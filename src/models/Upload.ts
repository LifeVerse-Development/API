import { Schema, model, Document } from 'mongoose';

interface IUpload extends Document {
    identifier: string;
    userId: string;
    filename: string;
    filePath: string;
    fileType: string;
    size: number;
    createdAt: Date;
    updatedAt: Date;
}

const uploadSchema = new Schema<IUpload>(
    {
        identifier: { type: String, required: true, unique: true },
        userId: { type: String, required: true },
        filename: { type: String, required: true },
        filePath: { type: String, required: true },
        fileType: { type: String, required: true },
        size: { type: Number, required: true },
    },
    { timestamps: true },
);

uploadSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

export const Upload = model<IUpload>('Upload', uploadSchema);
