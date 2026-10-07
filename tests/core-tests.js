/* Run with Zotero's DOMParser, or any standards-compliant browser DOM. */
async function runCourseTests(core, md, DOMParser, XMLSerializer) {
  const checks = [];
  const assert = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
  const root = 'https://example.gitbook.io/course';
  const index = '# Example\n- [Introduction](' + root + '/readme.md)\n- [Chapter](' + root + '/chapter.md)\n- [Duplicate](' + root + '/chapter.md)\n- [Other site](https://other.test/a.md)\n- [Other course](https://example.gitbook.io/other/a.md)';
  const parsed = core.parseIndex(index, root, md);
  assert(parsed.entries.length === 2, 'Index deduplicates and stays inside course');
  assert(parsed.entries[0].url === root, 'Introduction resolves to home page');
  const outputs = new Map();
  let imageRequests = 0;
  const options = {
    url: root, DOMParser, XMLSerializer,
    read: async (url, binary) => {
      if (binary) { imageRequests++; return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); }
      if (url.endsWith('llms.txt')) return index;
      return '# Heading\n\nText & Chinese: 中文\n\n![one](https://cdn.test/a.png)\n![two](https://cdn.test/a.png)\n\n[chapter](' + root + '/chapter.md)\n\n<script>alert(1)</script><img src="https://cdn.test/a.png" onerror="alert(2)"/><a href="javascript:alert(3)">unsafe</a>\n\n| A | B |\n|---|---|\n| 1 | 2 |';
    },
    write: async (name, value) => outputs.set(name, value)
  };
  const result = await core.build(options);
  assert(result.pages === 2 && result.images === 1 && imageRequests === 1, 'Concurrent images download once');
  const chapter = outputs.get('EPUB/chapter-0001.xhtml');
  assert(!chapter.includes('javascript:') && !chapter.includes('onerror') && !chapter.includes('<script'), 'Executable markup removed');
  assert(chapter.includes('<table') && chapter.includes('中文'), 'Tables and Unicode retained');
  assert(chapter.includes('href="chapter-0002.xhtml"'), 'Internal chapter links rewritten');
  for (const [name, content] of outputs) {
    if (/\.(xml|xhtml|opf)$/.test(name)) {
      assert(!new DOMParser().parseFromString(content, 'application/xml').querySelector('parsererror'), 'Valid XML: ' + name);
    }
  }
  let failed = false;
  try { await core.build({ ...options, read: async (url, binary) => { if (binary) throw new Error('offline image'); return options.read(url, binary); } }); } catch (err) { failed = err.message.includes('offline image'); }
  assert(failed, 'Missing image fails import');
  failed = false;
  try { await core.build({ ...options, cancelled: () => true }); } catch (err) { failed = err.message.includes('Cancelled'); }
  assert(failed, 'Cancellation stops before requests');
  failed = false;
  try { core.imageType(new Uint8Array([60, 104, 116, 109, 108])); } catch (_) { failed = true; }
  assert(failed, 'HTML error response rejected as image');
  return checks;
}
