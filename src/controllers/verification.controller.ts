import type { Request, Response, RequestHandler } from "express"
import { Verification } from "../models/Verification"
import { logger } from "../services/logger.service"
import { invalidateCache } from "../middlewares/cache.middleware"
import { asyncHandler } from "../utils/asyncHandler.util"

// Cache key patterns for better cache management
const CACHE_KEYS = {
    ALL_VERIFICATIONS: "verifications:all",
    USER_VERIFICATION: (userId: string) => `verifications:${userId}`,
    USER_STATUS: (userId: string) => `verifications:status:${userId}`,
}

/**
 * @desc    Get all verifications
 * @route   GET /api/verifications
 * @access  Private/Admin
 */
export const getAllVerifications: RequestHandler = asyncHandler(async (_req: Request, res: Response) => {
    // Use lean() for better performance on read operations
    const verifications = await Verification.find().lean().exec()

    if (!verifications || verifications.length === 0) {
        logger.warn("No verifications found.")
        return res.status(404).json({ message: "No verifications found" })
    }

    logger.info("Fetched all verifications successfully.", { count: verifications.length })
    return res.status(200).json({ verifications })
})

/**
 * @desc    Get verification by user ID
 * @route   GET /api/verifications/:userId
 * @access  Private
 */
export const getVerificationById: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params

    if (!userId) {
        return res.status(400).json({ message: "User ID is required" })
    }

    // Use lean() for better performance
    const verification = await Verification.findOne({ userId }).lean().exec()

    if (!verification) {
        logger.warn(`Verification not found for user ${userId}.`)
        return res.status(404).json({ message: "Verification not found" })
    }

    logger.info(`Fetched verification status for user ${userId}.`)
    return res.status(200).json({ verification })
})

/**
 * @desc    Delete verification
 * @route   DELETE /api/verifications/:userId
 * @access  Private/Admin
 */
export const deleteVerification: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params

    if (!userId) {
        return res.status(400).json({ message: "User ID is required" })
    }

    // Use deleteOne instead of findOneAndDelete for better performance
    const result = await Verification.deleteOne({ userId })

    if (result.deletedCount === 0) {
        logger.warn(`Verification not found for user ${userId}.`)
        return res.status(404).json({ message: "Verification not found" })
    }

    // Use more specific cache keys for better invalidation
    await invalidateCache([
        CACHE_KEYS.USER_VERIFICATION(userId),
        CACHE_KEYS.USER_STATUS(userId),
        CACHE_KEYS.ALL_VERIFICATIONS,
    ])

    logger.info(`Deleted verification for user ${userId}.`)
    return res.status(200).json({ message: "Verification deleted successfully" })
})

/**
 * @desc    Get verification status
 * @route   GET /api/verifications/:userId/status
 * @access  Private
 */
export const getVerificationStatus: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params

    if (!userId) {
        return res.status(400).json({ message: "User ID is required" })
    }

    // Use projection to only get the verified field for better performance
    const verification = await Verification.findOne({ userId }, { verified: 1 }).lean().exec()

    if (!verification) {
        logger.warn(`Fetching verification status failed: No verification found for user ${userId}.`)
        return res.status(404).json({ message: "Verification not found" })
    }

    logger.info(`Fetched verification status successfully for user ${userId}.`)
    return res.status(200).json({ verified: verification.verified })
})

/**
 * @desc    Create or update verification
 * @route   POST /api/verifications
 * @access  Private/Admin
 */
export const createOrUpdateVerification: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { userId, verified, verificationDate, verificationMethod } = req.body

    if (!userId) {
        return res.status(400).json({ message: "User ID is required" })
    }

    // Use updateOne with upsert for better performance
    const result = await Verification.updateOne(
        { userId },
        {
            $set: {
                userId,
                verified: verified !== undefined ? verified : false,
                verificationDate: verificationDate || new Date(),
                verificationMethod: verificationMethod || "manual",
                updatedAt: new Date(),
            },
        },
        { upsert: true },
    )

    const isNew = result.upsertedCount > 0

    // Use more specific cache keys for better invalidation
    await invalidateCache([
        CACHE_KEYS.USER_VERIFICATION(userId),
        CACHE_KEYS.USER_STATUS(userId),
        CACHE_KEYS.ALL_VERIFICATIONS,
    ])

    // Get the updated verification to return in the response
    const verification = await Verification.findOne({ userId }).lean().exec()

    logger.info(`Verification ${isNew ? "created" : "updated"} for user ${userId}.`)
    return res.status(200).json({
        message: `Verification ${isNew ? "created" : "updated"} successfully`,
        verification,
    })
})

