/* global Zotero, Components, ChromeUtils, MozXULElement */

const PLUGIN_ID = "txt-md-to-epub@local.codex";
const MENU_ID = "txt-md-to-epub-convert-menu";
const FTL_FILE = "txt-md-to-epub.ftl";

var registeredMenuID = null;
var txtMdToEpubServices = null;

function install() {}

function uninstall() {}

async function startup() {
  log("startup");
  registerMenu();

  for (const win of Zotero.getMainWindows()) {
    onMainWindowLoad({ window: win });
  }
}

function shutdown() {
  log("shutdown");
  unregisterMenu();

  for (const win of Zotero.getMainWindows()) {
    onMainWindowUnload({ window: win });
  }
}

function onMainWindowLoad({ window }) {
  window.MozXULElement.insertFTLIfNeeded(FTL_FILE);
}

function onMainWindowUnload({ window }) {
  window.document.querySelector(`link[rel="localization"][href="${FTL_FILE}"]`)?.remove();
}

function registerMenu() {
  if (registeredMenuID || !Zotero.MenuManager) {
    return;
  }

  registeredMenuID = Zotero.MenuManager.registerMenu({
    menuID: MENU_ID,
    pluginID: PLUGIN_ID,
    target: "main/library/item",
    menus: [
      {
        menuType: "menuitem",
        l10nID: "txt-md-to-epub-menu-convert",
        onShowing: (event, context) => {
          context.setVisible(getConvertibleAttachments(context.items || []).length > 0);
        },
        onCommand: async (event, context) => {
          const win = event.target.ownerGlobal;
          await convertItems(win, context.items || win.ZoteroPane.getSelectedItems());
        }
      }
    ]
  });
}

function unregisterMenu() {
  if (!registeredMenuID || !Zotero.MenuManager) {
    registeredMenuID = null;
    return;
  }

  Zotero.MenuManager.unregisterMenu(registeredMenuID);
  registeredMenuID = null;
}

async function convertItems(win, items) {
  const attachments = getConvertibleAttachments(items);
  if (!attachments.length) {
    return;
  }

  let converted = 0;
  const failures = [];
  const importedItems = [];

  for (const attachment of attachments) {
    try {
      const imported = await convertAttachment(attachment);
      importedItems.push(imported);
      converted += 1;
    }
    catch (err) {
      const filename = attachment.attachmentFilename || "attachment";
      failures.push(`${filename}: ${err.message || err}`);
      log(`conversion failed for ${filename}: ${err && err.stack ? err.stack : err}`);
    }
  }

  const lines = [];
  if (converted) {
    lines.push(`Converted ${converted} attachment${converted === 1 ? "" : "s"} to EPUB.`);
    lines.push(...importedItems.map((item) => `Created: ${item.getField("title")}`));
  }
  if (failures.length) {
    lines.push("");
    lines.push("Failures:");
    lines.push(...failures);
  }

  await win.Zotero.alert(null, "TXT/Markdown to EPUB", lines.join("\n"));

  if (importedItems.length && win.ZoteroPane?.selectItems) {
    await win.ZoteroPane.selectItems(importedItems.map((item) => item.id));
  }
}

async function convertAttachment(attachment) {
  const sourcePath = await attachment.getFilePathAsync();
  if (!sourcePath) {
    throw new Error("Attachment file path is unavailable.");
  }

  const sourceFile = Zotero.File.pathToFile(sourcePath);
  const sourceDir = sourceFile.parent;
  const sourceName = attachment.attachmentFilename || basename(sourcePath);
  const title = sourceName.replace(/\.(txt|md|markdown)$/i, "");
  const text = await Zotero.File.getContentsAsync(sourcePath, "utf-8");
  const xhtml = /\.(md|markdown)$/i.test(sourceName)
    ? markdownToXHTML(text, title)
    : txtToXHTML(text, title);

  const buildDir = makeTempDirectory("txt-md-to-epub-build");
  const epubPath = pathJoin(sourceDir.path, `${safeFilename(title)}.epub`);

  try {
    await writeEpub(buildDir, epubPath, title, xhtml);
    const imported = await attachEpubBesideSource(attachment, epubPath, `${title}.epub`);
    return imported;
  }
  finally {
    if (buildDir.exists()) {
      buildDir.remove(true);
    }
  }
}

async function attachEpubBesideSource(sourceAttachment, epubPath, title) {
  const options = {
    file: Zotero.File.pathToFile(epubPath),
    contentType: "application/epub+zip",
    title
  };

  if (sourceAttachment.parentItemID) {
    options.parentItemID = sourceAttachment.parentItemID;
  }
  else {
    options.libraryID = sourceAttachment.libraryID;
  }

  const imported = Zotero.Attachments.linkFromFile
    ? await Zotero.Attachments.linkFromFile(options)
    : await Zotero.Attachments.importFromFile(options);
  imported.setField("title", title);
  copyCollectionMembership(sourceAttachment, imported);
  await imported.saveTx();
  return imported;
}

function copyCollectionMembership(sourceAttachment, importedAttachment) {
  if (sourceAttachment.parentItemID || !sourceAttachment.getCollections || !importedAttachment.setCollections) {
    return;
  }

  const collectionIDs = sourceAttachment.getCollections();
  if (collectionIDs.length) {
    importedAttachment.setCollections(collectionIDs);
  }
}

async function writeEpub(workDir, epubPath, title, chapterXHTML) {
  const metaInf = ensureChildDirectory(workDir, "META-INF");
  const epubDir = ensureChildDirectory(workDir, "EPUB");

  await Zotero.File.putContentsAsync(pathJoin(workDir.path, "mimetype"), "application/epub+zip");
  await Zotero.File.putContentsAsync(pathJoin(metaInf.path, "container.xml"), containerXML());
  await Zotero.File.putContentsAsync(pathJoin(epubDir.path, "content.opf"), contentOPF(title));
  await Zotero.File.putContentsAsync(pathJoin(epubDir.path, "nav.xhtml"), navXHTML(title));
  await Zotero.File.putContentsAsync(pathJoin(epubDir.path, "chapter.xhtml"), chapterXHTML);
  await Zotero.File.putContentsAsync(pathJoin(epubDir.path, "style.css"), styleCSS());

  const zipFile = Zotero.File.pathToFile(epubPath);
  if (zipFile.exists()) {
    zipFile.remove(false);
  }

  const zipWriter = Components.classes["@mozilla.org/zipwriter;1"]
    .createInstance(Components.interfaces.nsIZipWriter);
  zipWriter.open(zipFile, 0x04 | 0x08 | 0x20);

  try {
    const zw = Components.interfaces.nsIZipWriter;
    zipWriter.addEntryFile("mimetype", zw.COMPRESSION_NONE, Zotero.File.pathToFile(pathJoin(workDir.path, "mimetype")), false);
    zipWriter.addEntryFile("META-INF/container.xml", zw.DEFAULT_COMPRESSION, Zotero.File.pathToFile(pathJoin(metaInf.path, "container.xml")), false);
    zipWriter.addEntryFile("EPUB/content.opf", zw.DEFAULT_COMPRESSION, Zotero.File.pathToFile(pathJoin(epubDir.path, "content.opf")), false);
    zipWriter.addEntryFile("EPUB/nav.xhtml", zw.DEFAULT_COMPRESSION, Zotero.File.pathToFile(pathJoin(epubDir.path, "nav.xhtml")), false);
    zipWriter.addEntryFile("EPUB/chapter.xhtml", zw.DEFAULT_COMPRESSION, Zotero.File.pathToFile(pathJoin(epubDir.path, "chapter.xhtml")), false);
    zipWriter.addEntryFile("EPUB/style.css", zw.DEFAULT_COMPRESSION, Zotero.File.pathToFile(pathJoin(epubDir.path, "style.css")), false);
  }
  finally {
    zipWriter.close();
  }
}

function getConvertibleAttachments(items) {
  return items.filter((item) => {
    if (!item || !item.isAttachment || !item.isAttachment()) {
      return false;
    }
    return /\.(txt|md|markdown)$/i.test(item.attachmentFilename || "");
  });
}

function markdownToXHTML(markdown, title) {
  const lines = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks = [];
  const paragraph = [];
  let inCode = false;
  let codeLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }
    blocks.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph.length = 0;
  };

  for (const line of lines) {
    const stripped = line.trim();

    if (stripped.startsWith("```")) {
      if (inCode) {
        blocks.push(`<pre><code>${escapeHTML(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      }
      else {
        flushParagraph();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!stripped) {
      flushParagraph();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(stripped);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (stripped.startsWith("> ")) {
      flushParagraph();
      blocks.push(`<blockquote><p>${inlineMarkdown(stripped.slice(2))}</p></blockquote>`);
      continue;
    }

    paragraph.push(stripped);
  }

  flushParagraph();
  if (inCode) {
    blocks.push(`<pre><code>${escapeHTML(codeLines.join("\n"))}</code></pre>`);
  }

  return htmlDocument(title, blocks.join("\n") || "<p></p>");
}

function txtToXHTML(text, title) {
  const paragraphs = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split(/\n\s*\n/);
  const body = paragraphs
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHTML(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("\n") || "<p></p>";

  return htmlDocument(title, body);
}

function htmlDocument(title, body) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">
<head>
  <title>${escapeHTML(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
  <h1>${escapeHTML(title)}</h1>
  ${body}
</body>
</html>
`;
}

function inlineMarkdown(text) {
  let value = escapeHTML(text);
  value = value.replace(/`([^`]+)`/g, "<code>$1</code>");
  value = value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  value = value.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return value;
}

function containerXML() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>
`;
}

function contentOPF(title) {
  const services = getServices();
  const id = `urn:uuid:${services.uuid.generateUUID().toString().replace(/[{}]/g, "")}`;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${id}</dc:identifier>
    <dc:title>${escapeHTML(title)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml" />
    <item id="style" href="style.css" media-type="text/css" />
  </manifest>
  <spine>
    <itemref idref="chapter" />
  </spine>
</package>
`;
}

function navXHTML(title) {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN">
<head>
  <title>${escapeHTML(title)}</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>${escapeHTML(title)}</h1>
    <ol>
      <li><a href="chapter.xhtml">${escapeHTML(title)}</a></li>
    </ol>
  </nav>
</body>
</html>
`;
}

function styleCSS() {
  return `body {
  font-family: serif;
  line-height: 1.65;
  margin: 5%;
}

pre,
code {
  font-family: monospace;
}

pre {
  background: #f4f4f4;
  padding: 0.75em;
  white-space: pre-wrap;
}

blockquote {
  border-left: 0.25em solid #999;
  color: #444;
  margin-left: 0;
  padding-left: 1em;
}
`;
}

function ensureChildDirectory(parent, name) {
  const dir = parent.clone();
  dir.append(name);
  if (!dir.exists()) {
    dir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0o755);
  }
  return dir;
}

function makeTempDirectory(prefix) {
  const dir = getServices().dirsvc.get("TmpD", Components.interfaces.nsIFile);
  dir.append(`${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`);
  dir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0o755);
  return dir;
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function basename(filePath) {
  return String(filePath).split(/[\\/]/).pop();
}

function safeFilename(value) {
  return String(value).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").slice(0, 120) || "converted";
}

function pathJoin(...parts) {
  return parts.join(getServices().appinfo.OS === "WINNT" ? "\\" : "/");
}

function log(message) {
  Zotero.debug(`[${PLUGIN_ID}] ${message}`);
}

function getServices() {
  if (!txtMdToEpubServices) {
    txtMdToEpubServices = globalThis.Services;
    if (!txtMdToEpubServices) {
      throw new Error("Zotero did not expose the global Services object.");
    }
  }
  return txtMdToEpubServices;
}
