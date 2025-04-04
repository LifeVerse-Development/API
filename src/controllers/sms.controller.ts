import type { Request, Response, RequestHandler } from "express"
import { SmsService } from "../services/sms.service"
import { Sms } from "../models/Sms"
import { logger } from "../services/logger.service"
import { asyncHandler } from "../utils/asyncHandler.util"
import { invalidateCache } from "../middlewares/cache.middleware"

// Cache key patterns for better cache management
const CACHE_KEYS = {
    ALL_SMS: "sms:all",
    SMS_BY_ID: (id: string) => `sms:${id}`,
    SMS_BY_PHONE: (phone: string) => `sms:phone:${phone}`,
    REMINDERS: "sms:reminders",
    REMINDER_BY_ID: (id: string) => `sms:reminder:${id}`,
}

/**
 * @desc    Send SMS message
 * @route   POST /api/sms
 * @access  Private
 */
export const sendSms: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { phoneNumber, message } = req.body

    if (!phoneNumber || !message) {
        logger.warn("Missing phone number or message", { phoneNumber })
        res.status(400).json({ message: "Phone number and message are required" })
        return;
    }

    logger.info("Sending SMS", { phoneNumber })
    const response = await SmsService.sendSms(phoneNumber, message)

    if (response.success) {
        const sms = new Sms({
            identifier: Math.random().toString(36).substring(2, 15),
            phoneNumber,
            message,
            sentAt: new Date(),
            status: "sent",
        })

        await sms.save()

        // Invalidate relevant caches
        await invalidateCache([CACHE_KEYS.ALL_SMS, CACHE_KEYS.SMS_BY_PHONE(phoneNumber)])

        logger.info("SMS sent successfully", { phoneNumber, messageSid: response.messageSid })
        res.status(200).json({ message: "SMS sent successfully", messageSid: response.messageSid })
        return;
    } else {
        logger.error("Failed to send SMS", { error: response.error })
        res.status(500).json({ message: "Failed to send SMS", error: response.error })
        return;
    }
})

/**
 * @desc    Send reminder SMS
 * @route   POST /api/sms/reminder
 * @access  Private
 */
export const sendReminder: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { phoneNumber, reminderMessage, sendAt } = req.body

    if (!phoneNumber || !reminderMessage || !sendAt) {
        logger.warn("Missing phone number, reminder message, or send time", { phoneNumber })
        res.status(400).json({ message: "Phone number, reminder message, and send time are required" })
        return;
    }

    const reminderDate = new Date(sendAt)
    logger.info("Scheduling reminder SMS", { phoneNumber, sendAt: reminderDate })

    const response = await SmsService.sendReminder(phoneNumber, reminderMessage, reminderDate)

    if (response.success) {
        const sms = new Sms({
            identifier: Math.random().toString(36).substring(2, 15),
            phoneNumber,
            message: reminderMessage,
            sentAt: reminderDate,
            status: "scheduled",
        })

        await sms.save()

        // Invalidate relevant caches
        await invalidateCache([CACHE_KEYS.ALL_SMS, CACHE_KEYS.SMS_BY_PHONE(phoneNumber), CACHE_KEYS.REMINDERS])

        logger.info("Reminder SMS scheduled successfully", { phoneNumber, messageSid: response.messageSid })
        res.status(200).json({ message: "Reminder SMS scheduled successfully", messageSid: response.messageSid })
        return;
    } else {
        logger.error("Failed to send reminder SMS", { error: response.error })
        res.status(500).json({ message: "Failed to send reminder SMS", error: response.error })
        return;
    }
})

/**
 * @desc    Get all SMS records with pagination
 * @route   GET /api/sms
 * @access  Private/Admin
 */
export const getAllSms: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Use lean() and exec() for better performance
    const smsRecords = await Sms.find().sort({ sentAt: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await Sms.estimatedDocumentCount()

    logger.info("Fetched all SMS records", { count: smsRecords.length, page, limit })
    res.status(200).json({
        smsRecords,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
    return;
})

/**
 * @desc    Get SMS record by ID
 * @route   GET /api/sms/:smsId
 * @access  Private
 */
export const getSmsById: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { smsId } = req.params

    // Use lean() for better performance
    const sms = await Sms.findById(smsId).lean().exec()

    if (!sms) {
        logger.warn("SMS record not found", { smsId })
        res.status(404).json({ message: "SMS record not found" })
        return;
    }

    logger.info("Fetched SMS record by ID", { smsId })
    res.status(200).json(sms)
    return;
})

/**
 * @desc    Get all reminders with pagination
 * @route   GET /api/sms/reminders
 * @access  Private/Admin
 */
export const getAllReminders: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Use lean() and exec() for better performance
    const reminders = await Sms.find({ status: "scheduled" })
        .sort({ sentAt: 1 }) // Sort by scheduled time ascending
        .skip(skip)
        .limit(limit)
        .lean()
        .exec()

    const total = await Sms.countDocuments({ status: "scheduled" })

    logger.info("Fetched all scheduled reminders", { count: reminders.length, page, limit })
    res.status(200).json({
        reminders,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
    return;
})

/**
 * @desc    Get reminder by ID
 * @route   GET /api/sms/reminders/:reminderId
 * @access  Private
 */
export const getReminderById: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { reminderId } = req.params

    // Use lean() for better performance
    const reminder = await Sms.findOne({
        _id: reminderId,
        status: "scheduled",
    })
        .lean()
        .exec()

    if (!reminder) {
        logger.warn("Reminder not found", { reminderId })
        res.status(404).json({ message: "Reminder not found" })
        return;
    }

    logger.info("Fetched reminder by ID", { reminderId })
    res.status(200).json(reminder)
    return;
})

/**
 * @desc    Cancel a scheduled reminder
 * @route   DELETE /api/sms/reminders/:reminderId
 * @access  Private
 */
export const cancelReminder: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { reminderId } = req.params

    // Find the reminder first to get the phone number for cache invalidation
    const reminder = await Sms.findOne({
        _id: reminderId,
        status: "scheduled",
    })
        .lean()
        .exec()

    if (!reminder) {
        logger.warn("Reminder not found for cancellation", { reminderId })
        res.status(404).json({ message: "Reminder not found" })
        return;
    }

    // Cancel the reminder in the SMS service
    const response = await SmsService.cancelReminder(reminder.identifier)

    if (response.success) {
        // Update the status to 'cancelled'
        await Sms.updateOne({ _id: reminderId }, { $set: { status: "cancelled", updatedAt: new Date() } })

        // Invalidate relevant caches
        await invalidateCache([
            CACHE_KEYS.ALL_SMS,
            CACHE_KEYS.SMS_BY_ID(reminderId),
            CACHE_KEYS.SMS_BY_PHONE(reminder.phoneNumber),
            CACHE_KEYS.REMINDERS,
            CACHE_KEYS.REMINDER_BY_ID(reminderId),
        ])

        logger.info("Reminder cancelled successfully", { reminderId })
        res.status(200).json({ message: "Reminder cancelled successfully" })
        return;
    } else {
        logger.error("Failed to cancel reminder", { error: response.error })
        res.status(500).json({ message: "Failed to cancel reminder", error: response.error })
        return;
    }
})

/**
 * @desc    Get SMS records by phone number with pagination
 * @route   GET /api/sms/phone/:phoneNumber
 * @access  Private
 */
export const getSmsbyPhoneNumber: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { phoneNumber } = req.params

    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Use lean() and exec() for better performance
    const smsRecords = await Sms.find({ phoneNumber }).sort({ sentAt: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await Sms.countDocuments({ phoneNumber })

    logger.info("Fetched SMS records by phone number", { phoneNumber, count: smsRecords.length })
    res.status(200).json({
        smsRecords,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
    return;
})

