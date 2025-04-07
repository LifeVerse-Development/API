import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { cacheMiddleware } from '../middlewares/cache.middleware';

// Cache TTL in seconds - shorter for payment data
const CACHE_TTL = 60; // 1 minute for payment data

/**
 * Helper function to apply cache middleware to a request handler
 */
export const withCache = (handler: RequestHandler): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction) => {
        const cacheMiddlewareInstance = cacheMiddleware(CACHE_TTL);
        cacheMiddlewareInstance(req, res, (err?: any) => {
            if (err) return next(err);
            return handler(req, res, next);
        });
    };
};
