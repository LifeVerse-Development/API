import { Request, Response, RequestHandler } from 'express';
import { NewsletterSubscriber, Newsletter } from '../models/Newsletter';
import { logger } from '../services/logger.service';
import { sendEmail } from '../services/email.service';
import { asyncHandler } from '../utils/asyncHandler.util';
import { withCache } from '../utils/withCache.util';

export const subscribeNewsletter: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const { email } = req.body;

            if (!email) {
                res.status(400).json({ message: 'Email is required' });
                return;
            }

            const existingSubscriber = await NewsletterSubscriber.findOne({ email });
            if (existingSubscriber) {
                res.status(409).json({ message: 'Email is already subscribed' });
                return;
            }

            const subscriber = new NewsletterSubscriber({
                identifier: Math.random().toString(36).substring(2, 15),
                email,
            });
            await subscriber.save();
            logger.info('New newsletter subscriber', { email });

            res.status(201).json({ message: 'Successfully subscribed to the newsletter' });
        } catch (error: any) {
            logger.error('Error subscribing to newsletter', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Internal Server Error' });
        }
    }),
);

export const createNewsletter: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const { subject, content } = req.body;

            if (!subject || !content) {
                res.status(400).json({ message: 'Subject and content are required' });
                return;
            }

            const newsletter = new Newsletter({ subject, content });
            await newsletter.save();
            logger.info('Newsletter created', { subject });

            res.status(201).json(newsletter);
        } catch (error: any) {
            logger.error('Error creating newsletter', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Internal Server Error' });
        }
    }),
);

export const sendNewsletter: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const newsletter = await Newsletter.findById(id);

            if (!newsletter) {
                res.status(404).json({ message: 'Newsletter not found' });
                return;
            }

            const subscribers = await NewsletterSubscriber.find();
            if (subscribers.length === 0) {
                res.status(400).json({ message: 'No subscribers found' });
                return;
            }

            const emails = subscribers.map(subscriber => subscriber.email);
            await Promise.all(emails.map(email => sendEmail(email, newsletter.subject, newsletter.content, newsletter.content)));

            newsletter.sentAt = new Date();
            await newsletter.save();

            logger.info('Newsletter sent', { id, subject: newsletter.subject });
            res.status(200).json({ message: 'Newsletter sent successfully' });
        } catch (error: any) {
            logger.error('Error sending newsletter', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Internal Server Error' });
        }
    }),
);

export const getNewsletters: RequestHandler = withCache(
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
        try {
            const newsletters = await Newsletter.find().sort({ sentAt: -1 });
            res.status(200).json(newsletters);
        } catch (error: any) {
            logger.error('Error fetching newsletters', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Internal Server Error' });
        }
    }),
);
