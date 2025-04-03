import type { Request, RequestHandler, Response } from 'express';
import { Upload } from '../models/Upload';
import { getFilePath, deleteFile } from '../services/multer.service';
import { logger } from '../services/logger.service';

export const createUpload: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
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
            size: req.file.size
        });

        await newUpload.save();
        logger.info('New file uploaded', { uploadId: newUpload._id, userId: newUpload.userId });

        res.status(201).json({ message: 'File uploaded successfully', upload: newUpload });
    } catch (error: any) {
        logger.error('Error uploading file', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'File upload failed', error: error.message });
    }
};

export const getUpload: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const upload = await Upload.findById(req.params.uploadId);
        if (!upload) {
            logger.warn('File not found', { uploadId: req.params.uploadId });
            res.status(404).json({ message: 'File not found' });
            return;
        }

        logger.info('Fetched file by ID', { uploadId: upload._id });
        res.status(200).json(upload);
    } catch (error: any) {
        logger.error('Error fetching file by ID', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error retrieving file', error: error.message });
    }
};

export const getAllUploads: RequestHandler = async (_req: Request, res: Response): Promise<void> => {
    try {
        const uploads = await Upload.find();
        logger.info('Fetched all uploads', { count: uploads.length });

        res.status(200).json(uploads);
    } catch (error: any) {
        logger.error('Error fetching files', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error retrieving files', error: error.message });
    }
};

export const updateUpload: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const upload = await Upload.findById(req.params.uploadId);
        if (!upload) {
            logger.warn('File not found for update', { uploadId: req.params.uploadId });
            res.status(404).json({ message: 'File not found' });
            return;
        }

        upload.filename = req.body.filename || upload.filename;
        upload.fileType = req.body.fileType || upload.fileType;

        await upload.save();
        logger.info('File updated successfully', { uploadId: upload._id });

        res.status(200).json({ message: 'File updated successfully', upload });
    } catch (error: any) {
        logger.error('Error updating file', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error updating file', error: error.message });
    }
};

export const deleteUpload: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const upload = await Upload.findById(req.params.uploadId);
        if (!upload) {
            logger.warn('File not found for deletion', { uploadId: req.params.uploadId });
            res.status(404).json({ message: 'File not found' });
            return;
        }

        deleteFile(upload.filename);

        await upload.deleteOne();
        logger.info('File deleted successfully', { uploadId: upload._id });

        res.status(200).json({ message: 'File deleted successfully' });
    } catch (error: any) {
        logger.error('Error deleting file', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error deleting file', error: error.message });
    }
};