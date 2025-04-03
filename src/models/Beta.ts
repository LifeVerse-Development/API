import { Schema, model, Document } from 'mongoose';

interface IBetaKey {
    _id: Schema.Types.ObjectId;
    identifier: string;
    name: string;
    key: string;
    isActive: boolean;
    isExpired: boolean;
    expireAt: Date;
    user?: string;
    checkExpiration(): boolean;
}

interface IBeta extends Document {
    identifier: string;
    isEnabled: boolean;
    keys: IBetaKey[];
    createdAt: Date;
    updatedAt: Date;
    toggleBetaSystem(): void;
}

const betaKeySchema = new Schema<IBetaKey>(
    {
        identifier: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        key: { type: String, required: true, unique: true },
        isActive: { type: Boolean, default: true },
        isExpired: { type: Boolean, default: false },
        expireAt: { type: Date, required: true },
        user: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

const betaSchema = new Schema<IBeta>(
    {
        identifier: { type: String, required: true, unique: true },
        isEnabled: { type: Boolean, default: true },
        keys: { type: [betaKeySchema], default: [] },
    },
    { timestamps: true },
);

betaSchema.methods.toggleBetaSystem = function (): void {
    this.isEnabled = !this.isEnabled;
};

betaSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

betaKeySchema.methods.checkExpiration = function (): boolean {
    return new Date() > this.expireAt;
};

betaKeySchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

export const Beta = model<IBeta>('Beta', betaSchema);
export const BetaKey = model<IBetaKey>('BetaKey', betaKeySchema);
