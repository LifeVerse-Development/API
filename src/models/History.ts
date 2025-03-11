import { Schema, model, Document } from 'mongoose';

interface IHistory extends Document {
    identifier: string;
    userId: string;
    action: string;
    description: string;
    details?: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
}

const historySchema = new Schema<IHistory>({
    identifier: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    action: { type: String, required: true },
    description: { type: String, required: true },
    details: { type: String, default: '' },
    status: { type: String, enum: ['read', 'unread'], default: 'unread' },
}, { timestamps: true });

historySchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

export const History = model<IHistory>('History', historySchema);
