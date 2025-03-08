import { Schema, model, Document } from 'mongoose';

interface IPost {
    identifier: string;
    image: string;
    title: string;
    description: string;
    content: string;
    tags: string[];
    badges: string[];
    author: string;
    createdAt: Date;
}

export interface IUser extends Document {
    identifier: string;
    userId: string;
    socketId: string;
    accessToken: string;
    refreshToken: string;
    titlePicture?: string;
    profilePicture?: string;
    email?: string;
    username: string;
    role: string;
    bio?: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    address?: {
        street: string;
        houseNumber: string;
        city: string;
        state: string;
        country: string;
        postalCode: string;
    };
    payments: Schema.Types.ObjectId[];
    stripeCustomerId?: string;
    chats: Schema.Types.ObjectId[];
    groups: Schema.Types.ObjectId[];
    follower?: string[];
    following?: string[];
    posts?: IPost[];
    apiKeys: Schema.Types.ObjectId[];
    betaKey: Schema.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const userSchema = new Schema<IUser>({
    identifier: { type: String, required: true, unique: true },
    userId: { type: String, required: true, unique: true },
    socketId: { type: String, default: '', unique: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true, unique: true },
    titlePicture: { type: String, default: '' },
    profilePicture: { type: String, default: '' },
    email: { type: String, default: '' },
    username: { type: String, required: true },
    role: { type: String, default: 'Member', required: true },
    bio: { type: String, default: '' },
    firstName: { type: String, default: '' },
    middleName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    address: {
        street: { type: String, default: '' },
        houseNumber: { type: String, default: '' },
        city: { type: String, default: '' },
        state: { type: String, default: '' },
        country: { type: String, default: '' },
        postalCode: { type: String, default: '' },
    },
    payments: [{ type: Schema.Types.ObjectId, ref: 'Payment' }],
    stripeCustomerId: { type: String, default: null },
    chats: [{ type: Schema.Types.ObjectId, ref: 'Chat' }],
    groups: [{ type: Schema.Types.ObjectId, ref: 'Chat' }],
    follower: { type: [String], default: [] },
    following: { type: [String], default: [] },
    posts: [{ type: Schema.Types.ObjectId, ref: 'Post' }],
    apiKeys: [{ type: Schema.Types.ObjectId, ref: 'ApiKey' }],
    betaKey: { type: Schema.Types.ObjectId, ref: 'BetaKey' },
}, { timestamps: true });

userSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

userSchema.pre('save', function (next) {
    if (this.posts && Array.isArray(this.posts)) {
        this.posts.forEach(post => {
            if (!post.identifier) {
                post.identifier = Math.random().toString(36).substring(2, 15);
            }
        });
    }
    next();
});

userSchema.pre<IUser>('save', function (next) {
    this.updatedAt = new Date();
    next();
});

export const User = model<IUser>('User', userSchema);
