import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { sendToDiscord } from '../utils/sendToDiscord.util';
import { application } from '../configs/application.config';

const logDirectory = path.join(__dirname, '../../logs');

if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
}

export const logger = winston.createLogger({
    level: application.env === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, meta }) => {
            return `[${timestamp}] [${level}] ${message} ${meta ? JSON.stringify(meta) : ''}`;
        })
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(logDirectory, 'errors.log'),
            level: 'error',
            maxsize: 10 * 1024 * 1024,
            maxFiles: 5,
        }),
        new winston.transports.File({
            filename: path.join(logDirectory, 'combined.log'),
            level: 'info',
            maxsize: 10 * 1024 * 1024,
            maxFiles: 5,
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
            level: application.env === 'production' ? 'info' : 'debug',
        }),
    ],
});

logger.on('data', async (log) => {
    const { level, message, timestamp } = log;
    if (['error', 'warn', 'debug'].includes(level)) {
        try {
            await sendToDiscord(`[${timestamp}] ${message}`, level);
        } catch (err) {
            logger.error('Failed to send log to Discord', { error: err });
        }
    }
});

export const log = {
    info: (message: string, meta?: any) => logger.info(message, meta),
    warn: (message: string, meta?: any) => logger.warn(message, meta),
    error: (message: string, meta?: any) => logger.error(message, meta),
    debug: (message: string, meta?: any) => logger.debug(message, meta),
};
