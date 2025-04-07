import type { Request, Response, RequestHandler } from "express"
import { NewsletterSubscriber, Newsletter } from "../models/Newsletter"
import { logger } from "../services/logger.service"
import { sendEmail } from "../services/email.service"
import { asyncHandler } from "../utils/asyncHandler.util"
import { invalidateCache } from "../middlewares/cache.middleware"

// Cache key patterns for better cache management
const CACHE_KEYS = {
    ALL_NEWSLETTERS: "newsletters:all",
    NEWSLETTER_BY_ID: (id: string) => `newsletters:${id}`,
    ALL_SUBSCRIBERS: "newsletters:subscribers:all",
    SUBSCRIBER_BY_EMAIL: (email: string) => `newsletters:subscribers:${email}`,
}

/**
 * @desc    Subscribe to newsletter
 * @route   POST /api/newsletters/subscribe
 * @access  Public
 */
export const subscribeNewsletter: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body

    if (!email) {
        res.status(400).json({ message: "Email is required" })
        return
    }

    // Check if email is already subscribed - use lean() for better performance
    const existingSubscriber = await NewsletterSubscriber.findOne({ email }).lean().exec()

    if (existingSubscriber) {
        res.status(409).json({ message: "Email is already subscribed" })
        return
    }

    // Create new subscriber with a unique identifier
    const subscriber = new NewsletterSubscriber({
        identifier: Math.random().toString(36).substring(2, 15),
        email,
        subscribedAt: new Date(),
        status: "active",
    })

    await subscriber.save()

    // Invalidate relevant caches
    await invalidateCache([CACHE_KEYS.ALL_SUBSCRIBERS, CACHE_KEYS.SUBSCRIBER_BY_EMAIL(email)])

    logger.info("New newsletter subscriber", { email })
    res.status(201).json({ message: "Successfully subscribed to the newsletter" })
})

/**
 * @desc    Create a new newsletter
 * @route   POST /api/newsletters
 * @access  Private/Admin
 */
export const createNewsletter: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { subject, content, scheduledFor } = req.body

    if (!subject || !content) {
        res.status(400).json({ message: "Subject and content are required" })
        return
    }

    // Create newsletter with scheduled date if provided
    const newsletter = new Newsletter({
        subject,
        content,
        createdAt: new Date(),
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    })

    await newsletter.save()

    // Invalidate relevant caches
    await invalidateCache([CACHE_KEYS.ALL_NEWSLETTERS])

    logger.info("Newsletter created", { subject, scheduledFor })
    res.status(201).json(newsletter)
})

/**
 * @desc    Send newsletter to all subscribers
 * @route   POST /api/newsletters/:id/send
 * @access  Private/Admin
 */
export const sendNewsletter: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params

    // Use lean() for better performance
    const newsletter = await Newsletter.findById(id).lean().exec()

    if (!newsletter) {
        res.status(404).json({ message: "Newsletter not found" })
        return
    }

    // Check if newsletter was already sent
    if (newsletter.sentAt) {
        res.status(400).json({ message: "Newsletter was already sent" })
        return
    }

    // Get active subscribers only - use projection to get only emails
    const subscribers = await NewsletterSubscriber.find({ status: "active" }, { email: 1 }).lean().exec()

    if (subscribers.length === 0) {
        res.status(400).json({ message: "No active subscribers found" })
        return
    }

    // Batch process emails in chunks of 50 to avoid overwhelming the email service
    const batchSize = 50
    const emails = subscribers.map((subscriber) => subscriber.email)

    for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize)
        await Promise.all(
            batch.map((email) =>
                sendEmail(email, newsletter.subject, newsletter.content, newsletter.content).catch((error) => {
                    logger.error("Error sending newsletter to email", { email, error })
                    return null // Continue with other emails even if one fails
                }),
            ),
        )

        // Small delay between batches to prevent rate limiting
        if (i + batchSize < emails.length) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
        }
    }

    // Update newsletter with sent timestamp
    await Newsletter.findByIdAndUpdate(id, {
        sentAt: new Date(),
        recipientCount: subscribers.length,
    })

    // Invalidate relevant caches
    await invalidateCache([CACHE_KEYS.ALL_NEWSLETTERS, CACHE_KEYS.NEWSLETTER_BY_ID(id)])

    logger.info("Newsletter sent", { id, subject: newsletter.subject, recipientCount: subscribers.length })
    res.status(200).json({
        message: "Newsletter sent successfully",
        recipientCount: subscribers.length,
    })
})

/**
 * @desc    Get all newsletters with pagination
 * @route   GET /api/newsletters
 * @access  Private/Admin
 */
export const getNewsletters: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Use lean() and exec() for better performance
    const newsletters = await Newsletter.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await Newsletter.estimatedDocumentCount()

    res.status(200).json({
        newsletters,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Get newsletter by ID
 * @route   GET /api/newsletters/:id
 * @access  Private/Admin
 */
export const getNewsletterById: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params

    // Use lean() for better performance
    const newsletter = await Newsletter.findById(id).lean().exec()

    if (!newsletter) {
        res.status(404).json({ message: "Newsletter not found" })
        return
    }

    res.status(200).json(newsletter)
})

/**
 * @desc    Get all subscribers with pagination
 * @route   GET /api/newsletters/subscribers
 * @access  Private/Admin
 */
export const getSubscribers: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 50
    const skip = (page - 1) * limit

    // Use lean() and exec() for better performance
    const subscribers = await NewsletterSubscriber.find().sort({ subscribedAt: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await NewsletterSubscriber.estimatedDocumentCount()

    res.status(200).json({
        subscribers,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Unsubscribe from newsletter
 * @route   POST /api/newsletters/unsubscribe
 * @access  Public
 */
export const unsubscribeNewsletter: RequestHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { email } = req.body

        if (!email) {
            res.status(400).json({ message: "Email is required" })
            return
        }

        // Find subscriber
        const subscriber = await NewsletterSubscriber.findOne({ email })

        if (!subscriber) {
            res.status(404).json({ message: "Subscriber not found" })
            return
        }

        // Update status to unsubscribed
        subscriber.status = "inactive"
        subscriber.unsubscribedAt = new Date()
        await subscriber.save()

        // Invalidate relevant caches
        await invalidateCache([CACHE_KEYS.ALL_SUBSCRIBERS, CACHE_KEYS.SUBSCRIBER_BY_EMAIL(email)])

        logger.info("Newsletter unsubscribe", { email })
        res.status(200).json({ message: "Successfully unsubscribed from the newsletter" })
    },
)

