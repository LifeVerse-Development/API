import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger.service';

export const isAuthenticated = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.isAuthenticated && req.isAuthenticated()) {
        const userId = (req.user as any)?.userId;

        if (userId) {
            logger.info('User authenticated via session', { ip: req.ip, userId });
            return next();
        }
    }

    const accessToken = req.headers['authorization']?.split(' ')[1];

    if (accessToken) {
        logger.info('User authenticated via access token', { ip: req.ip });
        return next();
    }

    logger.warn('User not authenticated', { ip: req.ip });
    res.status(401).json({ message: 'Unauthorized' });
};
