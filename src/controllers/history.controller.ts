import type { Request, Response, RequestHandler } from "express"
import { History } from "../models/History"
import { logger } from "../services/logger.service"
import { asyncHandler } from "../utils/asyncHandler.util"
import { invalidateCache } from "../middlewares/cache.middleware"

// Cache key patterns for better cache management
const CACHE_KEYS = {
    ALL_HISTORY: "history:all",
    HISTORY_BY_ID: (id: string) => `history:${id}`,
    HISTORY_BY_USER: (userId: string) => `history:user:${userId}`,
    HISTORY_BY_ACTION: (action: string) => `history:action:${action}`,
}

/**
 * @desc    Create a new history record
 * @route   POST /api/history
 * @access  Private
 */
export const createHistory: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, action, description, details } = req.body

    // Validate required fields
    if (!userId || !action) {
        logger.warn("Missing required fields for history creation", { userId, action })
        res.status(400).json({ message: "User ID and action are required" })
        return
    }

    // Create history record with unique identifier
    const newHistory = new History({
        identifier: Math.random().toString(36).substring(2, 15),
        userId,
        action,
        description: description || "",
        details: details || {},
        timestamp: new Date(),
        status: "unread",
    })

    await newHistory.save()

    // Invalidate relevant caches
    await invalidateCache([
        CACHE_KEYS.ALL_HISTORY,
        CACHE_KEYS.HISTORY_BY_USER(userId),
        CACHE_KEYS.HISTORY_BY_ACTION(action),
    ])

    logger.info("New history record created", { historyId: newHistory._id, userId, action })
    res.status(201).json({ message: "History created successfully", history: newHistory })
})

/**
 * @desc    Get all history records with pagination and filtering
 * @route   GET /api/history
 * @access  Private/Admin
 */
export const getAllHistory: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 50
    const skip = (page - 1) * limit

    // Add filtering options
    const filter: any = {}

    if (req.query.action) {
        filter.action = req.query.action
    }

    if (req.query.status) {
        filter.status = req.query.status
    }

    if (req.query.startDate && req.query.endDate) {
        filter.timestamp = {
            $gte: new Date(req.query.startDate as string),
            $lte: new Date(req.query.endDate as string),
        }
    }

    // Use lean() and exec() for better performance
    const histories = await History.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await History.countDocuments(filter)

    logger.info("Fetched all history records", { count: histories.length, page, limit })
    res.status(200).json({
        histories,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Get history record by ID
 * @route   GET /api/history/:historyId
 * @access  Private
 */
export const getHistoryById: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { historyId } = req.params

    // Use lean() for better performance
    const history = await History.findById(historyId).lean().exec()

    if (!history) {
        logger.warn("History record not found", { historyId })
        res.status(404).json({ message: "History not found" })
        return
    }

    logger.info("Fetched history record by ID", { historyId: history._id })
    res.status(200).json(history)
})

/**
 * @desc    Get history records by user ID with pagination
 * @route   GET /api/history/user/:userId
 * @access  Private
 */
export const getHistoryByUserId: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params

    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Add filtering options
    const filter: any = { userId }

    if (req.query.status) {
        filter.status = req.query.status
    }

    // Use lean() and exec() for better performance
    const histories = await History.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await History.countDocuments(filter)

    if (total === 0) {
        logger.warn("No history found for user", { userId })
        res.status(404).json({ message: "No history found for this user" })
        return
    }

    logger.info("Fetched history records for user", { userId, count: histories.length })
    res.status(200).json({
        histories,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Delete history record
 * @route   DELETE /api/history/:historyId
 * @access  Private/Admin
 */
export const deleteHistory: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { historyId } = req.params

    // Use findOneAndDelete for better performance
    const history = await History.findByIdAndDelete(historyId).lean().exec()

    if (!history) {
        logger.warn("History record not found for deletion", { historyId })
        res.status(404).json({ message: "History not found" })
        return
    }

    // Invalidate relevant caches
    await invalidateCache([
        CACHE_KEYS.ALL_HISTORY,
        CACHE_KEYS.HISTORY_BY_ID(historyId),
        CACHE_KEYS.HISTORY_BY_USER(history.userId),
        CACHE_KEYS.HISTORY_BY_ACTION(history.action),
    ])

    logger.info("History record deleted successfully", { historyId: history._id })
    res.status(200).json({ message: "History deleted successfully" })
})

/**
 * @desc    Mark history record as read
 * @route   PATCH /api/history/:historyId/read
 * @access  Private
 */
export const markAsRead: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { historyId } = req.params

    // Use direct update for better performance
    const result = await History.updateOne({ _id: historyId }, { $set: { status: "read", readAt: new Date() } })

    if (result.matchedCount === 0) {
        logger.warn("History record not found for mark as read", { historyId })
        res.status(404).json({ message: "History not found" })
        return
    }

    // Get updated history to return in response
    const history = await History.findById(historyId).lean().exec()

    // Invalidate relevant caches
    await invalidateCache([
        CACHE_KEYS.ALL_HISTORY,
        CACHE_KEYS.HISTORY_BY_ID(historyId),
        CACHE_KEYS.HISTORY_BY_USER(history?.userId as string),
    ])

    logger.info("History marked as read", { historyId })
    res.status(200).json({ message: "History marked as read", history })
})

/**
 * @desc    Mark all user history as read
 * @route   PATCH /api/history/user/:userId/read-all
 * @access  Private
 */
export const markAllAsRead: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params

    // Use direct update for better performance
    const result = await History.updateMany(
        { userId, status: "unread" },
        { $set: { status: "read", readAt: new Date() } },
    )

    // Invalidate relevant caches
    await invalidateCache([CACHE_KEYS.ALL_HISTORY, CACHE_KEYS.HISTORY_BY_USER(userId)])

    logger.info("All history marked as read for user", { userId, count: result.modifiedCount })
    res.status(200).json({
        message: "All history marked as read",
        count: result.modifiedCount,
    })
})

/**
 * @desc    Delete all history for a user
 * @route   DELETE /api/history/user/:userId
 * @access  Private/Admin
 */
export const deleteUserHistory: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params

    // Use direct delete for better performance
    const result = await History.deleteMany({ userId })

    // Invalidate relevant caches
    await invalidateCache([CACHE_KEYS.ALL_HISTORY, CACHE_KEYS.HISTORY_BY_USER(userId)])

    logger.info("All history deleted for user", { userId, count: result.deletedCount })
    res.status(200).json({
        message: "All history deleted for user",
        count: result.deletedCount,
    })
})

