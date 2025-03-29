import { Router } from 'express';
import { createPayment, getStripeSession, getPaymentStatus } from '../controllers/payment.controller';
//import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';

const router = Router();

router.post('/', isAuthenticated, createPayment);
router.get('/:sessionId', isAuthenticated, getStripeSession);
router.get('/:transactionId', isAuthenticated, getPaymentStatus);
//router.get('/', getAllPayments);
//router.put('/:transactionId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), updatePayment);
//router.delete('/:transactionId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deletePayment);

export default router;
