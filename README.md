# TXT/Markdown to EPUB for Zotero

A Zotero 9/10 plugin that converts TXT/Markdown attachments or a public GitBook course into an offline EPUB.

## Import a GitBook Course (0.4.0)

1. Select the destination collection in Zotero.
2. Open **Tools > Import EPUB from GitBook URL...** (Chinese: **工具 > 从 GitBook 网址导入 EPUB…**).
3. Paste the course home URL, optionally enter a book title, and click Import.
4. Keep the window open while chapters and images download. The window shows progress and supports cancellation.
5. The EPUB appears in the collection selected when the window opened. Its actual file path is shown on completion.

Example: `https://mit-public-courses-cn-translatio.gitbook.io/mit6-s081/`

Images are embedded, chapters follow the published index, and the EPUB has a hierarchical table of contents. These imports use Zotero-managed storage, so deleting temporary build files does not break the attachment. The destination remains fixed even if you change the selected collection while downloading.

This release supports public GitBook courses with a `llms.txt` index and Markdown page endpoints. It is not a general website crawler. Login-protected sites, video, SVG images, interactive content, and rendered math are not supported. PNG/JPEG/GIF images are included; WebP is converted to PNG. Links to individual anchors remain online source links. Download errors stop the import rather than silently omitting chapters or images. Cancellation is disabled during the final Zotero attachment transaction.

Limits: 400 pages, 2,000 unique images, 50 MB per image, and 1 GB total images. Large courses can take several minutes and require additional temporary disk space. Only the URL and public resources requested by the import are fetched; no external conversion service or Python installation is needed.

## Compatibility

- Manifest range: Zotero `9.0.0` through `10.*`
- Original local-file conversion target: Zotero `9.0.5` 64-bit on Windows
- New course-import runtime tests: Zotero `10.0.3` on Windows. The new feature has not yet been runtime-tested on `9.0.5`.
- Zotero 7/8 compatibility is not targeted

Zotero 9.0.5 requires `applications.zotero.update_url` in `manifest.json`, so this plugin includes a placeholder update URL. Replace it with your own update manifest URL before publishing official releases.

## Features

- Converts `.txt`, `.md`, and `.markdown` attachments to `.epub`
- Writes the generated EPUB beside the original TXT/Markdown file
- Keeps the original TXT/Markdown attachment and source file
- Adds the generated EPUB back into Zotero
- Copies Zotero collection membership for standalone attachments when possible
- Supports English and Simplified Chinese menu labels

## Install

[Download the v0.4.0 XPI installer](https://github.com/exhilarating0411/zotero-txt-md-to-epub/raw/refs/heads/main/releases/txt-md-to-epub-for-zotero-0.4.0.xpi)

1. Download the `.xpi` package from a release.
2. Open Zotero.
3. Go to `Tools` -> `Plugins`.
4. Click the gear icon.
5. Choose `Install Plugin From File...`.
6. Select the `.xpi` file.
7. Restart Zotero.

## Use

1. Select one or more TXT or Markdown file attachments in Zotero.
2. Right-click the selection.
3. Choose `Convert TXT/Markdown to EPUB`.
4. The generated EPUB is created in the same filesystem directory as the source file and added to Zotero.

## Markdown Support

The original local-file converter intentionally implements a small Markdown subset:

- headings
- paragraphs
- blockquotes
- fenced code blocks
- inline code
- bold
- emphasis

Tables, footnotes, math, images, nested lists, and advanced Markdown extensions are not fully supported by the local-file converter. The new GitBook importer uses bundled markdown-it 14.1.0 and additionally handles tables, lists, links, and embedded images.

## Build

Run from the project directory:

```powershell
.\build.ps1
```

The script writes:

- `..\txt-md-to-epub-for-zotero.xpi`
- `..\txt-md-to-epub-for-zotero-0.4.0.xpi`

## Project Structure

```text
bootstrap.js
manifest.json
locale/
  en-US/txt-md-to-epub.ftl
  zh-CN/txt-md-to-epub.ftl
build.ps1
```

## Notes

For local-file conversion, the final EPUB is written beside the original source file. Existing EPUB files with the same output name are overwritten. GitBook imports instead create a new Zotero-managed attachment and clean up their temporary directory.

The bundled markdown-it dependency is MIT-licensed; see `MARKDOWN-IT-LICENSE.txt`. `tests/core-tests.js` exercises the conversion core using the actual Zotero DOM APIs, including failure and cancellation cases.
