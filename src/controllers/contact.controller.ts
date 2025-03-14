import { Request, Response, RequestHandler } from 'express';
import { Contact } from '../models/Contact';
import { logger } from '../services/logger.service';

export const createContact: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const contact = new Contact({
            ...req.body,
            replied: false,
        });
        await contact.save();

        logger.info('New contact created', { contactId: contact._id });
        res.status(201).json(contact);
    } catch (error: any) {
        logger.error('Error creating contact', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error creating contact' });
    }
};

export const getAllContacts: RequestHandler = async (_req: Request, res: Response): Promise<void> => {
    try {
        const contacts = await Contact.find();
        logger.info('Fetched all contacts', { count: contacts.length });
        res.status(200).json(contacts);
    } catch (error: any) {
        logger.error('Error fetching contacts', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error fetching contacts' });
    }
};

export const getContactById: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const contact = await Contact.findById(req.params.contactId);
        if (!contact) {
            logger.warn('Contact not found', { contactId: req.params.contactId });
            res.status(404).json({ message: 'Contact not found' });
            return;
        }

        logger.info('Fetched contact by ID', { contactId: contact._id });
        res.status(200).json(contact);
    } catch (error: any) {
        logger.error('Error fetching contact by ID', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error fetching contact' });
    }
};

export const updateContact: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const updatedData = {
            ...req.body,
            replied: req.body.replied !== undefined ? req.body.replied : false,
        };

        const contact = await Contact.findByIdAndUpdate(req.params.contactId, updatedData, { new: true, runValidators: true });
        if (!contact) {
            logger.warn('Contact not found for update', { contactId: req.params.contactId });
            res.status(404).json({ message: 'Contact not found' });
            return;
        }

        logger.info('Contact updated successfully', { contactId: contact._id });
        res.status(200).json(contact);
    } catch (error: any) {
        logger.error('Error updating contact', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error updating contact' });
    }
};

export const deleteContact: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const contact = await Contact.findByIdAndDelete(req.params.contactId);
        if (!contact) {
            logger.warn('Contact not found for deletion', { contactId: req.params.contactId });
            res.status(404).json({ message: 'Contact not found' });
            return;
        }

        logger.info('Contact deleted successfully', { contactId: contact._id });
        res.status(200).json({ message: 'Contact deleted successfully' });
    } catch (error: any) {
        logger.error('Error deleting contact', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error deleting contact' });
    }
};
