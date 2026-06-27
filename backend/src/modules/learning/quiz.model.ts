import mongoose, { Document, Schema } from 'mongoose';

export type QuizDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface IQuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface IQuiz extends Document {
  documentId: mongoose.Types.ObjectId;
  title: string;
  questions: IQuizQuestion[];
  sourceChunkIds?: mongoose.Types.ObjectId[];
  createdBy: string;
  difficulty?: QuizDifficulty;
  createdAt: Date;
  updatedAt: Date;
}

const QuizQuestionSchema = new Schema(
  {
    question: { type: String, required: true, trim: true },
    options: {
      type: [{ type: String, required: true, trim: true }],
      validate: {
        validator: (value: string[]) => Array.isArray(value) && value.length >= 2,
        message: 'A quiz question requires at least 2 options',
      },
    },
    correctIndex: { type: Number, required: true, min: 0 },
    explanation: { type: String, default: undefined, trim: true },
  },
  {
    _id: false,
  },
);

const QuizSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    title: { type: String, required: true, trim: true },
    questions: {
      type: [QuizQuestionSchema],
      required: true,
      validate: {
        validator: (value: IQuizQuestion[]) => Array.isArray(value) && value.length > 0,
        message: 'A quiz requires at least one question',
      },
    },
    sourceChunkIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'DocumentChunk' }],
      default: undefined,
    },
    createdBy: { type: String, required: true, trim: true },
    difficulty: {
      type: String,
      enum: ['EASY', 'MEDIUM', 'HARD'],
      default: undefined,
    },
  },
  {
    timestamps: true,
  },
);

QuizSchema.index({ documentId: 1 });

export default mongoose.model<IQuiz>('Quiz', QuizSchema);
