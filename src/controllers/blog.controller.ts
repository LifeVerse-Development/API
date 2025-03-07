import { Request, Response, RequestHandler } from 'express';
import { Blog, Comment, Reaction } from '../models/Blog';
import { logger } from '../services/logger.service';

export const createBlogPost: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { title, description, content, tags, author, image } = req.body;

        if (!title || !description || !content || !tags || !author) {
            res.status(400).json({ message: 'Title, description, content, tags, and author are required' });
            return;
        }

        const newBlogPost = new Blog({
            identifier: Math.random().toString(36).substring(2, 15),
            title,
            description,
            content,
            tags,
            author,
            image,
        });

        await newBlogPost.save();
        logger.info('Blog post created successfully', { title, author });
        res.status(201).json({ message: 'Blog post created successfully', blogPost: newBlogPost });
    } catch (error: any) {
        logger.error('Error creating blog post', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getAllBlogPosts: RequestHandler = async (_req: Request, res: Response): Promise<void> => {
    try {
        const blogPosts = await Blog.find();
        logger.info('Fetched all blog posts', { count: blogPosts.length });
        res.status(200).json(blogPosts);
    } catch (error: any) {
        logger.error('Error fetching blog posts', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getBlogPostById: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { blogId } = req.params;

    try {
        const blogPost = await Blog.findById(blogId).populate('comments.user', 'username profileImage').populate('reactions.user', 'username');
        if (!blogPost) {
            logger.warn('Blog post not found', { blogId });
            res.status(404).json({ message: 'Blog post not found' });
            return;
        }

        logger.info('Fetched blog post by ID', { blogId, title: blogPost.title });
        res.status(200).json(blogPost);
    } catch (error: any) {
        logger.error('Error fetching blog post by ID', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateBlogPost: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { blogId } = req.params;
    const { title, description, content, tags, author, image } = req.body;

    try {
        const blogPost = await Blog.findById(blogId);
        if (!blogPost) {
            logger.warn('Blog post not found for update', { blogId });
            res.status(404).json({ message: 'Blog post not found' });
            return;
        }

        if (title) blogPost.title = title;
        if (description) blogPost.description = description;
        if (content) blogPost.content = content;
        if (tags) blogPost.tags = tags;
        if (author) blogPost.author = author;
        if (image) blogPost.image = image;

        await blogPost.save();
        logger.info('Blog post updated successfully', { blogId, title });
        res.status(200).json({ message: 'Blog post updated successfully', blogPost });
    } catch (error: any) {
        logger.error('Error updating blog post', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteBlogPost: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { blogId } = req.params;

    try {
        const blogPost = await Blog.findById(blogId);
        if (!blogPost) {
            logger.warn('Blog post not found for deletion', { blogId });
            res.status(404).json({ message: 'Blog post not found' });
            return;
        }

        await blogPost.deleteOne();
        logger.info('Blog post deleted successfully', { blogId });
        res.status(200).json({ message: 'Blog post deleted successfully' });
    } catch (error: any) {
        logger.error('Error deleting blog post', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createComment: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { blogId } = req.params;
    const { userId, content, username, profileImage } = req.body;

    try {
        const blogPost = await Blog.findById(blogId);
        if (!blogPost) {
            logger.warn('Blog post not found for comment', { blogId });
            res.status(404).json({ message: 'Blog post not found' });
            return;
        }

        const newComment = new Comment({
            user: userId,
            content,
            username,
            profileImage,
        });

        blogPost.comments.push(newComment);
        await blogPost.save();
        logger.info('Comment created successfully', { blogId, userId });
        res.status(201).json({ message: 'Comment created successfully', comment: newComment });
    } catch (error: any) {
        logger.error('Error creating comment', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const removeComment: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { blogId, commentId } = req.params;
    const { userId, userRole } = req.body;

    try {
        const blogPost = await Blog.findById(blogId);
        if (!blogPost) {
            logger.warn('Blog post not found for comment removal', { blogId });
            res.status(404).json({ message: 'Blog post not found' });
            return;
        }

        const comment = blogPost.comments.find((comment) => comment.id.toString() === commentId);
        if (!comment) {
            logger.warn('Comment not found for removal', { commentId });
            res.status(404).json({ message: 'Comment not found' });
            return;
        }

        if (comment.user.toString() !== userId.toString() && userRole !== 'team') {
            logger.warn('User is not authorized to remove this comment', { userId, commentId });
            res.status(403).json({ message: 'Forbidden' });
            return;
        }

        blogPost.comments = blogPost.comments.filter((comment) => comment.id.toString() !== commentId);
        await blogPost.save();
        
        logger.info('Comment removed successfully', { blogId, commentId, userId });
        res.status(200).json({ message: 'Comment removed successfully' });
    } catch (error: any) {
        logger.error('Error removing comment', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const removeCommentFromTeam: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { blogId, commentId } = req.params;
    const { userId, userRole } = req.body;

    try {
        const blogPost = await Blog.findById(blogId);
        if (!blogPost) {
            logger.warn('Blog post not found for team comment removal', { blogId });
            res.status(404).json({ message: 'Blog post not found' });
            return;
        }

        const comment = blogPost.comments.find((comment) => comment.id.toString() === commentId);
        if (!comment) {
            logger.warn('Comment not found for team removal', { commentId });
            res.status(404).json({ message: 'Comment not found' });
            return;
        }

        const allowedRoles = ['Admin', 'Moderator', 'Developer', 'Content', 'Supporter'];

        if (!allowedRoles.includes(userRole)) {
            logger.warn('User does not have the required role to remove this comment', { userId, commentId, userRole });
            res.status(403).json({ message: 'Forbidden' });
            return;
        }

        blogPost.comments = blogPost.comments.filter((comment) => comment.id.toString() !== commentId);
        await blogPost.save();
        
        logger.info('Team comment removed successfully', { blogId, commentId, userId });
        res.status(200).json({ message: 'Team comment removed successfully' });
    } catch (error: any) {
        logger.error('Error removing team comment', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const toggleReaction: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { blogId } = req.params;
    const { userId, type } = req.body;

    try {
        const blogPost = await Blog.findById(blogId);
        if (!blogPost) {
            logger.warn('Blog post not found for reaction', { blogId });
            res.status(404).json({ message: 'Blog post not found' });
            return;
        }

        const existingReaction = blogPost.reactions.find(reaction => reaction.user.toString() === userId.toString());

        if (existingReaction) {
            if (existingReaction.type === type) {
                blogPost.reactions = blogPost.reactions.filter(reaction => reaction.user.toString() !== userId.toString());
                logger.info('Reaction removed successfully', { blogId, userId, type });
                res.status(200).json({ message: 'Reaction removed successfully' });
            } else {
                existingReaction.type = type;
                logger.info('Reaction updated successfully', { blogId, userId, type });
                res.status(200).json({ message: 'Reaction updated successfully', reaction: { user: userId, type } });
            }
        } else {
            const newReaction = new Reaction({
                user: userId,
                type,
            });
            blogPost.reactions.push(newReaction);
            logger.info('Reaction added successfully', { blogId, userId, type });
            res.status(201).json({ message: 'Reaction added successfully', reaction: { user: userId, type } });
        }

        await blogPost.save();
    } catch (error: any) {
        logger.error('Error toggling reaction', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

