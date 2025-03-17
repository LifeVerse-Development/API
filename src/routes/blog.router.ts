import { Router } from 'express';
import { createBlogPost, getAllBlogPosts, getBlogPostById, updateBlogPost, deleteBlogPost, createComment, getAllComments, getCommentById, updateComment, deleteComment, toggleReaction } from '../controllers/blog.controller';
import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';

const router = Router();

router.post('/', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), createBlogPost);
router.get('/', getAllBlogPosts);
router.get('/:blogId', getBlogPostById);
router.put('/:blogId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), updateBlogPost);
router.delete('/:blogId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deleteBlogPost);

router.post('/:blogId/comment', isAuthenticated, createComment);
router.get('/:blogId/comments', getAllComments);
router.get('/:blogId/comment/:commentId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getCommentById);
router.put('/:blogId/comment/:commentId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), updateComment);
router.delete('/:blogId/comment/:commentId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deleteComment);

router.post('/:blogId/reaction', isAuthenticated, toggleReaction);

export default router;
