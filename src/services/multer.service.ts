import multer from "multer"
import type { Request, Response, NextFunction } from "express"
import path from "path"
import fs from "fs"
import { logger } from "./logger.service"
import crypto from "crypto"

// Constants
const UPLOAD_DIR = path.join(__dirname, "../../uploads")
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_MIMES = {
    image: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    document: [
        "application/pdf",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    all: [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
}

// Create upload directory if it doesn't exist
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    logger.info("Upload directory created", { path: UPLOAD_DIR })
}

// Configure storage
const storage = multer.diskStorage({
    destination: (_req: Request, _file: Express.Multer.File, cb: Function) => {
        cb(null, UPLOAD_DIR)
    },
    filename: (_req: Request, file: Express.Multer.File, cb: Function) => {
        // Generate a secure random filename to prevent path traversal attacks
        const uniqueSuffix = Date.now() + "-" + crypto.randomBytes(8).toString("hex")
        const extname = path.extname(file.originalname).toLowerCase()
        cb(null, file.fieldname + "-" + uniqueSuffix + extname)
    },
})

// File filter function
const fileFilter = (fileTypes: string[] = ALLOWED_MIMES.all) => {
    return (_req: Request, file: Express.Multer.File, cb: Function): void => {
        if (!fileTypes.includes(file.mimetype)) {
            const error = new Error(`Unsupported file type. Allowed types: ${fileTypes.join(", ")}`)
            logger.warn("File upload rejected: invalid file type", {
                mimetype: file.mimetype,
                originalname: file.originalname,
                allowedTypes: fileTypes,
            })
            cb(error, false)
            return
        }
        cb(null, true)
    }
}

// Create multer instance with default options
const createUploader = (
    options: {
        fileTypes?: string[]
        maxSize?: number
    } = {},
) => {
    const { fileTypes = ALLOWED_MIMES.all, maxSize = MAX_FILE_SIZE } = options

    return multer({
        storage: storage,
        limits: { fileSize: maxSize },
        fileFilter: fileFilter(fileTypes),
    })
}

/**
 * Middleware for uploading a single file
 * @param fieldName Field name for the file
 * @param options Options for file upload (fileTypes, maxSize)
 */
export const uploadSingle = (fieldName: string, options: { fileTypes?: string[]; maxSize?: number } = {}) => {
    const uploader = createUploader(options)

    return (req: Request, res: Response, next: NextFunction): void => {
        uploader.single(fieldName)(req, res, (error: any) => {
            if (error) {
                logger.error("File upload error", {
                    error: error.message,
                    stack: error.stack,
                    fieldName,
                })
                res.status(400).json({
                    message: "File upload failed",
                    error: error.message,
                })
                return
            }

            // Log successful upload
            if (req.file) {
                logger.info("File uploaded successfully", {
                    fieldName,
                    filename: req.file.filename,
                    size: req.file.size,
                    mimetype: req.file.mimetype,
                })
            }

            next()
        })
    }
}

/**
 * Middleware for uploading multiple files
 * @param fieldName Field name for the files
 * @param options Options for file upload (fileTypes, maxSize)
 * @param maxCount Maximum number of files (optional)
 */
export const uploadMultiple = (
    fieldName: string,
    options: { fileTypes?: string[]; maxSize?: number } = {},
    maxCount?: number,
) => {
    const uploader = createUploader(options)

    return (req: Request, res: Response, next: NextFunction): void => {
        const upload = maxCount ? uploader.array(fieldName, maxCount) : uploader.array(fieldName)

        upload(req, res, (error: any) => {
            if (error) {
                logger.error("File upload error", {
                    error: error.message,
                    stack: error.stack,
                    fieldName,
                })
                res.status(400).json({
                    message: "File upload failed",
                    error: error.message,
                })
                return
            }

            // Log successful upload
            if (req.files && Array.isArray(req.files)) {
                logger.info("Files uploaded successfully", {
                    fieldName,
                    count: req.files.length,
                    totalSize: req.files.reduce((sum, file) => sum + file.size, 0),
                })
            }

            next()
        })
    }
}

/**
 * Get the full path to a file
 * @param filename Filename
 * @returns Full path to the file
 */
export const getFilePath = (filename: string): string => {
    return path.join(UPLOAD_DIR, filename)
}

/**
 * Get the public URL for a file
 * @param filename Filename
 * @returns Public URL for the file
 */
export const getFileUrl = (filename: string): string => {
    return `/api/uploads/${filename}`
}

/**
 * Delete a file
 * @param filename Filename to delete
 * @returns Promise that resolves when the file is deleted
 */
export const deleteFile = (filename: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (!filename) {
            logger.warn("Empty filename provided to deleteFile")
            resolve()
            return
        }

        const filePath = getFilePath(filename)

        // Check if file exists before attempting to delete
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                logger.warn("File not found for deletion", { filename, error: err.message })
                resolve() // Don't reject if file doesn't exist
                return
            }

            fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr) {
                    logger.error("Failed to delete file", { filename, error: unlinkErr.message })
                    reject(unlinkErr)
                    return
                }

                logger.info("File deleted successfully", { filename })
                resolve()
            })
        })
    })
}

// Export allowed mime types for external use
export const allowedMimeTypes = ALLOWED_MIMES

