import { Request, Response, NextFunction, RequestHandler } from 'express';
import { redisClient } from '../utils/redis.util';

// Cache TTL in seconds (5 minutes default)
const DEFAULT_CACHE_TTL = 300;

/**
 * Middleware to cache all API responses in Redis
 * @param ttl Cache time-to-live in seconds
 */
export const cacheMiddleware = (ttl = DEFAULT_CACHE_TTL): RequestHandler => {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Skip caching for non-GET requests or if cache is explicitly disabled
        if (req.method !== 'GET' && !req.query.forceCache) {
            next();
            return;
        }

        // Generate a unique cache key based on the request
        const cacheKey = `cache:${req.originalUrl || req.url}`;

        try {
            // Check if we have a cached response
            const cachedResponse = await redisClient.get(cacheKey);

            if (cachedResponse) {
                console.log(`Cache hit for ${cacheKey}`);
                res.status(200).json(JSON.parse(cachedResponse));
                return;
            }

            // Cache miss, continue to the controller
            console.log(`Cache miss for ${cacheKey}`);

            // Store original res.json method
            const originalJson = res.json;

            // Override res.json method to cache the response
            res.json = function (body) {
                // Only cache successful responses
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    redisClient.setex(cacheKey, ttl, JSON.stringify(body)).catch(err => console.error(`Redis cache error: ${err.message}`));
                }

                // Call the original json method
                return originalJson.call(this, body);
            };

            next();
        } catch (error: any) {
            console.error(`Redis cache middleware error: ${error.message}`);
            next(); // Continue without caching on error
        }
    };
};

/**
 * Helper function to invalidate cache for specific patterns
 * @param patterns Array of key patterns to invalidate
 */
export const invalidateCache = async (patterns: string[]) => {
    try {
        for (const pattern of patterns) {
            const keys = await redisClient.keys(pattern);
            if (keys.length > 0) {
                await redisClient.del(keys);
                console.log(`Invalidated ${keys.length} cache keys matching ${pattern}`);
            }
        }
    } catch (error: any) {
        console.error(`Cache invalidation error: ${error.message}`);
    }
};
