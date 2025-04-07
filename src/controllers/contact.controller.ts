import type { Request, Response, RequestHandler } from "express"
import { Contact } from "../models/Contact"
import { logger } from "../services/logger.service"
import { asyncHandler } from "../utils/asyncHandler.util"
import { invalidateCache } from "../middlewares/cache.middleware"

// Cache key patterns for better cache management
const CACHE_KEYS = {
    ALL_CONTACTS: "contacts:all",
    CONTACT_BY_ID: (id: string) => `contacts:${id}`,
    CONTACTS_BY_STATUS: (status: string) => `contacts:status:${status}`,
}

/**
 * @desc    Create a new contact message
 * @route   POST /api/contacts
 * @access  Public
 */
export const createContact: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, email, subject, message, phone } = req.body

    // Validate required fields
    if (!name || !email || !message) {
        logger.warn("Missing required fields for contact creation", { name, email })
        res.status(400).json({ message: "Name, email, and message are required" })
        return
    }

    // Create contact with unique identifier
    const contact = new Contact({
        identifier: Math.random().toString(36).substring(2, 15),
        name,
        email,
        subject: subject || "General Inquiry",
        message,
        phone: phone || "",
        replied: false,
        createdAt: new Date(),
        updatedAt: new Date(),
    })

    await contact.save()

    // Invalidate relevant caches
    await invalidateCache([CACHE_KEYS.ALL_CONTACTS, CACHE_KEYS.CONTACTS_BY_STATUS("unreplied")])

    logger.info("New contact created", { contactId: contact._id, email })
    res.status(201).json({
        success: true,
        message: "Contact message sent successfully",
        contact: {
            id: contact._id,
            identifier: contact.identifier,
        },
    })
})

/**
 * @desc    Get all contacts with pagination and filtering
 * @route   GET /api/contacts
 * @access  Private/Admin
 */
export const getAllContacts: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Add filtering options
    const filter: any = {}

    if (req.query.replied !== undefined) {
        filter.replied = req.query.replied === "true"
    }

    if (req.query.search) {
        const searchRegex = new RegExp(req.query.search as string, "i")
        filter.$or = [{ name: searchRegex }, { email: searchRegex }, { subject: searchRegex }, { message: searchRegex }]
    }

    // Use lean() and exec() for better performance
    const contacts = await Contact.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await Contact.countDocuments(filter)

    logger.info("Fetched all contacts", { count: contacts.length, page, limit })
    res.status(200).json({
        contacts,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Get contact by ID
 * @route   GET /api/contacts/:contactId
 * @access  Private/Admin
 */
export const getContactById: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { contactId } = req.params

    // Use lean() for better performance
    const contact = await Contact.findById(contactId).lean().exec()

    if (!contact) {
        logger.warn("Contact not found", { contactId })
        res.status(404).json({ message: "Contact not found" })
        return
    }

    logger.info("Fetched contact by ID", { contactId })
    res.status(200).json(contact)
})

/**
 * @desc    Update contact (mark as replied, add notes)
 * @route   PUT /api/contacts/:contactId
 * @access  Private/Admin
 */
export const updateContact: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { contactId } = req.params
    const { replied, notes, adminResponse } = req.body

    // Prepare update data
    const updateData: any = {
        updatedAt: new Date(),
    }

    if (replied !== undefined) {
        updateData.replied = replied
        if (replied) {
            updateData.repliedAt = new Date()
        }
    }

    if (notes !== undefined) {
        updateData.notes = notes
    }

    if (adminResponse !== undefined) {
        updateData.adminResponse = adminResponse
    }

    // Use findOneAndUpdate with projection for better performance
    const contact = await Contact.findByIdAndUpdate(contactId, { $set: updateData }, { new: true, runValidators: true })
        .lean()
        .exec()

    if (!contact) {
        logger.warn("Contact not found for update", { contactId })
        res.status(404).json({ message: "Contact not found" })
        return
    }

    // Invalidate relevant caches
    await invalidateCache([
        CACHE_KEYS.ALL_CONTACTS,
        CACHE_KEYS.CONTACT_BY_ID(contactId),
        CACHE_KEYS.CONTACTS_BY_STATUS("replied"),
        CACHE_KEYS.CONTACTS_BY_STATUS("unreplied"),
    ])

    logger.info("Contact updated successfully", { contactId, replied })
    res.status(200).json(contact)
})

/**
 * @desc    Delete contact
 * @route   DELETE /api/contacts/:contactId
 * @access  Private/Admin
 */
export const deleteContact: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { contactId } = req.params

    // Use findOneAndDelete for better performance
    const contact = await Contact.findByIdAndDelete(contactId).lean().exec()

    if (!contact) {
        logger.warn("Contact not found for deletion", { contactId })
        res.status(404).json({ message: "Contact not found" })
        return
    }

    // Invalidate relevant caches
    await invalidateCache([
        CACHE_KEYS.ALL_CONTACTS,
        CACHE_KEYS.CONTACT_BY_ID(contactId),
        CACHE_KEYS.CONTACTS_BY_STATUS(contact.replied ? "replied" : "unreplied"),
    ])

    logger.info("Contact deleted successfully", { contactId })
    res.status(200).json({ message: "Contact deleted successfully" })
})

/**
 * @desc    Get unreplied contacts count
 * @route   GET /api/contacts/unreplied/count
 * @access  Private/Admin
 */
export const getUnrepliedCount: RequestHandler = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const count = await Contact.countDocuments({ replied: false })

    res.status(200).json({ count })
})

/**
 * @desc    Bulk delete contacts
 * @route   DELETE /api/contacts/bulk
 * @access  Private/Admin
 */
export const bulkDeleteContacts: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { ids } = req.body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ message: "Contact IDs array is required" })
        return
    }

    const result = await Contact.deleteMany({ _id: { $in: ids } })

    // Invalidate all contact caches
    await invalidateCache([
        CACHE_KEYS.ALL_CONTACTS,
        ...ids.map((id) => CACHE_KEYS.CONTACT_BY_ID(id)),
        CACHE_KEYS.CONTACTS_BY_STATUS("replied"),
        CACHE_KEYS.CONTACTS_BY_STATUS("unreplied"),
    ])

    logger.info("Bulk contact deletion completed", { count: result.deletedCount })
    res.status(200).json({
        message: "Contacts deleted successfully",
        count: result.deletedCount,
    })
})

