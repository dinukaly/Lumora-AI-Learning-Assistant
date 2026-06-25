import Notification, { type INotification, type NotificationType } from './notification.model.js';
import { emitToUser, SOCKET_EVENTS } from '../../common/realtime/socket.js';

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

export class NotificationsService {
  static async createNotification(input: NotificationInput) {
    const notification = await Notification.create(input);
    emitToUser(input.userId, SOCKET_EVENTS.notificationNew, {
      notification: this.serializeNotification(notification),
    });
    return notification;
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

  static emitDocumentStatus(userId: string, payload: DocumentStatusPayload) {
    emitToUser(userId, SOCKET_EVENTS.documentStatus, payload);
  }

  static serializeNotification(notification: INotification) {
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
