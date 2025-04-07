import { Router } from 'express';
import {
    getAllVerifications,
    getVerificationById,
    deleteVerification,
    getVerificationStatus,
} from '../controllers/verification.controller';
import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';
import { cacheMiddleware } from '../middlewares/cache.middleware';

const router = Router();

// Apply cache middleware to all routes
router.use(cacheMiddleware());

router.get('/', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getAllVerifications);
router.get('/:userId', isAuthenticated, getVerificationById);
router.get('/status/:userId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getVerificationStatus);
router.delete('/:userId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deleteVerification);

export default router;
