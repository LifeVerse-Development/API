import { Router, Request, Response, NextFunction } from "express";
import passport from "passport";
import { isAuthenticated } from "../middlewares/authentication.middleware";
import { logger } from "../services/logger.service";
import { config } from "../configs/main.config";

const router = Router();

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
    visibility: "public" | "followers" | "private";
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

interface DiscordUser {
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

declare module "express-session" {
    interface Session {
        user?: DiscordUser;
    }
}

router.get("/discord", passport.authenticate("discord"));

router.get("/discord/callback", passport.authenticate("discord", { failureRedirect: `/` }),
    (req: Request, res: Response) => {
        if (!req.user) {
            res.status(401).json({ message: "Authentication failed" });
            return;
        }

        const user = req.user as DiscordUser;
        req.session.user = user;

        res.status(200).redirect(
            `${config.frontendUrl}/login?user=${encodeURIComponent(JSON.stringify(user))}`
        );
    }
);

router.get("/logout", isAuthenticated, (req: Request, res: Response, next: NextFunction) => {
    req.session.destroy((err) => {
        if (err) {
            return next(err);
        }
        res.clearCookie("connect.sid");
        res.status(200).json({ message: `${req.session.user?.username} been successfully logged out.` });
        logger.debug(`${req.session.user?.username} successfully logged out.`);
    });
});

export default router;
