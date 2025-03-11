import axios from 'axios';
import { config } from '../configs/config';
import { logger } from '../services/logger.service';

const DISCORD_WEBHOOK_URL = config.discord.webhook.logUrl;

export const sendToDiscord = async (message: string, level: 'info' | 'warn' | 'error') => {
    try {
        if (!DISCORD_WEBHOOK_URL) {
            logger.warn('Discord webhook URL is missing. Skipping log.');
            return;
        }

        const colors = {
            info: 0x00ff00,
            warn: 0xffff00,
            error: 0xff0000
        };

        const payload = {
            username: 'Logger',
            avatar_url: 'https://imgur.com/a/XuF0WDL',
            embeds: [
                {
                    title: `${level.toUpperCase()} - Log Message`,
                    description: message,
                    color: colors[level] || 0x000000,
                    timestamp: new Date().toISOString(),
                }
            ]
        };

        await axios.post(DISCORD_WEBHOOK_URL, payload, { timeout: 5000 });

    } catch (error: any) {
        logger.error('Error sending log to Discord:', {
            message: error.message,
            stack: error.stack,
            responseData: error.response?.data
        });
    }
};
