import { Request, Response, RequestHandler } from 'express';
import { History } from '../models/History';
import { logger } from '../services/logger.service';
import { asyncHandler } from '../utils/asyncHandler.util';
import { withCache } from '../utils/withCache.util';

export const createHistory: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const { userId, action, description, details } = req.body;

            const newHistory = new History({
                identifier: Math.random().toString(36).substring(2, 15),
                userId,
                action,
                description,
                details,
            });

            await newHistory.save();
            logger.info('New history record created', { historyId: newHistory._id, userId });
            res.status(201).json({ message: 'History created successfully', history: newHistory });
        } catch (error: any) {
            logger.error('Error creating history record', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Failed to create history', error: error.message });
        }
    }),
);

export const getAllHistory: RequestHandler = withCache(
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
        try {
            const histories = await History.find();
            logger.info('Fetched all history records', { count: histories.length });
            res.status(200).json(histories);
        } catch (error: any) {
            logger.error('Error fetching history records', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Failed to retrieve history', error: error.message });
        }
    }),
);

export const getHistoryById: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const { historyId } = req.params;
            const history = await History.findById(historyId);

            if (!history) {
                logger.warn('History record not found', { historyId: historyId });
                res.status(404).json({ message: 'History not found' });
                return;
            }

            logger.info('Fetched history record by ID', { historyId: history._id });
            res.status(200).json(history);
        } catch (error: any) {
            logger.error('Error fetching history record by ID', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Failed to retrieve history', error: error.message });
        }
    }),
);

export const getHistoryByUserId: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const { userId } = req.params;
            const histories = await History.find({ userId });

            if (!histories.length) {
                logger.warn('No history found for user', { userId });
                res.status(404).json({ message: 'No history found for this user' });
                return;
            }

            logger.info('Fetched history records for user', { userId, count: histories.length });
            res.status(200).json(histories);
        } catch (error: any) {
            logger.error('Error fetching history records for user', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Failed to retrieve history', error: error.message });
        }
    }),
);

export const deleteHistory: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const { historyId } = req.params;
            const history = await History.findByIdAndDelete(historyId);

            if (!history) {
                logger.warn('History record not found for deletion', { historyId: historyId });
                res.status(404).json({ message: 'History not found' });
                return;
            }

            logger.info('History record deleted successfully', { historyId: history._id });
            res.status(200).json({ message: 'History deleted successfully' });
        } catch (error: any) {
            logger.error('Error deleting history record', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Failed to delete history', error: error.message });
        }
    }),
);

export const markAsRead: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const { historyId } = req.params;
            const history = await History.findById(historyId);

            if (!history) {
                logger.warn('History record not found for mark as read', { historyId: historyId });
                res.status(404).json({ message: 'History not found' });
                return;
            }

            history.status = 'read';
            await history.save();

            logger.info('History marked as read', { historyId: history._id });
            res.status(200).json({ message: 'History marked as read', history });
        } catch (error: any) {
            logger.error('Error marking history as read', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Failed to mark history as read', error: error.message });
        }
    }),
);
