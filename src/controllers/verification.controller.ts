import { Request, Response, RequestHandler } from 'express';
import { Verification } from '../models/Verification';
import { logger } from '../services/logger.service';
import { invalidateCache } from '../middlewares/cache.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';
import { withCache } from '../utils/withCache.util';

/**
 * @desc    Get all verifications
 * @route   GET /api/verifications
 * @access  Private/Admin
 */
export const getAllVerifications: RequestHandler = withCache(
    asyncHandler(async (_req: Request, res: Response) => {
        const verifications = await Verification.find();

        if (!verifications || verifications.length === 0) {
            logger.warn('No verifications found.');
            res.status(404).json({ message: 'No verifications found' });
            return;
        }

        logger.info('Fetched all verifications successfully.');
        res.status(200).json({ verifications });
    }),
);

/**
 * @desc    Get verification by user ID
 * @route   GET /api/verifications/:userId
 * @access  Private
 */
export const getVerificationById: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response) => {
        const { userId } = req.params;

        const verification = await Verification.findOne({ userId });

        if (!verification) {
            logger.warn(`Verification not found for user ${userId}.`);
            res.status(404).json({ message: 'Verification not found' });
            return;
        }

        logger.info(`Fetched verification status for user ${userId}.`);
        res.status(200).json({ verification });
    }),
);

/**
 * @desc    Delete verification
 * @route   DELETE /api/verifications/:userId
 * @access  Private/Admin
 */
export const deleteVerification: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;

    const verification = await Verification.findOneAndDelete({ userId });

    if (!verification) {
        logger.warn(`Verification not found for user ${userId}.`);
        res.status(404).json({ message: 'Verification not found' });
        return;
    }

    // Invalidate related caches
    await invalidateCache([
        `cache:*/api/verifications/${userId}*`,
        `cache:*/api/verifications*`,
        `verifications:${userId}*`,
        `verifications:all*`,
    ]);

    logger.info(`Deleted verification for user ${userId}.`);
    res.status(200).json({ message: 'Verification deleted successfully' });
});

/**
 * @desc    Get verification status
 * @route   GET /api/verifications/:userId/status
 * @access  Private
 */
export const getVerificationStatus: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response) => {
        const { userId } = req.params;

        const verification = await Verification.findOne({ userId });

        if (!verification) {
            logger.warn(`Fetching verification status failed: No verification found for user ${userId}.`);
            res.status(404).json({ message: 'Verification not found' });
            return;
        }

        logger.info(`Fetched verification status successfully for user ${userId}.`);
        res.status(200).json({ verified: verification.verified });
    }),
);

/**
 * @desc    Create or update verification
 * @route   POST /api/verifications
 * @access  Private/Admin
 */
export const createOrUpdateVerification: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { userId, verified, verificationDate, verificationMethod } = req.body;

    if (!userId) {
        res.status(400).json({ message: 'User ID is required' });
        return;
    }

    // Find and update or create new verification
    const verification = await Verification.findOneAndUpdate(
        { userId },
        {
            userId,
            verified: verified !== undefined ? verified : false,
            verificationDate: verificationDate || new Date(),
            verificationMethod: verificationMethod || 'manual',
            updatedAt: new Date(),
        },
        { new: true, upsert: true },
    );

    // Invalidate related caches
    await invalidateCache([
        `cache:*/api/verifications/${userId}*`,
        `cache:*/api/verifications*`,
        `verifications:${userId}*`,
        `verifications:all*`,
    ]);

    logger.info(`Verification ${verification._id ? 'updated' : 'created'} for user ${userId}.`);
    res.status(200).json({
        message: `Verification ${verification._id ? 'updated' : 'created'} successfully`,
        verification,
    });
});
