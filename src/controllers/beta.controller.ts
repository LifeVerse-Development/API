import type { Request, Response, RequestHandler } from "express"
import { Beta, BetaKey } from "../models/Beta"
import { logger } from "../services/logger.service"
import { asyncHandler } from "../utils/asyncHandler.util"
import { invalidateCache } from "../middlewares/cache.middleware"
import { invalidateBetaKeyCache, invalidateBetaSystemCache } from "../middlewares/beta.middleware"

// Cache key patterns for better cache management
const CACHE_KEYS = {
    BETA_SYSTEM: "beta:system",
    ALL_BETA_KEYS: "beta:keys:all",
    BETA_KEY_BY_ID: (id: string) => `beta:keys:${id}`,
    BETA_KEY_BY_USER: (userId: string) => `beta:keys:user:${userId}`,
}

/**
 * @desc    Create a new beta key
 * @route   POST /api/beta/keys
 * @access  Private/Admin
 */
export const createBetaKey: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, key, user, expireAt, maxUses } = req.body

    // Validate required fields
    if (!name || !key || !user) {
        logger.warn("Missing required fields for beta key creation", { name, key, user })
        res.status(400).json({ message: "Name, key, and user are required" })
        return
    }

    try {
        // Find beta system
        const beta = await Beta.findOne().lean().exec()

        if (!beta) {
            logger.warn("Beta system not found")
            res.status(404).json({ message: "Beta system not found" })
            return
        }

        if (!beta.isEnabled) {
            logger.warn("Beta system is not enabled")
            res.status(403).json({ message: "Beta system is not enabled" })
            return
        }

        // Check if key already exists
        const existingKey = beta.keys.find((k) => k.key === key)
        if (existingKey) {
            logger.warn("Beta key already exists", { key })
            res.status(409).json({ message: "Beta key already exists" })
            return
        }

        // Create new beta key
        const betaKey = new BetaKey({
            identifier: Math.random().toString(36).substring(2, 15),
            name,
            key,
            user,
            expireAt: expireAt || null,
            maxUses: maxUses || null,
            usedCount: 0,
            isActive: true,
            isExpired: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        })

        // Add key to beta system
        await Beta.updateOne(
            { _id: beta._id },
            {
                $push: { keys: betaKey },
                $set: { updatedAt: new Date() },
            },
        )

        // Invalidate relevant caches
        await invalidateCache([CACHE_KEYS.ALL_BETA_KEYS, CACHE_KEYS.BETA_KEY_BY_USER(user)])

        // Invalidate beta middleware caches
        await invalidateBetaKeyCache(key)

        logger.info("Beta key created successfully", { name, key, user })
        res.status(201).json(betaKey)
    } catch (error: any) {
        logger.error("Error creating beta key", { error: error.message, stack: error.stack })
        res.status(500).json({ message: "Error creating beta key" })
    }
})

/**
 * @desc    Get all beta keys with pagination
 * @route   GET /api/beta/keys
 * @access  Private/Admin
 */
export const getAllBetaKeys: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
        // Add pagination support
        const page = Number(req.query.page) || 1
        const limit = Number(req.query.limit) || 20

        // Find beta system
        const beta = await Beta.findOne().lean().exec()

        if (!beta) {
            logger.warn("Beta system not found")
            res.status(404).json({ message: "Beta system not found" })
            return
        }

        // Apply pagination to keys array
        const startIndex = (page - 1) * limit
        const endIndex = page * limit
        const keys = beta.keys.slice(startIndex, endIndex)
        const total = beta.keys.length

        logger.info("Fetched all beta keys", { count: keys.length, page, limit })
        res.status(200).json({
            keys,
            isEnabled: beta.isEnabled,
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit),
                limit,
            },
        })
    } catch (error: any) {
        logger.error("Error fetching beta keys", { error: error.message, stack: error.stack })
        res.status(500).json({ message: "Error fetching beta keys" })
    }
})

/**
 * @desc    Get beta key by ID
 * @route   GET /api/beta/keys/:betaKeyId
 * @access  Private/Admin
 */
export const getBetaKeyById: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { betaKeyId } = req.params

    try {
        // Find beta system and extract the specific key
        const beta = await Beta.findOne({ "keys.identifier": betaKeyId }, { "keys.$": 1 }).lean().exec()

        if (!beta || !beta.keys || beta.keys.length === 0) {
            logger.warn("Beta key not found", { betaKeyId })
            res.status(404).json({ message: "Beta key not found" })
            return
        }

        const betaKey = beta.keys[0]

        logger.info("Fetched beta key by ID", { betaKeyId })
        res.status(200).json(betaKey)
    } catch (error: any) {
        logger.error("Error fetching beta key by ID", { error: error.message, stack: error.stack, betaKeyId })
        res.status(500).json({ message: "Error fetching beta key" })
    }
})

/**
 * @desc    Update beta key
 * @route   PUT /api/beta/keys/:betaKeyId
 * @access  Private/Admin
 */
export const updateBetaKey: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { betaKeyId } = req.params
    const { name, expireAt, maxUses, isActive } = req.body

    try {
        // Find beta system first to get the key
        const beta = await Beta.findOne({ "keys.identifier": betaKeyId }).lean().exec()

        if (!beta) {
            logger.warn("Beta system not found")
            res.status(404).json({ message: "Beta system not found" })
            return
        }

        const keyIndex = beta.keys.findIndex((k) => k.identifier === betaKeyId)

        if (keyIndex === -1) {
            logger.warn("Beta key not found for update", { betaKeyId })
            res.status(404).json({ message: "Beta key not found" })
            return
        }

        // Get the key for cache invalidation
        const oldKey = beta.keys[keyIndex]

        // Prepare update data
        const updateData: any = {
            updatedAt: new Date(),
        }

        if (name !== undefined) updateData[`keys.${keyIndex}.name`] = name
        if (expireAt !== undefined) {
            updateData[`keys.${keyIndex}.expireAt`] = expireAt ? new Date(expireAt) : null
            updateData[`keys.${keyIndex}.isExpired`] = expireAt ? new Date() > new Date(expireAt) : false
        }
        if (maxUses !== undefined) updateData[`keys.${keyIndex}.maxUses`] = maxUses
        if (isActive !== undefined) updateData[`keys.${keyIndex}.isActive`] = isActive

        // Update the beta key
        await Beta.updateOne({ "keys.identifier": betaKeyId }, { $set: updateData })

        // Get the updated beta key
        const updatedBeta = await Beta.findOne({ "keys.identifier": betaKeyId }, { "keys.$": 1 }).lean().exec()

        const updatedKey = updatedBeta?.keys[0]

        // Invalidate relevant caches
        await invalidateCache([
            CACHE_KEYS.ALL_BETA_KEYS,
            CACHE_KEYS.BETA_KEY_BY_ID(betaKeyId),
            CACHE_KEYS.BETA_KEY_BY_USER(oldKey.user as string),
        ])

        // Invalidate beta middleware cache
        await invalidateBetaKeyCache(oldKey.key)

        logger.info("Beta key updated successfully", { betaKeyId })
        res.status(200).json(updatedKey)
    } catch (error: any) {
        logger.error("Error updating beta key", { error: error.message, stack: error.stack, betaKeyId })
        res.status(500).json({ message: "Error updating beta key" })
    }
})

/**
 * @desc    Delete beta key
 * @route   DELETE /api/beta/keys/:betaKeyId
 * @access  Private/Admin
 */
export const deleteBetaKey: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { betaKeyId } = req.params

    try {
        // Find beta system first to get the key for cache invalidation
        const beta = await Beta.findOne({ "keys.identifier": betaKeyId }).lean().exec()

        if (!beta) {
            logger.warn("Beta system not found")
            res.status(404).json({ message: "Beta system not found" })
            return
        }

        const key = beta.keys.find((k) => k.identifier === betaKeyId)

        if (!key) {
            logger.warn("Beta key not found for deletion", { betaKeyId })
            res.status(404).json({ message: "Beta key not found" })
            return
        }

        // Remove the key from the beta system
        await Beta.updateOne(
            { _id: beta._id },
            {
                $pull: { keys: { identifier: betaKeyId } },
                $set: { updatedAt: new Date() },
            },
        )

        // Invalidate relevant caches
        await invalidateCache([
            CACHE_KEYS.ALL_BETA_KEYS,
            CACHE_KEYS.BETA_KEY_BY_ID(betaKeyId),
            CACHE_KEYS.BETA_KEY_BY_USER(key.user as string),
        ])

        // Invalidate beta middleware cache
        await invalidateBetaKeyCache(key.key)

        logger.info("Beta key deleted successfully", { betaKeyId })
        res.status(200).json({ message: "Beta key deleted successfully" })
    } catch (error: any) {
        logger.error("Error deleting beta key", { error: error.message, stack: error.stack, betaKeyId })
        res.status(500).json({ message: "Error deleting beta key" })
    }
})

/**
 * @desc    Toggle beta system (enable/disable)
 * @route   PATCH /api/beta/system/toggle
 * @access  Private/Admin
 */
export const toggleBetaSystem: RequestHandler = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    try {
        // Find beta system
        const beta = await Beta.findOne()

        if (!beta) {
            // Create beta system if it doesn't exist
            const newBeta = new Beta({
                isEnabled: true,
                keys: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            await newBeta.save()

            logger.info("Beta system created and enabled")
            res.status(201).json({
                message: "Beta system created and enabled",
                isEnabled: true,
            })
            return
        }

        // Toggle beta system
        beta.isEnabled = !beta.isEnabled
        beta.updatedAt = new Date()

        await beta.save()

        // Invalidate beta system cache
        await invalidateCache([CACHE_KEYS.BETA_SYSTEM])
        await invalidateBetaSystemCache()

        logger.info("Beta system toggled successfully", { isEnabled: beta.isEnabled })
        res.status(200).json({
            message: `Beta system is now ${beta.isEnabled ? "enabled" : "disabled"}`,
            isEnabled: beta.isEnabled,
        })
    } catch (error: any) {
        logger.error("Error toggling beta system", { error: error.message, stack: error.stack })
        res.status(500).json({ message: "Error toggling beta system" })
    }
})

/**
 * @desc    Get beta system status
 * @route   GET /api/beta/system/status
 * @access  Private/Admin
 */
export const getBetaSystemStatus: RequestHandler = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    try {
        // Find beta system
        const beta = await Beta.findOne().lean().exec()

        if (!beta) {
            logger.warn("Beta system not found")
            res.status(404).json({ message: "Beta system not found" })
            return
        }

        logger.info("Fetched beta system status", { isEnabled: beta.isEnabled })
        res.status(200).json({
            isEnabled: beta.isEnabled,
            keysCount: beta.keys.length,
            activeKeysCount: beta.keys.filter((k) => k.isActive && !k.isExpired).length,
        })
    } catch (error: any) {
        logger.error("Error fetching beta system status", { error: error.message, stack: error.stack })
        res.status(500).json({ message: "Error fetching beta system status" })
    }
})

