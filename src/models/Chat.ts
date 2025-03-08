import { Schema, model, Document } from 'mongoose';

export interface IChat extends Document {
    identifier: string;
    participants: Schema.Types.ObjectId[];
    messages: IMessage[];
    chatType: 'group' | 'one-to-one';
    groupName?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IMessage {
    identifier: string;
    sender: Schema.Types.ObjectId;
    content: string;
    timestamp: Date;
}

const messageSchema = new Schema<IMessage>({
    identifier: { type: String, required: true, unique: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const chatSchema = new Schema<IChat>({
    identifier: { type: String, required: true, unique: true },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    messages: [messageSchema],
    chatType: { type: String, enum: ['group', 'one-to-one'], required: true },
    groupName: { type: String },
}, { timestamps: true });

messageSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

chatSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

export const Chat = model<IChat>('Chat', chatSchema);
