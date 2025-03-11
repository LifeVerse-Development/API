import nodemailer from 'nodemailer';
import { Email } from '../models/Email';
import { simpleParser, ParsedMail, AddressObject } from 'mailparser';
import { logger } from '../services/logger.service';
import imapClient, { ImapSimple, ImapSimpleOptions } from 'imap-simple';
import { Config } from 'imap';

interface SMTPConfig {
    host: string;
    port: number;
    user: string;
    pass: string;
}

export const createTransporter = (smtpConfig: SMTPConfig) => {
    return nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.port === 465,
        auth: {
            user: smtpConfig.user,
            pass: smtpConfig.pass,
        },
    });
};

export const sendEmail = async (smtpConfig: SMTPConfig, to: string, subject: string, text: string, html: string) => {
    try {
        if (!to) throw new Error('Recipient email (to) is required.');

        const transporter = createTransporter(smtpConfig);
        const mailOptions = {
            from: `"LifeVerse Game" <info@lifeversegame.com>`,
            to,
            subject,
            text,
            html,
        };

        await transporter.sendMail(mailOptions);
        logger.info(`E-Mail erfolgreich an ${to} gesendet.`);

        const email = new Email({
            identifier: Math.random().toString(36).substring(2, 15),
            to,
            subject,
            text,
            html,
        });
        await email.save();

        return email;
    } catch (error: any) {
        logger.error('Fehler beim Senden der E-Mail:', { error: error.message, stack: error.stack });
        throw new Error('Failed to send email');
    }
};

export const getEmails = async () => {
    return await Email.find();
};

export const getEmailById = async (emailId: string) => {
    const email = await Email.findById(emailId);
    if (!email) throw new Error('Email not found');
    return email;
};

export const deleteAllEmails = async () => {
    await Email.deleteMany();
    logger.info('Alle gespeicherten E-Mails wurden gelöscht.');
};

export const deleteEmailById = async (emailId: string) => {
    const email = await Email.findByIdAndDelete(emailId);
    if (!email) throw new Error('Email not found');
    return email;
};

export const fetchAndStoreEmails = async () => {
    try {
        const existingEmails = await getEmails();
        const missingEmails = await getNewEmails();

        for (const email of missingEmails) {
            const emailDoc = new Email(email);
            await emailDoc.save();
        }

        logger.info(`${missingEmails.length} neue E-Mails wurden gespeichert.`);
        return [...existingEmails, ...missingEmails];
    } catch (error: any) {
        logger.error('Fehler beim Abrufen neuer E-Mails:', { error: error.message, stack: error.stack });
        throw new Error('Failed to fetch and store emails');
    }
};

const getNewEmails = async () => {
    const config: ImapSimpleOptions = {
        imap: {
            user: process.env.IMAP_USER || '',
            password: process.env.IMAP_PASS || '',
            host: process.env.IMAP_HOST || '',
            port: 993,
            tls: true,
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
            results.map(async (result) => {
                try {
                    const textPart = result.parts.find((part) => part.which === 'TEXT');
                    const parsed: ParsedMail = await simpleParser(textPart?.body || '');

                    return {
                        identifier: Math.random().toString(36).substring(2, 15),
                        to: Array.isArray(parsed.to)
                            ? parsed.to.flatMap((addr: AddressObject) => addr.value.map(v => v.address)).join(', ')
                            : parsed.to?.value.map(v => v.address).join(', '),

                        subject: parsed.subject || 'No Subject',
                        text: parsed.text || '',
                        html: parsed.html || '',
                    };
                } catch (parseError: any) {
                    logger.error('Fehler beim Parsen einer E-Mail:', { error: parseError.message });
                    return null;
                }
            })
        );

        await connection.end();

        return emails.filter((email) => email !== null);
    } catch (error: any) {
        logger.error('Fehler beim Abrufen der IMAP-E-Mails:', { error: error.message, stack: error.stack });
        throw new Error('Failed to fetch new emails');
    } finally {
        if (connection) {
            await connection.end()
            logger.warn('IMAP-Verbindung konnte nicht korrekt geschlossen werden.');
        }
    }
};
