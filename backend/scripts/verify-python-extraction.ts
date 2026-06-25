import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractPdfWithPython } from '../src/common/queue/python-extraction.js';

const pdfPath = process.argv[2];

if (!pdfPath) {
  throw new Error('Usage: tsx src/common/queue/verify-python-extraction.ts <pdf-path>');
}

const result = await extractPdfWithPython(await readFile(pdfPath));

assert.ok(result.pageCount > 0, 'Expected at least one page');
assert.equal(result.pages.length, result.pageCount, 'Expected one result per PDF page');
assert.ok(result.text.trim(), 'Expected non-empty extracted text');

console.log(
  JSON.stringify({
    pageCount: result.pageCount,
    characterCount: result.text.length,
  }),
);
