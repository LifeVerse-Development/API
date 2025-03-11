import { Request, Response, RequestHandler } from 'express';
import { Beta, BetaKey } from '../models/Beta';
import { logger } from '../services/logger.service';

export const createBetaKey: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const betaKey = new BetaKey({
            ...req.body,
            isActive: true,
            isExpired: false,
            identifier: Math.random().toString(36).substring(2, 15),
        });

        const beta = await Beta.findOne();
        if (!beta || !beta.isEnabled) {
            logger.warn('Beta system is not enabled');
            res.status(403).json({ message: 'Beta system is not enabled' });
            return;
        }

        beta.keys.push(betaKey);
        await beta.save();

        logger.info('Beta key created successfully', { name: betaKey.name, user: betaKey.user });
        res.status(201).json(betaKey);
    } catch (error: any) {
        logger.error('Error creating beta key', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error creating beta key' });
    }
};

export const getAllBetaKeys: RequestHandler = async (_req: Request, res: Response): Promise<void> => {
    try {
        const beta = await Beta.findOne();
        if (!beta || !beta.isEnabled) {
            logger.warn('Beta system is not enabled');
            res.status(403).json({ message: 'Beta system is not enabled' });
            return;
        }

        logger.info('Fetched all beta keys', { count: beta.keys.length });
        res.status(200).json(beta.keys);
    } catch (error: any) {
        logger.error('Error fetching beta keys', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error fetching beta keys' });
    }
};

export const getBetaKeyById: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const betaKey = await BetaKey.findById(req.params.betaKeyId);
        if (!betaKey) {
            logger.warn('Beta key not found', { betaKeyId: req.params.betaKeyId });
            res.status(404).json({ message: 'Beta key not found' });
            return;
        }

        logger.info('Fetched beta key by ID', { betaKeyId: betaKey._id });
        res.status(200).json(betaKey);
    } catch (error: any) {
        logger.error('Error fetching beta key by ID', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error fetching beta key' });
    }
};

export const updateBetaKey: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const updatedData = {
            ...req.body,
            isExpired: req.body.expireAt ? new Date() > req.body.expireAt : false,
        };

        const betaKey = await BetaKey.findByIdAndUpdate(req.params.betaKeyId, updatedData, { new: true, runValidators: true });
        if (!betaKey) {
            logger.warn('Beta key not found for update', { betaKeyId: req.params.betaKeyId });
            res.status(404).json({ message: 'Beta key not found' });
            return;
        }

        logger.info('Beta key updated successfully', { betaKeyId: betaKey._id });
        res.status(200).json(betaKey);
    } catch (error: any) {
        logger.error('Error updating beta key', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error updating beta key' });
    }
};

export const deleteBetaKey: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const betaKey = await BetaKey.findByIdAndDelete(req.params.betaKeyId);
        if (!betaKey) {
            logger.warn('Beta key not found for deletion', { betaKeyId: req.params.betaKeyId });
            res.status(404).json({ message: 'Beta key not found' });
            return;
        }

        logger.info('Beta key deleted successfully', { betaKeyId: betaKey._id });
        res.status(200).json({ message: 'Beta key deleted successfully' });
    } catch (error: any) {
        logger.error('Error deleting beta key', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error deleting beta key' });
    }
};

export const toggleBetaSystem: RequestHandler = async (_req: Request, res: Response): Promise<void> => {
    try {
        const beta = await Beta.findOne();
        if (!beta) {
            logger.warn('Beta system not found');
            res.status(404).json({ message: 'Beta system not found' });
            return;
        }

        beta.toggleBetaSystem();
        await beta.save();

        logger.info('Beta system toggled successfully', { isEnabled: beta.isEnabled });
        res.status(200).json({ message: `Beta system is now ${beta.isEnabled ? 'enabled' : 'disabled'}` });
    } catch (error: any) {
        logger.error('Error toggling beta system', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error toggling beta system' });
    }
};
