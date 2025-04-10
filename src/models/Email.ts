import { Schema, model, type Document } from "mongoose"

export interface IEmail extends Document {
    identifier: string
    to: string
    subject: string
    text: string
    html: string
    profilePicture?: string
    sentAt: Date
}

const emailSchema = new Schema<IEmail>({
    identifier: { type: String, required: true, unique: true },
    to: { type: String, required: true },
    subject: { type: String, required: true },
    text: { type: String, required: true },
    html: { type: String, required: true },
    profilePicture: { type: String },
    sentAt: { type: Date, default: Date.now },
})

emailSchema.pre("save", function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15)
    }
    next()
})

export const Email = model<IEmail>("Email", emailSchema)

