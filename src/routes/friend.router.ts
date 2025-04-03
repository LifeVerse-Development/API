import { Router } from 'express';
import {
    sendFriendRequest,
    respondToFriendRequest,
    getFriends,
    getFriendRequestById,
    getFriendRequestsByUserId,
} from '../controllers/friend.controller';
import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';
import { cacheMiddleware } from '../middlewares/cache.middleware';

const router = Router();

router.use(cacheMiddleware());

router.post('/send', isAuthenticated, sendFriendRequest);
router.post('/respond', isAuthenticated, respondToFriendRequest);
router.get('/:userId/friends', isAuthenticated, getFriends);
router.get(
    '/request/:requestId',
    isAuthenticated,
    hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'),
    getFriendRequestById,
);
router.get('/:userId/requests', isAuthenticated, getFriendRequestsByUserId);

export default router;
