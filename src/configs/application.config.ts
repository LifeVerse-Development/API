import dotenv from 'dotenv';

dotenv.config();

export const application = {
    env: String(process.env.ENVIRONMENT || 'development'),
    port: parseInt(process.env.PORT || '3000'),
}