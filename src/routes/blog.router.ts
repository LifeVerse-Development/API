import { Router } from 'express';
import { createBlogPost, getAllBlogPosts, getBlogPostById, updateBlogPost, deleteBlogPost, toggleReaction, createComment, removeComment, removeCommentFromTeam } from '../controllers/blog.controller';
import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';

const router = Router();

router.post('/', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), createBlogPost);
router.get('/', getAllBlogPosts);
router.get('/:blogId', getBlogPostById);
router.put('/:blogId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), updateBlogPost);
router.delete('/:blogId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deleteBlogPost);

router.post('/:blogId/reactions', isAuthenticated, toggleReaction);
router.delete('/:blogId/reactions', isAuthenticated, toggleReaction);

router.post('/:blogId/comments', isAuthenticated, createComment);
router.delete('/:blogId/comments/:commentId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), removeComment);
router.delete('/:blogId/comments/:commentId/team', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), removeCommentFromTeam);

export default router;
