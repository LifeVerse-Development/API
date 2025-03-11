import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { logger } from './logger.service';

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024;

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req: Request, _file: Express.Multer.File, cb: Function) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (_req: Request, file: Express.Multer.File, cb: Function) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extname = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + extname);
    }
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: Function) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'];

    if (!allowedMimes.includes(file.mimetype)) {
        return cb(new Error('Unsupported file type'), false);
    }

    cb(null, true);
};

const upload = multer({
    storage: storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: fileFilter
});

export const uploadSingle = (fieldName: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
        upload.single(fieldName)(req, res, (error: any) => {
            if (error) {
                logger.error('File upload error', { error: error.message, stack: error.stack });
                res.status(400).json({ message: 'File upload failed', error: error.message });
                return;
            }
            next();
        });
    };
};

export const uploadMultiple = (fieldName: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
        upload.array(fieldName)(req, res, (error: any) => {
            if (error) {
                logger.error('File upload error', { error: error.message, stack: error.stack });
                res.status(400).json({ message: 'File upload failed', error: error.message });
                return;
            }
            next();
        });
    };
};

export const getFilePath = (filename: string) => {
    return path.join(UPLOAD_DIR, filename);
};

export const deleteFile = (filename: string): void => {
    const filePath = getFilePath(filename);
    fs.unlink(filePath, (err) => {
        if (err) {
            logger.error('Failed to delete file', { error: err.message });
        } else {
            logger.info('File deleted successfully', { filename });
        }
    });
};
