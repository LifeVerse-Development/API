import { Router } from "express"
import {
    createPayment,
    getStripeSession,
    getPaymentStatus,
    getAllPayments,
    getPaymentByIdentifier,
    getPaymentsByCustomer,
    getPaymentsByUserId,
    getMyPayments
} from "../controllers/payment.controller"
import { hasRole } from "../middlewares/authorization.middleware"
import { isAuthenticated } from "../middlewares/authentication.middleware"
import { cacheMiddleware } from "../middlewares/cache.middleware"

const router = Router()

// Apply cache middleware to GET requests
router.get("*", cacheMiddleware(300)) // 5 minutes cache

// Payment creation endpoint
router.post("/", isAuthenticated, createPayment)

// Session and status endpoints
router.get("/session/:sessionId", isAuthenticated, getStripeSession)
router.get("/status/:transactionId", isAuthenticated, getPaymentStatus)

// User-specific payment endpoints
router.get("/me", isAuthenticated, getMyPayments)
router.get("/user/:userId", isAuthenticated, hasRole("Admin", "Moderator", "Developer"), getPaymentsByUserId)
router.get("/customer/:email", isAuthenticated, getPaymentsByCustomer)

// Get payment by identifier
router.get("/:identifier", isAuthenticated, getPaymentByIdentifier)

// Get all payments (admin only)
router.get("/", isAuthenticated, hasRole("Admin", "Moderator", "Developer"), getAllPayments)

export default router