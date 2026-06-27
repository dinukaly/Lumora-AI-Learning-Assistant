import mongoose from 'mongoose';
import UsageEvent, { type UsageActionType } from './usage-event.model.js';

interface LogUsageEventInput {
  userId: string;
  actionType: UsageActionType;
  tokensUsed: number;
  documentId?: string;
  costEstimate?: number;
}

export class UsageEventsService {
  static async logEvent(input: LogUsageEventInput) {
    return UsageEvent.create({
      userId: new mongoose.Types.ObjectId(input.userId),
      actionType: input.actionType,
      tokensUsed: Math.max(0, input.tokensUsed),
      documentId: input.documentId ? new mongoose.Types.ObjectId(input.documentId) : undefined,
      costEstimate: input.costEstimate,
    });
  }
}
