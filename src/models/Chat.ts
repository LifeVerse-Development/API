import { Schema, model, Document } from 'mongoose';

interface IMessage {
    identifier: string;
    sender: Schema.Types.ObjectId;
    content: string;
    timestamp: Date;
}

export interface IChat extends Document {
    identifier: string;
    participants: Schema.Types.ObjectId[];
    messages: IMessage[];
    lastMessage?: IMessage;
    createdAt: Date;
    updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>({
    identifier: { type: String, required: true, unique: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const ChatSchema = new Schema<IChat>({
    identifier: { type: String, required: true, unique: true },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    messages: [MessageSchema],
    lastMessage: MessageSchema
}, { timestamps: true });

MessageSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

ChatSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

export const Chat = model<IChat>('Chat', ChatSchema);