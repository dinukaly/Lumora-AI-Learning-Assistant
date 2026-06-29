import mongoose from 'mongoose';
import Document from '../documents/document.model.js';
import { getAIOrchestrator } from './ai.service.js';
import { getChatProvider } from './ai.config.js';
import type { Citation } from './ai-providers.js';
import type { DocumentChunkSearchResult } from '../documents/document-vector-search.service.js';
import AIActionArtifact from './ai-action-artifact.model.js';

interface SummaryPayload {
  summary?: string;
  takeaways?: string[];
}

interface ConceptPayload {
  concepts?: Array<{
    title?: string;
    description?: string;
  }>;
}

export interface SummarizeDocumentResult {
  documentId: string;
  summary: string;
  takeaways: string[];
  citations: Citation[];
}

export interface ExtractConceptsResult {
  documentId: string;
  concepts: Array<{
    title: string;
    description: string;
  }>;
  citations: Citation[];
}

export interface LatestAIActionsResult {
  documentId: string;
  summary: {
    artifactId: string;
    summary: string;
    takeaways: string[];
    citations: Citation[];
    sourceChunkIds: string[];
    createdAt: Date;
  } | null;
  concepts: {
    artifactId: string;
    concepts: Array<{
      title: string;
      description: string;
    }>;
    citations: Citation[];
    sourceChunkIds: string[];
    createdAt: Date;
  } | null;
}

export interface ExplainConceptResult {
  documentId: string;
  topic: string;
  explanation: string;
  citations: Citation[];
}

export class AIActionsService {
  private readonly orchestrator = getAIOrchestrator();

  async summarizeDocument(userId: string, documentId: string): Promise<SummarizeDocumentResult> {
    const { context, citations } = await this.prepareDocumentActionContext({
      userId,
      documentId,
      query: 'Summarize this document and highlight the key takeaways.',
    });

    const prompt = [
      this.orchestrator.buildPrompt('SUMMARIZE_DOCUMENT', context),
      '',
      'Return strict JSON with this shape:',
      '{"summary":"string","takeaways":["string"]}',
      'Use concise, factual language.',
      'Include 3 to 5 takeaways when possible.',
      'Do not include markdown fences.',
    ].join('\n');

    const response = await getChatProvider().generateJSON<SummaryPayload>(prompt, 'summary', {
      temperature: 0,
      maxTokens: 1400,
    });

    const summary = typeof response.summary === 'string' ? response.summary.trim() : '';
    if (!summary) {
      throw new Error('AI did not return a usable document summary');
    }

    await AIActionArtifact.create({
      userId: new mongoose.Types.ObjectId(userId),
      documentId: new mongoose.Types.ObjectId(documentId),
      actionType: 'SUMMARY',
      createdBy: 'AI',
      summary,
      takeaways: normalizeTakeaways(response.takeaways),
      citations,
      sourceChunkIds: context.retrievedChunks.map((chunk) => new mongoose.Types.ObjectId(chunk.chunkId)),
    });

    return {
      documentId,
      summary,
      takeaways: normalizeTakeaways(response.takeaways),
      citations,
    };
  }

  async extractConcepts(userId: string, documentId: string): Promise<ExtractConceptsResult> {
    const { context, citations } = await this.prepareDocumentActionContext({
      userId,
      documentId,
      query: 'Extract the most important concepts from this document and explain each briefly.',
    });

    const prompt = [
      this.orchestrator.buildPrompt('EXTRACT_CONCEPTS', context),
      '',
      'Return strict JSON with this shape:',
      '{"concepts":[{"title":"string","description":"string"}]}',
      'Return 3 to 6 concepts when possible.',
      'Each concept should have a short title and a grounded explanation.',
      'Do not include markdown fences.',
    ].join('\n');

    const response = await getChatProvider().generateJSON<ConceptPayload>(prompt, 'concepts', {
      temperature: 0,
      maxTokens: 1600,
    });

    const concepts = normalizeConcepts(response.concepts);
    if (concepts.length === 0) {
      throw new Error('AI did not return any usable concepts');
    }

    await AIActionArtifact.create({
      userId: new mongoose.Types.ObjectId(userId),
      documentId: new mongoose.Types.ObjectId(documentId),
      actionType: 'CONCEPTS',
      createdBy: 'AI',
      concepts,
      citations,
      sourceChunkIds: context.retrievedChunks.map((chunk) => new mongoose.Types.ObjectId(chunk.chunkId)),
    });

    return {
      documentId,
      concepts,
      citations,
    };
  }

  async getLatestActions(userId: string, documentId: string): Promise<LatestAIActionsResult> {
    await assertReadyOwnedDocument(documentId, userId);

    const artifacts = await AIActionArtifact.find({
      userId: new mongoose.Types.ObjectId(userId),
      documentId: new mongoose.Types.ObjectId(documentId),
      actionType: { $in: ['SUMMARY', 'CONCEPTS'] },
    })
      .sort({ createdAt: -1 })
      .lean();

    const latestSummary = artifacts.find((artifact) => artifact.actionType === 'SUMMARY') ?? null;
    const latestConcepts = artifacts.find((artifact) => artifact.actionType === 'CONCEPTS') ?? null;

    return {
      documentId,
      summary: latestSummary
        ? {
          artifactId: latestSummary._id.toString(),
          summary: latestSummary.summary ?? '',
          takeaways: latestSummary.takeaways ?? [],
          citations: normalizeStoredCitations(latestSummary.citations),
          sourceChunkIds: (latestSummary.sourceChunkIds ?? []).map((id) => id.toString()),
          createdAt: latestSummary.createdAt,
        }
        : null,
      concepts: latestConcepts
        ? {
          artifactId: latestConcepts._id.toString(),
          concepts: latestConcepts.concepts ?? [],
          citations: normalizeStoredCitations(latestConcepts.citations),
          sourceChunkIds: (latestConcepts.sourceChunkIds ?? []).map((id) => id.toString()),
          createdAt: latestConcepts.createdAt,
        }
        : null,
    };
  }

  async explainConcept(
    userId: string,
    documentId: string,
    topic: string,
  ): Promise<ExplainConceptResult> {
    const normalizedTopic = topic.trim();
    if (!normalizedTopic) {
      throw new Error('A concept or takeaway is required');
    }

    await assertReadyOwnedDocument(documentId, userId);

    const response = await this.orchestrator.process({
      userId,
      documentId,
      action: 'EXPLAIN_CONCEPT',
      message: `Explain this concept from the document in more depth: ${normalizedTopic}`,
    });

    const explanation = response.content.trim();
    if (!explanation) {
      throw new Error('AI did not return a usable concept explanation');
    }

    return {
      documentId,
      topic: normalizedTopic,
      explanation,
      citations: response.citations,
    };
  }

  private async prepareDocumentActionContext(input: {
    userId: string;
    documentId: string;
    query: string;
  }) {
    await assertReadyOwnedDocument(input.documentId, input.userId);

    const chunks = await this.orchestrator.searchChunks(input.query, input.documentId, 8, {
      fallbackToDocumentStart: true,
    });

    const context = await this.orchestrator.assembleContext({
      documentId: input.documentId,
      queryScope: 'DOCUMENT',
      userMessage: input.query,
      chunks,
    });

    return {
      context,
      citations: buildCitations(chunks),
    };
  }
}

async function assertReadyOwnedDocument(documentId: string, userId: string) {
  if (!mongoose.Types.ObjectId.isValid(documentId)) {
    throw new Error('Invalid document ID');
  }

  const document = await Document.findOne({
    _id: documentId,
    ownerId: new mongoose.Types.ObjectId(userId),
  })
    .select('_id status')
    .lean();

  if (!document) {
    throw new Error('Document not found');
  }

  if (document.status !== 'READY') {
    throw new Error('Document is not ready for AI actions');
  }
}

function buildCitations(chunks: DocumentChunkSearchResult[]): Citation[] {
  return chunks.slice(0, 4).map((chunk) => ({
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    pageNumber: chunk.pageNumber ?? 0,
    snippet: chunk.text.slice(0, 220),
  }));
}

function normalizeTakeaways(takeaways: string[] | undefined) {
  if (!Array.isArray(takeaways)) {
    return [];
  }

  return takeaways
    .map((takeaway) => (typeof takeaway === 'string' ? takeaway.trim() : ''))
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeConcepts(concepts: ConceptPayload['concepts']) {
  if (!Array.isArray(concepts)) {
    return [];
  }

  return concepts
    .map((concept) => {
      const title = typeof concept.title === 'string' ? concept.title.trim() : '';
      const description = typeof concept.description === 'string'
        ? concept.description.trim()
        : '';

      if (!title || !description) {
        return null;
      }

      return { title, description };
    })
    .filter((concept): concept is NonNullable<typeof concept> => concept !== null)
    .slice(0, 6);
}

function normalizeStoredCitations(citations: Array<{
  chunkId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  pageNumber: number;
  snippet: string;
}> | undefined): Citation[] {
  if (!Array.isArray(citations)) {
    return [];
  }

  return citations.map((citation) => ({
    chunkId: citation.chunkId.toString(),
    documentId: citation.documentId.toString(),
    pageNumber: citation.pageNumber,
    snippet: citation.snippet,
  }));
}
