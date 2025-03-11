import express from "express";
import { createContact, getAllContacts, getContactById, updateContact, deleteContact } from "../controllers/contact.controller";
import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';

const router = express.Router();

router.post("/", createContact);
router.get("/", isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getAllContacts);
router.get("/:contactId", isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getContactById);
router.put("/:contactId", isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), updateContact);
router.delete("/:contactId", isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deleteContact);

export default router;
