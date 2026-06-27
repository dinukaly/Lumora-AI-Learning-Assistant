import mongoose, { Document, Schema } from 'mongoose';

export interface IQuizAttempt extends Document {
  userId: mongoose.Types.ObjectId;
  quizId: mongoose.Types.ObjectId;
  answers: number[];
  score: number;
  totalQuestions: number;
  completedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const QuizAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    answers: {
      type: [{ type: Number, required: true }],
      required: true,
    },
    score: { type: Number, required: true, min: 0 },
    totalQuestions: { type: Number, required: true, min: 0 },
    completedAt: { type: Date, default: () => new Date(), required: true },
  },
  {
    timestamps: true,
  },
);

QuizAttemptSchema.index({ userId: 1, quizId: 1 });

export default mongoose.model<IQuizAttempt>('QuizAttempt', QuizAttemptSchema);
