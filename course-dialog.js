/* global window, document */
'use strict';
const args = window.arguments[0];
const zh = (window.opener?.Zotero?.locale || navigator.language).startsWith('zh');
const text = (en, cn) => zh ? cn : en;
const $ = id => document.getElementById(id);
let running = false;
let cancelled = false;
let importing = false;
$('heading').textContent = text('GitBook to EPUB', 'GitBook 课程转 EPUB');
document.title = $('heading').textContent;
$('destination').textContent = text('Destination: ', '保存到：') + args.destination;
$('url-label').textContent = text('Course home URL', '课程首页网址');
$('title-label').textContent = text('Book title (optional)', '书名（选填）');
$('start').textContent = text('Import', '导入');
$('cancel').textContent = text('Close', '关闭');
$('cancel').addEventListener('click', () => {
  if (!running) { window.close(); return; }
  if (importing) return;
  cancelled = true;
  $('cancel').disabled = true;
  $('status').textContent = text('Cancelling...', '正在取消…');
});
window.addEventListener('unload', () => { cancelled = true; });
$('form').addEventListener('submit', async event => {
  event.preventDefault();
  if (running) return;
  running = true; cancelled = false; importing = false;
  $('start').disabled = true; $('url').disabled = true; $('title').disabled = true;
  $('cancel').textContent = text('Cancel', '取消');
  $('progress').removeAttribute('value');
  const progress = state => {
    if (window.closed || cancelled) return;
    if (state.stage === 'index') $('status').textContent = text('Reading course index...', '正在读取课程目录…');
    if (state.stage === 'chapters') {
      $('progress').max = state.total; $('progress').value = state.completed;
      $('status').textContent = text(`Pages: ${state.completed}/${state.total}\nImages: ${state.images}`, `章节：${state.completed}/${state.total}\n已下载图片：${state.images}`);
    }
    if (state.stage === 'pack') { $('progress').removeAttribute('value'); $('status').textContent = text('Building EPUB...', '正在打包 EPUB…'); }
    if (state.stage === 'import') {
      importing = true; $('cancel').disabled = true;
      $('status').textContent = text('Saving to Zotero...', '正在保存到 Zotero…');
    }
  };
  try {
    const result = await args.run({ url: $('url').value.trim(), title: $('title').value, cancelled: () => cancelled, progress });
    if (window.closed) return;
    $('progress').max = 1; $('progress').value = 1;
    $('status').textContent = text(`Imported: ${result.title}\n${result.pages} pages, ${result.images} images\n${result.path}`, `已导入：${result.title}\n${result.pages} 个章节，${result.images} 张图片\n${result.path}`);
  } catch (err) {
    if (window.closed) return;
    $('progress').value = 0;
    $('status').textContent = cancelled ? text('Cancelled. No attachment was imported.', '已取消，未导入附件。') : text('Import failed: ', '导入失败：') + err.message;
  } finally {
    running = false; importing = false;
    if (!window.closed) {
      $('start').disabled = false; $('url').disabled = false; $('title').disabled = false;
      $('cancel').disabled = false; $('cancel').textContent = text('Close', '关闭');
    }
  }
});
