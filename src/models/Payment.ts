import { Schema, model, Document } from 'mongoose';

export interface IPayment extends Document {
    identifier: string;
    paymentMethod: string;
    amount: number;
    currency: string;
    paymentDate: Date;
    transactionId?: string;
    status: string;
    customerInfo: {
        name: string;
        email: string;
        phone: string;
    };
    shippingInfo: {
        address: {
            line1: string;
            line2: string;
            city: string;
            state: string;
            postalCode: string;
            country: string;
        };
        method: string;
    };
    items: Array<{
        productId: string;
        name: string;
        price: number;
        quantity: number;
    }>;
    createdAt: Date;
    updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>({
    identifier: { type: String, required: true, unique: true },
    paymentMethod: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    paymentDate: { type: Date, required: true },
    transactionId: { type: String, default: '' },
    status: { type: String, required: true },
    customerInfo: {
        name: { type: String, required: true },
        email: { type: String, required: true },
        phone: { type: String, required: false, default: "" }
    },
    shippingInfo: {
        address: {
            line1: { type: String, required: true },
            line2: { type: String, required: false, default: "" },
            city: { type: String, required: true },
            state: { type: String, required: false, default: "" },
            postalCode: { type: String, required: true },
            country: { type: String, required: true },
        },
        method: { type: String, required: true }
    },
    items: [{
        productId: { type: String, required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true }
    }]
}, { timestamps: true });

paymentSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

export const Payment = model<IPayment>('Payment', paymentSchema);
