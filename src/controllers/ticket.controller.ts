import { Request, Response, RequestHandler } from "express";
import { Ticket } from "../models/Ticket";
import { logger } from "../services/logger.service";

export const createTicket: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const ticket = new Ticket({
            ...req.body,
            identifier: Math.random().toString(36).substring(2, 15),
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
        });
        await ticket.save();

        logger.info("New ticket created", { ticketId: ticket._id });
        res.status(201).json(ticket);
    } catch (error: any) {
        logger.error("Error creating ticket", { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error creating ticket" });
    }
};

export const getTickets: RequestHandler = async (_req: Request, res: Response): Promise<void> => {
    try {
        const tickets = await Ticket.find();
        logger.info("Fetched all tickets", { count: tickets.length });
        res.status(200).json(tickets);
    } catch (error: any) {
        logger.error("Error fetching tickets", { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error fetching tickets" });
    }
};

export const getTicketById: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const ticket = await Ticket.findById(req.params.ticketId);
        if (!ticket) {
            logger.warn("Ticket not found", { ticketId: req.params.ticketId });
            res.status(404).json({ message: "Ticket not found" });
            return;
        }
        
        logger.info("Fetched ticket by ID", { ticketId: ticket._id });
        res.status(200).json(ticket);
    } catch (error: any) {
        logger.error("Error fetching ticket by ID", { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error fetching ticket" });
    }
};

export const updateTicket: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const updatedData = {
            ...req.body,
            lastUpdated: new Date().toISOString(),
        };

        const ticket = await Ticket.findByIdAndUpdate(req.params.ticketId, updatedData, { new: true, runValidators: true });
        if (!ticket) {
            logger.warn("Ticket not found for update", { ticketId: req.params.ticketId });
            res.status(404).json({ message: "Ticket not found" });
            return;
        }

        logger.info("Ticket updated successfully", { ticketId: ticket._id });
        res.status(200).json(ticket);
    } catch (error: any) {
        logger.error("Error updating ticket", { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error updating ticket" });
    }
};

export const deleteTicket: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const ticket = await Ticket.findByIdAndDelete(req.params.ticketId);
        if (!ticket) {
            logger.warn("Ticket not found for deletion", { ticketId: req.params.ticketId });
            res.status(404).json({ message: "Ticket not found" });
            return;
        }

        logger.info("Ticket deleted successfully", { ticketId: ticket._id });
        res.status(200).json({ message: "Ticket deleted successfully" });
    } catch (error: any) {
        logger.error("Error deleting ticket", { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error deleting ticket" });
    }
};
