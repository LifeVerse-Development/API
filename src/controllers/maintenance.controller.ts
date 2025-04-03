import { Request, Response, RequestHandler } from 'express';
import { Maintenance } from '../models/Maintenance';
import { logger } from '../services/logger.service';
import { asyncHandler } from '../utils/asyncHandler.util';
import { withCache } from '../utils/withCache.util';

export const createMaintenance: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const maintenance = new Maintenance({
                ...req.body,
            });
            await maintenance.save();

            logger.info('New maintenance record created', { maintenanceId: maintenance._id });
            res.status(201).json(maintenance);
        } catch (error: any) {
            logger.error('Error creating maintenance record', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Error creating maintenance record' });
        }
    }),
);

export const getAllMaintenance: RequestHandler = withCache(
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
        try {
            const maintenance = await Maintenance.find();
            logger.info('Fetched all maintenance records', { count: maintenance.length });
            res.status(200).json(maintenance);
        } catch (error: any) {
            logger.error('Error fetching maintenance records', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Error fetching maintenance records' });
        }
    }),
);

export const getMaintenanceById: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const maintenance = await Maintenance.findById(req.params.maintenanceId);
            if (!maintenance) {
                logger.warn('Maintenance record not found', { maintenanceId: req.params.maintenanceId });
                res.status(404).json({ message: 'Maintenance record not found' });
                return;
            }

            logger.info('Fetched maintenance record by ID', { maintenanceId: maintenance._id });
            res.status(200).json(maintenance);
        } catch (error: any) {
            logger.error('Error fetching maintenance record by ID', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Error fetching maintenance record' });
        }
    }),
);

export const updateMaintenance: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const updatedData = {
                ...req.body,
            };

            const maintenance = await Maintenance.findByIdAndUpdate(req.params.maintenanceId, updatedData, {
                new: true,
                runValidators: true,
            });
            if (!maintenance) {
                logger.warn('Maintenance record not found for update', { maintenanceId: req.params.maintenanceId });
                res.status(404).json({ message: 'Maintenance record not found' });
                return;
            }

            logger.info('Maintenance record updated successfully', { maintenanceId: maintenance._id });
            res.status(200).json(maintenance);
        } catch (error: any) {
            logger.error('Error updating maintenance record', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Error updating maintenance record' });
        }
    }),
);

export const deleteMaintenance: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const maintenance = await Maintenance.findByIdAndDelete(req.params.maintenanceId);
            if (!maintenance) {
                logger.warn('Maintenance record not found for deletion', { maintenanceId: req.params.maintenanceId });
                res.status(404).json({ message: 'Maintenance record not found' });
                return;
            }

            logger.info('Maintenance record deleted successfully', { maintenanceId: maintenance._id });
            res.status(200).json({ message: 'Maintenance record deleted successfully' });
        } catch (error: any) {
            logger.error('Error deleting maintenance record', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Error deleting maintenance record' });
        }
    }),
);
