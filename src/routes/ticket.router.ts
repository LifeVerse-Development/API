import { Router } from 'express';
import {
    createTicket,
    getTickets,
    getTicketById,
    updateTicket,
    deleteTicket,
    getTicketsByStatus,
    getTicketsByPriority,
    getTicketsByAssignee,
} from '../controllers/ticket.controller';
import { isAuthenticated } from '../middlewares/authentication.middleware';
import { hasRole } from '../middlewares/authorization.middleware';
import { cacheMiddleware } from '../middlewares/cache.middleware';

const router = Router();

// Apply cache middleware globally
router.use(cacheMiddleware());

// Ticket CRUD operations
router.post('/', isAuthenticated, createTicket);
router.get('/', isAuthenticated, getTickets);
router.get('/:ticketId', isAuthenticated, getTicketById);
router.put('/:ticketId', isAuthenticated, updateTicket);
router.delete('/:ticketId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deleteTicket);

// Additional filtered queries
router.get('/status/:status', isAuthenticated, getTicketsByStatus);
router.get('/priority/:priority', isAuthenticated, getTicketsByPriority);
router.get('/assignee/:assigneeId', isAuthenticated, getTicketsByAssignee);

export default router;
