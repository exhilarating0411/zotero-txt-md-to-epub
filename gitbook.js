/* global markdownit */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/1999/xhtml';
  const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const CSS = 'body{font-family:serif;line-height:1.7;margin:5%;}img{max-width:100%;height:auto;}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f4f4;padding:.7em;}code{font-family:monospace;}table{border-collapse:collapse;max-width:100%;}td,th{border:1px solid #aaa;padding:.3em;}a{overflow-wrap:anywhere;}blockquote{border-left:3px solid #aaa;padding-left:1em;margin-left:0;}';

  function webURL(value, base) {
    const url = new global.URL(value.replace(/\\([&_])/g, '$1'), base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Only public HTTP(S) URLs without credentials are supported.');
    }
    if (/^(?:localhost$|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[)/i.test(url.hostname)) {
      throw new Error('Local URLs are not supported.');
    }
    return url;
  }

  function pageURL(value) {
    const url = webURL(value);
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\.md$/, '').replace(/\/readme$/i, '').replace(/\/$/, '') || '/';
    return url.href.replace(/\/$/, '');
  }

  function parseIndex(text, root, md) {
    const base = webURL(root);
    base.pathname = base.pathname.replace(/\/$/, '') + '/';
    const entries = [];
    const seen = new Set();
    let title = '';
    const tokens = md.parse(text, {});
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!title && token.type === 'heading_open' && token.tag === 'h1') title = tokens[i + 1].content;
      for (let j = 0; j < (token.children || []).length; j++) {
        const child = token.children[j];
        if (child.type !== 'link_open') continue;
        let url;
        try { url = webURL(child.attrGet('href'), base.href); } catch (_) { continue; }
        if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || !url.pathname.endsWith('.md')) continue;
        const canonical = pageURL(url.href);
        if (seen.has(canonical)) continue;
        seen.add(canonical);
        let label = '';
        for (let k = j + 1; k < token.children.length && token.children[k].type !== 'link_close'; k++) label += token.children[k].content;
        entries.push({ title: label || canonical, url: canonical, markdownURL: url.href, file: `chapter-${String(entries.length + 1).padStart(4, '0')}.xhtml` });
      }
    }
    if (!entries.length) throw new Error('No GitBook chapter index found. Enter the course home URL, not an individual chapter.');
    if (entries.length > 400) throw new Error('This course exceeds the 400-page limit.');
    return { title: title || base.hostname, entries };
  }

  function imageType(bytes) {
    if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return ['png', 'image/png'];
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return ['jpg', 'image/jpeg'];
    if (String.fromCharCode(...bytes.slice(0, 6)).match(/^GIF8[79]a$/)) return ['gif', 'image/gif'];
    if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return ['webp', 'image/webp'];
    throw new Error('Unsupported or invalid image (PNG, JPEG, GIF and WebP are supported).');
  }

  async function parallel(items, count, fn) {
    let next = 0;
    let failure;
    await Promise.all(Array.from({ length: Math.min(count, items.length) }, async () => {
      while (!failure && next < items.length) {
        const index = next++;
        try { await fn(items[index], index); } catch (err) { failure = failure || err; }
      }
    }));
    if (failure) throw failure;
  }

  function documentXML(title, body) {
    return `<?xml version="1.0" encoding="UTF-8"?><html xmlns="${NS}" lang="zh-CN"><head><title>${esc(title)}</title><link rel="stylesheet" href="style.css" type="text/css"/></head><body>${body}</body></html>`;
  }

  async function build(options) {
    const { read, write, DOMParser, XMLSerializer, cancelled = () => false, progress = () => {} } = options;
    const check = () => { if (cancelled()) throw new Error('Cancelled'); };
    const md = global.markdownit({ html: true, linkify: false, typographer: false });
    const root = webURL(options.url);
    root.hash = ''; root.search = '';
    root.pathname = root.pathname.replace(/\/$/, '');
    const source = root.href.replace(/\/$/, '');
    const request = async (url, binary = false) => {
      check();
      const result = await read(url, binary);
      check();
      if (result.length > (binary ? 50 * 1024 * 1024 : 5 * 1024 * 1024)) throw new Error(`Resource too large: ${url}`);
      return result;
    };
    progress({ stage: 'index' });
    const index = parseIndex(await request(source + '/llms.txt'), source, md);
    const title = options.title?.trim() || index.title;
    const entries = index.entries;
    const pageMap = new Map(entries.map(entry => [entry.url, entry.file]));
    const assets = [];
    const downloads = new Map();
    let bytesTotal = 0;
    let completed = 0;
    const downloadImage = url => {
      if (!downloads.has(url)) {
        if (downloads.size >= 2000) throw new Error('Image count exceeds 2000.');
        const id = downloads.size + 1;
        const promise = (async () => {
          let bytes = await request(url, true);
          let [ext, type] = imageType(bytes);
          if (ext === 'webp') {
            if (!options.convertWebP) throw new Error('WebP conversion unavailable.');
            bytes = await options.convertWebP(bytes);
            [ext, type] = imageType(bytes);
          }
          bytesTotal += bytes.length;
          if (bytesTotal > 1024 * 1024 * 1024) throw new Error('Images exceed the 1 GB limit.');
          const file = `images/image-${id}.${ext}`;
          await write('EPUB/' + file, bytes);
          assets.push({ id: `image-${id}`, file, type });
          progress({ stage: 'chapters', completed, total: entries.length, images: assets.length });
          return file;
        })();
        downloads.set(url, promise);
      }
      return downloads.get(url);
    };
    await parallel(entries, 3, async entry => {
      try {
        let raw = await request(entry.markdownURL);
        if (/^\s*<!doctype html|^\s*<html/i.test(raw)) throw new Error('Server returned HTML instead of Markdown.');
        raw = raw.replace(/^> For the complete documentation index[^\n]*\n\s*\n/, '');
        // GitBook container directives are presentation metadata, not course text.
        raw = raw.replace(/\{%\s*(?:end\w+|hint|code|tabs|tab|stepper|step)\b[^%]*%\}/g, '');
        const parsed = new DOMParser().parseFromString(md.render(raw), 'text/html');
        parsed.querySelectorAll('script,style,iframe,object,embed,form,input,button,svg,math,video,audio,source').forEach(node => node.remove());
        const images = Array.from(parsed.querySelectorAll('img'));
        await parallel(images, 3, async image => {
          const url = webURL(image.getAttribute('src') || image.getAttribute('data-src') || '', entry.markdownURL).href;
          image.setAttribute('src', await downloadImage(url));
          if (!image.getAttribute('alt')) image.setAttribute('alt', entry.title);
        });
        for (const link of parsed.querySelectorAll('a[href]')) {
          try {
            const url = webURL(link.getAttribute('href'), entry.markdownURL);
            const local = pageMap.get(pageURL(url.href));
            // Preserve fragments as source links unless the target is a complete page.
            link.setAttribute('href', local && !url.hash ? local : url.href);
          } catch (_) { link.removeAttribute('href'); }
        }
        const clean = new DOMParser().parseFromString(`<div xmlns="${NS}"/>`, 'application/xml');
        const allowed = new Set('p div span h1 h2 h3 h4 h5 h6 pre code strong em b i s del blockquote ul ol li table thead tbody tfoot tr th td caption a img br hr figure figcaption sup sub details summary'.split(' '));
        function copy(node, parent) {
          if (node.nodeType === 3) { parent.appendChild(clean.createTextNode(node.nodeValue)); return; }
          if (node.nodeType !== 1) return;
          let next = parent;
          if (allowed.has(node.localName)) {
            next = clean.createElementNS(NS, node.localName);
            parent.appendChild(next);
            for (const attr of ['id', 'title', 'alt', 'colspan', 'rowspan', 'start']) {
              if (node.hasAttribute(attr)) next.setAttribute(attr, node.getAttribute(attr));
            }
            if (node.localName === 'a' && node.hasAttribute('href')) next.setAttribute('href', node.getAttribute('href'));
            if (node.localName === 'img') next.setAttribute('src', node.getAttribute('src'));
          }
          for (const child of node.childNodes) copy(child, next);
        }
        for (const child of parsed.body.childNodes) copy(child, clean.documentElement);
        const xml = new XMLSerializer();
        const body = Array.from(clean.documentElement.childNodes).map(node => xml.serializeToString(node)).join('');
        await write('EPUB/' + entry.file, documentXML(entry.title, body + `<p><a href="${esc(entry.url)}">Source</a></p>`));
        completed++;
        progress({ stage: 'chapters', completed, total: entries.length, images: assets.length });
      } catch (err) { throw new Error(`${entry.title}: ${err.message}`); }
    });
    check();
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const identifier = esc(source);
    let manifest = '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>';
    manifest += entries.map((entry, i) => `<item id="chapter-${i}" href="${entry.file}" media-type="application/xhtml+xml"/>`).join('');
    manifest += assets.map(asset => `<item id="${asset.id}" href="${asset.file}" media-type="${asset.type}"/>`).join('');
    await write('mimetype', 'application/epub+zip');
    await write('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    await write('EPUB/style.css', CSS);
    await write('EPUB/content.opf', `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${identifier}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:language>zh-CN</dc:language><dc:source>${identifier}</dc:source><meta property="dcterms:modified">${now}</meta></metadata><manifest>${manifest}</manifest><spine>${entries.map((entry, i) => `<itemref idref="chapter-${i}"/>`).join('')}</spine></package>`);
    const children = new Map([[null, []]]);
    for (const entry of entries) {
      const parent = entries.filter(candidate => candidate.url !== source && entry.url.startsWith(candidate.url + '/'))
        .sort((a, b) => b.url.length - a.url.length)[0] || null;
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(entry);
    }
    const tocList = parent => (children.get(parent) || []).map(entry => `<li><a href="${entry.file}">${esc(entry.title)}</a>${children.has(entry) ? `<ol>${tocList(entry)}</ol>` : ''}</li>`).join('');
    const toc = tocList(null);
    await write('EPUB/nav.xhtml', documentXML(title, `<nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc"><h1>${esc(title)}</h1><ol>${toc}</ol></nav>`));
    check();
    return { title, pages: entries.length, images: assets.length, source };
  }
  global.GitBookEPUB = { build, parseIndex, imageType, pageURL, webURL, parallel };
  if (typeof module !== 'undefined') module.exports = global.GitBookEPUB;
})(globalThis);
