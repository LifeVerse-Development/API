import mongoose, { Schema, type Document } from "mongoose"

interface IMessage {
    identifier: string
    sender: string
    content: string
    timestamp: Date
}

export interface IChat extends Document {
    identifier: string
    name: string
    participants: mongoose.Types.ObjectId[]
    messages: IMessage[]
    lastMessage?: IMessage
    createdAt: Date
    updatedAt: Date
}

const messageSchema = new Schema<IMessage>({
    identifier: { type: String, required: true },
    sender: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
})

const chatSchema = new Schema<IChat>(
    {
        identifier: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        messages: [messageSchema],
        lastMessage: { type: messageSchema, required: false },
    },
    { timestamps: true },
)

chatSchema.pre("save", function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15)
    }
    next()
})

export const Chat = mongoose.model<IChat>("Chat", chatSchema)

