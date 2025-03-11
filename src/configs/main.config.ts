import dotenv from 'dotenv';

dotenv.config();

export const config = {
    frontendUrl: String(process.env.FRONTEND_URL),
    cors: {
        allowedOrigins: process.env.ALLOWED_ORIGINS || "*",
    },
}