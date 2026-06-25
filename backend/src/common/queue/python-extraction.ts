import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../../config/index.js';

export interface ExtractionResult {
  pageCount: number;
  text: string;
  pages: Array<{ page: number; text: string }>;
}

const extractionScript = fileURLToPath(
  new URL('../../../python-worker/extract_pdf.py', import.meta.url),
);

export async function extractPdfWithPython(pdf: Buffer): Promise<ExtractionResult> {
  const temporaryPath = path.join(os.tmpdir(), `lumora-${randomUUID()}.pdf`);
  await fs.writeFile(temporaryPath, pdf);

  try {
    const output = await runPythonExtractor(temporaryPath);
    const result = JSON.parse(output) as ExtractionResult;

    if (
      !Number.isInteger(result.pageCount) ||
      result.pageCount < 1 ||
      !Array.isArray(result.pages) ||
      result.pages.length !== result.pageCount ||
      typeof result.text !== 'string' ||
      !result.text.trim()
    ) {
      throw new Error('Python extractor returned an invalid or empty result');
    }

    return result;
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

function runPythonExtractor(pdfPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.extraction.pythonExecutable, [extractionScript, pdfPath], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
      },
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill();
      reject(
        new Error(`Python extractor timed out after ${config.extraction.timeoutMs} milliseconds`),
      );
    }, config.extraction.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Unable to start Python extractor using "${config.extraction.pythonExecutable}": ${error.message}`,
        ),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const details = Buffer.concat(stderr).toString('utf8').trim();
        reject(new Error(details || `Python extractor exited with code ${code}`));
        return;
      }

      resolve(Buffer.concat(stdout).toString('utf8'));
    });
  });
}
