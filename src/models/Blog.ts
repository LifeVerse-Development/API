import { Schema, model, Document } from 'mongoose';

interface IComment extends Document {
    identifier: string;
    user: Schema.Types.ObjectId;
    profileImage?: string;
    username: string;
    content: string;
    createdAt: Date;
}

interface IReaction extends Document {
    user: Schema.Types.ObjectId;
    type: 'like' | 'dislike';
}

interface IBlog extends Document {
    identifier: string;
    image?: string;
    title: string;
    description: string;
    content: string;
    tags: string[];
    author: string;
    reactions: IReaction[];
    comments: IComment[];
    createdAt: Date;
    updatedAt: Date;
}

const commentSchema = new Schema<IComment>(
    {
        identifier: { type: String, required: true, unique: true },
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        profileImage: { type: String },
        username: { type: String, required: true },
        content: { type: String, required: true },
    },
    { timestamps: true },
);

const reactionSchema = new Schema<IReaction>({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['like', 'dislike'], required: true },
});

const blogSchema = new Schema<IBlog>(
    {
        identifier: { type: String, required: true, unique: true },
        image: { type: String },
        title: { type: String, required: true },
        description: { type: String, required: true },
        content: { type: String, required: true },
        tags: { type: [String], required: true },
        author: { type: String, required: true },
        reactions: [reactionSchema],
        comments: [commentSchema],
    },
    { timestamps: true },
);

blogSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

commentSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

export const Blog = model<IBlog>('Blog', blogSchema);
export const Comment = model<IComment>('Comment', commentSchema);
export const Reaction = model<IReaction>('Reaction', reactionSchema);
