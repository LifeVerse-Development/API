import { Schema, model, Document } from 'mongoose';

interface IContact extends Document {
    identifier: string;
    name: string;
    email: string;
    phone: string;
    message: string;
    replied: boolean;
}

const contactSchema = new Schema<IContact>({
    identifier: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    message: { type: String, required: true },
    replied: { type: Boolean, required: true }
}, { timestamps: true });

contactSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

export const Contact = model<IContact>('Contact', contactSchema);
