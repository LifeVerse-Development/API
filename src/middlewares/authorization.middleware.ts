import { Request, Response, NextFunction } from 'express';
import { ApiKey } from '../models/ApiKey';
import { User } from '../models/User';
import { logger } from '../services/logger.service';

interface AuthenticatedRequest extends Request {
    user?: any;
}

export const checkApiKey = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const apiKey = req.headers['X-API-KEY'] as string;

        if (!apiKey) {
            logger.warn('API key missing in request headers');
            return res.status(401).json({ error: 'Access denied: API key is required' });
        }

        const apiKeyDoc = await ApiKey.findOne({ key: apiKey, isActive: true });

        if (!apiKeyDoc) {
            logger.warn('Invalid or inactive API key provided', { apiKey });
            return res.status(403).json({ error: 'Access denied: Invalid or inactive API key' });
        }

        if (apiKeyDoc.isExpired()) {
            logger.warn('API key has expired', { apiKey });
            return res.status(403).json({ error: 'Access denied: API key has expired' });
        }

        const user = await User.findById(apiKeyDoc.user).populate('role');

        if (!user) {
            logger.warn('User not found for provided API key', { apiKey, userId: apiKeyDoc.user });
            return res.status(404).json({ error: 'Access denied: User not found' });
        }

        req.user = user;
        logger.info('API key successfully verified for user', { userId: user._id });

        return next();
    } catch (error: any) {
        logger.error('Error occurred while checking API key', { error: error.message, stack: error.stack });
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const hasRole = (...roles: string[]) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
        if (!req.user) {
            logger.warn('User not authenticated', { ip: req.ip, headers: req.headers });
            res.status(401).json({ error: 'Access denied: User not authenticated' });
            return;
        }

        try {
            const userRole = req.user.role;

            if (roles.length === 0) {
                logger.info('No role restriction, access granted', { userId: req.user.userId });
                return next();
            }

            if (userRole && roles.includes(userRole)) {
                logger.info('User has required role', { userId: req.user.userId, role: userRole });
                return next();
            }

            logger.warn('User does not have required role', { userId: req.user.userId, requiredRoles: roles });
            res.status(403).json({ error: 'Access denied: Insufficient permissions' });
        } catch (error: any) {
            logger.error('Error occurred while checking user role', { error: error.message, stack: error.stack });
            res.status(500).json({ error: 'Internal server error' });
        }
    };
};
