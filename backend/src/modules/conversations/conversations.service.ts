import mongoose from 'mongoose';
import Document from '../documents/document.model.js';
import Conversation from './conversation.model.js';
import Message, {
  type IMessageCitation,
  type IMessageTokenUsage,
  type MessageRole,
} from './message.model.js';

interface ListConversationsOptions {
  page: number;
  limit: number;
  documentId?: string;
}

interface CreateConversationInput {
  userId: string;
  documentId?: string;
  title?: string;
  contextSummary?: string;
}

interface AddMessageInput {
  conversationId: string;
  role: MessageRole;
  content: string;
  citations?: MessageCitationInput[];
  tokenUsage?: IMessageTokenUsage;
}

interface MessageCitationInput {
  chunkId?: string;
  documentId?: string;
  pageNumber?: number;
  snippet?: string;
}

export class ConversationsService {
  static async createConversation(input: CreateConversationInput) {
    const userId = new mongoose.Types.ObjectId(input.userId);
    const documentId = input.documentId ? await this.ensureOwnedDocument(input.documentId, input.userId) : undefined;
    const title = input.title?.trim() || await this.buildDefaultTitle(input.documentId);

    const conversation = await Conversation.create({
      userId,
      documentId,
      title,
      contextSummary: input.contextSummary?.trim() || undefined,
    });

    return conversation;
  }

  static async addMessage(input: AddMessageInput) {
    if (!mongoose.Types.ObjectId.isValid(input.conversationId)) {
      throw new Error('Invalid conversation ID');
    }

    const conversationId = new mongoose.Types.ObjectId(input.conversationId);
    const citations = input.citations?.map((citation) => this.mapCitationInput(citation));

    const message = await Message.create({
      conversationId,
      role: input.role,
      content: input.content,
      citations: citations?.length ? citations : undefined,
      tokenUsage: input.tokenUsage,
    });

    await Conversation.findByIdAndUpdate(conversationId, { updatedAt: message.createdAt });

    return message;
  }

  static async listConversations(userId: string, options: ListConversationsOptions) {
    const filter: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
    };

    if (options.documentId) {
      filter.documentId = await this.ensureOwnedDocument(options.documentId, userId);
    }

    const skip = (options.page - 1) * options.limit;

    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(options.limit)
        .lean(),
      Conversation.countDocuments(filter),
    ]);

    const conversationIds = conversations.map((conversation) => conversation._id);
    const messageCounts = conversationIds.length
      ? await Message.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
        {
          $match: {
            conversationId: { $in: conversationIds },
          },
        },
        {
          $group: {
            _id: '$conversationId',
            count: { $sum: 1 },
          },
        },
      ])
      : [];

    const countByConversationId = new Map(
      messageCounts.map((item) => [item._id.toString(), item.count]),
    );

    return {
      conversations: conversations.map((conversation) => ({
        id: conversation._id.toString(),
        documentId: conversation.documentId ? conversation.documentId.toString() : null,
        title: conversation.title,
        messageCount: countByConversationId.get(conversation._id.toString()) ?? 0,
        updatedAt: conversation.updatedAt,
        createdAt: conversation.createdAt,
      })),
      total,
      page: options.page,
      totalPages: Math.ceil(total / options.limit),
    };
  }

  static async getConversationById(conversationId: string, userId: string) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      throw new Error('Invalid conversation ID');
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      userId: new mongoose.Types.ObjectId(userId),
    }).lean();

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const messages = await Message.find({ conversationId: conversation._id })
      .sort({ createdAt: 1 })
      .lean();

    return {
      id: conversation._id.toString(),
      documentId: conversation.documentId ? conversation.documentId.toString() : null,
      title: conversation.title,
      contextSummary: conversation.contextSummary,
      messages: messages.map((message) => ({
        id: message._id.toString(),
        role: message.role,
        content: message.content,
        citations: message.citations?.map((citation) => ({
          chunkId: citation.chunkId?.toString(),
          documentId: citation.documentId?.toString(),
          pageNumber: citation.pageNumber,
          snippet: citation.snippet,
        })),
        tokenUsage: message.tokenUsage,
        createdAt: message.createdAt,
      })),
      updatedAt: conversation.updatedAt,
      createdAt: conversation.createdAt,
    };
  }

  private static async ensureOwnedDocument(documentId: string, userId: string) {
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      throw new Error('Invalid document ID');
    }

    const ownedDocument = await Document.findOne({
      _id: documentId,
      ownerId: new mongoose.Types.ObjectId(userId),
    })
      .select('_id title')
      .lean();

    if (!ownedDocument) {
      throw new Error('Document not found');
    }

    return ownedDocument._id;
  }

  private static async buildDefaultTitle(documentId?: string) {
    if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
      return 'New conversation';
    }

    const document = await Document.findById(documentId).select('title').lean();
    if (!document?.title) {
      return 'New conversation';
    }

    return `Chat about ${document.title}`;
  }

  private static mapCitationInput(citation: MessageCitationInput): IMessageCitation {
    const mapped: IMessageCitation = {};

    if (citation.chunkId && mongoose.Types.ObjectId.isValid(citation.chunkId)) {
      mapped.chunkId = new mongoose.Types.ObjectId(citation.chunkId);
    }

    if (citation.documentId && mongoose.Types.ObjectId.isValid(citation.documentId)) {
      mapped.documentId = new mongoose.Types.ObjectId(citation.documentId);
    }

    if (typeof citation.pageNumber === 'number') {
      mapped.pageNumber = citation.pageNumber;
    }

    if (citation.snippet?.trim()) {
      mapped.snippet = citation.snippet.trim();
    }

    return mapped;
  }
}
