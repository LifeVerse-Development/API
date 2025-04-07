import Stripe from "stripe"
import type { Request, Response, RequestHandler } from "express"
import { Payment } from "../models/Payment"
import { config } from "../configs/main.config"
import { gateway } from "../configs/gateway.config"
import { logger } from "../services/logger.service"
import { invalidateCache } from "../middlewares/cache.middleware"
import { asyncHandler } from "../utils/asyncHandler.util"

// Initialize Stripe with API version
const stripe = new Stripe(gateway.payment.stripe, {
    apiVersion: "2025-02-24.acacia",
})

// Cache key patterns for better cache management
const CACHE_KEYS = {
    ALL_PAYMENTS: "payments:all",
    PAYMENT_BY_ID: (id: string) => `payments:${id}`,
    PAYMENT_BY_IDENTIFIER: (identifier: string) => `payments:identifier:${identifier}`,
    PAYMENTS_BY_CUSTOMER: (email: string) => `payments:customer:${email}`,
    PAYMENT_BY_TRANSACTION: (transactionId: string) => `payments:transaction:${transactionId}`,
}

// Supported currencies
type SupportedCurrency = "eur" | "usd" | "gbp"

// Supported countries for shipping
const ALLOWED_COUNTRIES: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] = [
    "DE",
    "AT",
    "CH",
    "FR",
    "NL",
    "BE",
    "GB",
    "US",
]

/**
 * @desc    Create a new payment
 * @route   POST /api/payments
 * @access  Private
 */
export const createPayment: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    logger.info("Processing payment request", {
        method: req.method,
        url: req.url,
    })

    if (!req.body) {
        logger.error("Request body is undefined", {
            contentType: req.headers["content-type"],
            method: req.method,
        })
        return res.status(400).json({ message: "Invalid request: Body is missing" })
    }

    const { items, customer, shipping, billing, amount, notes, currency = "eur" } = req.body

    // Validate required fields
    if (!items?.length || !customer || !shipping) {
        logger.error("Invalid payment request data", {
            missingFields: !items ? "items" : !customer ? "customer" : !shipping ? "shipping" : "unknown",
        })
        return res.status(400).json({ message: "Invalid payment data" })
    }

    if (!customer.email || !customer.name) {
        logger.error("Missing customer information", { customer })
        return res.status(400).json({ message: "Customer information is incomplete" })
    }

    if (
        !shipping.address ||
        !shipping.address.line1 ||
        !shipping.address.city ||
        !shipping.address.postal_code ||
        !shipping.address.country
    ) {
        logger.error("Missing shipping address information", { shipping })
        return res.status(400).json({ message: "Shipping address is incomplete" })
    }

    // Validate currency
    const validatedCurrency = validateCurrency(currency)

    // Map items to Stripe line items format with images if available
    const lineItems = items.map(
        (item: {
            id: string
            name: string
            price: number
            quantity: number
            image?: string
            description?: string
        }) => ({
            price_data: {
                currency: validatedCurrency,
                product_data: {
                    name: item.name,
                    description: item.description || undefined,
                    // Include image if available
                    images: item.image ? [item.image] : undefined,
                    metadata: {
                        product_id: item.id,
                    },
                },
                unit_amount: Math.round(item.price * 100),
            },
            quantity: item.quantity,
        }),
    )

    // Add tax as a separate line item (not as shipping)
    if (amount.tax > 0) {
        lineItems.push({
            price_data: {
                currency: validatedCurrency,
                product_data: {
                    name: 'Tax (19% VAT)',
                },
                unit_amount: Math.round(amount.tax * 100),
            },
            quantity: 1,
        });
    }

    // Define shipping rates for different methods
    const shippingRates = {
        standard: {
            amount: shipping.method === "standard" ? Math.round(amount.shipping * 100) : 599,
            display_name: "Standard Shipping",
            min_days: 3,
            max_days: 5
        },
        express: {
            amount: shipping.method === "express" ? Math.round(amount.shipping * 100) : 1299,
            display_name: "Express Shipping",
            min_days: 2,
            max_days: 3
        },
        overnight: {
            amount: shipping.method === "overnight" ? Math.round(amount.shipping * 100) : 1999,
            display_name: "Overnight Shipping",
            min_days: 1,
            max_days: 1
        }
    };

    // Create shipping options for all three shipping methods
    // Put the selected shipping method first in the array so it's selected by default
    const selectedShippingMethod = shipping.method || "standard";
    const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [];
    
    // Add the selected shipping method first
    if (selectedShippingMethod === "standard") {
        shippingOptions.push(createShippingOption(shippingRates.standard, validatedCurrency));
        shippingOptions.push(createShippingOption(shippingRates.express, validatedCurrency));
        shippingOptions.push(createShippingOption(shippingRates.overnight, validatedCurrency));
    } else if (selectedShippingMethod === "express") {
        shippingOptions.push(createShippingOption(shippingRates.express, validatedCurrency));
        shippingOptions.push(createShippingOption(shippingRates.standard, validatedCurrency));
        shippingOptions.push(createShippingOption(shippingRates.overnight, validatedCurrency));
    } else {
        shippingOptions.push(createShippingOption(shippingRates.overnight, validatedCurrency));
        shippingOptions.push(createShippingOption(shippingRates.standard, validatedCurrency));
        shippingOptions.push(createShippingOption(shippingRates.express, validatedCurrency));
    }
    
    // Get country code for shipping
    const countryCode = getCountryCode(shipping.address.country)

    // Ensure country code is in the allowed list
    const allowedCountries = getAllowedCountries(countryCode)

    // Create session parameters
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
        customer_email: customer.email,
        line_items: lineItems,
        mode: "payment",
        payment_method_types: ["bancontact", "card", "eps", "klarna", "link", "p24", "revolut_pay"],
        shipping_address_collection: {
            allowed_countries: allowedCountries,
        },
        shipping_options: shippingOptions,
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
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create(sessionParams)

    // Create payment record in database
    const paymentIdentifier = generatePaymentIdentifier()
    const payment = new Payment({
        identifier: paymentIdentifier,
        paymentMethod: "stripe",
        amount: amount.total,
        currency: validatedCurrency,
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
            image: item.image || null,
            description: item.description || null,
        })),
    })

    await payment.save()

    // Invalidate relevant caches
    await invalidateCache([CACHE_KEYS.ALL_PAYMENTS, CACHE_KEYS.PAYMENTS_BY_CUSTOMER(customer.email)])

    logger.info("Payment record created", {
        paymentId: payment._id,
        identifier: payment.identifier,
        sessionId: session.id,
    })

    logger.info("Stripe session created", {
        sessionId: session.id,
        url: session.url,
    })

    return res.json({
        redirectUrl: session.url,
        sessionId: session.id,
        paymentIdentifier: payment.identifier,
    })
})

// Helper function to create a shipping option
function createShippingOption(
    shippingRate: { amount: number; display_name: string; min_days: number; max_days: number },
    currency: string
): Stripe.Checkout.SessionCreateParams.ShippingOption {
    return {
        shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: {
                amount: shippingRate.amount,
                currency: currency,
            },
            display_name: shippingRate.display_name,
            delivery_estimate: {
                minimum: {
                    unit: "business_day",
                    value: shippingRate.min_days,
                },
                maximum: {
                    unit: "business_day",
                    value: shippingRate.max_days,
                },
            },
        },
    };
}

/**
 * @desc    Get Stripe session details
 * @route   GET /api/payments/session
 * @access  Private
 */
export const getStripeSession: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { session_id } = req.query

    if (!session_id || typeof session_id !== "string") {
        return res.status(400).json({ message: "Session ID is required and must be a string." })
    }

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id)

    if (!session) {
        return res.status(404).json({ message: "Session not found" })
    }

    // Find corresponding payment in database
    const payment = await Payment.findOne({ transactionId: session.id }).lean().exec()

    if (!payment) {
        return res.status(404).json({ message: "Payment not found in the database" })
    }

    return res.json({
        productName: payment.items[0].name,
        amount: payment.amount,
        orderId: payment.identifier,
        date: payment.paymentDate,
    })
})

/**
 * @desc    Get payment status
 * @route   GET /api/payments/status/:transactionId
 * @access  Private
 */
export const getPaymentStatus: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { transactionId } = req.params

    if (!transactionId) {
        return res.status(400).json({ message: "Session ID is required" })
    }

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(transactionId)

    // Find corresponding payment in database
    const payment = await Payment.findOne({ transactionId }).lean().exec()

    if (!payment) {
        return res.status(404).json({ message: "Payment not found" })
    }

    // If payment status has changed, update it
    if (session.payment_status === "paid" && payment.status !== "completed") {
        await Payment.updateOne({ transactionId }, { $set: { status: "completed", updatedAt: new Date() } })

        // Invalidate relevant caches
        await invalidateCache([
            CACHE_KEYS.ALL_PAYMENTS,
            CACHE_KEYS.PAYMENT_BY_ID(payment._id.toString()),
            CACHE_KEYS.PAYMENT_BY_IDENTIFIER(payment.identifier),
            CACHE_KEYS.PAYMENT_BY_TRANSACTION(transactionId),
            CACHE_KEYS.PAYMENTS_BY_CUSTOMER(payment.customerInfo.email),
        ])

        logger.info("Payment status updated to completed", { transactionId })
    }

    return res.json({
        paymentStatus: session.payment_status === "paid" ? "completed" : payment.status,
        stripeStatus: session.payment_status,
        paymentIdentifier: payment.identifier,
    })
})

/**
 * @desc    Get all payments with pagination
 * @route   GET /api/payments
 * @access  Private/Admin
 */
export const getAllPayments: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Add filtering options
    const filter: any = {}

    // Filter by status if provided
    if (req.query.status) {
        filter.status = req.query.status
    }

    // Filter by userId if provided
    if (req.query.userId) {
        filter.userId = req.query.userId
    }

    // Filter by date range if provided
    if (req.query.startDate && req.query.endDate) {
        filter.paymentDate = {
            $gte: new Date(req.query.startDate as string),
            $lte: new Date(req.query.endDate as string)
        };
    } else if (req.query.startDate) {
        filter.paymentDate = { $gte: new Date(req.query.startDate as string) };
    } else if (req.query.endDate) {
        filter.paymentDate = { $lte: new Date(req.query.endDate as string) };
    }

    // Use lean() and exec() for better performance
    const payments = await Payment.find(filter).sort({ paymentDate: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await Payment.countDocuments(filter)

    return res.json({
        payments,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Get payments by user ID with pagination
 * @route   GET /api/payments/user/:userId
 * @access  Private
 */
export const getPaymentsByUserId: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params

    if (!userId) {
        return res.status(400).json({ message: "User ID is required" })
    }

    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 10
    const skip = (page - 1) * limit

    // Add filtering options
    const filter: any = { userId }

    // Filter by status if provided
    if (req.query.status) {
        filter.status = req.query.status
    }

    // Filter by date range if provided
    if (req.query.startDate && req.query.endDate) {
        filter.paymentDate = {
            $gte: new Date(req.query.startDate as string),
            $lte: new Date(req.query.endDate as string)
        };
    } else if (req.query.startDate) {
        filter.paymentDate = { $gte: new Date(req.query.startDate as string) };
    } else if (req.query.endDate) {
        filter.paymentDate = { $lte: new Date(req.query.endDate as string) };
    }

    // Use lean() and exec() for better performance
    const payments = await Payment.find(filter)
        .sort({ paymentDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec()

    const total = await Payment.countDocuments(filter)

    return res.json({
        payments,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Get current user's payments with pagination
 * @route   GET /api/payments/me
 * @access  Private
 */
export const getMyPayments: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as any)?.userId;
    if (!userId) {
        return res.status(401).json({ message: "Not authenticated" })
    }

    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 10
    const skip = (page - 1) * limit

    // Add filtering options
    const filter: any = { userId }

    // Filter by status if provided
    if (req.query.status) {
        filter.status = req.query.status
    }

    // Filter by date range if provided
    if (req.query.startDate && req.query.endDate) {
        filter.paymentDate = {
            $gte: new Date(req.query.startDate as string),
            $lte: new Date(req.query.endDate as string)
        };
    } else if (req.query.startDate) {
        filter.paymentDate = { $gte: new Date(req.query.startDate as string) };
    } else if (req.query.endDate) {
        filter.paymentDate = { $lte: new Date(req.query.endDate as string) };
    }

    // Use lean() and exec() for better performance
    const payments = await Payment.find(filter)
        .sort({ paymentDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec()

    const total = await Payment.countDocuments(filter)

    return res.json({
        payments,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Get payment by identifier
 * @route   GET /api/payments/:identifier
 * @access  Private
 */
export const getPaymentByIdentifier: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { identifier } = req.params

    // Use lean() for better performance
    const payment = await Payment.findOne({ identifier }).lean().exec()

    if (!payment) {
        return res.status(404).json({ message: "Payment not found" })
    }

    return res.json(payment)
})

/**
 * @desc    Get payments by customer email with pagination
 * @route   GET /api/payments/customer/:email
 * @access  Private
 */
export const getPaymentsByCustomer: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.params

    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 10
    const skip = (page - 1) * limit

    // Use lean() and exec() for better performance
    const payments = await Payment.find({ "customerInfo.email": email })
        .sort({ paymentDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec()

    const total = await Payment.countDocuments({ "customerInfo.email": email })

    return res.json({
        payments,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * Generate a unique payment identifier
 */
function generatePaymentIdentifier(): string {
    const timestamp = Date.now().toString(36)
    const randomStr = Math.random().toString(36).substring(2, 10)
    return `${timestamp}-${randomStr}`
}

/**
 * Get ISO country code from country name
 */
function getCountryCode(countryName: string): string {
    const countryMap: Record<string, string> = {
        Germany: "DE",
        Austria: "AT",
        Switzerland: "CH",
        France: "FR",
        Netherlands: "NL",
        Belgium: "BE",
        "United Kingdom": "GB",
        "Great Britain": "GB",
        England: "GB",
        "United States": "US",
        USA: "US",
    }

    return countryMap[countryName] || "DE"
}

/**
 * Validate and normalize currency
 */
function validateCurrency(currency: string): SupportedCurrency {
    const normalizedCurrency = currency.toLowerCase()

    if (normalizedCurrency === "eur" || normalizedCurrency === "usd" || normalizedCurrency === "gbp") {
        return normalizedCurrency as SupportedCurrency
    }

    // Default to EUR if invalid currency provided
    logger.warn(`Invalid currency provided: ${currency}, defaulting to EUR`)
    return "eur"
}

/**
 * Get allowed countries for Stripe, ensuring the customer's country is included
 */
function getAllowedCountries(
    countryCode: string,
): Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] {
    // Make sure the country code is valid for Stripe
    const validCountryCode = ALLOWED_COUNTRIES.includes(countryCode as any)
        ? (countryCode as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry)
        : "DE"

    // Create a set of allowed countries, starting with the customer's country
    const allowedCountriesSet = new Set<Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry>([
        validCountryCode,
    ])

        // Add default European countries
        ;["DE", "AT", "CH", "FR", "NL", "BE"].forEach((country) => {
            allowedCountriesSet.add(country as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry)
        })

    // Convert set back to array
    return Array.from(allowedCountriesSet)
}

