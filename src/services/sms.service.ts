import { Twilio } from 'twilio';
import { gateway } from '../configs/gateway.config';
import { logger } from '../services/logger.service';

const twilioClient = new Twilio(gateway.sms.accountSid, gateway.sms.authToken);

export class SmsService {
    static async sendSms(to: string, message: string) {
        try {
            const messageResponse = await twilioClient.messages.create({
                body: message,
                from: gateway.sms.phoneNumber,
                to,
            });

            return { success: true, messageSid: messageResponse.sid };
        } catch (error: any) {
            logger.error('Error sending SMS:', { error: error.message, stack: error.stack });
            return { success: false, message: 'Error sending SMS', error: error.message };
        }
    }

    static async sendReminder(to: string, reminderMessage: string, sendAt: Date) {
        try {
            const messageResponse = await twilioClient.messages.create({
                body: reminderMessage,
                from: gateway.sms.phoneNumber,
                to,
                sendAt: sendAt,
            });

            return { success: true, messageSid: messageResponse.sid };
        } catch (error: any) {
            logger.error('Error sending reminder SMS:', { error: error.message, stack: error.stack });
            return { success: false, message: 'Error sending reminder SMS', error: error.message };
        }
    }
}
