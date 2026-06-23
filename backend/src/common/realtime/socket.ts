import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { verifyAccessToken, type TokenPayload } from '../utils/jwt.js';

export const SOCKET_EVENTS = {
  notificationNew: 'notification:new',
  documentStatus: 'document:status',
} as const;

type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

let ioInstance: Server | null = null;

export function initializeSocketServer(httpServer: HttpServer) {
  if (ioInstance) {
    return ioInstance;
  }

  ioInstance = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  ioInstance.use((socket, next) => {
    try {
      const token = extractSocketToken(socket);
      if (!token) {
        next(new Error('Authentication token is required'));
        return;
      }

      socket.data = verifyAccessToken(token);
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  ioInstance.on('connection', (socket) => {
    const payload = socket.data as TokenPayload;
    socket.join(getUserRoom(payload.userId));
  });

  return ioInstance;
}

export function getUserRoom(userId: string) {
  return `user:${userId}`;
}

export function emitToUser(userId: string, event: SocketEventName, payload: unknown) {
  if (!ioInstance) {
    return false;
  }

  ioInstance.to(getUserRoom(userId)).emit(event, payload);
  return true;
}

function extractSocketToken(socket: Socket) {
  const authToken = socket.handshake.auth.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim();
  }

  const authorizationHeader = socket.handshake.headers.authorization;
  if (typeof authorizationHeader === 'string' && authorizationHeader.startsWith('Bearer ')) {
    return authorizationHeader.slice('Bearer '.length).trim();
  }

  return null;
}
