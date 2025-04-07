import { Schema, model, Document } from 'mongoose';

export interface IReview {
    user: string;
    rating: number;
    comment: string;
    createdAt: Date;
}

export interface IProduct extends Document {
    identifier: string;
    images: string[];
    name: string;
    description: string;
    price: number;
    image: string;
    category: string;
    stock: number;
    rating: number;
    featured?: boolean;
    new?: boolean;
    details?: string[];
    specifications?: { [key: string]: string };
    reviews?: IReview[];
    createdAt: Date;
    updatedAt: Date;
}

const ProductSchema: Schema = new Schema<IProduct>(
    {
        identifier: { type: String, required: true, unique: true },
        images: { type: [String], required: true },
        name: { type: String, required: true },
        description: { type: String, required: true },
        price: { type: Number, required: true },
        image: { type: String, required: true },
        category: { type: String, required: true },
        stock: { type: Number, required: true },
        rating: { type: Number, required: true },
        featured: { type: Boolean, default: false },
        new: { type: Boolean, default: false },
        details: { type: [String], default: [] },
        specifications: { type: Map, of: String, default: {} },
        reviews: [
            {
                user: { type: String, required: true },
                rating: { type: Number, required: true },
                comment: { type: String, required: true },
                createdAt: { type: Date, default: Date.now },
            },
        ],
    },
    { timestamps: true },
);

ProductSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

export default model<IProduct>('Product', ProductSchema);
