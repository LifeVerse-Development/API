import { Schema, model, Document } from 'mongoose';

export interface IPayment extends Document {
    identifier: string;
    paymentMethod: string;
    amount: number;
    currency: string;
    paymentDate: Date;
    transactionId?: string;
    createdAt: Date;
    updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>({
    identifier: { type: String, required: true, unique: true },
    paymentMethod: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    paymentDate: { type: Date, required: true },
    transactionId: { type: String, default: '' }
}, { timestamps: true });

paymentSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

export const Payment = model<IPayment>('Payment', paymentSchema);
