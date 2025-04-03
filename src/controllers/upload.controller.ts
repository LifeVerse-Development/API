import type { Request, RequestHandler, Response } from 'express';
import { Upload } from '../models/Upload';
import { getFilePath, deleteFile } from '../services/multer.service';
import { logger } from '../services/logger.service';
import { invalidateCache } from '../middlewares/cache.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';
import { withCache } from '../utils/withCache.util';

/**
 * @desc    Create a new file upload
 * @route   POST /api/uploads
 * @access  Private
 */
export const createUpload: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        res.status(400).json({ message: 'No file uploaded' });
        return;
    }

    const newUpload = new Upload({
        identifier: Math.random().toString(36).substring(2, 15),
        userId: req.body.userId,
        filename: req.file.filename,
        filePath: getFilePath(req.file.filename),
        fileType: req.file.mimetype,
        size: req.file.size,
    });

    await newUpload.save();

    // Invalidate uploads cache
    await invalidateCache([`cache:*/api/uploads*`, `uploads:all*`, `uploads:user:${req.body.userId}*`]);

    logger.info('New file uploaded', { uploadId: newUpload._id, userId: newUpload.userId });

    res.status(201).json({ message: 'File uploaded successfully', upload: newUpload });
});

/**
 * @desc    Get upload by ID
 * @route   GET /api/uploads/:uploadId
 * @access  Private
 */
export const getUpload: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response) => {
        const upload = await Upload.findById(req.params.uploadId);
        if (!upload) {
            logger.warn('File not found', { uploadId: req.params.uploadId });
            res.status(404).json({ message: 'File not found' });
            return;
        }

        logger.info('Fetched file by ID', { uploadId: upload._id });
        res.status(200).json(upload);
    }),
);

/**
 * @desc    Get all uploads
 * @route   GET /api/uploads
 * @access  Private/Admin
 */
export const getAllUploads: RequestHandler = withCache(
    asyncHandler(async (_req: Request, res: Response) => {
        const uploads = await Upload.find();
        logger.info('Fetched all uploads', { count: uploads.length });

        res.status(200).json(uploads);
    }),
);

/**
 * @desc    Update upload metadata
 * @route   PUT /api/uploads/:uploadId
 * @access  Private
 */
export const updateUpload: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const upload = await Upload.findById(req.params.uploadId);
    if (!upload) {
        logger.warn('File not found for update', { uploadId: req.params.uploadId });
        res.status(404).json({ message: 'File not found' });
        return;
    }

    upload.filename = req.body.filename || upload.filename;
    upload.fileType = req.body.fileType || upload.fileType;

    await upload.save();

    // Invalidate related caches
    await invalidateCache([
        `cache:*/api/uploads*`,
        `cache:*/api/uploads/${req.params.uploadId}*`,
        `uploads:all*`,
        `uploads:${req.params.uploadId}*`,
        `uploads:user:${upload.userId}*`,
    ]);

    logger.info('File updated successfully', { uploadId: upload._id });

    res.status(200).json({ message: 'File updated successfully', upload });
});

/**
 * @desc    Delete upload
 * @route   DELETE /api/uploads/:uploadId
 * @access  Private
 */
export const deleteUpload: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const upload = await Upload.findById(req.params.uploadId);
    if (!upload) {
        logger.warn('File not found for deletion', { uploadId: req.params.uploadId });
        res.status(404).json({ message: 'File not found' });
        return;
    }

    deleteFile(upload.filename);

    await upload.deleteOne();

    // Invalidate related caches
    await invalidateCache([
        `cache:*/api/uploads*`,
        `cache:*/api/uploads/${req.params.uploadId}*`,
        `uploads:all*`,
        `uploads:${req.params.uploadId}*`,
        `uploads:user:${upload.userId}*`,
    ]);

    logger.info('File deleted successfully', { uploadId: upload._id });

    res.status(200).json({ message: 'File deleted successfully' });
});

/**
 * @desc    Get uploads by user ID
 * @route   GET /api/uploads/user/:userId
 * @access  Private
 */
export const getUploadsByUser: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response) => {
        const { userId } = req.params;

        const uploads = await Upload.find({ userId });

        logger.info(`Fetched uploads for user: ${userId}`, { count: uploads.length });
        res.status(200).json(uploads);
    }),
);

/**
 * @desc    Get uploads by file type
 * @route   GET /api/uploads/type/:fileType
 * @access  Private
 */
export const getUploadsByType: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response) => {
        const { fileType } = req.params;

        // Use regex to match file type (e.g., "image/*" will match all image types)
        const typeRegex = new RegExp(fileType.replace('*', '.*'), 'i');
        const uploads = await Upload.find({ fileType: typeRegex });

        logger.info(`Fetched uploads with file type: ${fileType}`, { count: uploads.length });
        res.status(200).json(uploads);
    }),
);
