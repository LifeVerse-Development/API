import { Router } from 'express';
import { createUser, getAllUsers, getUserById, updateUser, deleteUser, followUser, unfollowUser, createPost, getFollowStats, getAllPosts, viewPost, updatePost, deletePost } from '../controllers/user.controller';
import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';

const router = Router();

router.post('/', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer'), createUser);
router.get('/', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getAllUsers);
router.get('/:userId', getUserById);
router.put('/:userId', isAuthenticated, updateUser);
router.delete('/:userId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer'), deleteUser);

router.post('/:userId/follow', isAuthenticated, followUser);
router.post('/:userId/unfollow', isAuthenticated, unfollowUser);
router.get('/:userId/follow-stats', getFollowStats);

router.post('/:userId/post', isAuthenticated, createPost);
router.get('/:userId/posts', isAuthenticated, getAllPosts);
router.get('/:userId/post/:postId', isAuthenticated, viewPost);
router.put('/:userId/post/:postId', isAuthenticated, updatePost);
router.delete('/:userId/post/:postId', isAuthenticated, deletePost);

export default router;
