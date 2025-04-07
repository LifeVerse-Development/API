import type { Request, Response, RequestHandler } from "express"
import { Ticket } from "../models/Ticket"
import { logger } from "../services/logger.service"
import { invalidateCache } from "../middlewares/cache.middleware"
import { asyncHandler } from "../utils/asyncHandler.util"

// Cache key patterns for better cache management
const CACHE_KEYS = {
    ALL_TICKETS: "tickets:all",
    TICKET_BY_ID: (id: string) => `tickets:${id}`,
    TICKETS_BY_STATUS: (status: string) => `tickets:status:${status}`,
    TICKETS_BY_PRIORITY: (priority: string) => `tickets:priority:${priority}`,
    TICKETS_BY_ASSIGNEE: (assigneeId: string) => `tickets:assignee:${assigneeId}`,
}

/**
 * @desc    Create a new ticket
 * @route   POST /api/tickets
 * @access  Private
 */
export const createTicket: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const ticket = new Ticket({
        ...req.body,
        identifier: Math.random().toString(36).substring(2, 15),
        createdAt: new Date(),
        lastUpdated: new Date(),
    })

    await ticket.save()

    // Invalidate relevant caches
    await invalidateCache(
        [
            CACHE_KEYS.ALL_TICKETS,
            req.body.status ? CACHE_KEYS.TICKETS_BY_STATUS(req.body.status) : "",
            req.body.priority ? CACHE_KEYS.TICKETS_BY_PRIORITY(req.body.priority) : "",
            req.body.assignedTo ? CACHE_KEYS.TICKETS_BY_ASSIGNEE(req.body.assignedTo) : "",
        ].filter(Boolean),
    )

    logger.info("New ticket created", { ticketId: ticket._id, identifier: ticket.identifier })
    return res.status(201).json(ticket)
})

/**
 * @desc    Get all tickets with pagination
 * @route   GET /api/tickets
 * @access  Private
 */
export const getTickets: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Add filtering options
    const filter: any = {}

    if (req.query.status) {
        filter.status = req.query.status
    }

    if (req.query.priority) {
        filter.priority = req.query.priority
    }

    if (req.query.assignee) {
        filter.assignee = req.query.assignee
    }

    // Use lean() and exec() for better performance
    const tickets = await Ticket.find(filter).sort({ lastUpdated: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await Ticket.countDocuments(filter)

    logger.info("Fetched all tickets", { count: tickets.length, page, limit })
    return res.status(200).json({
        tickets,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Get ticket by ID
 * @route   GET /api/tickets/:ticketId
 * @access  Private
 */
export const getTicketById: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { ticketId } = req.params

    // Use lean() for better performance
    const ticket = await Ticket.findById(ticketId).lean().exec()

    if (!ticket) {
        logger.warn("Ticket not found", { ticketId })
        return res.status(404).json({ message: "Ticket not found" })
    }

    logger.info("Fetched ticket by ID", { ticketId })
    return res.status(200).json(ticket)
})

/**
 * @desc    Update ticket
 * @route   PUT /api/tickets/:ticketId
 * @access  Private
 */
export const updateTicket: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { ticketId } = req.params
    const updateData = {
        ...req.body,
        lastUpdated: new Date(),
    }

    // Get the original ticket for cache invalidation
    const originalTicket = await Ticket.findById(ticketId).lean().exec()

    if (!originalTicket) {
        logger.warn("Ticket not found for update", { ticketId })
        return res.status(404).json({ message: "Ticket not found" })
    }

    // Use findOneAndUpdate with projection for better performance
    const ticket = await Ticket.findByIdAndUpdate(ticketId, { $set: updateData }, { new: true, runValidators: true })
        .lean()
        .exec()

    // Prepare cache keys to invalidate
    const keysToInvalidate = [CACHE_KEYS.ALL_TICKETS, CACHE_KEYS.TICKET_BY_ID(ticketId)]

    // Add status-related cache keys if status changed
    if (originalTicket.status !== ticket?.status) {
        keysToInvalidate.push(
            CACHE_KEYS.TICKETS_BY_STATUS(originalTicket.status),
            CACHE_KEYS.TICKETS_BY_STATUS(ticket?.status as string),
        )
    }

    // Add priority-related cache keys if priority changed
    if (originalTicket.priority !== ticket?.priority) {
        keysToInvalidate.push(
            CACHE_KEYS.TICKETS_BY_PRIORITY(originalTicket.priority),
            CACHE_KEYS.TICKETS_BY_PRIORITY(ticket?.priority as string),
        )
    }

    // Add assignee-related cache keys if assignee changed
    if (originalTicket.assignedTo !== ticket?.assignedTo) {
        keysToInvalidate.push(
            originalTicket.assignedTo ? CACHE_KEYS.TICKETS_BY_ASSIGNEE(originalTicket.assignedTo) : "",
            ticket?.assignedTo ? CACHE_KEYS.TICKETS_BY_ASSIGNEE(ticket.assignedTo) : "",
        )
    }

    // Invalidate relevant caches
    await invalidateCache(keysToInvalidate.filter(Boolean))

    logger.info("Ticket updated successfully", { ticketId })
    return res.status(200).json(ticket)
})

/**
 * @desc    Delete ticket
 * @route   DELETE /api/tickets/:ticketId
 * @access  Private
 */
export const deleteTicket: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { ticketId } = req.params

    // Get the ticket for cache invalidation
    const ticket = await Ticket.findById(ticketId).lean().exec()

    if (!ticket) {
        logger.warn("Ticket not found for deletion", { ticketId })
        return res.status(404).json({ message: "Ticket not found" })
    }

    // Delete the ticket
    await Ticket.deleteOne({ _id: ticketId })

    // Invalidate relevant caches
    await invalidateCache(
        [
            CACHE_KEYS.ALL_TICKETS,
            CACHE_KEYS.TICKET_BY_ID(ticketId),
            ticket.status ? CACHE_KEYS.TICKETS_BY_STATUS(ticket.status) : "",
            ticket.priority ? CACHE_KEYS.TICKETS_BY_PRIORITY(ticket.priority) : "",
            ticket.assignedTo ? CACHE_KEYS.TICKETS_BY_ASSIGNEE(ticket.assignedTo) : "",
        ].filter(Boolean),
    )

    logger.info("Ticket deleted successfully", { ticketId })
    return res.status(200).json({ message: "Ticket deleted successfully" })
})

/**
 * @desc    Get tickets by status
 * @route   GET /api/tickets/status/:status
 * @access  Private
 */
export const getTicketsByStatus: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { status } = req.params

    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Use lean() and exec() for better performance
    const tickets = await Ticket.find({ status }).sort({ lastUpdated: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await Ticket.countDocuments({ status })

    logger.info(`Fetched tickets with status: ${status}`, { count: tickets.length, page, limit })
    return res.status(200).json({
        tickets,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Get tickets by priority
 * @route   GET /api/tickets/priority/:priority
 * @access  Private
 */
export const getTicketsByPriority: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { priority } = req.params

    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Use lean() and exec() for better performance
    const tickets = await Ticket.find({ priority }).sort({ lastUpdated: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await Ticket.countDocuments({ priority })

    logger.info(`Fetched tickets with priority: ${priority}`, { count: tickets.length, page, limit })
    return res.status(200).json({
        tickets,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Get tickets by assignee
 * @route   GET /api/tickets/assignee/:assigneeId
 * @access  Private
 */
export const getTicketsByAssignee: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { assigneeId } = req.params

    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Use lean() and exec() for better performance
    const tickets = await Ticket.find({ assignee: assigneeId })
        .sort({ lastUpdated: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec()

    const total = await Ticket.countDocuments({ assignee: assigneeId })

    logger.info(`Fetched tickets assigned to: ${assigneeId}`, { count: tickets.length, page, limit })
    return res.status(200).json({
        tickets,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

