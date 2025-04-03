import nodemailer from 'nodemailer';
import { Email } from '../models/Email';
import { simpleParser, ParsedMail, AddressObject } from 'mailparser';
import { logger } from '../services/logger.service';
import imapClient, { ImapSimple, ImapSimpleOptions } from 'imap-simple';
import { Config } from 'imap';
import { gateway } from '../configs/gateway.config';

// Function to get profile picture URL (Placeholder function, implement as needed)
const getProfilePicture = async (): Promise<string | null> => {
    return `https://imgur.com/sWwpSfV`;
};

// Creates a Nodemailer transporter based on SMTP settings
const createTransporter = () => {
    return nodemailer.createTransport({
        host: gateway.email.smtp.host,
        port: gateway.email.smtp.port,
        secure: false,
        tls: {
            rejectUnauthorized: false,
        },
        auth: {
            user: gateway.email.smtp.user,
            pass: gateway.email.smtp.pass,
        },
    });
};

// Sends an email and stores it in the database
export const sendEmail = async (to: string, subject: string, text: string, html: string) => {
    try {
        if (!to) throw new Error('Recipient email (to) is required.');

        const transporter = createTransporter();
        const mailOptions = {
            from: `"LifeVerse Studio" <${gateway.email.smtp.user}>`,
            to,
            subject,
            text,
            html,
        };

        await transporter.sendMail(mailOptions);
        logger.info(`Email successfully sent to ${to}.`);

        const profilePicture = await getProfilePicture();

        // Stores the sent email in the MongoDB database
        const email = new Email({
            identifier: Math.random().toString(36).substring(2, 15),
            to,
            subject,
            text,
            html,
            profilePicture,
        });
        await email.save();

        return email;
    } catch (error: any) {
        logger.error('Error sending email:', { error: error.message, stack: error.stack });
        throw new Error('Failed to send email');
    }
};

// Retrieves all stored emails from the database
export const getEmails = async () => {
    return await Email.find();
};

// Retrieves a specific email by its ID
export const getEmailById = async (emailId: string) => {
    const email = await Email.findById(emailId);
    if (!email) throw new Error('Email not found');
    return email;
};

// Deletes all stored emails
export const deleteAllEmails = async () => {
    await Email.deleteMany();
    logger.info('All stored emails have been deleted.');
};

// Deletes a specific email by its ID
export const deleteEmailById = async (emailId: string) => {
    const email = await Email.findByIdAndDelete(emailId);
    if (!email) throw new Error('Email not found');
    return email;
};

// Fetches new emails via IMAP and stores them in the database
export const fetchAndStoreEmails = async () => {
    try {
        const missingEmails = await getNewEmails();

        for (const email of missingEmails) {
            const profilePicture = await getProfilePicture();
            const emailDoc = new Email({ ...email, profilePicture });
            await emailDoc.save();
        }

        logger.info(`${missingEmails.length} new emails have been stored.`);
        return missingEmails;
    } catch (error: any) {
        logger.error('Error fetching new emails:', { error: error.message, stack: error.stack });
        throw new Error('Failed to fetch and store emails');
    }
};

// Fetches new, unread emails via IMAP
const getNewEmails = async () => {
    const config: ImapSimpleOptions = {
        imap: {
            user: gateway.email.imap.user || '',
            password: gateway.email.imap.pass || '',
            host: gateway.email.imap.host || '',
            port: gateway.email.imap.port || 993,
            tls: gateway.email.imap.tls ?? true,
            authTimeout: 10000,
        } as Config,
    };

    let connection: ImapSimple | null = null;
    try {
        connection = await imapClient.connect(config);
        await connection.openBox('INBOX');

        const searchCriteria = ['UNSEEN'];
        const fetchOptions = {
            bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT'],
            struct: true,
        };

        const results = await connection.search(searchCriteria, fetchOptions);

        const emails = await Promise.all(
            results.map(async result => {
                try {
                    const textPart = result.parts.find(part => part.which === 'TEXT');
                    if (!textPart) {
                        logger.warn('No TEXT part found in the email.');
                        return null;
                    }

                    const parsed: ParsedMail = await simpleParser(textPart.body);
                    const toEmail = Array.isArray(parsed.to)
                        ? parsed.to.flatMap((addr: AddressObject) => addr.value.map(v => v.address)).join(', ')
                        : parsed.to?.value.map(v => v.address).join(', ');

                    return {
                        identifier: Math.random().toString(36).substring(2, 15),
                        to: toEmail,
                        subject: parsed.subject || 'No Subject',
                        text: parsed.text || '',
                        html: parsed.html || '',
                    };
                } catch (parseError: any) {
                    logger.error('Error parsing an email:', { error: parseError.message });
                    return null;
                }
            }),
        );

        return emails.filter(email => email !== null);
    } catch (error: any) {
        logger.error('Error fetching IMAP emails:', { error: error.message, stack: error.stack });
        throw new Error('Failed to fetch new emails');
    } finally {
        if (connection) {
            await connection.end();
            logger.info('IMAP connection successfully closed.');
        }
    }
};
