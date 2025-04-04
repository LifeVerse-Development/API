import type { Request, Response, NextFunction } from "express"
import { Beta } from "../models/Beta"
import { logger } from "../services/logger.service"
import { redisClient } from "../utils/redis.util"

// Cache TTL for beta key verification (5 minutes)
const BETA_KEY_CACHE_TTL = 300

// Cache key patterns
const CACHE_KEYS = {
    BETA_SYSTEM: "beta:system:status",
    BETA_KEY: (key: string) => `beta:key:${key}`,
}

export const verifyBetaKey = async (req: Request, res: Response, next: NextFunction) => {
    // Get beta key from header (case-insensitive)
    const betaKey = req.headers["x-beta-key"] || (req.headers["X-BETA-KEY"] as string)

    if (!betaKey) {
        logger.warn("Beta key missing in request headers")
        return res.status(401).json({ error: "Beta key is required" })
    }

    try {
        // Check beta system status from cache first
        let betaSystemEnabled = false
        const cachedBetaStatus = await redisClient.get(CACHE_KEYS.BETA_SYSTEM)

        if (cachedBetaStatus !== null) {
            betaSystemEnabled = cachedBetaStatus === "enabled"
        } else {
            // If not in cache, check database
            const beta = await Beta.findOne().lean().exec()

            if (!beta) {
                logger.warn("Beta system not found")
                return res.status(403).json({ error: "Beta system is not available" })
            }

            betaSystemEnabled = beta.isEnabled

            // Cache beta system status
            await redisClient.setex(CACHE_KEYS.BETA_SYSTEM, BETA_KEY_CACHE_TTL, betaSystemEnabled ? "enabled" : "disabled")
        }

        if (!betaSystemEnabled) {
            logger.warn("Beta system is disabled")
            return res.status(403).json({ error: "Beta system is not enabled" })
        }

        // Check beta key from cache first
        const cachedBetaKey = await redisClient.get(CACHE_KEYS.BETA_KEY(betaKey as string))

        if (cachedBetaKey) {
            const betaKeyData = JSON.parse(cachedBetaKey)

            if (!betaKeyData.isActive || betaKeyData.isExpired) {
                logger.warn("Beta key is expired or inactive", { betaKey })
                return res.status(403).json({ error: "Beta Key is expired or inactive" })
            }

            req.body.user = betaKeyData.user
            logger.info("Beta key verified from cache", { user: req.body.user })
            return next()
        }

        // If not in cache, check database
        const beta = await Beta.findOne().lean().exec()
        const betaKeyRecord = beta?.keys.find((key) => key.key === betaKey)

        if (!betaKeyRecord) {
            logger.warn("Invalid beta key provided")
            return res.status(403).json({ error: "Invalid Beta Key" })
        }

        if (betaKeyRecord.isExpired || !betaKeyRecord.isActive) {
            logger.warn("Beta key is expired or inactive", { betaKeyRecord })
            return res.status(403).json({ error: "Beta Key is expired or inactive" })
        }

        // Cache beta key data
        await redisClient.setex(
            CACHE_KEYS.BETA_KEY(betaKey as string),
            BETA_KEY_CACHE_TTL,
            JSON.stringify({
                user: betaKeyRecord.user,
                isActive: betaKeyRecord.isActive,
                isExpired: betaKeyRecord.isExpired,
            }),
        )

        req.body.user = betaKeyRecord.user
        logger.info("Beta key successfully verified", { user: req.body.user })

        return next()
    } catch (error: any) {
        logger.error("Error verifying beta key", { error: error.message, stack: error.stack })
        return res.status(500).json({ error: "Internal server error" })
    }
}

/**
 * Invalidate beta key cache
 * @param betaKey The beta key to invalidate
 */
export const invalidateBetaKeyCache = async (betaKey: string): Promise<void> => {
    try {
        await redisClient.del(CACHE_KEYS.BETA_KEY(betaKey))
        logger.info("Beta key cache invalidated", { betaKey })
    } catch (error: any) {
        logger.error("Error invalidating beta key cache", { error: error.message })
        throw error
    }
}

/**
 * Invalidate beta system status cache
 */
export const invalidateBetaSystemCache = async (): Promise<void> => {
    try {
        await redisClient.del(CACHE_KEYS.BETA_SYSTEM)
        logger.info("Beta system cache invalidated")
    } catch (error: any) {
        logger.error("Error invalidating beta system cache", { error: error.message })
        throw error
    }
}

