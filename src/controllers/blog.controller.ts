import type { Request, Response, RequestHandler, NextFunction } from "express"
import { Blog } from "../models/Blog"
import { logger } from "../services/logger.service"
import { asyncHandler } from "../utils/asyncHandler.util"
import { invalidateCache } from "../middlewares/cache.middleware"
import { uploadSingle, getFileUrl, deleteFile } from "../services/multer.service"

// Cache key patterns for better cache management
const CACHE_KEYS = {
    ALL_BLOGS: "blogs:all",
    BLOG_BY_ID: (id: string) => `blogs:${id}`,
    BLOGS_BY_TAG: (tag: string) => `blogs:tag:${tag}`,
    BLOGS_BY_AUTHOR: (author: string) => `blogs:author:${author}`,
    BLOG_COMMENTS: (id: string) => `blogs:${id}:comments`,
    BLOG_REACTIONS: (id: string) => `blogs:${id}:reactions`,
}

/**
 * Middleware for handling blog image uploads
 */
export const handleBlogImageUpload = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Only process if there's an image to upload
        if (req.body.uploadImage === 'true' || req.query.uploadImage === 'true') {
            await new Promise<void>((resolve, reject) => {
                uploadSingle('blogImage', {
                    fileTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] 
                })(req, res, (err: any) => {
                    if (err) {
                        logger.error(`Error uploading blog image`, { error: err.message });
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
            
            // If image was uploaded successfully, add the URL to the request body
            if (req.file) {
                req.body.image = getFileUrl(req.file.filename);
            }
        }
        
        next();
    } catch (error: any) {
        logger.error("Error in handleBlogImageUpload middleware", { error: error.message, stack: error.stack });
        res.status(400).json({
            message: "Blog image upload failed",
            error: error.message
        });
        return;
    }
});

/**
 * @desc    Create a new blog post
 * @route   POST /api/blogs
 * @access  Private/Admin
 */
export const createBlogPost: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { title, description, content, tags, author, image } = req.body

    if (!title || !description || !content || !tags || !author) {
        res.status(400).json({ message: "Title, description, content, tags, and author are required" })
        return
    }

    // Use the image from the file upload if available
    const blogImage = req.file ? getFileUrl(req.file.filename) : image;

    const newBlogPost = new Blog({
        identifier: Math.random().toString(36).substring(2, 15),
        title,
        description,
        content,
        tags: Array.isArray(tags) ? tags : [tags],
        author,
        image: blogImage,
        reactions: [],
        comments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    })

    await newBlogPost.save()

    // Invalidate relevant caches
    await invalidateCache([
        CACHE_KEYS.ALL_BLOGS,
        CACHE_KEYS.BLOGS_BY_AUTHOR(author),
        ...tags.map((tag: string) => CACHE_KEYS.BLOGS_BY_TAG(tag)),
    ])

    logger.info("Blog post created successfully", { blogId: newBlogPost._id, title, author })
    res.status(201).json({ message: "Blog post created successfully", blogPost: newBlogPost })
})

/**
 * @desc    Get all blog posts with pagination
 * @route   GET /api/blogs
 * @access  Public
 */
export const getAllBlogPosts: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 10
    const skip = (page - 1) * limit

    // Add filtering options
    const filter: any = {}

    if (req.query.tag) {
        filter.tags = req.query.tag
    }

    if (req.query.author) {
        filter.author = req.query.author
    }

    // Use lean() and exec() for better performance
    const blogPosts = await Blog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await Blog.countDocuments(filter)

    logger.info("Fetched all blog posts", { count: blogPosts.length, page, limit })
    res.status(200).json({
        blogPosts,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Get blog post by ID
 * @route   GET /api/blogs/:blogId
 * @access  Public
 */
export const getBlogPostById: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { blogId } = req.params

    // Use lean() for better performance
    const blogPost = await Blog.findById(blogId).lean().exec()

    if (!blogPost) {
        logger.warn("Blog post not found", { blogId })
        res.status(404).json({ message: "Blog post not found" })
        return
    }

    // Increment view count
    await Blog.updateOne({ _id: blogId }, { $inc: { viewCount: 1 } })

    logger.info("Fetched blog post by ID", { blogId, title: blogPost.title })
    res.status(200).json(blogPost)
})

/**
 * @desc    Update blog post
 * @route   PUT /api/blogs/:blogId
 * @access  Private/Admin
 */
export const updateBlogPost: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { blogId } = req.params
    const updateData = { ...req.body, updatedAt: new Date() }

    // Get the original blog post for cache invalidation and image handling
    const originalBlog = await Blog.findById(blogId).lean().exec()

    if (!originalBlog) {
        logger.warn("Blog post not found for update", { blogId })
        res.status(404).json({ message: "Blog post not found" })
        return
    }

    // Handle image update
    if (req.file) {
        // Delete old image if it exists and is being replaced
        if (originalBlog.image) {
            // Extract filename from URL
            const oldImageFilename = originalBlog.image.split('/').pop();
            if (oldImageFilename) {
                await deleteFile(oldImageFilename);
            }
        }
        
        // Set new image URL
        updateData.image = getFileUrl(req.file.filename);
    }

    // Use findOneAndUpdate with projection for better performance
    const blogPost = await Blog.findByIdAndUpdate(blogId, { $set: updateData }, { new: true, runValidators: true })
        .lean()
        .exec()

    // Invalidate relevant caches
    await invalidateCache([
        CACHE_KEYS.ALL_BLOGS,
        CACHE_KEYS.BLOG_BY_ID(blogId),
        CACHE_KEYS.BLOGS_BY_AUTHOR(originalBlog.author),
        ...originalBlog.tags.map((tag: string) => CACHE_KEYS.BLOGS_BY_TAG(tag)),
        ...(blogPost?.tags ? blogPost.tags.map((tag: string) => CACHE_KEYS.BLOGS_BY_TAG(tag)) : []),
    ])

    logger.info("Blog post updated successfully", { blogId, title: blogPost?.title })
    res.status(200).json({ message: "Blog post updated successfully", blogPost })
})

/**
 * @desc    Delete blog post
 * @route   DELETE /api/blogs/:blogId
 * @access  Private/Admin
 */
export const deleteBlogPost: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { blogId } = req.params

    // First get the blog post to get author and tags for cache invalidation
    const blogPost = await Blog.findById(blogId).lean().exec()

    if (!blogPost) {
        logger.warn("Blog post not found for deletion", { blogId })
        res.status(404).json({ message: "Blog post not found" })
        return
    }

    // Delete associated image if it exists
    if (blogPost.image) {
        // Extract filename from URL
        const imageFilename = blogPost.image.split('/').pop();
        if (imageFilename) {
            await deleteFile(imageFilename);
        }
    }

    // Delete the blog post
    await Blog.deleteOne({ _id: blogId })

    // Invalidate relevant caches
    await invalidateCache([
        CACHE_KEYS.ALL_BLOGS,
        CACHE_KEYS.BLOG_BY_ID(blogId),
        CACHE_KEYS.BLOGS_BY_AUTHOR(blogPost.author),
        CACHE_KEYS.BLOG_COMMENTS(blogId),
        CACHE_KEYS.BLOG_REACTIONS(blogId),
        ...blogPost.tags.map((tag: string) => CACHE_KEYS.BLOGS_BY_TAG(tag)),
    ])

    logger.info("Blog post deleted successfully", { blogId })
    res.status(200).json({ message: "Blog post deleted successfully" })
})

/**
 * @desc    Add comment to blog post
 * @route   POST /api/blogs/:blogId/comments
 * @access  Private
 */
export const addComment: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { blogId } = req.params
    const { userId, userName, content } = req.body

    if (!userId || !userName || !content) {
        res.status(400).json({ message: "User ID, user name, and comment content are required" })
        return
    }

    const newComment = {
        userId,
        userName,
        content,
        createdAt: new Date(),
    }

    // Use updateOne for better performance
    const result = await Blog.updateOne(
        { _id: blogId },
        {
            $push: { comments: newComment },
            $set: { updatedAt: new Date() },
        },
    )

    if (result.matchedCount === 0) {
        logger.warn("Blog post not found for adding comment", { blogId })
        res.status(404).json({ message: "Blog post not found" })
        return
    }

    // Invalidate relevant caches
    await invalidateCache([CACHE_KEYS.BLOG_BY_ID(blogId), CACHE_KEYS.BLOG_COMMENTS(blogId)])

    logger.info("Comment added to blog post", { blogId, userId })
    res.status(201).json({ message: "Comment added successfully", comment: newComment })
})

/**
 * @desc    Get comments for blog post
 * @route   GET /api/blogs/:blogId/comments
 * @access  Public
 */
export const getComments: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { blogId } = req.params

    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Use projection and lean() for better performance
    const blogPost = await Blog.findById(blogId, { comments: 1 }).lean().exec()

    if (!blogPost) {
        logger.warn("Blog post not found for fetching comments", { blogId })
        res.status(404).json({ message: "Blog post not found" })
        return
    }

    // Sort comments by createdAt in descending order (newest first)
    const comments = blogPost.comments || []
    comments.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Apply pagination
    const paginatedComments = comments.slice(skip, skip + limit)
    const total = comments.length

    logger.info("Fetched comments for blog post", { blogId, count: paginatedComments.length })
    res.status(200).json({
        comments: paginatedComments,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Delete comment from blog post
 * @route   DELETE /api/blogs/:blogId/comments/:commentId
 * @access  Private
 */
export const deleteComment: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { blogId, commentId } = req.params

    // Use updateOne for better performance
    const result = await Blog.updateOne(
        { _id: blogId },
        {
            $pull: { comments: { _id: commentId } },
            $set: { updatedAt: new Date() },
        },
    )

    if (result.matchedCount === 0) {
        logger.warn("Blog post not found for deleting comment", { blogId, commentId })
        res.status(404).json({ message: "Blog post not found" })
        return
    }

    if (result.modifiedCount === 0) {
        logger.warn("Comment not found for deletion", { blogId, commentId })
        res.status(404).json({ message: "Comment not found" })
        return
    }

    // Invalidate relevant caches
    await invalidateCache([CACHE_KEYS.BLOG_BY_ID(blogId), CACHE_KEYS.BLOG_COMMENTS(blogId)])

    logger.info("Comment deleted from blog post", { blogId, commentId })
    res.status(200).json({ message: "Comment deleted successfully" })
})

/**
 * @desc    Add reaction (thumb up) to blog post
 * @route   POST /api/blogs/:blogId/reactions
 * @access  Private
 */
export const addReaction: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { blogId } = req.params
    const { userId, type = "thumbUp" } = req.body

    if (!userId) {
        res.status(400).json({ message: "User ID is required" })
        return
    }

    // Check if user already reacted
    const blog = await Blog.findOne({
        _id: blogId,
        "reactions.userId": userId,
    })
        .lean()
        .exec()

    if (blog) {
        // User already reacted, update the reaction type
        await Blog.updateOne(
            { _id: blogId, "reactions.userId": userId },
            { $set: { "reactions.$.type": type, "reactions.$.updatedAt": new Date() } },
        )
    } else {
        // User hasn't reacted yet, add new reaction
        await Blog.updateOne(
            { _id: blogId },
            {
                $push: {
                    reactions: {
                        userId,
                        type,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    },
                },
                $set: { updatedAt: new Date() },
            },
        )
    }

    // Invalidate relevant caches
    await invalidateCache([CACHE_KEYS.BLOG_BY_ID(blogId), CACHE_KEYS.BLOG_REACTIONS(blogId)])

    logger.info("Reaction added to blog post", { blogId, userId, type })
    res.status(200).json({ message: "Reaction added successfully" })
})

/**
 * @desc    Remove reaction from blog post
 * @route   DELETE /api/blogs/:blogId/reactions/:userId
 * @access  Private
 */
export const removeReaction: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { blogId, userId } = req.params

    // Use updateOne for better performance
    const result = await Blog.updateOne(
        { _id: blogId },
        {
            $pull: { reactions: { userId } },
            $set: { updatedAt: new Date() },
        },
    )

    if (result.matchedCount === 0) {
        logger.warn("Blog post not found for removing reaction", { blogId, userId })
        res.status(404).json({ message: "Blog post not found" })
        return
    }

    if (result.modifiedCount === 0) {
        logger.warn("Reaction not found for removal", { blogId, userId })
        res.status(404).json({ message: "Reaction not found" })
        return
    }

    // Invalidate relevant caches
    await invalidateCache([CACHE_KEYS.BLOG_BY_ID(blogId), CACHE_KEYS.BLOG_REACTIONS(blogId)])

    logger.info("Reaction removed from blog post", { blogId, userId })
    res.status(200).json({ message: "Reaction removed successfully" })
})

/**
 * @desc    Get reaction count for blog post
 * @route   GET /api/blogs/:blogId/reactions/count
 * @access  Public
 */
export const getReactionCount: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { blogId } = req.params

    // Use projection and lean() for better performance
    const blogPost = await Blog.findById(blogId, { reactions: 1 }).lean().exec()

    if (!blogPost) {
        logger.warn("Blog post not found for fetching reaction count", { blogId })
        res.status(404).json({ message: "Blog post not found" })
        return
    }

    const reactionCount = blogPost.reactions?.length || 0

    logger.info("Fetched reaction count for blog post", { blogId, count: reactionCount })
    res.status(200).json({ count: reactionCount })
})

/**
 * @desc    Get blog posts by tag
 * @route   GET /api/blogs/tag/:tag
 * @access  Public
 */
export const getBlogPostsByTag: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tag } = req.params

    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 10
    const skip = (page - 1) * limit

    // Use lean() and exec() for better performance
    const blogPosts = await Blog.find({ tags: tag }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await Blog.countDocuments({ tags: tag })

    logger.info(`Fetched blog posts with tag: ${tag}`, { count: blogPosts.length })
    res.status(200).json({
        blogPosts,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

