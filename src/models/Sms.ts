import { Schema, model, Document } from 'mongoose';

interface ISms extends Document {
    identifier: string;
    phoneNumber: string;
    message: string;
    sentAt: Date;
    status: string;
    createdAt: Date;
    updatedAt: Date;
}

const SmsSchema = new Schema<ISms>({
    identifier: { type: String, required: true, unique: true },
    phoneNumber: { type: String, required: true },
    message: { type: String, required: true },
    sentAt: { type: Date, required: true },
    status: { type: String, enum: ['sent', 'scheduled'], default: 'sent' },
}, { timestamps: true });

SmsSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

export const Sms = model<ISms>('Sms', SmsSchema);
