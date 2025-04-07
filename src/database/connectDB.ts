import mongoose from 'mongoose';
import { database } from '../configs/database.config';
import { logger } from '../services/logger.service';

const mongoUri = database.mongoUri;

export const connectDB = async (): Promise<void> => {
    try {
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            autoIndex: false,
            maxPoolSize: 10,
            minPoolSize: 2,
            connectTimeoutMS: 10000,
        } as mongoose.ConnectOptions);

        logger.info('MongoDB connected successfully');

        mongoose.connection.on('connected', () => {
            logger.info('MongoDB connection established');
        });

        mongoose.connection.on('error', err => {
            logger.error('MongoDB connection error:', err);
            process.exit(1);
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected. Attempting to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            logger.info('MongoDB successfully reconnected');
        });

        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            logger.info('MongoDB connection closed due to application termination');
            process.exit(0);
        });
    } catch (err: any) {
        logger.error('Critical MongoDB connection failure:', err);
        process.exit(1);
    }
};
