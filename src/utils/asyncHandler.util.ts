import type { Request, Response, NextFunction } from "express"
import { logger } from "../services/logger.service"

/**
 * Async handler to wrap async route handlers and catch errors
 * @param fn Request handler function
 * @returns Wrapped request handler
 */
export const asyncHandler = 
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
        logger.error(`Error in ${req.method} ${req.path}: ${error.message}`, {
            error: error.message,
            stack: error.stack,
            path: req.path,
            method: req.method,
            userId: req.params.userId || "unknown",
        })

        // Handle different types of errors
        if (error.name === "ValidationError") {
            res.status(400).json({
                success: false,
                message: "Validation error",
                errors: error.errors,
            });
            return;
        }

        if (error.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Duplicate entry",
                errors: error,
            });
            return;
        }

        // Default error response
        res.status(500).json({
            success: false,
            message: "Internal server error",
            ...(process.env.NODE_ENV !== "production" && {
                error: error.message,
                stack: error.stack,
            }),
        });
        // No need to return anything as this function is explicitly typed to return void
    });
}