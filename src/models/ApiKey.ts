import mongoose, { Schema, Document } from 'mongoose';

export interface IApiKey extends Document {
    identifier: string;
    name: string;
    key: string;
    user: mongoose.Types.ObjectId;
    expiresAt: Date;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    deactivate: () => Promise<void>;
    isExpired: () => boolean;
}

const apiKeySchema = new Schema<IApiKey>(
    {
        identifier: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        key: { type: String, required: true, unique: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        expiresAt: { type: Date, required: true },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true },
);

apiKeySchema.methods.deactivate = async function () {
    this.isActive = false;
    await this.save();
};

apiKeySchema.methods.isExpired = function (): boolean {
    return new Date() > this.expiresAt;
};

apiKeySchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

export const ApiKey = mongoose.model<IApiKey>('ApiKey', apiKeySchema);
