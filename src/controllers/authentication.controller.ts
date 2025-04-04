import fs from "fs"
import path from "path"
import type { Request, Response, RequestHandler } from "express"
import { sendEmail } from '../services/email.service';
import { SmsService } from "../services/sms.service"
import { logger } from "../services/logger.service"
import { redisClient } from "../utils/redis.util"
import { asyncHandler } from "../utils/asyncHandler.util"

// Cache key patterns for better cache management
const CACHE_KEYS = {
    VERIFICATION_EMAIL: (email: string) => `verification:email:${email}`,
    VERIFICATION_SMS: (phone: string) => `verification:sms:${phone}`,
    VERIFICATION_ATTEMPTS: (identifier: string) => `verification:attempts:${identifier}`,
}

// Constants
const VERIFICATION_CODE_EXPIRY = 600 // 10 minutes in seconds
const MAX_VERIFICATION_ATTEMPTS = 5
const VERIFICATION_ATTEMPT_RESET = 3600 // 1 hour in seconds

/**
 * @desc    Send email verification
 * @route   POST /api/verification/email
 * @access  Private
 */
export const sendEmailVerification: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body

    if (!email) {
        return res.status(400).json({
            success: false,
            message: "Email is required.",
        })
    }

    // Check if too many attempts
    const attemptsKey = CACHE_KEYS.VERIFICATION_ATTEMPTS(email)
    const attempts = await redisClient.get(attemptsKey)

    if (attempts && Number.parseInt(attempts) >= MAX_VERIFICATION_ATTEMPTS) {
        logger.warn("Too many verification attempts", { email })
        return res.status(429).json({
            success: false,
            message: "Too many verification attempts. Please try again later.",
        })
    }

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()
    const subject = "Your LifeVerse Verification Code"
    const text = `Your verification code is: ${verificationCode}`

    try {
        // Read HTML template
        const htmlFilePath = path.join(__dirname, "../", "assets", "email", "verification.html")
        let html = fs.readFileSync(htmlFilePath, "utf-8")

        // Replace verification code in template
        // Replace each digit individually for better formatting
        for (let i = 0; i < verificationCode.length; i++) {
            html = html.replace(`{{VERIFICATION_CODE[${i}]}}`, verificationCode[i])
        }

        // Send email
        await sendEmail(email, subject, text, html)

        // Store verification code in Redis with expiry
        await redisClient.setex(CACHE_KEYS.VERIFICATION_EMAIL(email), VERIFICATION_CODE_EXPIRY, verificationCode)

        // Increment attempt counter
        const currentAttempts = attempts ? Number.parseInt(attempts) : 0
        await redisClient.setex(attemptsKey, VERIFICATION_ATTEMPT_RESET, (currentAttempts + 1).toString())

        logger.info("Verification email sent successfully", { email })
        return res.status(200).json({
            success: true,
            message: "Verification email sent successfully.",
        })
    } catch (error: any) {
        logger.error("Error sending verification email", { email, error })
        return res.status(500).json({
            success: false,
            message: "Failed to send verification email.",
            error: error.message,
        })
    }
})

/**
 * @desc    Verify email code
 * @route   POST /api/verification/email/verify
 * @access  Private
 */
export const verifyEmailCode: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { email, code } = req.body

    if (!email || !code) {
        return res.status(400).json({
            success: false,
            message: "Email and verification code are required.",
        })
    }

    // Get stored verification code
    const storedCode = await redisClient.get(CACHE_KEYS.VERIFICATION_EMAIL(email))

    if (!storedCode) {
        return res.status(400).json({
            success: false,
            message: "Verification code expired or not found.",
        })
    }

    // Verify code
    if (storedCode !== code) {
        logger.warn("Invalid verification code", { email })
        return res.status(400).json({
            success: false,
            message: "Invalid verification code.",
        })
    }

    // Delete verification code after successful verification
    await redisClient.del(CACHE_KEYS.VERIFICATION_EMAIL(email))

    // Reset attempt counter
    await redisClient.del(CACHE_KEYS.VERIFICATION_ATTEMPTS(email))

    logger.info("Email verified successfully", { email })
    return res.status(200).json({
        success: true,
        message: "Email verified successfully.",
    })
})

/**
 * @desc    Send SMS verification
 * @route   POST /api/verification/sms
 * @access  Private
 */
export const sendSmsVerification: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { phoneNumber } = req.body

    if (!phoneNumber) {
        return res.status(400).json({
            success: false,
            message: "Phone number is required.",
        })
    }

    // Check if too many attempts
    const attemptsKey = CACHE_KEYS.VERIFICATION_ATTEMPTS(phoneNumber)
    const attempts = await redisClient.get(attemptsKey)

    if (attempts && Number.parseInt(attempts) >= MAX_VERIFICATION_ATTEMPTS) {
        logger.warn("Too many verification attempts", { phoneNumber })
        return res.status(429).json({
            success: false,
            message: "Too many verification attempts. Please try again later.",
        })
    }

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()
    const message = `Your LifeVerse verification code is: ${verificationCode}. Valid for 10 minutes.`

    // Send SMS
    const response = await SmsService.sendSms(phoneNumber, message)

    if (!response.success) {
        logger.error("Failed to send verification SMS", { phoneNumber, error: response.message })
        return res.status(500).json({
            success: false,
            message: "Failed to send verification SMS.",
            error: response.message,
        })
    }

    // Store verification code in Redis with expiry
    await redisClient.setex(CACHE_KEYS.VERIFICATION_SMS(phoneNumber), VERIFICATION_CODE_EXPIRY, verificationCode)

    // Increment attempt counter
    const currentAttempts = attempts ? Number.parseInt(attempts) : 0
    await redisClient.setex(attemptsKey, VERIFICATION_ATTEMPT_RESET, (currentAttempts + 1).toString())

    logger.info("Verification SMS sent successfully", { phoneNumber })
    return res.status(200).json({
        success: true,
        message: "Verification SMS sent successfully.",
    })
})

/**
 * @desc    Verify SMS code
 * @route   POST /api/verification/sms/verify
 * @access  Private
 */
export const verifySmsCode: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { phoneNumber, code } = req.body

    if (!phoneNumber || !code) {
        return res.status(400).json({
            success: false,
            message: "Phone number and verification code are required.",
        })
    }

    // Get stored verification code
    const storedCode = await redisClient.get(CACHE_KEYS.VERIFICATION_SMS(phoneNumber))

    if (!storedCode) {
        return res.status(400).json({
            success: false,
            message: "Verification code expired or not found.",
        })
    }

    // Verify code
    if (storedCode !== code) {
        logger.warn("Invalid verification code", { phoneNumber })
        return res.status(400).json({
            success: false,
            message: "Invalid verification code.",
        })
    }

    // Delete verification code after successful verification
    await redisClient.del(CACHE_KEYS.VERIFICATION_SMS(phoneNumber))

    // Reset attempt counter
    await redisClient.del(CACHE_KEYS.VERIFICATION_ATTEMPTS(phoneNumber))

    logger.info("Phone number verified successfully", { phoneNumber })
    return res.status(200).json({
        success: true,
        message: "Phone number verified successfully.",
    })
})