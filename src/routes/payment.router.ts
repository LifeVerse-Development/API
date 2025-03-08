import { Router } from 'express';
import { createPayment, createSubscription, getPaymentDetails, handleStripeWebhook, getAllPayments, getPaymentById, deletePayment } from '../controllers/payment.controller';
import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';

const router = Router();

router.post('/', isAuthenticated, createPayment);
router.post('/subscription', isAuthenticated, createSubscription);
router.get('/', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getAllPayments);
router.get('/:paymentId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getPaymentById);
router.get('/details/:sessionId', isAuthenticated, getPaymentDetails);
router.delete('/:paymentId', isAuthenticated, hasRole('Admin', 'Moderator'), deletePayment);

router.post('/webhook', handleStripeWebhook);

export default router;
