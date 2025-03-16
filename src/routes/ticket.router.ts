import { Router } from "express";
import { createTicket, getTickets, getTicketById, updateTicket, deleteTicket } from "../controllers/ticket.controller";
import { isAuthenticated } from '../middlewares/authentication.middleware';
import { hasRole } from "../middlewares/authorization.middleware";

const router = Router();

router.post("/", isAuthenticated, createTicket);
router.get("/", isAuthenticated, getTickets);
router.get("/:ticketId", isAuthenticated, getTicketById);
router.put("/:ticketId", isAuthenticated, updateTicket);
router.delete("/:ticketId", isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deleteTicket);

export default router;