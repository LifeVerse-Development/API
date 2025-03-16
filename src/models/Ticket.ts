import { Schema, model, Document } from 'mongoose';

export type TicketStatus = "open" | "in-progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

interface Attachment {
    name: string;
    size: string;
    url: string;
}

interface Message {
    sender: "user" | "support";
    senderName: string;
    content: string;
    timestamp: string;
    attachments?: Attachment[];
}

export interface ITicket extends Document {
    identifier: string;
    subject: string;
    description: string;
    status: TicketStatus;
    priority: TicketPriority;
    category: string;
    createdAt: string;
    lastUpdated: string;
    assignedTo?: string;
    messages: Message[];
}

const TicketSchema = new Schema<ITicket>({
    identifier: { type: String, required: true, unique: true },
    subject: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ["open", "in-progress", "resolved", "closed"], default: "open" },
    priority: { type: String, enum: ["low", "medium", "high", "urgent"], default: "medium" },
    category: { type: String, required: true },
    createdAt: { type: String, default: () => new Date().toISOString(), immutable: true }, // createdAt ist unveränderbar
    lastUpdated: { type: String, default: () => new Date().toISOString() },
    assignedTo: { type: String, required: false },
    messages: [
        {
            sender: { type: String, enum: ["user", "support"], required: true },
            senderName: { type: String, required: true },
            content: { type: String, required: true },
            timestamp: { type: String, default: () => new Date().toISOString(), immutable: true }, // timestamp ist unveränderbar
            attachments: [
                {
                    name: String,
                    size: String,
                    url: String,
                },
            ],
        },
    ],
});

TicketSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

TicketSchema.pre('findOneAndUpdate', function (next) {
    this.set({ lastUpdated: new Date().toISOString() });
    next();
});

TicketSchema.pre('updateOne', function (next) {
    this.set({ lastUpdated: new Date().toISOString() });
    next();
});

TicketSchema.pre('save', function (next) {
    if (!this.isNew) {
        this.lastUpdated = new Date().toISOString();
    }
    next();
});

TicketSchema.pre('findOneAndUpdate', function (next) {
    const update = this.getUpdate() as any;
    if (update?.$set?.["messages.$.timestamp"]) {
        delete update.$set["messages.$.timestamp"];
    }
    next();
});

export const Ticket = model<ITicket>("Ticket", TicketSchema);
