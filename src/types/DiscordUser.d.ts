import { IAddress } from "./Address";
import { IAuthenticatorSetup } from "./AuthenticatorSetup";
import { IPost } from "./Post";
import { IPrivacySettings } from "./PrivacySettings";
import { IVerification } from "./Verification";

export interface DiscordUser {
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
    theme?: "light" | "dark" | "system";
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