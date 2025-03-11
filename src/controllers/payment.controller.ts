import Stripe from "stripe";
import type { Request, Response, RequestHandler } from "express";
import { Payment } from "../models/Payment";
import { config } from "../configs/main.config";
import { gateway } from "../configs/gateway.config";
import { logger } from "../services/logger.service";

const stripe = new Stripe(gateway.payment.stripe, {
    apiVersion: "2025-02-24.acacia",
});

export const createPayment: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        logger.info("Processing payment request", {
            headers: req.headers,
            body: req.body,
            method: req.method,
            url: req.url,
        });

        if (!req.body) {
            logger.error("Request body is undefined", {
                contentType: req.headers["content-type"],
                method: req.method,
            });
            res.status(400).json({ message: "Invalid request: Body is missing" });
            return;
        }

        const { items, customer, shipping, billing, amount, notes } = req.body;

        if (!items || !items.length || !customer || !shipping) {
            logger.error("Invalid payment request data", {
                missingFields: !items ? "items" : !customer ? "customer" : !shipping ? "shipping" : "unknown",
                body: req.body,
            });
            res.status(400).json({ message: "Invalid payment data" });
            return;
        }

        if (!customer.email || !customer.name) {
            logger.error("Missing customer information", { customer });
            res.status(400).json({ message: "Customer information is incomplete" });
            return;
        }

        if (
            !shipping.address ||
            !shipping.address.line1 ||
            !shipping.address.city ||
            !shipping.address.postal_code ||
            !shipping.address.country
        ) {
            logger.error("Missing shipping address information", { shipping });
            res.status(400).json({ message: "Shipping address is incomplete" });
            return;
        }

        const lineItems = items.map((item: { id: string; name: string; price: number; quantity: number }) => ({
            price_data: {
                currency: "eur",
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
                    currency: "eur",
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
            mode: "payment",
            payment_method_types: ["bancontact", "card", "eps", "klarna", "link", "p24", "revolut_pay"],

            shipping_address_collection: {
                allowed_countries: ["DE", "AT", "CH", "FR", "NL", "BE"]
            },

            shipping_options: [
                {
                    shipping_rate_data: {
                        type: "fixed_amount",
                        fixed_amount: {
                            amount: Math.round(amount.shipping * 100),
                            currency: "eur",
                        },
                        display_name: `${shipping.method.charAt(0).toUpperCase() + shipping.method.slice(1)} Shipping`,
                        delivery_estimate: {
                            minimum: {
                                unit: "business_day",
                                value: shipping.method === "standard" ? 3 : shipping.method === "express" ? 2 : 1,
                            },
                            maximum: {
                                unit: "business_day",
                                value: shipping.method === "standard" ? 5 : shipping.method === "express" ? 3 : 1,
                            },
                        },
                    },
                },
            ],
            success_url: `${config.frontendUrl}/success_payment?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${config.frontendUrl}/cancel_payment`,
            metadata: {
                notes: notes || "",
                order_total: amount.total.toString(),
                tax: amount.tax.toString(),
                subtotal: amount.subtotal.toString(),
                customer_name: customer.name,
                customer_email: customer.email,
                customer_phone: customer.phone || "",
                shipping_method: shipping.method,
                shipping_address_line1: shipping.address.line1,
                shipping_address_line2: shipping.address.line2 || "",
                shipping_address_city: shipping.address.city,
                shipping_address_state: shipping.address.state || "",
                shipping_address_postal_code: shipping.address.postal_code,
                shipping_address_country: shipping.address.country,
                billing_same_as_shipping: billing ? "false" : "true",
            },
        });

        const payment = new Payment({
            identifier: generatePaymentIdentifier(),
            paymentMethod: "stripe",
            amount: amount.total,
            currency: "eur",
            paymentDate: new Date(),
            transactionId: session.id,
            status: "pending",
            customerInfo: {
                name: customer.name,
                email: customer.email,
                phone: customer.phone || "",
            },
            shippingInfo: {
                address: {
                    line1: shipping.address.line1,
                    line2: shipping.address.line2 || "",
                    city: shipping.address.city,
                    state: shipping.address.state || "",
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

        logger.info("Payment record created", {
            paymentId: payment._id,
            identifier: payment.identifier,
            sessionId: session.id,
        });

        logger.info("Stripe session created", {
            sessionId: session.id,
            url: session.url,
        });

        res.json({
            redirectUrl: session.url,
            sessionId: session.id,
            paymentIdentifier: payment.identifier,
        });
    } catch (error: any) {
        logger.error("Payment processing error:", {
            error: error.message,
            stack: error.stack,
            code: error.code || "unknown",
        });

        if (error.type === "StripeCardError") {
            res.status(400).json({ message: "Payment card error", error: error.message });
        } else if (error.type === "StripeInvalidRequestError") {
            res.status(400).json({ message: "Invalid payment request", error: error.message });
        } else {
            res.status(500).json({ message: "Payment processing failed", error: error.message });
        }
    }
};

function generatePaymentIdentifier(): string {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${randomStr}`;
}

function getCountryCode(countryName: string): string {
    const countryMap: Record<string, string> = {
        Germany: "DE",
        Austria: "AT",
        Switzerland: "CH",
        France: "FR",
        Netherlands: "NL",
        Belgium: "BE",
    };

    return countryMap[countryName] || "DE";
}

export const getPaymentStatus: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { transactionId } = req.params;

        if (!transactionId) {
            res.status(400).json({ message: "Session ID is required" });
            return;
        }

        const session = await stripe.checkout.sessions.retrieve(transactionId);
        const payment = await Payment.findOne({ transactionId: transactionId });

        if (!payment) {
            res.status(404).json({ message: "Payment not found" });
            return;
        }

        if (session.payment_status === "paid" && payment.status !== "completed") {
            payment.status = "completed";
            await payment.save();
            logger.info("Payment status updated to completed", { transactionId });
        }

        res.json({
            paymentStatus: payment.status,
            stripeStatus: session.payment_status,
            paymentIdentifier: payment.identifier,
        });
    } catch (error: any) {
        logger.error("Error retrieving payment status:", { error: error.message });
        res.status(500).json({ message: "Unable to retrieve payment status", error: error.message });
    }
};
