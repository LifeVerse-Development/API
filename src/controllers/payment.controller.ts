import Stripe from 'stripe';
import { Request, Response, RequestHandler } from "express";
import { Payment } from '../models/Payment';
import { User } from '../models/User';
import { config } from '../configs/config';
import { logger } from '../services/logger.service';

const stripe = new Stripe(config.gateways.payment.stripe, {
    apiVersion: '2025-02-24.acacia',
});

export const createPayment: RequestHandler = async (req, res): Promise<void> => {
    try {
        logger.info('Processing payment request', { body: req.body });

        const { userId, products, currency } = req.body;
        const user = await User.findById(userId);
        if (!user) return;

        const lineItems = products.map((product: { name: string; price: number; quantity: number }) => ({
            price_data: {
                currency: currency,
                product_data: { name: product.name },
                unit_amount: product.price * 100,
            },
            quantity: product.quantity,
        }));

        const session = await stripe.checkout.sessions.create({
            customer_email: user.email,
            line_items: lineItems,
            mode: 'payment',
            payment_method_configuration: 'default',
            success_url: `http://localhost:3000/success_payment?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `http://localhost:3000/cancel_payment`,
        });

        if (session.url) {
            res.redirect(session.url);
            return;
        } else {
            throw new Error('Session URL is null');
        }
    } catch (error: any) {
        logger.error('Payment processing error:', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Payment processing failed', error: error.message });
    }
};

export const createSubscription: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        logger.info('Processing subscription request', { body: req.body });

        const { userId, priceId } = req.body;
        const user = await User.findById(userId);
        if (!user) return; res.status(404).json({ message: 'User not found' });

        if (!user.stripeCustomerId) {
            const customer = await stripe.customers.create({ email: user.email });
            user.stripeCustomerId = customer.id;
            await user.save();
        }

        const session = await stripe.checkout.sessions.create({
            customer: user.stripeCustomerId,
            line_items: [{ price: priceId, quantity: 1 }],
            mode: 'subscription',
            payment_method_configuration: 'default',
            success_url: `http://localhost:3000/success_payment?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `http://localhost:3000/cancel_payment`,
        });

        res.status(201).json({ success: true, sessionId: session.id, url: session.url });
    } catch (error: any) {
        logger.error('Subscription creation error:', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Subscription creation failed', error: error.message });
    }
};

export const getPaymentDetails: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { sessionId } = req.params;
    
    try {
        logger.info('Fetching payment details', { sessionId });

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (!session) {
            res.status(404).json({ success: false, message: 'Session not found' });
            return;
        }

        res.status(200).json({ success: true, session });
    } catch (error: any) {
        logger.error('Error fetching payment details', { sessionId, error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const handleStripeWebhook: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const sig = req.headers['stripe-signature'] as string;
    const endpointSecret = config.gateways.payment.stripeWebhookSecret;
    
    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err: any) {
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    try {
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session;

            if (!session.customer_email) return;

            const user = await User.findOne({ email: session.customer_email });
            if (!user) return;

            const newPayment = new Payment({
                identifier: session.id,
                userId: user._id,
                paymentMethod: session.payment_method_types?.[0] || 'unknown',
                amount: session.amount_total ? session.amount_total / 100 : 0,
                currency: session.currency,
                transactionId: session.payment_intent,
                paymentDate: new Date(),
                status: 'success',
            });

            await newPayment.save();
            logger.info(`Payment recorded: ${newPayment.identifier}`);
        } else if (event.type === 'checkout.session.expired') {
            const session = event.data.object as Stripe.Checkout.Session;
            const payment = await Payment.findOne({ identifier: session.id });
            if (payment) {
                payment.status = 'failed';
                await payment.save();
                logger.info(`Payment failed: ${payment.identifier}`);
            }
        }
    } catch (error: any) {
        logger.error('Webhook processing error:', { error: error.message, stack: error.stack });
    }

    res.json({ received: true });
};

export const getAllPayments: RequestHandler = async (_req: Request, res: Response): Promise<void> => {
    try {
        logger.info('Fetching all payments');

        const payments = await Payment.find();
        res.status(200).json({ success: true, payments });
    } catch (error: any) {
        logger.error('Error fetching all payments', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getPaymentById: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { paymentId } = req.params;

    try {
        logger.info('Fetching payment by ID', { paymentId });

        const payment = await Payment.findById(paymentId);
        if (!payment) {
            res.status(404).json({ success: false, message: 'Payment not found' });
            return;
        }

        res.status(200).json({ success: true, payment });
    } catch (error: any) {
        logger.error('Error fetching payment by ID', { paymentId, error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deletePayment: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { paymentId } = req.params;

    try {
        logger.info('Deleting payment', { paymentId });

        const payment = await Payment.findById(paymentId);
        if (!payment) {
            res.status(404).json({ success: false, message: 'Payment not found' });
            return;
        }

        if (!payment.transactionId) {
            res.status(400).json({ success: false, message: 'Transaction ID not found for the payment' });
            return;
        }

        const canceledPaymentIntent = await stripe.paymentIntents.cancel(payment.transactionId);

        if (canceledPaymentIntent.status !== 'canceled') {
            res.status(400).json({ success: false, message: 'Failed to cancel payment intent' });
            return;
        }

        await Payment.findByIdAndDelete(paymentId);

        res.status(200).json({ success: true, message: 'Payment deleted successfully' });
    } catch (error: any) {
        logger.error('Error deleting payment', { paymentId, error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};
