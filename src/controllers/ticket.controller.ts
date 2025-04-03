import { Request, Response, RequestHandler } from 'express';
import { Ticket } from '../models/Ticket';
import { logger } from '../services/logger.service';
import { invalidateCache } from '../middlewares/cache.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';
import { withCache } from '../utils/withCache.util';
/**
 * @desc    Create a new ticket
 * @route   POST /api/tickets
 * @access  Private
 */
export const createTicket: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const ticket = new Ticket({
        ...req.body,
        identifier: Math.random().toString(36).substring(2, 15),
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
    });
    await ticket.save();

    // Invalidate tickets cache
    await invalidateCache([`cache:*/api/tickets*`, `tickets:all*`]);

    logger.info('New ticket created', { ticketId: ticket._id });
    res.status(201).json(ticket);
});

/**
 * @desc    Get all tickets
 * @route   GET /api/tickets
 * @access  Private
 */
export const getTickets: RequestHandler = withCache(
    asyncHandler(async (_req: Request, res: Response) => {
        const tickets = await Ticket.find();
        logger.info('Fetched all tickets', { count: tickets.length });
        res.status(200).json(tickets);
    }),
);

/**
 * @desc    Get ticket by ID
 * @route   GET /api/tickets/:ticketId
 * @access  Private
 */
export const getTicketById: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response) => {
        const ticket = await Ticket.findById(req.params.ticketId);
        if (!ticket) {
            logger.warn('Ticket not found', { ticketId: req.params.ticketId });
            res.status(404).json({ message: 'Ticket not found' });
            return;
        }

        logger.info('Fetched ticket by ID', { ticketId: ticket._id });
        res.status(200).json(ticket);
    }),
);

/**
 * @desc    Update ticket
 * @route   PUT /api/tickets/:ticketId
 * @access  Private
 */
export const updateTicket: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const updatedData = {
        ...req.body,
        lastUpdated: new Date().toISOString(),
    };

    const ticket = await Ticket.findByIdAndUpdate(req.params.ticketId, updatedData, { new: true, runValidators: true });
    if (!ticket) {
        logger.warn('Ticket not found for update', { ticketId: req.params.ticketId });
        res.status(404).json({ message: 'Ticket not found' });
        return;
    }

    // Invalidate related caches
    await invalidateCache([
        `cache:*/api/tickets*`,
        `cache:*/api/tickets/${req.params.ticketId}*`,
        `tickets:all*`,
        `tickets:${req.params.ticketId}*`,
    ]);

    logger.info('Ticket updated successfully', { ticketId: ticket._id });
    res.status(200).json(ticket);
});

/**
 * @desc    Delete ticket
 * @route   DELETE /api/tickets/:ticketId
 * @access  Private
 */
export const deleteTicket: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const ticket = await Ticket.findByIdAndDelete(req.params.ticketId);
    if (!ticket) {
        logger.warn('Ticket not found for deletion', { ticketId: req.params.ticketId });
        res.status(404).json({ message: 'Ticket not found' });
        return;
    }

    // Invalidate related caches
    await invalidateCache([
        `cache:*/api/tickets*`,
        `cache:*/api/tickets/${req.params.ticketId}*`,
        `tickets:all*`,
        `tickets:${req.params.ticketId}*`,
    ]);

    logger.info('Ticket deleted successfully', { ticketId: ticket._id });
    res.status(200).json({ message: 'Ticket deleted successfully' });
});

/**
 * @desc    Get tickets by status
 * @route   GET /api/tickets/status/:status
 * @access  Private
 */
export const getTicketsByStatus: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response) => {
        const { status } = req.params;

        const tickets = await Ticket.find({ status });

        logger.info(`Fetched tickets with status: ${status}`, { count: tickets.length });
        res.status(200).json(tickets);
    }),
);

/**
 * @desc    Get tickets by priority
 * @route   GET /api/tickets/priority/:priority
 * @access  Private
 */
export const getTicketsByPriority: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response) => {
        const { priority } = req.params;

        const tickets = await Ticket.find({ priority });

        logger.info(`Fetched tickets with priority: ${priority}`, { count: tickets.length });
        res.status(200).json(tickets);
    }),
);

/**
 * @desc    Get tickets by assignee
 * @route   GET /api/tickets/assignee/:assigneeId
 * @access  Private
 */
export const getTicketsByAssignee: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response) => {
        const { assigneeId } = req.params;

        const tickets = await Ticket.find({ assignee: assigneeId });

        logger.info(`Fetched tickets assigned to: ${assigneeId}`, { count: tickets.length });
        res.status(200).json(tickets);
    }),
);
