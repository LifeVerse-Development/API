import type { Request, Response, RequestHandler } from "express"
import { ApiKey } from "../models/ApiKey"
import { logger } from "../services/logger.service"
import { asyncHandler } from "../utils/asyncHandler.util"
import { invalidateCache } from "../middlewares/cache.middleware"
import crypto from "crypto"
import type mongoose from "mongoose"

// Cache key patterns for better cache management
const CACHE_KEYS = {
    ALL_API_KEYS: "apikeys:all",
    API_KEY_BY_ID: (id: string) => `apikeys:${id}`,
    API_KEY_BY_USER: (userId: string | mongoose.Types.ObjectId) => `apikeys:user:${userId.toString()}`,
    API_KEY_BY_KEY: (key: string) => `apikeys:key:${key}`,
}

/**
 * @desc    Generate a secure API key
 * @route   GET /api/apikeys/generate
 * @access  Private/Admin
 */
export const generateApiKey: RequestHandler = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    // Generate a secure random API key
    const key = crypto.randomBytes(32).toString("hex")

    res.status(200).json({ key })
})

/**
 * @desc    Create a new API key
 * @route   POST /api/apikeys
 * @access  Private/Admin
 */
export const createApiKey: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, key, user, expiresAt, permissions } = req.body

    // Validate required fields
    if (!name || !key) {
        logger.warn("Missing required fields for API key creation", { name, key })
        res.status(400).json({ message: "Name and key are required" })
        return
    }

    // Check if API key already exists
    const apiKeyExists = await ApiKey.findOne({ key }).lean().exec()

    if (apiKeyExists) {
        logger.warn("API Key already exists", { key })
        res.status(409).json({ message: "API Key already exists" })
        return
    }

    // Create new API key with unique identifier
    const newApiKey = new ApiKey({
        identifier: Math.random().toString(36).substring(2, 15),
        name,
        key,
        user,
        expiresAt: expiresAt ? new Date(expiresAt) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Default to 1 year
        permissions: permissions || [],
        isActive: true,
    })

    await newApiKey.save()

    // Invalidate relevant caches - use empty array if no user
    const cachesToInvalidate: string[] = [CACHE_KEYS.ALL_API_KEYS]
    if (user) {
        cachesToInvalidate.push(CACHE_KEYS.API_KEY_BY_USER(user))
    }

    await invalidateCache(cachesToInvalidate)

    logger.info("API Key created successfully", { name, user })
    res.status(201).json({
        message: "API Key created successfully",
        apiKey: {
            ...newApiKey.toObject(),
            key: key.substring(0, 8) + "..." + key.substring(key.length - 8), // Mask key for security
        },
    })
})

/**
 * @desc    Get all API keys with pagination
 * @route   GET /api/apikeys
 * @access  Private/Admin
 */
export const getAllApiKeys: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Add filtering options
    const filter: any = {}

    if (req.query.user) {
        filter.user = req.query.user
    }

    if (req.query.isActive !== undefined) {
        filter.isActive = req.query.isActive === "true"
    }

    // Use lean() and exec() for better performance
    const apiKeys = await ApiKey.find(filter, { key: 0 }) // Exclude full key for security
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec()

    const total = await ApiKey.countDocuments(filter)

    // Mask keys for security
    const maskedApiKeys = apiKeys.map((key) => ({
        ...key,
        key: key.key ? key.key.substring(0, 8) + "..." + key.key.substring(key.key.length - 8) : undefined,
    }))

    logger.info("Fetched all API keys", { count: apiKeys.length, page, limit })
    res.status(200).json({
        apiKeys: maskedApiKeys,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Get API key by ID
 * @route   GET /api/apikeys/:apiKeyId
 * @access  Private/Admin
 */
export const getApiKeyById: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { apiKeyId } = req.params

    // Use lean() for better performance
    const apiKey = await ApiKey.findById(apiKeyId, { key: 0 }).lean().exec() // Exclude full key for security

    if (!apiKey) {
        logger.warn("API Key not found", { apiKeyId })
        res.status(404).json({ message: "API Key not found" })
        return
    }

    // Mask key for security
    const maskedApiKey = {
        ...apiKey,
        key: apiKey.key ? apiKey.key.substring(0, 8) + "..." + apiKey.key.substring(apiKey.key.length - 8) : undefined,
    }

    logger.info("Fetched API Key by ID", { apiKeyId })
    res.status(200).json(maskedApiKey)
})

/**
 * @desc    Update API key
 * @route   PUT /api/apikeys/:apiKeyId
 * @access  Private/Admin
 */
export const updateApiKey: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { apiKeyId } = req.params
    const { name, expiresAt, isActive, permissions } = req.body

    // Find API key first for cache invalidation
    const apiKey = await ApiKey.findById(apiKeyId).lean().exec()

    if (!apiKey) {
        logger.warn("API Key not found for update", { apiKeyId })
        res.status(404).json({ message: "API Key not found" })
        return
    }

    // Prepare update data
    const updateData: any = {
        updatedAt: new Date(),
    }

    if (name !== undefined) updateData.name = name
    if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null
    if (isActive !== undefined) updateData.isActive = isActive
    if (permissions !== undefined) updateData.permissions = permissions

    // Use findOneAndUpdate with projection for better performance
    const updatedApiKey = await ApiKey.findByIdAndUpdate(
        apiKeyId,
        { $set: updateData },
        { new: true, runValidators: true, projection: { key: 0 } }, // Exclude full key for security
    )
        .lean()
        .exec()

    // Prepare cache keys to invalidate
    const cachesToInvalidate: string[] = [CACHE_KEYS.ALL_API_KEYS, CACHE_KEYS.API_KEY_BY_ID(apiKeyId)]

    if (apiKey.user) {
        cachesToInvalidate.push(CACHE_KEYS.API_KEY_BY_USER(apiKey.user))
    }

    if (apiKey.key) {
        cachesToInvalidate.push(CACHE_KEYS.API_KEY_BY_KEY(apiKey.key))
    }

    await invalidateCache(cachesToInvalidate)

    // Mask key for security
    const maskedApiKey = {
        ...updatedApiKey,
        key: updatedApiKey?.key
            ? updatedApiKey.key.substring(0, 8) + "..." + updatedApiKey.key.substring(updatedApiKey.key.length - 8)
            : undefined,
    }

    logger.info("API Key updated successfully", { apiKeyId, name, isActive })
    res.status(200).json(maskedApiKey)
})

/**
 * @desc    Delete API key
 * @route   DELETE /api/apikeys/:apiKeyId
 * @access  Private/Admin
 */
export const deleteApiKey: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { apiKeyId } = req.params

    // Find API key first for cache invalidation
    const apiKey = await ApiKey.findById(apiKeyId).lean().exec()

    if (!apiKey) {
        logger.warn("API Key not found for deletion", { apiKeyId })
        res.status(404).json({ message: "API Key not found" })
        return
    }

    // Delete API key
    await ApiKey.deleteOne({ _id: apiKeyId })

    // Prepare cache keys to invalidate
    const cachesToInvalidate: string[] = [CACHE_KEYS.ALL_API_KEYS, CACHE_KEYS.API_KEY_BY_ID(apiKeyId)]

    if (apiKey.user) {
        cachesToInvalidate.push(CACHE_KEYS.API_KEY_BY_USER(apiKey.user))
    }

    if (apiKey.key) {
        cachesToInvalidate.push(CACHE_KEYS.API_KEY_BY_KEY(apiKey.key))
    }

    await invalidateCache(cachesToInvalidate)

    logger.info("API Key deleted successfully", { apiKeyId })
    res.status(200).json({ message: "API Key deleted successfully" })
})

/**
 * @desc    Get API keys by user
 * @route   GET /api/apikeys/user/:userId
 * @access  Private/Admin
 */
export const getApiKeysByUser: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params

    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Use lean() and exec() for better performance
    const apiKeys = await ApiKey.find({ user: userId }, { key: 0 }) // Exclude full key for security
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec()

    const total = await ApiKey.countDocuments({ user: userId })

    // Mask keys for security
    const maskedApiKeys = apiKeys.map((key) => ({
        ...key,
        key: key.key ? key.key.substring(0, 8) + "..." + key.key.substring(key.key.length - 8) : undefined,
    }))

    logger.info("Fetched API keys by user", { userId, count: apiKeys.length })
    res.status(200).json({
        apiKeys: maskedApiKeys,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Revoke API key
 * @route   PATCH /api/apikeys/:apiKeyId/revoke
 * @access  Private/Admin
 */
export const revokeApiKey: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { apiKeyId } = req.params

    // Find API key first for cache invalidation
    const apiKey = await ApiKey.findById(apiKeyId).lean().exec()

    if (!apiKey) {
        logger.warn("API Key not found for revocation", { apiKeyId })
        res.status(404).json({ message: "API Key not found" })
        return
    }

    // Update API key to inactive
    await ApiKey.updateOne(
        { _id: apiKeyId },
        {
            $set: {
                isActive: false,
                updatedAt: new Date(),
            },
        },
    )

    // Prepare cache keys to invalidate
    const cachesToInvalidate: string[] = [CACHE_KEYS.ALL_API_KEYS, CACHE_KEYS.API_KEY_BY_ID(apiKeyId)]

    if (apiKey.user) {
        cachesToInvalidate.push(CACHE_KEYS.API_KEY_BY_USER(apiKey.user))
    }

    if (apiKey.key) {
        cachesToInvalidate.push(CACHE_KEYS.API_KEY_BY_KEY(apiKey.key))
    }

    await invalidateCache(cachesToInvalidate)

    logger.info("API Key revoked successfully", { apiKeyId })
    res.status(200).json({ message: "API Key revoked successfully" })
})

