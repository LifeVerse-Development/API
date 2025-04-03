import rateLimit from 'express-rate-limit';
import { logger } from '../services/logger.service';

/**
 * Rate limiting middleware factory
 * @param options Rate limiting options
 * @returns Rate limiting middleware
 */
export const createRateLimit = (options: { windowMs: number; max: number }) => {
    return rateLimit({
        windowMs: options.windowMs,
        max: options.max,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            logger.warn(`Rate limit exceeded for ${req.method} ${req.path}`, {
                ip: req.ip,
                path: req.path,
                method: req.method,
            });

            res.status(429).json({
                success: false,
                message: 'Too many requests, please try again later.',
            });
        },
    });
};
