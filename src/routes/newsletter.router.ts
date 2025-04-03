import { Router } from 'express';
import { subscribeNewsletter, createNewsletter, sendNewsletter, getNewsletters } from '../controllers/newsletter.controller';
import { isAuthenticated } from '../middlewares/authentication.middleware';
import { hasRole } from '../middlewares/authorization.middleware';
import { cacheMiddleware } from '../middlewares/cache.middleware';

const router = Router();

router.use(cacheMiddleware());

router.post('/subscribe', subscribeNewsletter);
router.post('/', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), createNewsletter);
router.post('/:id/send', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), sendNewsletter);
router.get('/', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getNewsletters);

export default router;
