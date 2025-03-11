import dotenv from 'dotenv';

dotenv.config();

export const database = {
    mongoUri: String(process.env.MONGO_URI),
}