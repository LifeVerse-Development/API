import dotenv from 'dotenv';

dotenv.config();

export const discord = {
    clientId: String(process.env.DISCORD_CLIENT_ID),
    clientSecret: String(process.env.DISCORD_CLIENT_SECRET),
    callbackUrl: String(process.env.DISCORD_CALLBACK_URL),
    webhook: {
        logUrl: String(process.env.DISCORD_LOG_WEBHOOK_URL),
    }
}