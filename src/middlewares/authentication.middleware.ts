import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { logger } from '../services/logger.service';

export const isAuthenticated = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const accessToken = req.headers['authorization']?.split(' ')[1];
    const refreshToken = req.cookies['refreshToken'];

    if (!accessToken || !refreshToken) {
        logger.warn('Tokens missing', { ip: req.ip, headers: req.headers });
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    try {
        const user = await User.findOne({ 'tokens.accessToken': accessToken, 'tokens.refreshToken': refreshToken });

        if (!user) {
            logger.warn('Invalid tokens', { ip: req.ip, headers: req.headers });
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        req.user = user;
        logger.info('User authenticated', { userId: user.userId });
        next();
    } catch (err) {
        logger.error('Error during authentication', { error: err });
        res.status(500).json({ message: 'Internal server error' });
    }
};
