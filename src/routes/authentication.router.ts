import { Router, Request, Response, NextFunction } from "express";
import passport from "passport";
import { isAuthenticated } from "../middlewares/authentication.middleware";
import { logger } from "../services/logger.service";
import { config } from "../configs/main.config";

const router = Router();

interface DiscordUser {
    identifier: string;
    userId: string;
    socketId: string;
    accessToken: string;
    refreshToken: string;
    titlePicture?: string;
    profilePicture?: string;
    email: string;
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
    payments?: [{
        identifier: string;
        paymentMethod: string;
        amount: number;
        currency: string;
        paymentDate: Date;
        transactionId: string;
        createdAt: Date;
    }];
    chats?: [{
        identifier: string;
        name: string;
        messages: [string];
        createdAt: Date;
    }];
    groups?: [{
        identifier: string;
        image?: string;
        name: string;
        description?: string;
        users: [string];
        createdAt: Date;
    }];
    follower: {
        userId: string;
    };
    following: {
        userId: string;
    };
    posts: [{
        identifier: string;
        image?: string;
        title: string;
        description: string;
        content: string;
        tags: [string];
        badges: [string];
        author: string;
        createdAt: Date;
    }];
    apiKeys?: [{
        identifier: string;
        name: string;
        key: string;
        user: string;
        expiresAt: Date;
        isActive: boolean;
        createdAt: Date;
    }];
    betaKey?: {
        identifier: string;
        name: string;
        key: string;
        isActive: boolean;
        isExpired: boolean;
        expireAt: Date;
        user?: string;
        createdAt: Date;
    };
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
        logger.debug(`${req.session.user?.username} successfully logged out.`)
    });
});

export default router;
