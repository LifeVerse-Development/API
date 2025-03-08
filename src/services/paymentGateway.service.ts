import Stripe from 'stripe';
import { Payment } from '../models/Payment';
import { User } from '../models/User';
import { config } from '../configs/config';
import { logger } from '../services/logger.service';

const stripe = new Stripe(config.gateways.payment.stripe, {
    apiVersion: '2025-02-24.acacia',
});

export class PaymentGatewayService {
    static async processPayment(paymentData: {
        userId: string;
        products: { name: string; quantity: number; price: number }[];
        currency: string;
    }) {
        try {
            const user = await User.findById(paymentData.userId);
            if (!user) return { success: false, message: 'User not found' };

            const lineItems = paymentData.products.map(product => ({
                price_data: {
                    currency: paymentData.currency,
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

            return { success: true, sessionId: session.id, url: session.url };
        } catch (error: any) {
            logger.error('Payment processing error:', { error: error.message, stack: error.stack });
            return { success: false, message: 'Payment processing failed', error: error.message };
        }
    }

    static async createSubscription(subscriptionData: { userId: string; priceId: string }) {
        try {
            const user = await User.findById(subscriptionData.userId);
            if (!user) return { success: false, message: 'User not found' };

            if (!user.stripeCustomerId) {
                const customer = await stripe.customers.create({ email: user.email });
                user.stripeCustomerId = customer.id;
                await user.save();
            }

            const session = await stripe.checkout.sessions.create({
                customer: user.stripeCustomerId,
                line_items: [{ price: subscriptionData.priceId, quantity: 1 }],
                mode: 'subscription',
                payment_method_configuration: 'default',
                success_url: `http://localhost:3000/success_payment?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `http://localhost:3000/cancel_payment`,
            });

            return { success: true, sessionId: session.id, url: session.url };
        } catch (error: any) {
            logger.error('Subscription creation error:', { error: error.message, stack: error.stack });
            return { success: false, message: 'Subscription creation failed', error: error.message };
        }
    }

    static async getPaymentDetails(sessionId: string) {
        try {
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            if (!session) return { success: false, message: 'Session not found' };

            return { success: true, session };
        } catch (error: any) {
            logger.error('Error fetching session:', { error: error.message, stack: error.stack });
            return { success: false, message: 'Error fetching session', error: error.message };
        }
    }

    static async handleStripeWebhook(event: Stripe.Event) {
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
    }

    static async getAllPayments() {
        try {
            const payments = await Payment.find();
            return { success: true, payments };
        } catch (error: any) {
            logger.error('Error fetching payments:', { error: error.message, stack: error.stack });
            return { success: false, message: 'Error fetching payments', error: error.message };
        }
    }

    static async getPaymentById(paymentId: string) {
        try {
            const payment = await Payment.findById(paymentId);
            if (!payment) {
                return { success: false, message: 'Payment not found' };
            }
            return { success: true, payment };
        } catch (error: any) {
            logger.error('Error fetching payment:', { error: error.message, stack: error.stack });
            return { success: false, message: 'Error fetching payment', error: error.message };
        }
    }

    static async deletePayment(paymentId: string) {
        try {
            const payment = await Payment.findById(paymentId);
            if (!payment) {
                return { success: false, message: 'Payment not found' };
            }

            if (!payment.transactionId) {
                return { success: false, message: 'Transaction ID not found for the payment' };
            }

            const canceledPaymentIntent = await stripe.paymentIntents.cancel(payment.transactionId);

            if (canceledPaymentIntent.status !== 'canceled') {
                return { success: false, message: 'Failed to cancel payment intent' };
            }

            await Payment.findByIdAndDelete(paymentId);

            return { success: true, message: 'Payment deleted successfully' };
        } catch (error: any) {
            logger.error('Error deleting payment:', { error: error.message, stack: error.stack });
            return { success: false, message: 'Error deleting payment', error: error.message };
        }
    }
}
