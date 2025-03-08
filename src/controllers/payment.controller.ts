import { Request, Response, RequestHandler } from 'express';
import { PaymentGatewayService } from '../services/paymentGateway.service';
import { logger } from '../services/logger.service';

export const createPayment: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        logger.info('Processing payment request', { body: req.body });

        const result = await PaymentGatewayService.processPayment(req.body);
        
        if (!result.success) {
            logger.warn('Payment processing failed', { message: result.message });
            res.status(400).json({ message: result.message, error: result.error });
            return;
        }

        logger.info('Payment processed successfully', { sessionId: result.sessionId });
        res.status(201).json(result);
    } catch (error: any) {
        logger.error('Error processing payment', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createSubscription: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        logger.info('Processing subscription request', { body: req.body });

        const result = await PaymentGatewayService.createSubscription(req.body);
        
        if (!result.success) {
            logger.warn('Subscription processing failed', { message: result.message });
            res.status(400).json({ message: result.message, error: result.error });
            return;
        }

        logger.info('Subscription created successfully', { sessionId: result.sessionId });
        res.status(201).json(result);
    } catch (error: any) {
        logger.error('Error processing subscription', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getPaymentDetails: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { sessionId } = req.params;
    
    try {
        logger.info('Fetching payment details', { sessionId });

        const result = await PaymentGatewayService.getPaymentDetails(sessionId);
        const status = result.success ? 200 : 404;

        if (!result.success) {
            logger.warn('Failed to fetch payment details', { sessionId, message: result.message });
        }

        res.status(status).json(result);
    } catch (error: any) {
        logger.error('Error fetching payment details', { sessionId, error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const handleStripeWebhook: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const event: any = req.body;
    
    try {
        logger.info('Processing Stripe webhook event', { eventType: event.type });
        await PaymentGatewayService.handleStripeWebhook(event);
        res.status(200).send('Webhook received');
    } catch (error: any) {
        logger.error('Error processing Stripe webhook', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getAllPayments: RequestHandler = async (_req: Request, res: Response): Promise<void> => {
    try {
        logger.info('Fetching all payments');

        const result = await PaymentGatewayService.getAllPayments();
        const status = result.success ? 200 : 400;

        if (!result.success) {
            logger.warn('Failed to fetch payments', { message: result.message });
        }

        res.status(status).json(result);
    } catch (error: any) {
        logger.error('Error fetching all payments', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getPaymentById: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { paymentId } = req.params;

    try {
        logger.info('Fetching payment by ID', { paymentId });

        const result = await PaymentGatewayService.getPaymentById(paymentId);
        const status = result.success ? 200 : 404;

        if (!result.success) {
            logger.warn('Payment not found', { paymentId });
        }

        res.status(status).json(result);
    } catch (error: any) {
        logger.error('Error fetching payment by ID', { paymentId, error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deletePayment: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { paymentId } = req.params;

    try {
        logger.info('Deleting payment', { paymentId });

        const result = await PaymentGatewayService.deletePayment(paymentId);
        const status = result.success ? 200 : 404;

        if (!result.success) {
            logger.warn('Payment not found for deletion', { paymentId });
        }

        res.status(status).json(result);
    } catch (error: any) {
        logger.error('Error deleting payment', { paymentId, error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};
