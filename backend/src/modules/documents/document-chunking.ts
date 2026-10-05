import { config } from '../../config/index.js';
import type { IExtractedPage } from './document.model.js';

interface ChunkSegment {
  pageNumber: number;
  text: string;
  tokenCount: number;
}

export interface ChunkDraft {
  chunkIndex: number;
  text: string;
  pageNumber: number;
  tokenCount: number;
  metadata: {
    pageNumbers: number[];
    startPageNumber: number;
    endPageNumber: number;
  };
}

interface ChunkingOptions {
  targetTokens: number;
  maxTokens: number;
  overlapTokens: number;
}

const DEFAULT_OPTIONS: ChunkingOptions = {
  targetTokens: config.chunking.targetTokens,
  maxTokens: config.chunking.maxTokens,
  overlapTokens: config.chunking.overlapTokens,
};

export function buildSemanticChunks(
  pages: IExtractedPage[],
  options: Partial<ChunkingOptions> = {},
): ChunkDraft[] {
  const settings: ChunkingOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const segments = pages.flatMap((page) => splitPageIntoSegments(page, settings.maxTokens));
  if (segments.length === 0) {
    return [];
  }

  const chunks: ChunkDraft[] = [];
  let currentSegments: ChunkSegment[] = [];
  let currentTokenCount = 0;

  const finalizeCurrentChunk = () => {
    if (currentSegments.length === 0) {
      return;
    }

    chunks.push(createChunkDraft(chunks.length, currentSegments));
  };

  for (const segment of segments) {
    if (currentSegments.length === 0) {
      currentSegments = [segment];
      currentTokenCount = segment.tokenCount;
      continue;
    }

    const nextTokenCount = currentTokenCount + segment.tokenCount;
    const shouldFinalize =
      nextTokenCount > settings.maxTokens
      || (currentTokenCount >= settings.targetTokens && nextTokenCount > settings.targetTokens);

    if (shouldFinalize) {
      finalizeCurrentChunk();

      currentSegments = buildOverlapSegments(currentSegments, settings.overlapTokens);
      currentTokenCount = sumTokens(currentSegments);

      if (currentTokenCount + segment.tokenCount > settings.maxTokens) {
        currentSegments = buildOverlapSegments(
          currentSegments,
          Math.max(settings.maxTokens - segment.tokenCount, 0),
        );
        currentTokenCount = sumTokens(currentSegments);
      }
    }

    currentSegments = [...currentSegments, segment];
    currentTokenCount += segment.tokenCount;
  }

  finalizeCurrentChunk();

  return chunks;
}

function splitPageIntoSegments(page: IExtractedPage, maxTokens: number): ChunkSegment[] {
  const pageText = normalizeText(page.text);
  if (!pageText) {
    return [];
  }

  const paragraphs = pageText
    .split(/\n{2,}/)
    .map((paragraph) => normalizeText(paragraph))
    .filter(Boolean);

  const blocks = paragraphs.length > 0 ? paragraphs : [pageText];
  return blocks.flatMap((block) => splitTextToMaxTokens(block, page.page, maxTokens));
}

function splitTextToMaxTokens(text: string, pageNumber: number, maxTokens: number): ChunkSegment[] {
  const tokenCount = countTokens(text);
  if (tokenCount <= maxTokens) {
    return [{ pageNumber, text, tokenCount }];
  }

  const sentences = splitIntoSentences(text);
  if (sentences.length <= 1) {
    return splitSentenceByTokenCount(text, pageNumber, maxTokens);
  }

  const segments: ChunkSegment[] = [];
  let currentText = '';

  for (const sentence of sentences) {
    const candidate = currentText ? `${currentText} ${sentence}` : sentence;
    if (countTokens(candidate) <= maxTokens) {
      currentText = candidate;
      continue;
    }

    if (currentText) {
      segments.push({
        pageNumber,
        text: currentText,
        tokenCount: countTokens(currentText),
      });
    }

    if (countTokens(sentence) <= maxTokens) {
      currentText = sentence;
    } else {
      segments.push(...splitSentenceByTokenCount(sentence, pageNumber, maxTokens));
      currentText = '';
    }
  }

  if (currentText) {
    segments.push({
      pageNumber,
      text: currentText,
      tokenCount: countTokens(currentText),
    });
  }

  return segments;
}

function splitSentenceByTokenCount(
  text: string,
  pageNumber: number,
  maxTokens: number,
): ChunkSegment[] {
  const tokens = tokenize(text);
  const segments: ChunkSegment[] = [];

  for (let start = 0; start < tokens.length; start += maxTokens) {
    const slice = tokens.slice(start, start + maxTokens);
    segments.push({
      pageNumber,
      text: slice.join(' '),
      tokenCount: slice.length,
    });
  }

  return segments;
}

function buildOverlapSegments(segments: ChunkSegment[], overlapTokens: number): ChunkSegment[] {
  if (overlapTokens <= 0 || segments.length === 0) {
    return [];
  }

  const overlap: ChunkSegment[] = [];
  let collectedTokens = 0;

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (collectedTokens + segment.tokenCount <= overlapTokens) {
      overlap.unshift(segment);
      collectedTokens += segment.tokenCount;
      continue;
    }

    const remainingTokens = overlapTokens - collectedTokens;
    if (remainingTokens > 0) {
      overlap.unshift(createTailSegment(segment, remainingTokens));
    }
    break;
  }

  return overlap;
}

function createTailSegment(segment: ChunkSegment, tokenCount: number): ChunkSegment {
  const tokens = tokenize(segment.text);
  const tail = tokens.slice(Math.max(tokens.length - tokenCount, 0));
  return {
    pageNumber: segment.pageNumber,
    text: tail.join(' '),
    tokenCount: tail.length,
  };
}

function createChunkDraft(chunkIndex: number, segments: ChunkSegment[]): ChunkDraft {
  const text = segments.map((segment) => segment.text).join('\n\n').trim();
  const pageNumbers = Array.from(new Set(segments.map((segment) => segment.pageNumber))).sort(
    (left, right) => left - right,
  );

  return {
    chunkIndex,
    text,
    pageNumber: pageNumbers[0],
    tokenCount: countTokens(text),
    metadata: {
      pageNumbers,
      startPageNumber: pageNumbers[0],
      endPageNumber: pageNumbers[pageNumbers.length - 1],
    },
  };
}

function splitIntoSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [];
  return matches.map((sentence) => normalizeText(sentence)).filter(Boolean);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function countTokens(text: string): number {
  return tokenize(text).length;
}

function sumTokens(segments: ChunkSegment[]): number {
  return segments.reduce((total, segment) => total + segment.tokenCount, 0);
}
