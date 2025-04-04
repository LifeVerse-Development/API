import type { Request, Response, NextFunction } from "express"
import { ApiKey } from "../models/ApiKey"
import { User } from "../models/User"
import { logger } from "../services/logger.service"
import { redisClient } from "../utils/redis.util"

interface AuthenticatedRequest extends Request {
    user?: any
}

// Cache TTL for API key verification (5 minutes)
const API_KEY_CACHE_TTL = 300

// Cache key patterns
const CACHE_KEYS = {
    API_KEY: (key: string) => `auth:apikey:${key}`,
    USER_ROLES: (userId: string) => `auth:user:${userId}:roles`,
}

/**
 * Middleware to check API key validity
 */
export const checkApiKey = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Get API key from header (case-insensitive)
        const apiKey = req.headers["x-api-key"] || (req.headers["X-API-KEY"] as string)

        if (!apiKey) {
            logger.warn("API key missing in request headers")
            return res.status(401).json({ error: "Access denied: API key is required" })
        }

        // Check cache first for better performance
        const cachedApiKeyData = await redisClient.get(CACHE_KEYS.API_KEY(apiKey as string))

        // When using cached data
        if (cachedApiKeyData) {
            const { userId, isActive, isExpired } = JSON.parse(cachedApiKeyData)

            if (!isActive || isExpired) {
                logger.warn("Cached API key is inactive or expired", { apiKey })
                return res.status(403).json({ error: "Access denied: Invalid or inactive API key" })
            }

            // Get user info to include the role
            const user = await User.findById(userId, { password: 0 }).populate("role").lean().exec()

            if (!user) {
                logger.warn("User not found for cached API key", { apiKey, userId })
                return res.status(404).json({ error: "Access denied: User not found" })
            }

            req.user = user
            logger.info("API key verified from cache", { userId })
            return next()
        }

        // If not in cache, check database
        const apiKeyDoc = await ApiKey.findOne({ key: apiKey }).lean().exec()

        if (!apiKeyDoc) {
            logger.warn("Invalid API key provided", { apiKey })
            return res.status(403).json({ error: "Access denied: Invalid or inactive API key" })
        }

        if (!apiKeyDoc.isActive) {
            logger.warn("Inactive API key provided", { apiKey })
            return res.status(403).json({ error: "Access denied: API key is inactive" })
        }

        const isExpired = apiKeyDoc.expiresAt && new Date() > new Date(apiKeyDoc.expiresAt)

        if (isExpired) {
            logger.warn("Expired API key provided", { apiKey })
            return res.status(403).json({ error: "Access denied: API key has expired" })
        }

        // Cache API key data for better performance
        await redisClient.setex(
            CACHE_KEYS.API_KEY(apiKey as string),
            API_KEY_CACHE_TTL,
            JSON.stringify({
                userId: apiKeyDoc.user,
                isActive: apiKeyDoc.isActive,
                isExpired,
            }),
        )

        // Get user info
        const user = await User.findById(apiKeyDoc.user, { password: 0 }).populate("role").lean().exec()

        if (!user) {
            logger.warn("User not found for provided API key", { apiKey, userId: apiKeyDoc.user })
            return res.status(404).json({ error: "Access denied: User not found" })
        }

        req.user = user
        logger.info("API key successfully verified for user", { userId: user._id })

        return next()
    } catch (error: any) {
        logger.error("Error occurred while checking API key", { error: error.message, stack: error.stack })
        return res.status(500).json({ error: "Internal server error" })
    }
}

/**
 * Middleware to check if user has required role
 * @param roles Array of allowed roles
 */
export const hasRole = (...roles: string[]) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
        if (!req.user) {
            logger.warn("User not authenticated", { ip: req.ip, headers: req.headers })
            res.status(401).json({ error: "Access denied: User not authenticated" })
            return;
        }

        try {
            // If no roles specified, allow access
            if (roles.length === 0) {
                logger.info("No role restriction, access granted", { userId: req.user.userId })
                return next()
            }

            // Get user role from request
            const userRole = req.user.role

            // Check if user has required role
            if (userRole && roles.includes(userRole)) {
                logger.info("User has required role", { userId: req.user.userId, role: userRole })
                return next()
            }

            logger.warn("User does not have required role", { userId: req.user.userId, requiredRoles: roles })
            res.status(403).json({ error: "Access denied: Insufficient permissions" })
            return;
        } catch (error: any) {
            logger.error("Error occurred while checking user role", { error: error.message, stack: error.stack })
            res.status(500).json({ error: "Internal server error" })
            return;
        }
    }
}

/**
 * Middleware to check if user has required permissions
 * @param permissions Array of required permissions
 */
export const hasPermission = (...permissions: string[]) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
        if (!req.user) {
            logger.warn("User not authenticated", { ip: req.ip, headers: req.headers })
            res.status(401).json({ error: "Access denied: User not authenticated" })
            return;
        }

        try {
            // If no permissions specified, allow access
            if (permissions.length === 0) {
                logger.info("No permission restriction, access granted", { userId: req.user.userId })
                return next()
            }

            // Get user permissions from cache or database
            let userPermissions: string[] = []

            if (req.user.permissions) {
                // If permissions are already in the request
                userPermissions = req.user.permissions
            } else if (req.user.role) {
                // Check cache first
                const cachedPermissions = await redisClient.get(CACHE_KEYS.USER_ROLES(req.user.userId))

                if (cachedPermissions) {
                    userPermissions = JSON.parse(cachedPermissions)
                } else {
                    // Get permissions from database
                    const role = await req.user.role.populate("permissions")
                    userPermissions = role?.permissions || []

                    // Cache permissions for better performance
                    await redisClient.setex(
                        CACHE_KEYS.USER_ROLES(req.user.userId),
                        API_KEY_CACHE_TTL,
                        JSON.stringify(userPermissions),
                    )
                }
            }

            // Check if user has all required permissions
            const hasAllPermissions = permissions.every((permission) => userPermissions.includes(permission))

            if (hasAllPermissions) {
                logger.info("User has required permissions", { userId: req.user.userId })
                return next()
            }

            logger.warn("User does not have required permissions", {
                userId: req.user.userId,
                requiredPermissions: permissions,
                userPermissions,
            })
            res.status(403).json({ error: "Access denied: Insufficient permissions" })
            return;
        } catch (error: any) {
            logger.error("Error occurred while checking user permissions", { error: error.message, stack: error.stack })
            res.status(500).json({ error: "Internal server error" })
            return;
        }
    }
}

