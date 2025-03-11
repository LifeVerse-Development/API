import { Request, Response, RequestHandler } from 'express';
import { Verification } from '../models/Verification';
import { logger } from '../services/logger.service';

export const getAllVerifications: RequestHandler = async (_req: Request, res: Response): Promise<void> => {
    try {
        const verifications = await Verification.find();

        if (!verifications || verifications.length === 0) {
            logger.warn('No verifications found.');
            res.status(404).json({ message: "No verifications found" });
            return;
        }

        logger.info('Fetched all verifications successfully.');
        res.status(200).json({ verifications });
    } catch (error: any) {
        logger.error(`Fetching all verifications failed: ${error.message}`, { stack: error.stack });
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getVerificationById: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;

    try {
        const verification = await Verification.findOne({ userId });

        if (!verification) {
            logger.warn(`Verification not found for user ${userId}.`);
            res.status(404).json({ message: "Verification not found" });
            return;
        }

        logger.info(`Fetched verification status for user ${userId}.`);
        res.status(200).json({ verification });
    } catch (error: any) {
        logger.error(`Fetching verification failed: ${error.message}`, { stack: error.stack });
        res.status(500).json({ message: "Internal server error" });
    }
};

export const deleteVerification: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;

    try {
        const verification = await Verification.findOneAndDelete({ userId });

        if (!verification) {
            logger.warn(`Verification not found for user ${userId}.`);
            res.status(404).json({ message: "Verification not found" });
            return;
        }

        logger.info(`Deleted verification for user ${userId}.`);
        res.status(200).json({ message: "Verification deleted successfully" });
    } catch (error: any) {
        logger.error(`Deleting verification failed: ${error.message}`, { stack: error.stack });
        res.status(500).json({ message: "Internal server error" });
    }
};

export const verifyUser: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, code } = req.body;

        if (!userId || !code) {
            logger.warn("Verification failed: Missing required fields.");
            res.status(400).json({ message: "Missing required fields" });
            return;
        }

        const verification = await Verification.findOne({ userId });

        if (!verification) {
            logger.warn(`Verification failed: No verification found for user ${userId}.`);
            res.status(400).json({ message: "No verification found" });
            return;
        }

        if (verification.code !== code) {
            logger.warn(`Verification failed: Invalid code for user ${userId}.`);
            res.status(400).json({ message: "Invalid verification code" });
            return;
        }

        if (verification.verified) {
            logger.warn(`Verification failed: User ${userId} is already verified.`);
            res.status(400).json({ message: "User is already verified" });
            return;
        }

        verification.verified = true;
        await verification.save();

        logger.info(`User ${userId} successfully verified.`);
        res.status(200).json({ message: "Verification successful", verification });
    } catch (error: any) {
        logger.error(`User verification failed: ${error.message}`, { stack: error.stack });
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getVerificationStatus: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;

    try {
        const verification = await Verification.findOne({ userId });

        if (!verification) {
            logger.warn(`Fetching verification status failed: No verification found for user ${userId}.`);
            res.status(404).json({ message: "Verification not found" });
            return;
        }

        logger.info(`Fetched verification status successfully for user ${userId}.`);
        res.status(200).json({ verified: verification.verified });
    } catch (error: any) {
        logger.error(`Fetching verification status failed: ${error.message}`, { stack: error.stack });
        res.status(500).json({ message: "Internal server error" });
    }
};
