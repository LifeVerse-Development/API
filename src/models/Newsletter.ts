import { Schema, model, Document } from 'mongoose';

export interface INewsletterSubscriber extends Document {
    identifier: string;
    email: string;
    status: 'active' | 'inactive';
    subscribedAt: Date;
    unsubscribedAt?: Date;
}

const NewsletterSubscriberSchema = new Schema<INewsletterSubscriber>({
    identifier: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    subscribedAt: { type: Date, default: Date.now },
    unsubscribedAt: { type: Date, default: null },
});

export const NewsletterSubscriber = model<INewsletterSubscriber>('NewsletterSubscriber', NewsletterSubscriberSchema);

NewsletterSubscriberSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

export interface INewsletter extends Document {
    identifier: string;
    subject: string;
    content: string;
    sentAt?: Date;
}

const NewsletterSchema = new Schema<INewsletter>({
    identifier: { type: String, required: true, unique: true },
    subject: { type: String, required: true },
    content: { type: String, required: true },
    sentAt: { type: Date, default: null },
});

NewsletterSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

export const Newsletter = model<INewsletter>('Newsletter', NewsletterSchema);
