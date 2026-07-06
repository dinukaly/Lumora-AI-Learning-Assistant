import mongoose from 'mongoose';
import Notification, { type INotification, type NotificationType } from './notification.model.js';
import { emitToUser, SOCKET_EVENTS } from '../../common/realtime/socket.js';
import User from '../users/user.model.js';

interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

interface DocumentStatusPayload {
  documentId: string;
  status: 'READY' | 'FAILED';
  title: string;
  processingError?: string;
}

interface SerializableNotificationShape {
  _id: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  readAt?: Date | null;
  createdAt: Date;
}

export class NotificationsService {
  static async listNotifications(userId: string, options: {
    unreadOnly?: boolean;
    page: number;
    limit: number;
  }) {
    const filter: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
    };

    if (options.unreadOnly) {
      filter.readAt = { $exists: false };
    }

    const skip = (options.page - 1) * options.limit;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(options.limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({
        userId: new mongoose.Types.ObjectId(userId),
        readAt: { $exists: false },
      }),
    ]);

    return {
      notifications: notifications.map((notification) => this.serializeNotification(notification)),
      unreadCount,
      total,
      page: options.page,
      totalPages: Math.ceil(total / options.limit),
    };
  }

  static async markAsRead(userId: string, notificationId: string) {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      throw new Error('Invalid notification ID');
    }

    const notification = await Notification.findOne({
      _id: notificationId,
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    if (!notification.readAt) {
      notification.readAt = new Date();
      await notification.save();
    }

    return {
      id: notification.id,
      readAt: notification.readAt,
    };
  }

  static async markAllAsRead(userId: string) {
    const readAt = new Date();
    await Notification.updateMany(
      {
        userId: new mongoose.Types.ObjectId(userId),
        readAt: { $exists: false },
      },
      {
        $set: { readAt },
      },
    );

    return {
      message: 'All notifications marked as read',
    };
  }

  static async createNotification(input: NotificationInput) {
    const notification = await Notification.create(input);
    emitToUser(input.userId, SOCKET_EVENTS.notificationNew, {
      notification: this.serializeNotification(notification),
    });
    return notification;
  }

  static async broadcastAdminNotification(input: {
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }) {
    const users = await User.find({}).select('_id').lean();
    if (users.length === 0) {
      return {
        createdCount: 0,
      };
    }

    const notifications = await Notification.insertMany(
      users.map((user) => ({
        userId: user._id,
        type: 'ADMIN_BROADCAST' as const,
        title: input.title,
        body: input.body,
        metadata: input.metadata,
      })),
    );

    for (const notification of notifications) {
      emitToUser(notification.userId.toString(), SOCKET_EVENTS.notificationNew, {
        notification: this.serializeNotification(notification),
      });
    }

    return {
      createdCount: notifications.length,
    };
  }

  static async notifyDocumentReady(input: {
    userId: string;
    documentId: string;
    title: string;
    originalFileName: string;
  }) {
    const notification = await this.createNotification({
      userId: input.userId,
      type: 'DOCUMENT_READY',
      title: 'Document processed',
      body: `${input.originalFileName} is ready for learning`,
      metadata: {
        documentId: input.documentId,
      },
    });

    this.emitDocumentStatus(input.userId, {
      documentId: input.documentId,
      status: 'READY',
      title: input.title,
    });

    return notification;
  }

  static async notifyDocumentFailed(input: {
    userId: string;
    documentId: string;
    title: string;
    originalFileName: string;
    error: string;
  }) {
    const notification = await this.createNotification({
      userId: input.userId,
      type: 'PROCESSING_FAILED',
      title: 'Document processing failed',
      body: `${input.originalFileName} could not be processed`,
      metadata: {
        documentId: input.documentId,
        error: input.error,
      },
    });

    this.emitDocumentStatus(input.userId, {
      documentId: input.documentId,
      status: 'FAILED',
      title: input.title,
      processingError: input.error,
    });

    return notification;
  }

  static async notifyFlashcardsReady(input: {
    userId: string;
    documentId: string;
    title: string;
    createdCount: number;
  }) {
    return this.createNotification({
      userId: input.userId,
      type: 'FLASHCARDS_READY',
      title: 'Flashcards generated',
      body: `${input.createdCount} flashcards are ready for ${input.title}`,
      metadata: {
        documentId: input.documentId,
        createdCount: input.createdCount,
      },
    });
  }

  static async notifyQuizReady(input: {
    userId: string;
    documentId: string;
    quizId: string;
    title: string;
    questionCount: number;
  }) {
    return this.createNotification({
      userId: input.userId,
      type: 'QUIZ_READY',
      title: 'Quiz generated',
      body: `${input.questionCount} questions are ready for ${input.title}`,
      metadata: {
        documentId: input.documentId,
        quizId: input.quizId,
        questionCount: input.questionCount,
      },
    });
  }

  static emitDocumentStatus(userId: string, payload: DocumentStatusPayload) {
    emitToUser(userId, SOCKET_EVENTS.documentStatus, payload);
  }

  static serializeNotification(notification: SerializableNotificationShape) {
    return {
      id: notification._id.toString(),
      type: notification.type,
      title: notification.title,
      body: notification.body,
      metadata: notification.metadata,
      readAt: notification.readAt ?? null,
      createdAt: notification.createdAt,
    };
  }
}
