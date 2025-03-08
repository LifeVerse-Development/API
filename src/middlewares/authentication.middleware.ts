import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger.service';

export const isAuthenticated = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const accessToken = req.headers['authorization']?.split(' ')[1];
    const isAuthenticatedHeader = req.headers['x-is-authenticated'];

    if (!accessToken) {
        logger.warn('Tokens missing', { ip: req.ip, headers: req.headers });
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    if (isAuthenticatedHeader !== 'true') {
        logger.warn('User not authenticated in header', { ip: req.ip, headers: req.headers });
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    logger.info('User authenticated from header', { ip: req.ip });

    next();
};
