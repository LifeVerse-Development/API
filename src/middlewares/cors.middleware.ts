import cors, { CorsOptions } from 'cors';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger.service';

export const corsOptions: CorsOptions = {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-API-KEY',
        'X-CSRF-Token',
        'X-FORWARDED-FOR',
        'X-Requested-With',
        'Accept',
        'Accept-Encoding',
        'Accept-Language',
        'Cache-Control',
        'Origin',
        'User-Agent',
        'Referer',
        'Host',
        'DNT',
        'Connection',
        'Upgrade-Insecure-Requests',
        'Pragma',
        'access-control-allow-origin'
    ],
    credentials: true,
    exposedHeaders: ['Authorization', 'X-CSRF-Token'],
};

export const corsMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const ip = req.headers['X-FORWARDED-FOR'] || req.connection.remoteAddress || req.socket.remoteAddress;
    logger.info('User IP:', ip);

    cors(corsOptions)(req, res, next);
};
