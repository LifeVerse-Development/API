import express from 'express';
import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { logger } from '../services/logger.service';

export interface BodyParserOptions {
    /** Maximum request body size in bytes (default: 1MB) */
    jsonLimit?: string | number;
    /** Maximum URL-encoded request body size (default: 1MB) */
    urlencodedLimit?: string | number;
    /** Whether to parse extended syntax with the querystring library (default: true) */
    extended?: boolean;
    /** Content types to parse as JSON (default: application/json) */
    jsonTypes?: string | string[];
    /** Content types to parse as URL-encoded (default: application/x-www-form-urlencoded) */
    urlencodedTypes?: string | string[];
}

export const bodyParserMiddleware = (options: BodyParserOptions = {}): express.RequestHandler[] => {
    const defaultOptions: BodyParserOptions = {
        jsonLimit: process.env.BODY_PARSER_JSON_LIMIT || '1mb',
        urlencodedLimit: process.env.BODY_PARSER_URLENCODED_LIMIT || '1mb',
        extended: true,
        jsonTypes: 'application/json',
        urlencodedTypes: 'application/x-www-form-urlencoded',
    };

    const mergedOptions = { ...defaultOptions, ...options };

    const jsonParser = express.json({
        limit: mergedOptions.jsonLimit,
        type: mergedOptions.jsonTypes,
        verify: (req: Request, _res: Response, buf: Buffer, encoding: string) => {
            if (buf && buf.length) {
                const bufferEncoding = (encoding || 'utf8') as BufferEncoding;
                (req as any).rawBody = buf.toString(bufferEncoding);
            }
        },
    });

    const urlencodedParser = express.urlencoded({
        extended: mergedOptions.extended === undefined ? true : mergedOptions.extended,
        limit: mergedOptions.urlencodedLimit,
        type: mergedOptions.urlencodedTypes,
    });

    return [jsonParser, urlencodedParser];
};

export const bodyParserErrorHandler: ErrorRequestHandler = (err: Error, req: Request, res: Response, next: NextFunction): void => {
    if (err.name === 'PayloadTooLargeError') {
        logger.warn('Request body too large', {
            contentLength: req.headers['content-length'],
            contentType: req.headers['content-type'],
            path: req.path,
            ip: req.ip,
        });
        res.status(413).json({
            error: 'Request entity too large',
            message: 'The request body exceeds the maximum allowed size',
        });
        return;
    }

    if (err.name === 'SyntaxError') {
        logger.warn('Invalid JSON in request body', {
            contentType: req.headers['content-type'],
            path: req.path,
            ip: req.ip,
            error: err.message,
        });
        res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid JSON format in request body',
        });
        return;
    }

    logger.error('Body parser error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        ip: req.ip,
    });

    next(err);
};

export const validateContentType = (allowedTypes: string[]): express.RequestHandler => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const contentType = req.headers['content-type'];

        if (!contentType) {
            res.status(415).json({
                error: 'Unsupported Media Type',
                message: 'Content-Type header is required',
            });
            return;
        }

        const contentTypeMatches = allowedTypes.some(type => contentType.toLowerCase().includes(type.toLowerCase()));

        if (!contentTypeMatches) {
            res.status(415).json({
                error: 'Unsupported Media Type',
                message: `Content-Type must be one of: ${allowedTypes.join(', ')}`,
            });
            return;
        }

        next();
    };
};
