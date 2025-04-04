import type { NextFunction, Request, RequestHandler, Response } from "express"
import { Upload } from "../models/Upload"
import { getFilePath, getFileUrl, deleteFile, uploadSingle } from "../services/multer.service"
import { logger } from "../services/logger.service"
import { invalidateCache } from "../middlewares/cache.middleware"
import { asyncHandler } from "../utils/asyncHandler.util"

// Cache key patterns for better cache management
const CACHE_KEYS = {
    ALL_UPLOADS: "uploads:all",
    UPLOAD_BY_ID: (id: string) => `uploads:${id}`,
    UPLOADS_BY_USER: (userId: string) => `uploads:user:${userId}`,
    UPLOADS_BY_TYPE: (type: string) => `uploads:type:${type}`,
}

/**
 * Middleware for handling file uploads
 */
export const handleFileUpload = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Configure upload options based on request
        const fileType = req.query.fileType as string || 'all';
        const fileTypes = fileType === 'image'
            ? ["image/jpeg", "image/png", "image/webp", "image/gif"]
            : fileType === 'document'
            ? ["application/pdf", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
            : undefined; // Use default allowed types

        // Use the multer service to handle the file upload
        await new Promise<void>((resolve, reject) => {
            uploadSingle('file', { fileTypes })(req, res, (err: any) => {
                if (err) {
                    logger.error(`Error uploading file`, { error: err.message });
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
        
        next();
    } catch (error: any) {
        logger.error("Error in handleFileUpload middleware", { error: error.message, stack: error.stack });
        res.status(400).json({
            message: "File upload failed",
            error: error.message
        });
        return;
    }
});

/**
 * @desc    Create a new file upload
 * @route   POST /api/uploads
 * @access  Private
 */
export const createUpload: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" })
    }

    const newUpload = new Upload({
        identifier: Math.random().toString(36).substring(2, 15),
        userId: req.body.userId,
        filename: req.file.filename,
        filePath: getFilePath(req.file.filename),
        fileUrl: getFileUrl(req.file.filename),
        fileType: req.file.mimetype,
        size: req.file.size,
        originalName: req.file.originalname,
        createdAt: new Date(),
        updatedAt: new Date()
    })

    await newUpload.save()

    // Use more specific cache keys for better invalidation
    await invalidateCache([
        CACHE_KEYS.ALL_UPLOADS,
        CACHE_KEYS.UPLOADS_BY_USER(req.body.userId),
        CACHE_KEYS.UPLOADS_BY_TYPE(req.file.mimetype.split("/")[0]),
    ])

    logger.info("New file uploaded", { uploadId: newUpload._id, userId: newUpload.userId })

    return res.status(201).json({ message: "File uploaded successfully", upload: newUpload })
})

/**
 * @desc    Get upload by ID
 * @route   GET /api/uploads/:uploadId
 * @access  Private
 */
export const getUpload: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { uploadId } = req.params

    // Use lean() for better performance
    const upload = await Upload.findById(uploadId).lean().exec()

    if (!upload) {
        logger.warn("File not found", { uploadId })
        return res.status(404).json({ message: "File not found" })
    }

    // Ensure fileUrl is set
    if (upload.filename && !upload.fileUrl) {
        upload.fileUrl = getFileUrl(upload.filename)
    }

    logger.info("Fetched file by ID", { uploadId: upload._id })
    return res.status(200).json(upload)
})

/**
 * @desc    Get all uploads
 * @route   GET /api/uploads
 * @access  Private/Admin
 */
export const getAllUploads: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 50
    const skip = (page - 1) * limit

    // Use lean() and exec() for better performance
    const uploads = await Upload.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await Upload.estimatedDocumentCount()

    logger.info("Fetched all uploads", { count: uploads.length, page, limit })

    return res.status(200).json({
        uploads,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Update upload metadata
 * @route   PUT /api/uploads/:uploadId
 * @access  Private
 */
export const updateUpload: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { uploadId } = req.params
    const updateData = req.body

    // Use findOneAndUpdate with projection for better performance
    const upload = await Upload.findByIdAndUpdate(uploadId, { $set: updateData }, { new: true, runValidators: true })
        .lean()
        .exec()

    if (!upload) {
        logger.warn("File not found for update", { uploadId })
        return res.status(404).json({ message: "File not found" })
    }

    // Use more specific cache keys for better invalidation
    await invalidateCache([
        CACHE_KEYS.ALL_UPLOADS,
        CACHE_KEYS.UPLOAD_BY_ID(uploadId),
        CACHE_KEYS.UPLOADS_BY_USER(upload.userId),
        CACHE_KEYS.UPLOADS_BY_TYPE(upload.fileType.split("/")[0]),
    ])

    logger.info("File updated successfully", { uploadId: upload._id })
    return res.status(200).json({ message: "File updated successfully", upload })
})

/**
 * @desc    Delete upload
 * @route   DELETE /api/uploads/:uploadId
 * @access  Private
 */
export const deleteUpload: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { uploadId } = req.params

    // First get the upload to get the filename for deletion
    const upload = await Upload.findById(uploadId).lean().exec()

    if (!upload) {
        logger.warn("File not found for deletion", { uploadId })
        return res.status(404).json({ message: "File not found" })
    }

    // Delete the physical file
    deleteFile(upload.filename)

    // Delete the database record
    await Upload.deleteOne({ _id: uploadId })

    // Use more specific cache keys for better invalidation
    await invalidateCache([
        CACHE_KEYS.ALL_UPLOADS,
        CACHE_KEYS.UPLOAD_BY_ID(uploadId),
        CACHE_KEYS.UPLOADS_BY_USER(upload.userId),
        CACHE_KEYS.UPLOADS_BY_TYPE(upload.fileType.split("/")[0]),
    ])

    logger.info("File deleted successfully", { uploadId })
    return res.status(200).json({ message: "File deleted successfully" })
})

/**
 * @desc    Get uploads by user ID
 * @route   GET /api/uploads/user/:userId
 * @access  Private
 */
export const getUploadsByUser: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params

    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Use lean() and exec() for better performance
    const uploads = await Upload.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await Upload.countDocuments({ userId })

    logger.info(`Fetched uploads for user: ${userId}`, { count: uploads.length, page, limit })
    return res.status(200).json({
        uploads,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Get uploads by file type
 * @route   GET /api/uploads/type/:fileType
 * @access  Private
 */
export const getUploadsByType: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { fileType } = req.params

    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Use regex to match file type (e.g., "image/*" will match all image types)
    const typeRegex = new RegExp(fileType.replace("*", ".*"), "i")

    // Use lean() and exec() for better performance
    const uploads = await Upload.find({ fileType: typeRegex })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec()

    const total = await Upload.countDocuments({ fileType: typeRegex })

    logger.info(`Fetched uploads with file type: ${fileType}`, { count: uploads.length, page, limit })
    return res.status(200).json({
        uploads,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

