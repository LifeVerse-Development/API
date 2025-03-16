import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger.service';

export const isAuthenticated = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (req.isAuthenticated && req.isAuthenticated()) {
            const userId = (req.user as any).userId;
            const role = (req.user as any)?.role || null;

            logger.info('User authenticated via session', { ip: req.ip, userId, role });
            req.user = { userId, role };
            return next();
        }

        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            logger.warn('Missing Authorization header', { ip: req.ip });
            res.status(401).json({ message: 'Unauthorized: No token provided' });
            return;
        }

        const parts = authHeader.split(' ');
        if (parts.length < 2) {
            logger.warn('Invalid Authorization format', { ip: req.ip });
            res.status(400).json({ message: 'Bad Request: Invalid Authorization format' });
            return;
        }

        const [, accessToken, role] = parts;

        if (accessToken) {
            logger.info('User authenticated via access token', { ip: req.ip, role });

            req.user = { userId: 'unknown', role };
            return next();
        }

        logger.warn('User not authenticated', { ip: req.ip });
        res.status(401).json({ message: 'Unauthorized' });
    } catch (error: any) {
        logger.error('Error in authentication middleware', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
