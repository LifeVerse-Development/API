import dotenv from 'dotenv';

dotenv.config();

export const gateway = {
    payment: {
        stripe: String(process.env.STRIPE_SECRET_KEY),
        stripeWebhookSecret: String(process.env.STRIPE_WEBHOOK_SECRET),
    },
    sms: {
        accountSid: String(process.env.TWILIO_ACCOUNT_SID),
        authToken: String(process.env.TWILIO_AUTH_TOKEN),
        phoneNumber: String(process.env.TWILIO_PHONE_NUMBER),
    },
}