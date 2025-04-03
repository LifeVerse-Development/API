import dotenv from 'dotenv';

dotenv.config();

export const config = {
    frontendUrl: String(process.env.FRONTEND_URL),
};
