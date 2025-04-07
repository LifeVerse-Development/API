import { Twilio } from "twilio"
import { gateway } from "../configs/gateway.config"
import { logger } from "../services/logger.service"

const twilioClient = new Twilio(gateway.sms.accountSid, gateway.sms.authToken)

export class SmsService {
    /**
     * Send an SMS message immediately
     * @param to Recipient phone number
     * @param message Message content
     * @returns Object with success status and message SID or error
     */
    static async sendSms(to: string, message: string) {
        try {
            // Normalize phone number format if needed
            const normalizedPhone = SmsService.normalizePhoneNumber(to)

            const messageResponse = await twilioClient.messages.create({
                body: message,
                from: gateway.sms.phoneNumber,
                to: normalizedPhone,
            })

            logger.info("SMS sent successfully", { to: normalizedPhone, messageSid: messageResponse.sid })
            return { success: true, messageSid: messageResponse.sid }
        } catch (error: any) {
            logger.error("Error sending SMS:", { to, error: error.message, stack: error.stack })
            return { success: false, message: "Error sending SMS", error: error.message }
        }
    }

    /**
     * Schedule an SMS message to be sent at a future time
     * @param to Recipient phone number
     * @param reminderMessage Message content
     * @param sendAt Date when the message should be sent
     * @returns Object with success status and message SID or error
     */
    static async sendReminder(to: string, reminderMessage: string, sendAt: Date) {
        try {
            // Normalize phone number format if needed
            const normalizedPhone = SmsService.normalizePhoneNumber(to)

            // Ensure sendAt is in the future
            const now = new Date()
            if (sendAt <= now) {
                logger.warn("Reminder scheduled time must be in the future", { to: normalizedPhone, sendAt })
                return { success: false, message: "Reminder time must be in the future", error: "Invalid date" }
            }

            // Format date for Twilio (ISO string)
            const formattedSendAt = sendAt.toISOString()

            const messageResponse = await twilioClient.messages.create({
                body: reminderMessage,
                from: gateway.sms.phoneNumber,
                to: normalizedPhone,
                sendAt: formattedSendAt as any,
                scheduleType: "fixed",
            })

            logger.info("Reminder SMS scheduled successfully", {
                to: normalizedPhone,
                messageSid: messageResponse.sid,
                scheduledFor: formattedSendAt,
            })

            return { success: true, messageSid: messageResponse.sid }
        } catch (error: any) {
            logger.error("Error scheduling reminder SMS:", { to, error: error.message, stack: error.stack })
            return { success: false, message: "Error scheduling reminder SMS", error: error.message }
        }
    }

    /**
     * Cancel a scheduled SMS reminder
     * @param messageSid The SID of the scheduled message to cancel
     * @returns Object with success status or error
     */
    static async cancelReminder(messageSid: string) {
        try {
            // Validate message SID format
            if (!messageSid || !messageSid.startsWith("SM")) {
                logger.warn("Invalid message SID format", { messageSid })
                return { success: false, message: "Invalid message SID format", error: "Invalid SID" }
            }

            // Cancel the scheduled message
            await twilioClient.messages(messageSid).update({ status: "canceled" })

            logger.info("Reminder SMS cancelled successfully", { messageSid })
            return { success: true, message: "Reminder cancelled successfully" }
        } catch (error: any) {
            logger.error("Error cancelling reminder SMS:", { messageSid, error: error.message, stack: error.stack })
            return { success: false, message: "Error cancelling reminder SMS", error: error.message }
        }
    }

    /**
     * Get the status of a sent or scheduled message
     * @param messageSid The SID of the message
     * @returns Object with message status or error
     */
    static async getMessageStatus(messageSid: string) {
        try {
            const message = await twilioClient.messages(messageSid).fetch()

            logger.info("Message status retrieved", { messageSid, status: message.status })
            return {
                success: true,
                status: message.status,
                dateCreated: message.dateCreated,
                dateSent: message.dateSent,
                errorCode: message.errorCode,
                errorMessage: message.errorMessage,
            }
        } catch (error: any) {
            logger.error("Error retrieving message status:", { messageSid, error: error.message, stack: error.stack })
            return { success: false, message: "Error retrieving message status", error: error.message }
        }
    }

    /**
     * Normalize phone number to E.164 format
     * @param phoneNumber Phone number to normalize
     * @returns Normalized phone number
     */
    private static normalizePhoneNumber(phoneNumber: string): string {
        // Remove any non-digit characters
        let digits = phoneNumber.replace(/\D/g, "")

        // Add country code if missing
        if (!digits.startsWith("1") && !digits.startsWith("+")) {
            digits = "1" + digits // Default to US country code
        }

        // Add + prefix if missing
        if (!digits.startsWith("+")) {
            digits = "+" + digits
        }

        return digits
    }
}

