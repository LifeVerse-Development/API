import { Router } from 'express';
import { getAllVerifications, getVerificationById, deleteVerification, verifyUser, getVerificationStatus } from '../controllers/verification.controller';
import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';

const router = Router();

router.get('/', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getAllVerifications);
router.get('/:userId', isAuthenticated, getVerificationById);
router.get('/status/:userId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getVerificationStatus);
router.post('/verify', isAuthenticated, verifyUser);
router.delete('/:userId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deleteVerification);

export default router;
