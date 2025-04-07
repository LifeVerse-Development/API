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
    email: {
        smtp: {
            host: String(process.env.SMTP_HOST),
            port: Number(process.env.SMTP_PORT),
            user: String(process.env.SMTP_USER),
            pass: String(process.env.SMTP_PASS),
            tls: Boolean(process.env.SMTP_TLS),
        },
        imap: {
            host: String(process.env.IMAP_HOST),
            port: Number(process.env.IMAP_PORT),
            user: String(process.env.IMAP_USER),
            pass: String(process.env.IMAP_PASS),
            tls: Boolean(process.env.IMAP_TLS),
        },
    },
};
