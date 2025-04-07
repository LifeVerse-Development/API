import { Schema, model, Document } from 'mongoose';

export interface IRole extends Document {
    identifier: string;
    color: string;
    name: string;
    permissions: string[];
    createdAt: Date;
    updatedAt: Date;
}

const roleSchema = new Schema<IRole>(
    {
        identifier: { type: String, required: true, unique: true },
        color: { type: String, required: true },
        name: { type: String, required: true, unique: true },
        permissions: { type: [String], default: [] },
    },
    { timestamps: true },
);

roleSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

export const Role = model<IRole>('Role', roleSchema);
