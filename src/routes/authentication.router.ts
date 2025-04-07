import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { sendEmailVerification, sendSmsVerification } from '../controllers/authentication.controller';
import { isAuthenticated } from '../middlewares/authentication.middleware';
import { logger } from '../services/logger.service';
import { config } from '../configs/main.config';
import { DiscordUser } from '../types/DiscordUser';
import { cacheMiddleware } from '../middlewares/cache.middleware';

declare module 'express-session' {
    interface SessionData {
        user?: DiscordUser;
    }
}

const router = Router();

router.use(cacheMiddleware());

router.get('/discord', passport.authenticate('discord'));

router.get('/discord/callback', passport.authenticate('discord', { failureRedirect: `/` }), (req: Request, res: Response) => {
    if (!req.user) {
        res.status(401).json({ message: 'Authentication failed' });
        return;
    }

    const user = req.user as DiscordUser;
    req.session.user = user;

    res.status(200).redirect(`${config.frontendUrl}/login?user=${encodeURIComponent(JSON.stringify(user))}`);
});

router.post('/send-verification/email', isAuthenticated, sendEmailVerification);
router.post('/send-verification/sms', isAuthenticated, sendSmsVerification);

router.get('/logout', isAuthenticated, (req: Request, res: Response, next: NextFunction) => {
    req.session.destroy(err => {
        if (err) {
            return next(err);
        }
        res.clearCookie('connect.sid');
        res.status(200).json({ message: `${req.session.user?.username} been successfully logged out.` });
        logger.debug(`${req.session.user?.username} successfully logged out.`);
    });
});

export default router;
