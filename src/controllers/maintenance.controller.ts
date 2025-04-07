import type { Request, Response, RequestHandler } from "express"
import { Maintenance } from "../models/Maintenance"
import { logger } from "../services/logger.service"
import { asyncHandler } from "../utils/asyncHandler.util"
import { invalidateCache } from "../middlewares/cache.middleware"

// Cache key patterns for better cache management
const CACHE_KEYS = {
    ALL_MAINTENANCE: "maintenance:all",
    MAINTENANCE_BY_ID: (id: string) => `maintenance:${id}`,
    ACTIVE_MAINTENANCE: "maintenance:active",
}

/**
 * @desc    Create a new maintenance record
 * @route   POST /api/maintenance
 * @access  Private/Admin
 */
export const createMaintenance: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { title, description, startTime, endTime, status = "scheduled", affectedServices } = req.body

    // Validate required fields
    if (!title || !description || !startTime || !endTime) {
        res.status(400).json({ message: "Title, description, start time, and end time are required" })
        return
    }

    // Create maintenance record with unique identifier
    const maintenance = new Maintenance({
        identifier: Math.random().toString(36).substring(2, 15),
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        status,
        affectedServices: affectedServices || [],
        createdAt: new Date(),
        updatedAt: new Date(),
    })

    await maintenance.save()

    // Invalidate relevant caches
    await invalidateCache([CACHE_KEYS.ALL_MAINTENANCE, CACHE_KEYS.ACTIVE_MAINTENANCE])

    logger.info("New maintenance record created", { maintenanceId: maintenance._id, title })
    res.status(201).json(maintenance)
})

/**
 * @desc    Get all maintenance records with pagination
 * @route   GET /api/maintenance
 * @access  Public
 */
export const getAllMaintenance: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Add filtering options
    const filter: any = {}

    if (req.query.status) {
        filter.status = req.query.status
    }

    // Use lean() and exec() for better performance
    const maintenance = await Maintenance.find(filter).sort({ startTime: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await Maintenance.countDocuments(filter)

    logger.info("Fetched all maintenance records", { count: maintenance.length, page, limit })
    res.status(200).json({
        maintenance,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Get active maintenance records
 * @route   GET /api/maintenance/active
 * @access  Public
 */
export const getActiveMaintenance: RequestHandler = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const now = new Date()

    // Find maintenance records that are currently active
    const activeMaintenance = await Maintenance.find({
        startTime: { $lte: now },
        endTime: { $gte: now },
        status: { $in: ["scheduled", "in-progress"] },
    })
        .sort({ startTime: 1 })
        .lean()
        .exec()

    logger.info("Fetched active maintenance records", { count: activeMaintenance.length })
    res.status(200).json(activeMaintenance)
})

/**
 * @desc    Get maintenance record by ID
 * @route   GET /api/maintenance/:maintenanceId
 * @access  Public
 */
export const getMaintenanceById: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { maintenanceId } = req.params

    // Use lean() for better performance
    const maintenance = await Maintenance.findById(maintenanceId).lean().exec()

    if (!maintenance) {
        logger.warn("Maintenance record not found", { maintenanceId })
        res.status(404).json({ message: "Maintenance record not found" })
        return
    }

    logger.info("Fetched maintenance record by ID", { maintenanceId: maintenance._id })
    res.status(200).json(maintenance)
})

/**
 * @desc    Update maintenance record
 * @route   PUT /api/maintenance/:maintenanceId
 * @access  Private/Admin
 */
export const updateMaintenance: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { maintenanceId } = req.params
    const updateData = {
        ...req.body,
        updatedAt: new Date(),
    }

    // Validate dates if provided
    if (updateData.startTime) {
        updateData.startTime = new Date(updateData.startTime)
    }

    if (updateData.endTime) {
        updateData.endTime = new Date(updateData.endTime)
    }

    // Use findOneAndUpdate with projection for better performance
    const maintenance = await Maintenance.findByIdAndUpdate(
        maintenanceId,
        { $set: updateData },
        { new: true, runValidators: true },
    )
        .lean()
        .exec()

    if (!maintenance) {
        logger.warn("Maintenance record not found for update", { maintenanceId })
        res.status(404).json({ message: "Maintenance record not found" })
        return
    }

    // Invalidate relevant caches
    await invalidateCache([
        CACHE_KEYS.ALL_MAINTENANCE,
        CACHE_KEYS.MAINTENANCE_BY_ID(maintenanceId),
        CACHE_KEYS.ACTIVE_MAINTENANCE,
    ])

    logger.info("Maintenance record updated successfully", { maintenanceId: maintenance._id })
    res.status(200).json(maintenance)
})

/**
 * @desc    Delete maintenance record
 * @route   DELETE /api/maintenance/:maintenanceId
 * @access  Private/Admin
 */
export const deleteMaintenance: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { maintenanceId } = req.params

    // Use findOneAndDelete for better performance
    const maintenance = await Maintenance.findByIdAndDelete(maintenanceId).lean().exec()

    if (!maintenance) {
        logger.warn("Maintenance record not found for deletion", { maintenanceId })
        res.status(404).json({ message: "Maintenance record not found" })
        return
    }

    // Invalidate relevant caches
    await invalidateCache([
        CACHE_KEYS.ALL_MAINTENANCE,
        CACHE_KEYS.MAINTENANCE_BY_ID(maintenanceId),
        CACHE_KEYS.ACTIVE_MAINTENANCE,
    ])

    logger.info("Maintenance record deleted successfully", { maintenanceId: maintenance._id })
    res.status(200).json({ message: "Maintenance record deleted successfully" })
})

/**
 * @desc    Update maintenance status
 * @route   PATCH /api/maintenance/:maintenanceId/status
 * @access  Private/Admin
 */
export const updateMaintenanceStatus: RequestHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { maintenanceId } = req.params
        const { status } = req.body

        if (!status || !["scheduled", "in-progress", "completed", "cancelled"].includes(status)) {
            res.status(400).json({ message: "Valid status is required" })
            return
        }

        // Use direct update for better performance
        const result = await Maintenance.updateOne(
            { _id: maintenanceId },
            {
                $set: {
                    status,
                    updatedAt: new Date(),
                    ...(status === "completed" ? { completedAt: new Date() } : {}),
                },
            },
        )

        if (result.matchedCount === 0) {
            logger.warn("Maintenance record not found for status update", { maintenanceId })
            res.status(404).json({ message: "Maintenance record not found" })
            return
        }

        // Invalidate relevant caches
        await invalidateCache([
            CACHE_KEYS.ALL_MAINTENANCE,
            CACHE_KEYS.MAINTENANCE_BY_ID(maintenanceId),
            CACHE_KEYS.ACTIVE_MAINTENANCE,
        ])

        logger.info("Maintenance status updated successfully", { maintenanceId, status })
        res.status(200).json({ message: "Maintenance status updated successfully" })
    },
)

