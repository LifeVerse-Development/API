import { Router } from "express";
import { sendEmailController, getEmailsController, getEmailByIdController, deleteAllEmailsController, deleteEmailByIdController, fetchAndStoreEmailsController } from "../controllers/email.controller";
import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';

const router = Router();

router.post("/send", isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), sendEmailController);
router.get("/", isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getEmailsController);
router.get("/:emailId", isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getEmailByIdController);
router.delete("/all", isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deleteAllEmailsController);
router.delete("/:emailId", isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deleteEmailByIdController);
router.get("/fetch_and_store", isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), fetchAndStoreEmailsController);

export default router;
