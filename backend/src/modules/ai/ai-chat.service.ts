import type { AIAction, Citation } from './ai-providers.js';
import { getAIOrchestrator } from './ai.service.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { UsageEventsService } from '../analytics/usage-events.service.js';

export interface AIChatRequest {
  userId: string;
  conversationId?: string;
  documentId?: string;
  message: string;
  action?: AIAction;
}

export interface PersistedChatMessage {
  id: string;
  conversationId: string;
  role: 'assistant';
  content: string;
  citations?: Citation[];
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  createdAt: Date;
}

export interface AIChatStreamEvent {
  type: 'conversation' | 'chunk' | 'done';
  conversationId?: string;
  content?: string;
  message?: PersistedChatMessage;
}

export class AIChatService {
  private readonly orchestrator = getAIOrchestrator();

  async sendMessage(request: AIChatRequest): Promise<PersistedChatMessage> {
    const scope = await this.resolveConversationScope(request);

    await ConversationsService.addMessage({
      conversationId: scope.conversationId,
      role: 'user',
      content: request.message,
    });

    const response = await this.orchestrator.process({
      userId: request.userId,
      conversationId: scope.conversationId,
      documentId: scope.documentId,
      message: request.message,
      action: request.action,
    });

    const assistantMessage = await ConversationsService.addMessage({
      conversationId: scope.conversationId,
      role: 'assistant',
      content: response.content,
      citations: response.citations,
      tokenUsage: response.tokenUsage,
    });

    await UsageEventsService.logEvent({
      userId: request.userId,
      actionType: response.action,
      tokensUsed: response.tokenUsage.total,
      documentId: scope.documentId,
    });

    return {
      id: assistantMessage.id,
      conversationId: scope.conversationId,
      role: 'assistant',
      content: assistantMessage.content,
      citations: response.citations,
      tokenUsage: response.tokenUsage,
      createdAt: assistantMessage.createdAt,
    };
  }

  async *streamMessage(request: AIChatRequest): AsyncIterable<AIChatStreamEvent> {
    const scope = await this.resolveConversationScope(request);

    await ConversationsService.addMessage({
      conversationId: scope.conversationId,
      role: 'user',
      content: request.message,
    });

    yield {
      type: 'conversation',
      conversationId: scope.conversationId,
    };

    let content = '';
    let finalResponse: Awaited<ReturnType<typeof this.orchestrator.process>> | null = null;
    for await (const chunk of this.orchestrator.processStream({
      userId: request.userId,
      conversationId: scope.conversationId,
      documentId: scope.documentId,
      message: request.message,
      action: request.action,
    })) {
      if (chunk.content) {
        content += chunk.content;
        yield {
          type: 'chunk',
          conversationId: scope.conversationId,
          content: chunk.content,
        };
      }

      if (chunk.done) {
        finalResponse = chunk.response ?? null;
        break;
      }
    }

    if (!finalResponse) {
      finalResponse = {
        content,
        citations: [],
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        conversationId: scope.conversationId,
        action: request.action ?? 'CHAT',
      };
    }

    const assistantMessage = await ConversationsService.addMessage({
      conversationId: scope.conversationId,
      role: 'assistant',
      content: content || finalResponse.content,
      citations: finalResponse.citations,
      tokenUsage: finalResponse.tokenUsage,
    });

    await UsageEventsService.logEvent({
      userId: request.userId,
      actionType: finalResponse.action,
      tokensUsed: finalResponse.tokenUsage.total,
      documentId: scope.documentId,
    });

    yield {
      type: 'done',
      conversationId: scope.conversationId,
      message: {
        id: assistantMessage.id,
        conversationId: scope.conversationId,
        role: 'assistant',
        content: assistantMessage.content,
        citations: finalResponse.citations,
        tokenUsage: finalResponse.tokenUsage,
        createdAt: assistantMessage.createdAt,
      },
    };
  }

  private async resolveConversationScope(request: AIChatRequest) {
    if (request.conversationId) {
      const conversation = await ConversationsService.getOwnedConversationRecord(
        request.conversationId,
        request.userId,
      );

      const conversationDocumentId = conversation.documentId?.toString();
      const resolvedDocumentId = request.documentId ?? conversationDocumentId;

      if (!resolvedDocumentId) {
        throw new Error('A documentId is required for document-grounded chat');
      }

      if (
        request.documentId
        && conversationDocumentId
        && request.documentId !== conversationDocumentId
      ) {
        throw new Error('Conversation document does not match request document');
      }

      return {
        conversationId: conversation._id.toString(),
        documentId: resolvedDocumentId,
      };
    }

    if (!request.documentId) {
      throw new Error('A documentId is required for document-grounded chat');
    }

    const conversation = await ConversationsService.createConversation({
      userId: request.userId,
      documentId: request.documentId,
    });

    return {
      conversationId: conversation.id,
      documentId: request.documentId,
    };
  }
}
