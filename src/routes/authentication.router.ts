import { Router, Request, Response } from "express";
import passport from "passport";
import { isAuthenticated } from "../middlewares/authentication.middleware";

const router = Router();

interface DiscordUser {
    id: string;
    role: string;
    profilePicture: string;
    username: string;
    fullName: string;
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

        res.redirect(
            `http://localhost:3000/login?user=${encodeURIComponent(JSON.stringify(user))}`
        );
    }
);

router.get("/logout", isAuthenticated, (req, res, next) => {
    req.session.destroy((err) => {
        if (err) {
            return next(err);
        }
        res.clearCookie("connect.sid");
        res.redirect("/");
    });
});

export default router;
