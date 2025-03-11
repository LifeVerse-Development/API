import cors, { type CorsOptions } from "cors"
import type { Request, Response, NextFunction } from "express"
import { logger } from "../services/logger.service"
import { config } from "../configs/main.config"

export const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || config.cors?.allowedOrigins || "http://localhost:3000")
            .split(",")
            .map((origin) => origin.trim())

        if (!origin) {
            return callback(null, true)
        }

        if (allowedOrigins.indexOf("*") !== -1 || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true)
        } else {
            logger.warn(`CORS blocked request from origin: ${origin}`)
            callback(new Error(`Origin ${origin} not allowed by CORS policy`))
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-API-KEY",
        "X-CSRF-Token",
        "X-Forwarded-For",
        "X-Requested-With",
        "Accept",
        "Origin",
        "Cache-Control",
        "User-Agent",
        "Referer",
        "Connection",
        "Access-Control-Allow-Origin",
    ],
    credentials: true,
    exposedHeaders: ["Authorization", "X-CSRF-Token"],
    maxAge: 86400,
}

export const corsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    try {
        const forwardedFor = req.headers["x-forwarded-for"]
        const ip = Array.isArray(forwardedFor)
            ? forwardedFor[0]
            : typeof forwardedFor === "string"
                ? forwardedFor.split(",")[0].trim()
                : req.socket.remoteAddress || "unknown"

        if (process.env.NODE_ENV !== "production") {
            logger.debug(`CORS request from IP: ${ip}, Origin: ${req.headers.origin || "none"}`)
        } else if (req.method !== "OPTIONS") {
            logger.info(`Request from IP: ${ip}, Method: ${req.method}, Path: ${req.path}`)
        }

        cors(corsOptions)(req, res, (err) => {
            if (err) {
                logger.error("CORS Error:", err.message)
                res.status(403).json({
                    status: "error",
                    message: "CORS policy violation",
                })
                return
            }
            next()
        })
    } catch (error) {
        logger.error("Unexpected error in CORS middleware:", error)
        next()
    }
}

export const internalServiceCorsMiddleware = cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
})

