import type { Request, Response, RequestHandler } from "express"
import {
    sendEmail,
    getEmails,
    getEmailById,
    deleteAllEmails,
    deleteEmailById,
    fetchAndStoreEmails,
} from "../services/email.service"
import { logger } from "../services/logger.service"
import { asyncHandler } from "../utils/asyncHandler.util"
import { invalidateCache } from "../middlewares/cache.middleware"

// Cache key patterns for better cache management
const CACHE_KEYS = {
    ALL_EMAILS: "emails:all",
    EMAIL_BY_ID: (id: string) => `emails:${id}`,
}

/**
 * @desc    Send email
 * @route   POST /api/emails
 * @access  Private/Admin
 */
export const sendEmailController: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { to, subject, text, html, cc, bcc } = req.body

    // Validate required fields
    if (!to || !subject || (!text && !html)) {
        logger.warn("Missing required fields for email", { to, subject })
        res.status(400).json({
            success: false,
            message: "To, subject, and either text or HTML content are required",
        })
        return
    }

    try {
        // Send email with optional cc and bcc
        const email = await sendEmail(to, subject, text || "", html || text, cc, bcc)

        // Invalidate email cache
        await invalidateCache([CACHE_KEYS.ALL_EMAILS])

        logger.info("Email sent successfully", { to, subject })
        res.status(200).json({
            success: true,
            message: "Email sent successfully",
            email,
        })
    } catch (error: any) {
        logger.error("Error sending email", { error: error.message, stack: error.stack, to, subject })
        res.status(500).json({
            success: false,
            message: "Failed to send email",
            error: error.message,
        })
    }
})

/**
 * @desc    Get all emails with pagination
 * @route   GET /api/emails
 * @access  Private/Admin
 */
export const getEmailsController: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
        // Add pagination support
        const page = Number(req.query.page) || 1
        const limit = Number(req.query.limit) || 20

        // Fetch emails from database with pagination
        const { data: emails, total } = await getEmails(page, limit)

        logger.info("Fetched all emails", { count: emails.length, page, limit })
        res.status(200).json({
            success: true,
            emails,
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit),
                limit,
            },
        })
    } catch (error: any) {
        logger.error("Error fetching emails", { error: error.message, stack: error.stack })
        res.status(500).json({
            success: false,
            message: "Failed to fetch emails",
            error: error.message,
        })
    }
})

/**
 * @desc    Get email by ID
 * @route   GET /api/emails/:emailId
 * @access  Private/Admin
 */
export const getEmailByIdController: RequestHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { emailId } = req.params

        try {
            const email = await getEmailById(emailId)

            logger.info("Fetched email by ID", { emailId })
            res.status(200).json({
                success: true,
                email,
            })
        } catch (error: any) {
            logger.error("Error fetching email by ID", { error: error.message, stack: error.stack, emailId })

            // Check if it's a "not found" error
            if (error.message === "Email not found") {
                res.status(404).json({
                    success: false,
                    message: "Email not found",
                })
                return
            }

            res.status(500).json({
                success: false,
                message: "Failed to fetch email",
                error: error.message,
            })
        }
    },
)

/**
 * @desc    Delete all emails
 * @route   DELETE /api/emails
 * @access  Private/Admin
 */
export const deleteAllEmailsController: RequestHandler = asyncHandler(
    async (_req: Request, res: Response): Promise<void> => {
        try {
            await deleteAllEmails()

            // Invalidate email cache
            await invalidateCache([CACHE_KEYS.ALL_EMAILS])

            logger.info("Deleted all emails")
            res.status(200).json({
                success: true,
                message: "All emails deleted successfully",
            })
        } catch (error: any) {
            logger.error("Error deleting all emails", { error: error.message, stack: error.stack })
            res.status(500).json({
                success: false,
                message: "Failed to delete all emails",
                error: error.message,
            })
        }
    },
)

/**
 * @desc    Delete email by ID
 * @route   DELETE /api/emails/:emailId
 * @access  Private/Admin
 */
export const deleteEmailByIdController: RequestHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { emailId } = req.params

        try {
            const email = await deleteEmailById(emailId)

            // Invalidate email caches
            await invalidateCache([CACHE_KEYS.ALL_EMAILS, CACHE_KEYS.EMAIL_BY_ID(emailId)])

            logger.info("Deleted email by ID", { emailId })
            res.status(200).json({
                success: true,
                message: "Email deleted successfully",
                email,
            })
        } catch (error: any) {
            logger.error("Error deleting email by ID", { error: error.message, stack: error.stack, emailId })

            // Check if it's a "not found" error
            if (error.message === "Email not found") {
                res.status(404).json({
                    success: false,
                    message: "Email not found",
                })
                return
            }

            res.status(500).json({
                success: false,
                message: "Failed to delete email",
                error: error.message,
            })
        }
    },
)

/**
 * @desc    Fetch and store emails from IMAP server
 * @route   POST /api/emails/fetch
 * @access  Private/Admin
 */
export const fetchAndStoreEmailsController: RequestHandler = asyncHandler(
    async (_req: Request, res: Response): Promise<void> => {
        try {
            const emails = await fetchAndStoreEmails()

            // Invalidate email cache
            await invalidateCache([CACHE_KEYS.ALL_EMAILS])

            logger.info("Fetched and stored emails", { count: emails.length })
            res.status(200).json({
                success: true,
                message: `${emails.length} emails fetched and stored successfully`,
                count: emails.length,
                emails,
            })
        } catch (error: any) {
            logger.error("Error fetching and storing emails", { error: error.message, stack: error.stack })
            res.status(500).json({
                success: false,
                message: "Failed to fetch and store emails",
                error: error.message,
            })
        }
    },
)

/**
 * @desc    Get email statistics
 * @route   GET /api/emails/stats
 * @access  Private/Admin
 */
export const getEmailStatsController: RequestHandler = asyncHandler(
    async (_req: Request, res: Response): Promise<void> => {
        try {
            // Get email counts by date (last 7 days)
            const today = new Date()
            const lastWeek = new Date(today)
            lastWeek.setDate(lastWeek.getDate() - 7)

            // Get total email count
            const { total } = await getEmails(1, 0)

            // This would need to be implemented in the email service
            const stats = {
                total,
                lastWeek: 0, // Placeholder - implement in email service
                today: 0, // Placeholder - implement in email service
            }

            res.status(200).json({
                success: true,
                stats,
            })
        } catch (error: any) {
            logger.error("Error getting email stats", { error: error.message, stack: error.stack })
            res.status(500).json({
                success: false,
                message: "Failed to get email statistics",
                error: error.message,
            })
        }
    },
)

