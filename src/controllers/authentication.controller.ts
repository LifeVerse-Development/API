import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import { sendEmail } from '../services/email.service';
import { SmsService } from '../services/sms.service';
import { logger } from '../services/logger.service';
import { asyncHandler } from '../utils/asyncHandler.util';
import { redisClient } from '../utils/redis.util';

/**
 * @desc    Send email verification
 * @route   POST /api/verification/email
 * @access  Private
 */
export const sendEmailVerification = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            success: false,
            message: "Email is required.",
        });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const subject = "Your LifeVerse Verification Code";
    const text = `Your verification code is: ${verificationCode}`;

    const htmlFilePath = path.join(__dirname, '../', 'assets', 'email', 'verification.html');
    console.log("HTML File Path:", htmlFilePath);
    try {
        let html = fs.readFileSync(htmlFilePath, 'utf-8');

        html = html.replace('{{VERIFICATION_CODE}}', verificationCode);

        await sendEmail(email, subject, text, html);
    } catch (error: any) {
        logger.error("Error sending verification email", { email, error });
        return res.status(500).json({
            success: false,
            message: "Failed to send verification email.",
            error: error.message,
        });
    }

    await redisClient.set(`verification:email:${email}`, verificationCode);
    // Set expiration for 10 minutes (600 seconds)
    await redisClient.expire(`verification:email:${email}`, 600);

    logger.info("Verification email sent successfully", { email });
    return res.status(200).json({
        success: true,
        message: "Verification email sent successfully.",
    });
});

/**
 * @desc    Send SMS verification
 * @route   POST /api/verification/sms
 * @access  Private
 */
export const sendSmsVerification = asyncHandler(async (req: Request, res: Response) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
        return res.status(400).json({
            success: false,
            message: 'Phone number is required.',
        });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const message = `Your verification code is: ${verificationCode}`;

    const response = await SmsService.sendSms(phoneNumber, message);

    if (!response.success) {
        logger.error('Failed to send verification SMS', { phoneNumber, error: response.message });
        return res.status(500).json({
            success: false,
            message: 'Failed to send verification SMS.',
            error: response.message,
        });
    }

    await redisClient.set(`verification:sms:${phoneNumber}`, verificationCode);
    logger.info('Verification SMS sent successfully', { phoneNumber });
    return res.status(200).json({
        success: true,
        message: 'Verification SMS sent successfully.',
    });
});
