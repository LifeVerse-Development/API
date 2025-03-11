import { Router } from 'express';
import { createBlogPost, getAllBlogPosts, getBlogPostById, updateBlogPost, deleteBlogPost, createComment, getAllComments, getCommentById, updateComment, deleteComment, toggleReaction } from '../controllers/blog.controller';
import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';

const router = Router();

router.post('/blog', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), createBlogPost);
router.get('/blog', getAllBlogPosts);
router.get('/blog/:blogId', getBlogPostById);
router.put('/blog/:blogId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), updateBlogPost);
router.delete('/blog/:blogId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deleteBlogPost);

router.post('/blog/:blogId/comment', isAuthenticated, createComment);
router.get('/blog/:blogId/comments', getAllComments);
router.get('/blog/:blogId/comment/:commentId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getCommentById);
router.put('/blog/:blogId/comment/:commentId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), updateComment);
router.delete('/blog/:blogId/comment/:commentId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deleteComment);

router.post('/blog/:blogId/reaction', isAuthenticated, toggleReaction);

export default router;
