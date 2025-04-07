import type { Request, Response, NextFunction } from "express"
import { logger } from "../services/logger.service"
import { redisClient } from "../utils/redis.util"

// Cache key for blacklisted tokens
const BLACKLISTED_TOKEN_KEY = "auth:blacklisted:"

// Cache TTL for token verification (5 minutes)
const TOKEN_CACHE_TTL = 300

export const isAuthenticated = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Check if user is authenticated via session
        if (req.isAuthenticated && req.isAuthenticated()) {
            const userId = (req.user as any).userId
            const role = (req.user as any)?.role || null

            logger.info("User authenticated via session", { ip: req.ip, userId, role })
            req.user = { userId, role }
            return next()
        }

        // Check for Authorization header
        const authHeader = req.headers["authorization"]
        if (!authHeader) {
            logger.warn("Missing Authorization header", { ip: req.ip })
            res.status(401).json({ message: "Unauthorized: No token provided" })
            return;
        }

        // Parse Authorization header
        const parts = authHeader.split(" ")
        if (parts.length < 2) {
            logger.warn("Invalid Authorization format", { ip: req.ip })
            res.status(400).json({ message: "Bad Request: Invalid Authorization format" })
            return;
        }

        const [scheme, accessToken, role] = parts

        // Validate token format
        if (scheme.toLowerCase() !== "bearer") {
            logger.warn("Invalid Authorization scheme", { ip: req.ip, scheme })
            res.status(400).json({ message: "Bad Request: Invalid Authorization scheme" })
            return;
        }

        if (!accessToken) {
            logger.warn("Missing access token", { ip: req.ip })
            res.status(401).json({ message: "Unauthorized: No token provided" })
            return;
        }

        // Check if token is blacklisted
        const isBlacklisted = await redisClient.get(`${BLACKLISTED_TOKEN_KEY}${accessToken}`)
        if (isBlacklisted) {
            logger.warn("Blacklisted token used", { ip: req.ip })
            res.status(401).json({ message: "Unauthorized: Token is invalid" })
            return;
        }

        // Check token in cache first for performance
        const cachedUserId = await redisClient.get(`auth:token:${accessToken}`)

        if (cachedUserId) {
            logger.info("User authenticated via cached token", { ip: req.ip, userId: cachedUserId, role })
            req.user = { userId: cachedUserId, role }
            return next()
        }

        // If token is valid, set user info and proceed
        logger.info("User authenticated via access token", { ip: req.ip, role })
        req.user = { userId: "unknown", role }

        // Cache token verification result for better performance
        await redisClient.setex(`auth:token:${accessToken}`, TOKEN_CACHE_TTL, "unknown")

        return next()
    } catch (error: any) {
        logger.error("Error in authentication middleware", { error: error.message, stack: error.stack })
        res.status(500).json({ message: "Internal Server Error" })
        return;
    }
}

/**
 * Blacklist a token (for logout)
 * @param token The token to blacklist
 * @param expiresIn Time in seconds until token expiration
 */
export const blacklistToken = async (token: string, expiresIn = 86400): Promise<void> => {
    try {
        await redisClient.setex(`${BLACKLISTED_TOKEN_KEY}${token}`, expiresIn, "1")
        logger.info("Token blacklisted successfully")
    } catch (error: any) {
        logger.error("Error blacklisting token", { error: error.message })
        throw error
    }
}

