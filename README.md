# TXT/Markdown to EPUB for Zotero

A Zotero 9 plugin that converts selected TXT and Markdown attachments into EPUB files.

## Compatibility

- Zotero: `9.0.0` to `9.99.99`
- Tested target: Zotero `9.0.5` 64-bit on Windows
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

This plugin intentionally implements a small Markdown subset:

- headings
- paragraphs
- blockquotes
- fenced code blocks
- inline code
- bold
- emphasis

Tables, footnotes, math, images, nested lists, and advanced Markdown extensions are not fully supported.

## Build

Run from the project directory:

```powershell
.\build.ps1
```

The script writes:

- `..\txt-md-to-epub-for-zotero.xpi`
- `..\txt-md-to-epub-for-zotero-0.3.5.xpi`

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

The plugin creates a temporary build directory only while packaging EPUB internals. The final EPUB is written beside the original source file. Existing EPUB files with the same output name are overwritten.
