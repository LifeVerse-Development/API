import { Schema, model, Document } from 'mongoose';

interface IMaintenance extends Document {
    identifier: string;
    isActive: boolean;
    title: string;
    message: string;
    createdAt: Date;
    updatedAt: Date;
}

const maintenanceSchema = new Schema<IMaintenance>({
    identifier: { type: String, required: true, unique: true },
    isActive: { type: Boolean, default: false },
    title: { type: String, default: 'Under Maintenance' },
    message: { type: String, default: 'The API is currently under maintenance. Please try again later.' },
}, { timestamps: true });

maintenanceSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

export const Maintenance = model<IMaintenance>('Maintenance', maintenanceSchema);
