import { Router } from 'express';
import {
    createHistory,
    getAllHistory,
    getHistoryById,
    getHistoryByUserId,
    deleteHistory,
    markAsRead,
} from '../controllers/history.controller';
import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';
import { cacheMiddleware } from '../middlewares/cache.middleware';

const router = Router();

router.use(cacheMiddleware());

router.post('/', isAuthenticated, createHistory);
router.get('/', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getAllHistory);
router.get('/:historyId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getHistoryById);
router.get('/user/:historyId', isAuthenticated, getHistoryByUserId);
router.delete('/:historyId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deleteHistory);
router.put('/:historyId/read', markAsRead);

export default router;
