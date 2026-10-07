# Changelog

## 0.4.0

- Add Tools-menu import of public GitBook course URLs using their published Markdown index.
- Embed downloaded images, preserve chapter order, and generate a hierarchical EPUB table of contents.
- Store the EPUB as a managed attachment in the collection selected when the import window opens.
- Add progress, cancellation, bounded retries, resource limits, and explicit failure reporting.
- Sanitize downloaded HTML and validate generated XML before packaging.
- Add Zotero 10 compatibility while retaining the Zotero 9 minimum version.
- Keep existing TXT/Markdown conversion behavior unchanged.

## 0.3.5

- Keep the original TXT/Markdown source file and Zotero attachment after conversion.
- Generate the EPUB beside the source file.
- Add the generated EPUB back into Zotero.
- Preserve standalone attachment collection membership where possible.

## 0.3.4

- Copy collection membership from standalone source attachments to generated EPUB attachments.

## 0.3.3

- Write the generated EPUB to the source file directory.

## 0.3.2

- Select newly created EPUB attachments after conversion.
- Show created attachment titles in the success message.

## 0.3.1

- Use Zotero's global `Services` object instead of importing `Services.sys.mjs`.

## 0.3.0

- Add Zotero 9 manifest compatibility fields required by Zotero 9.0.5.

## 0.2.0

- Switch menu integration to Zotero's `MenuManager` API.

## 0.1.0

- Initial TXT/Markdown to EPUB conversion prototype.
