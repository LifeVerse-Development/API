import Stripe from 'stripe';
import type { Request, Response, RequestHandler } from 'express';
import { Payment } from '../models/Payment';
import { config } from '../configs/main.config';
import { gateway } from '../configs/gateway.config';
import { logger } from '../services/logger.service';
import { invalidateCache } from '../middlewares/cache.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';
import { withCache } from '../utils/withCache.util';

const stripe = new Stripe(gateway.payment.stripe, {
    apiVersion: '2025-02-24.acacia',
});

/**
 * @desc    Create a new payment
 * @route   POST /api/payments
 * @access  Private
 */
export const createPayment: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response) => {
        logger.info('Processing payment request', {
            headers: req.headers,
            body: req.body,
            method: req.method,
            url: req.url,
        });

        if (!req.body) {
            logger.error('Request body is undefined', {
                contentType: req.headers['content-type'],
                method: req.method,
            });
            res.status(400).json({ message: 'Invalid request: Body is missing' });
            return;
        }

        const { items, customer, shipping, billing, amount, notes } = req.body;

        if (!items || !items.length || !customer || !shipping) {
            logger.error('Invalid payment request data', {
                missingFields: !items ? 'items' : !customer ? 'customer' : !shipping ? 'shipping' : 'unknown',
                body: req.body,
            });
            res.status(400).json({ message: 'Invalid payment data' });
            return;
        }

        if (!customer.email || !customer.name) {
            logger.error('Missing customer information', { customer });
            res.status(400).json({ message: 'Customer information is incomplete' });
            return;
        }

        if (
            !shipping.address ||
            !shipping.address.line1 ||
            !shipping.address.city ||
            !shipping.address.postal_code ||
            !shipping.address.country
        ) {
            logger.error('Missing shipping address information', { shipping });
            res.status(400).json({ message: 'Shipping address is incomplete' });
            return;
        }

        const lineItems = items.map((item: { id: string; name: string; price: number; quantity: number }) => ({
            price_data: {
                currency: 'eur',
                product_data: {
                    name: item.name,
                    metadata: {
                        product_id: item.id,
                    },
                },
                unit_amount: Math.round(item.price * 100),
            },
            quantity: item.quantity,
        }));

        if (amount.shipping > 0) {
            lineItems.push({
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: `Shipping (${shipping.method})`,
                    },
                    unit_amount: Math.round(amount.shipping * 100),
                },
                quantity: 1,
            });
        }

        getCountryCode(shipping.address.country);

        const session = await stripe.checkout.sessions.create({
            customer_email: customer.email,
            line_items: lineItems,
            mode: 'payment',
            payment_method_types: ['bancontact', 'card', 'eps', 'klarna', 'link', 'p24', 'revolut_pay'],

            shipping_address_collection: {
                allowed_countries: ['DE', 'AT', 'CH', 'FR', 'NL', 'BE'],
            },

            shipping_options: [
                {
                    shipping_rate_data: {
                        type: 'fixed_amount',
                        fixed_amount: {
                            amount: Math.round(amount.shipping * 100),
                            currency: 'eur',
                        },
                        display_name: `${shipping.method.charAt(0).toUpperCase() + shipping.method.slice(1)} Shipping`,
                        delivery_estimate: {
                            minimum: {
                                unit: 'business_day',
                                value: shipping.method === 'standard' ? 3 : shipping.method === 'express' ? 2 : 1,
                            },
                            maximum: {
                                unit: 'business_day',
                                value: shipping.method === 'standard' ? 5 : shipping.method === 'express' ? 3 : 1,
                            },
                        },
                    },
                },
            ],
            success_url: `${config.frontendUrl}/success_payment?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${config.frontendUrl}/cancel_payment`,
            metadata: {
                notes: notes || '',
                order_total: amount.total.toString(),
                tax: amount.tax.toString(),
                subtotal: amount.subtotal.toString(),
                customer_name: customer.name,
                customer_email: customer.email,
                customer_phone: customer.phone || '',
                shipping_method: shipping.method,
                shipping_address_line1: shipping.address.line1,
                shipping_address_line2: shipping.address.line2 || '',
                shipping_address_city: shipping.address.city,
                shipping_address_state: shipping.address.state || '',
                shipping_address_postal_code: shipping.address.postal_code,
                shipping_address_country: shipping.address.country,
                billing_same_as_shipping: billing ? 'false' : 'true',
            },
        });

        const payment = new Payment({
            identifier: generatePaymentIdentifier(),
            paymentMethod: 'stripe',
            amount: amount.total,
            currency: 'eur',
            paymentDate: new Date(),
            transactionId: session.id,
            status: 'pending',
            customerInfo: {
                name: customer.name,
                email: customer.email,
                phone: customer.phone || '',
            },
            shippingInfo: {
                address: {
                    line1: shipping.address.line1,
                    line2: shipping.address.line2 || '',
                    city: shipping.address.city,
                    state: shipping.address.state || '',
                    postalCode: shipping.address.postal_code,
                    country: shipping.address.country,
                },
                method: shipping.method,
            },
            items: items.map((item: any) => ({
                productId: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
            })),
        });

        await payment.save();

        // Invalidate any existing payment caches
        await invalidateCache([`cache:*/api/payments*`, `payments:all*`, `payments:customer:${customer.email}*`]);

        logger.info('Payment record created', {
            paymentId: payment._id,
            identifier: payment.identifier,
            sessionId: session.id,
        });

        logger.info('Stripe session created', {
            sessionId: session.id,
            url: session.url,
        });

        res.json({
            redirectUrl: session.url,
            sessionId: session.id,
            paymentIdentifier: payment.identifier,
        });
    }),
);

/**
 * @desc    Get Stripe session details
 * @route   GET /api/payments/session
 * @access  Private
 */
export const getStripeSession: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response) => {
        const { session_id } = req.query;

        if (!session_id || typeof session_id !== 'string') {
            res.status(400).json({ message: 'Session ID is required and must be a string.' });
            return;
        }

        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (!session) {
            res.status(404).json({ message: 'Session not found' });
            return;
        }

        const payment = await Payment.findOne({ transactionId: session.id });

        if (!payment) {
            res.status(404).json({ message: 'Payment not found in the database' });
            return;
        }

        res.json({
            productName: payment.items[0].name,
            amount: payment.amount / 100,
            orderId: payment.identifier,
            date: payment.paymentDate,
        });
    }),
);

/**
 * @desc    Get payment status
 * @route   GET /api/payments/status/:transactionId
 * @access  Private
 */
export const getPaymentStatus: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response) => {
        const { transactionId } = req.params;

        if (!transactionId) {
            res.status(400).json({ message: 'Session ID is required' });
            return;
        }

        const session = await stripe.checkout.sessions.retrieve(transactionId);
        const payment = await Payment.findOne({ transactionId: transactionId });

        if (!payment) {
            res.status(404).json({ message: 'Payment not found' });
            return;
        }

        // If payment status has changed, update it and invalidate cache
        if (session.payment_status === 'paid' && payment.status !== 'completed') {
            payment.status = 'completed';
            await payment.save();

            // Invalidate related caches
            await invalidateCache([
                `cache:*/api/payments/status/${transactionId}*`,
                `cache:*/api/payments*`,
                `payments:${transactionId}*`,
                `payments:customer:${payment.customerInfo.email}*`,
            ]);

            logger.info('Payment status updated to completed', { transactionId });
        }

        res.json({
            paymentStatus: payment.status,
            stripeStatus: session.payment_status,
            paymentIdentifier: payment.identifier,
        });
    }),
);

/**
 * @desc    Get all payments
 * @route   GET /api/payments
 * @access  Private/Admin
 */
export const getAllPayments: RequestHandler = withCache(
    asyncHandler(async (_req: Request, res: Response) => {
        const payments = await Payment.find().sort({ paymentDate: -1 });

        res.json({
            count: payments.length,
            payments,
        });
    }),
);

/**
 * @desc    Get payment by identifier
 * @route   GET /api/payments/:identifier
 * @access  Private
 */
export const getPaymentByIdentifier: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response) => {
        const { identifier } = req.params;

        const payment = await Payment.findOne({ identifier });

        if (!payment) {
            res.status(404).json({ message: 'Payment not found' });
            return;
        }

        res.json(payment);
    }),
);

/**
 * @desc    Get payments by customer email
 * @route   GET /api/payments/customer/:email
 * @access  Private
 */
export const getPaymentsByCustomer: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response) => {
        const { email } = req.params;

        const payments = await Payment.find({ 'customerInfo.email': email }).sort({ paymentDate: -1 });

        res.json({
            count: payments.length,
            payments,
        });
    }),
);

function generatePaymentIdentifier(): string {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${randomStr}`;
}

function getCountryCode(countryName: string): string {
    const countryMap: Record<string, string> = {
        Germany: 'DE',
        Austria: 'AT',
        Switzerland: 'CH',
        France: 'FR',
        Netherlands: 'NL',
        Belgium: 'BE',
    };

    return countryMap[countryName] || 'DE';
}
