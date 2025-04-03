import mongoose, { Schema, type Document } from 'mongoose';

interface IAddress {
    street?: string;
    houseNumber?: string;
    apartment?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
}

interface IVerification {
    verified: boolean;
    code: string;
}

interface IAuthenticatorSetup {
    isEnabled: boolean;
    qrCode: string;
    secret: string;
    verificationCode: string;
    recoveryCodesGenerated: boolean;
    recoveryCodes: string[];
}

interface IPrivacySettings {
    visibility: 'public' | 'followers' | 'private';
    showOnlineState: boolean;
    showActivity: boolean;
}

interface IPost {
    identifier: string;
    image?: string;
    title?: string;
    description?: string;
    content: string;
    tags: string[];
    badges: string[];
    author: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IUser extends Document {
    identifier: string;
    userId: string;
    socketId?: string;
    accessToken?: string;
    refreshToken?: string;
    titlePicture?: string;
    profilePicture?: string;
    email?: string;
    username: string;
    role: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    password?: string;
    bio?: string;
    address?: IAddress;
    phoneNumber?: string;
    chats?: string[];
    groups?: string[];
    apiKeys?: string[];
    payments?: string[];
    stripeCustomerId?: string;
    follower?: string[];
    following?: string[];
    posts?: IPost[];
    privacySettings?: IPrivacySettings;
    emailNotification?: boolean;
    pushNotification?: boolean;
    language?: string;
    theme?: 'light' | 'dark';
    verification?: {
        email: IVerification;
        discord: IVerification;
        sms: IVerification;
    };
    authenticatorSetup?: IAuthenticatorSetup;
    betaKey?: string;
    createdAt: Date;
    updatedAt: Date;
}

// User schema
const UserSchema: Schema = new Schema<IUser>({
    identifier: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    userId: { type: String, required: true, unique: true },
    socketId: { type: String, default: '', unique: true },
    accessToken: { type: String },
    refreshToken: { type: String },
    titlePicture: {
        name: { type: String, default: '' },
        size: { type: String, default: '' },
        url: { type: String, default: '' },
    },
    profilePicture: {
        name: { type: String, default: '' },
        size: { type: String, default: '' },
        url: { type: String, default: '' },
    },
    role: { type: String, default: 'Member' },
    firstName: { type: String, default: '' },
    middleName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    email: { type: String, unique: true, sparse: true, default: '' },
    password: { type: String, default: '', unique: true },
    bio: { type: String, default: '' },
    address: {
        street: { type: String, default: '' },
        houseNumber: { type: String, default: '' },
        apartment: { type: String, default: '' },
        city: { type: String, default: '' },
        state: { type: String, default: '' },
        country: { type: String, default: '' },
        postalCode: { type: String, default: '' },
    },
    phoneNumber: { type: String, default: '' },
    chats: [{ type: String, default: [] }],
    groups: [{ type: String, default: [] }],
    apiKeys: [{ type: String, default: [] }],
    payments: [{ type: String, default: [] }],
    stripeCustomerId: { type: String, default: null },
    follower: [{ type: String, default: [] }],
    following: [{ type: String, default: [] }],
    posts: [
        {
            identifier: { type: String, required: true },
            image: { type: String },
            title: { type: String },
            description: { type: String },
            content: { type: String, required: true },
            tags: [{ type: String }],
            badges: [{ type: String }],
            author: { type: String, required: true },
            createdAt: { type: Date, default: Date.now },
            updatedAt: { type: Date, default: Date.now },
        },
    ],
    privacySettings: {
        visibility: { type: String, enum: ['public', 'followers', 'private'], default: 'public' },
        showOnlineState: { type: Boolean, default: true },
        showActivity: { type: Boolean, default: true },
    },
    emailNotification: { type: Boolean, default: false },
    pushNotification: { type: Boolean, default: false },
    language: { type: String, default: 'en' },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    verification: {
        email: {
            verified: { type: Boolean, default: false },
            code: { type: String, default: '' },
        },
        discord: {
            verified: { type: Boolean, default: false },
            code: { type: String, default: '' },
        },
        sms: {
            verified: { type: Boolean, default: false },
            code: { type: String, default: '' },
        },
    },
    authenticatorSetup: {
        isEnabled: { type: Boolean, default: false },
        qrCode: { type: String, default: '' },
        secret: { type: String, default: '', unique: true },
        verificationCode: { type: String, default: '', unique: true },
        recoveryCodesGenerated: { type: Boolean, default: false },
        recoveryCodes: [{ type: String, default: [] }],
    },
    betaKey: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// Pre-save hooks
UserSchema.pre('save', function (next) {
    if (!this.identifier) {
        this.identifier = Math.random().toString(36).substring(2, 15);
    }
    next();
});

UserSchema.pre('save', function (next) {
    if (this.posts && Array.isArray(this.posts)) {
        this.posts.forEach(post => {
            if (!post.identifier) {
                post.identifier = Math.random().toString(36).substring(2, 15);
            }
        });
    }
    next();
});

UserSchema.pre<IUser>('save', function (next) {
    this.updatedAt = new Date();
    next();
});

// Create and export User model
export const User = mongoose.model<IUser>('User', UserSchema);
