import type { NextFunction, Request, Response } from "express"
import { User } from "../models/User"
import { logger } from "../services/logger.service"
import bcrypt from "bcryptjs"
import { generateQRCode, verifyTOTP, generateRecoveryCodes as generateRecoveryCodesUtil } from "../utils/2fa.util"
import { validateEmail, validatePassword, sanitizeInput } from "../utils/validation.util"
import { createRateLimit } from "../middlewares/rateLimit.middleware"
import { uploadSingle, deleteFile, getFileUrl } from "../services/multer.service"
import { invalidateCache } from "../middlewares/cache.middleware"
import { asyncHandler } from "../utils/asyncHandler.util"

// Projection to exclude sensitive data
const USER_SAFE_PROJECTION = {
    password: 0,
    "authenticatorSetup.secret": 0,
    "authenticatorSetup.recoveryCodes": 0,
}

// Cache key patterns for better cache management
const CACHE_KEYS = {
    ALL_USERS: "users:all",
    USER_BY_ID: (id: string) => `users:${id}`,
    USER_POSTS: (id: string) => `users:${id}:posts`,
    USER_FOLLOW_STATS: (id: string) => `users:${id}:follow-stats`,
}

export const uploadProfileImages = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Define upload fields
        const uploadFields = [
            { name: "profilePicture", maxCount: 1, fileTypes: ["image/jpeg", "image/png", "image/webp"] },
            { name: "titlePicture", maxCount: 1, fileTypes: ["image/jpeg", "image/png", "image/webp"] },
        ];

        // Process each field sequentially
        for (const field of uploadFields) {
            if (req.body[field.name] || (req.files && req.files?[field.name] : "")) {
                await new Promise<void>((resolve, reject) => {
                    uploadSingle(field.name, { fileTypes: field.fileTypes })(req, res, (err: any) => {
                        if (err) {
                            logger.error(`Error uploading ${field.name}`, { error: err.message });
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
            }
        }
        
        next();
    } catch (error: any) {
        logger.error("Error in uploadProfileImages middleware", { error: error.message, stack: error.stack });
        res.status(400).json({
            success: false,
            message: "File upload failed",
            error: error.message
        });
        return;
    }
});

/**
 * @desc    Create a new user
 * @route   POST /api/users
 * @access  Public
 */
export const createUser = asyncHandler(async (req: Request, res: Response) => {
    const { username, userId, email, password, firstName, lastName, middleName, address } = req.body

    // Validate required fields
    if (!username || !userId) {
        return res.status(400).json({
            success: false,
            message: "Username and userId are required",
        })
    }

    // Validate email if provided
    if (email && !validateEmail(email)) {
        return res.status(400).json({
            success: false,
            message: "Invalid email format",
        })
    }

    // Validate password if provided
    if (password && !validatePassword(password)) {
        return res.status(400).json({
            success: false,
            message:
                "Password must be at least 8 characters with at least one uppercase letter, one lowercase letter, one number, and one special character",
        })
    }

    // Check if user already exists - use lean() for faster query
    const userExists = await User.findOne({
        $or: [{ userId }, { username }, ...(email ? [{ email }] : [])],
    }).lean()

    if (userExists) {
        logger.warn("User creation failed: User already exists", { userId, username })
        return res.status(409).json({
            success: false,
            message: "User already exists",
        })
    }

    // Hash password if provided - use a lower cost factor for faster hashing
    let hashedPassword
    if (password) {
        hashedPassword = await bcrypt.hash(password, 10)
    }

    // Handle file uploads for profile and title pictures
    let profilePicturePath = undefined
    let titlePicturePath = undefined

    if (req.files) {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] }

        // Handle profile picture
        if (files.profilePicture && files.profilePicture[0]) {
            profilePicturePath = files.profilePicture[0].filename
        }

        // Handle title picture
        if (files.titlePicture && files.titlePicture[0]) {
            titlePicturePath = files.titlePicture[0].filename
        }
    }

    // Create new user with sanitized inputs
    const newUser = new User({
        identifier: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        username: sanitizeInput(username),
        userId,
        email: email ? email.toLowerCase() : undefined,
        password: hashedPassword,
        firstName: firstName ? sanitizeInput(firstName) : undefined,
        middleName: middleName ? sanitizeInput(middleName) : undefined,
        lastName: lastName ? sanitizeInput(lastName) : undefined,
        profilePicture: profilePicturePath,
        titlePicture: titlePicturePath,
        address: address
            ? {
                street: sanitizeInput(address.street),
                houseNumber: sanitizeInput(address.houseNumber),
                apartment: sanitizeInput(address.apartment),
                city: sanitizeInput(address.city),
                state: sanitizeInput(address.state),
                country: sanitizeInput(address.country),
                postalCode: sanitizeInput(address.postalCode),
            }
            : undefined,
        privacySettings: {
            visibility: "public",
            showOnlineState: true,
            showActivity: true,
        },
        emailNotification: true,
        pushNotification: true,
        language: "en",
        theme: "system",
        verification: {
            email: { verified: false, code: "" },
            discord: { verified: false, code: "" },
            sms: { verified: false, code: "" },
        },
        authenticatorSetup: {
            isEnabled: false,
            qrCode: "",
            secret: "",
            verificationCode: "",
            recoveryCodesGenerated: false,
            recoveryCodes: [],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
    })

    await newUser.save()

    // Invalidate user list cache after creating a new user - use specific key pattern
    await invalidateCache([CACHE_KEYS.ALL_USERS])

    logger.info("User created successfully", { userId, username })

    // Remove sensitive information before sending response
    const userResponse = newUser.toObject()
    delete userResponse.password
    userResponse.authenticatorSetup?.secret
    userResponse.authenticatorSetup?.recoveryCodes

    // Transform file paths to full URLs for response
    if (userResponse.profilePicture) {
        userResponse.profilePicture = getFileUrl(userResponse.profilePicture)
    }

    if (userResponse.titlePicture) {
        userResponse.titlePicture = getFileUrl(userResponse.titlePicture)
    }

    return res.status(201).json({
        success: true,
        message: "User created successfully",
        data: userResponse,
    })
})

/**
 * @desc    Get all users with pagination
 * @route   GET /api/users
 * @access  Private/Admin
 */
export const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
    const page = Number.parseInt(req.query.page as string) || 1
    const limit = Number.parseInt(req.query.limit as string) || 20
    const skip = (page - 1) * limit

    // Use countDocuments with no conditions for better performance
    const total = await User.estimatedDocumentCount()

    // Fetch users with pagination and projection to exclude sensitive data
    // Use lean() for faster query execution
    const users = await User.find({}, USER_SAFE_PROJECTION).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec()

    // Transform file paths to full URLs for response
    users.forEach(user => {
        if (user.profilePicture) {
            user.profilePicture = getFileUrl(user.profilePicture)
        }
        if (user.titlePicture) {
            user.titlePicture = getFileUrl(user.titlePicture)
        }
    })

    logger.info("Fetched all users", { count: users.length, page, limit })
    return res.status(200).json({
        success: true,
        message: "Users fetched successfully",
        data: {
            users,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        },
    })
})

/**
 * @desc    Get user by ID
 * @route   GET /api/users/:userId
 * @access  Private
 */
export const getUserById = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    // Use lean() for faster query execution
    const user = await User.findOne({ userId }, USER_SAFE_PROJECTION).lean()

    if (!user) {
        logger.warn("User not found", { userId })
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Transform file paths to full URLs for response
    if (user.profilePicture) {
        user.profilePicture = getFileUrl(user.profilePicture)
    }

    if (user.titlePicture) {
        user.titlePicture = getFileUrl(user.titlePicture)
    }

    logger.info("Fetched user by ID", { userId })
    return res.status(200).json({
        success: true,
        message: "User fetched successfully",
        data: user,
    })
})

/**
 * @desc    Update user
 * @route   PUT /api/users/:userId
 * @access  Private
 */
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params
    const updateData = { ...req.body }

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    // Prevent updating sensitive fields directly
    delete updateData.password
    delete updateData.authenticatorSetup
    delete updateData.verification

    // Validate email if provided
    if (updateData.email && !validateEmail(updateData.email)) {
        return res.status(400).json({
            success: false,
            message: "Invalid email format",
        })
    }

    // Sanitize input fields
    if (updateData.username) updateData.username = sanitizeInput(updateData.username)
    if (updateData.firstName) updateData.firstName = sanitizeInput(updateData.firstName)
    if (updateData.middleName) updateData.middleName = sanitizeInput(updateData.middleName)
    if (updateData.lastName) updateData.lastName = sanitizeInput(updateData.lastName)
    if (updateData.bio) updateData.bio = sanitizeInput(updateData.bio)

    // Sanitize address fields if provided
    if (updateData.address) {
        Object.keys(updateData.address).forEach((key) => {
            if (updateData.address[key]) {
                updateData.address[key] = sanitizeInput(updateData.address[key])
            }
        })
    }

    // Handle file uploads for profile and title pictures
    if (req.files) {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] }

        // Handle profile picture
        if (files.profilePicture && files.profilePicture[0]) {
            updateData.profilePicture = files.profilePicture[0].filename
        }

        // Handle title picture
        if (files.titlePicture && files.titlePicture[0]) {
            updateData.titlePicture = files.titlePicture[0].filename
        }
    }

    // Add updatedAt timestamp
    updateData.updatedAt = new Date()

    // Check if user exists before updating - use lean() for faster query
    const existingUser = await User.findOne({ userId }).lean()
    if (!existingUser) {
        logger.warn("User not found for update", { userId })
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Check if username is being changed and if it's already taken
    if (updateData.username && updateData.username !== existingUser.username) {
        const usernameExists = await User.findOne({ username: updateData.username }).lean()
        if (usernameExists) {
            return res.status(409).json({
                success: false,
                message: "Username already taken",
            })
        }
    }

    // Check if email is being changed and if it's already taken
    if (updateData.email && updateData.email !== existingUser.email) {
        const emailExists = await User.findOne({ email: updateData.email }).lean()
        if (emailExists) {
            return res.status(409).json({
                success: false,
                message: "Email already in use",
            })
        }
    }

    // Delete old profile picture if a new one is being uploaded
    if (updateData.profilePicture && existingUser.profilePicture) {
        await deleteFile(existingUser.profilePicture)
    }

    // Delete old title picture if a new one is being uploaded
    if (updateData.titlePicture && existingUser.titlePicture) {
        await deleteFile(existingUser.titlePicture)
    }

    const updatedUser = await User.findOneAndUpdate(
        { userId },
        { $set: updateData },
        {
            new: true,
            runValidators: true,
            projection: USER_SAFE_PROJECTION,
        },
    ).lean()

    // Transform file paths to full URLs for response
    if (updatedUser?.profilePicture) {
        updatedUser.profilePicture = getFileUrl(updatedUser.profilePicture)
    }

    if (updatedUser?.titlePicture) {
        updatedUser.titlePicture = getFileUrl(updatedUser.titlePicture)
    }

    // Invalidate related caches - use more specific key patterns
    await invalidateCache([CACHE_KEYS.USER_BY_ID(userId), CACHE_KEYS.ALL_USERS])

    logger.info("User updated successfully", { userId })
    return res.status(200).json({
        success: true,
        message: "User updated successfully",
        data: updatedUser,
    })
})

/**
 * @desc    Delete user
 * @route   DELETE /api/users/:userId
 * @access  Private
 */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params
    const { confirmation } = req.body

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    // Use lean() for faster query
    const user = await User.findOne({ userId }).lean()

    if (!user) {
        logger.warn("User not found for deletion", { userId })
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Require confirmation for account deletion
    if (!confirmation || confirmation !== user.username) {
        return res.status(400).json({
            success: false,
            message: "Confirmation required. Please provide your username to confirm deletion",
        })
    }

    // Delete associated profile and title pictures
    if (user.profilePicture) {
        await deleteFile(user.profilePicture)
    }

    if (user.titlePicture) {
        await deleteFile(user.titlePicture)
    }

    // Perform deletion
    await User.findOneAndDelete({ userId })

    // Invalidate all related caches - use more specific key patterns
    await invalidateCache([
        CACHE_KEYS.USER_BY_ID(userId),
        CACHE_KEYS.ALL_USERS,
        CACHE_KEYS.USER_POSTS(userId),
        CACHE_KEYS.USER_FOLLOW_STATS(userId)
    ])

    logger.info("User deleted successfully", { userId })
    return res.status(200).json({
        success: true,
        message: "User deleted successfully",
    })
})

/**
 * @desc    Follow user
 * @route   POST /api/users/:userId/follow
 * @access  Private
 */
export const followUser = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params
    const { followUserId } = req.body

    if (!userId || !followUserId) {
        return res.status(400).json({
            success: false,
            message: "User ID and followUserId are required",
        })
    }

    // Prevent following yourself
    if (userId === followUserId) {
        return res.status(400).json({
            success: false,
            message: "You cannot follow yourself",
        })
    }

    // Use Promise.all for parallel queries
    const [user, userToFollow] = await Promise.all([User.findOne({ userId }), User.findOne({ userId: followUserId })])

    if (!user || !userToFollow) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Check if already following
    if (user.following?.includes(followUserId)) {
        return res.status(400).json({
            success: false,
            message: "Already following this user",
        })
    }

    // Initialize arrays if they don't exist
    if (!user.following) user.following = []
    if (!userToFollow.follower) userToFollow.follower = []

    // Update following/follower lists
    user.following.push(followUserId)
    userToFollow.follower.push(userId)

    // Update timestamps
    user.updatedAt = new Date()
    userToFollow.updatedAt = new Date()

    // Use bulkWrite for better performance
    await User.bulkWrite([
        {
            updateOne: {
                filter: { userId },
                update: { $set: { following: user.following, updatedAt: user.updatedAt } },
            },
        },
        {
            updateOne: {
                filter: { userId: followUserId },
                update: { $set: { follower: userToFollow.follower, updatedAt: userToFollow.updatedAt } },
            },
        },
    ])

    // Invalidate related caches
    await invalidateCache([`users:${userId}`, `users:${followUserId}`])

    logger.info("User followed successfully", { userId, followUserId })
    return res.status(200).json({
        success: true,
        message: "Followed user successfully",
    })
})

/**
 * @desc    Unfollow user
 * @route   POST /api/users/:userId/unfollow
 * @access  Private
 */
export const unfollowUser = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params
    const { unfollowUserId } = req.body

    if (!userId || !unfollowUserId) {
        return res.status(400).json({
            success: false,
            message: "User ID and unfollowUserId are required",
        })
    }

    // Use Promise.all for parallel queries
    const [user, userToUnfollow] = await Promise.all([User.findOne({ userId }), User.findOne({ userId: unfollowUserId })])

    if (!user || !userToUnfollow) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Check if not following
    if (!user.following?.includes(unfollowUserId)) {
        return res.status(400).json({
            success: false,
            message: "Not following this user",
        })
    }

    // Update following/follower lists
    user.following = user.following.filter((id) => id !== unfollowUserId)
    userToUnfollow.follower = userToUnfollow.follower?.filter((id) => id !== userId)

    // Update timestamps
    user.updatedAt = new Date()
    userToUnfollow.updatedAt = new Date()

    // Use bulkWrite for better performance
    await User.bulkWrite([
        {
            updateOne: {
                filter: { userId },
                update: { $set: { following: user.following, updatedAt: user.updatedAt } },
            },
        },
        {
            updateOne: {
                filter: { userId: unfollowUserId },
                update: { $set: { follower: userToUnfollow.follower, updatedAt: userToUnfollow.updatedAt } },
            },
        },
    ])

    // Invalidate related caches
    await invalidateCache([`users:${userId}`, `users:${unfollowUserId}`])

    logger.info("User unfollowed successfully", { userId, unfollowUserId })
    return res.status(200).json({
        success: true,
        message: "Unfollowed user successfully",
    })
})

/**
 * @desc    Get follow stats
 * @route   GET /api/users/:userId/follow-stats
 * @access  Private
 */
export const getFollowStats = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    // Use projection to only get the fields we need
    const user = await User.findOne({ userId }, { follower: 1, following: 1 }).lean()

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    const stats = {
        followers: user.follower?.length ?? 0,
        following: user.following?.length ?? 0,
    }

    return res.status(200).json({
        success: true,
        message: "Follow stats fetched successfully",
        data: stats,
    })
})

/**
 * @desc    Create post
 * @route   POST /api/users/:userId/posts
 * @access  Private
 */
export const createPost = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params
    const { image, title, content, tags, description, badges, author } = req.body

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    if (!content) {
        return res.status(400).json({
            success: false,
            message: "Post content is required",
        })
    }

    // Use lean() for faster query
    const user = await User.findOne({ userId })

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Process and sanitize inputs
    const tagsArray = Array.isArray(tags)
        ? tags.map((tag: string) => sanitizeInput(tag))
        : tags
            ? [sanitizeInput(tags)]
            : ["defaultTag"]

    const badgesArray = Array.isArray(badges)
        ? badges.map((badge: string) => sanitizeInput(badge))
        : badges
            ? [sanitizeInput(badges)]
            : ["defaultBadge"]

    const newPost = {
        identifier: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        image,
        title: title ? sanitizeInput(title) : undefined,
        description: description ? sanitizeInput(description) : undefined,
        content: sanitizeInput(content),
        tags: tagsArray,
        badges: badgesArray,
        author: author ? sanitizeInput(author) : user.username,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    // Use direct update instead of fetching, modifying, and saving
    await User.updateOne(
        { userId },
        {
            $push: { posts: newPost },
            $set: { updatedAt: new Date() },
        },
    )

    // Invalidate related caches
    await invalidateCache([`users:${userId}:posts`])

    logger.info("Post created successfully", { userId, postId: newPost.identifier })
    return res.status(201).json({
        success: true,
        message: "Post created successfully",
        data: newPost,
    })
})

/**
 * @desc    Get all posts
 * @route   GET /api/users/:userId/posts
 * @access  Private
 */
export const getAllPosts = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params
    const page = Number.parseInt(req.query.page as string) || 1
    const limit = Number.parseInt(req.query.limit as string) || 10

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    // Use projection to only get the posts field
    const user = await User.findOne({ userId }, { posts: 1 }).lean()

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    const posts = user.posts || []
    const total = posts.length

    // Sort by createdAt in descending order (newest first)
    posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Apply pagination
    const paginatedPosts = posts.slice((page - 1) * limit, page * limit)

    return res.status(200).json({
        success: true,
        message: "Posts fetched successfully",
        data: {
            posts: paginatedPosts,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        },
    })
})

/**
 * @desc    Get post by ID
 * @route   GET /api/users/:userId/posts/:postId
 * @access  Private
 */
export const getPostById = asyncHandler(async (req: Request, res: Response) => {
    const { userId, postId } = req.params

    if (!userId || !postId) {
        return res.status(400).json({
            success: false,
            message: "User ID and Post ID are required",
        })
    }

    // Use aggregation for better performance when finding a specific post
    const result = await User.aggregate([
        { $match: { userId } },
        { $unwind: "$posts" },
        { $match: { "posts.identifier": postId } },
        { $replaceRoot: { newRoot: "$posts" } },
    ])

    if (!result.length) {
        return res.status(404).json({
            success: false,
            message: "Post not found",
        })
    }

    return res.status(200).json({
        success: true,
        message: "Post fetched successfully",
        data: result[0],
    })
})

/**
 * @desc    Update post
 * @route   PUT /api/users/:userId/posts/:postId
 * @access  Private
 */
export const updatePost = asyncHandler(async (req: Request, res: Response) => {
    const { userId, postId } = req.params
    const updateData = { ...req.body }

    if (!userId || !postId) {
        return res.status(400).json({
            success: false,
            message: "User ID and Post ID are required",
        })
    }

    // Sanitize inputs
    if (updateData.title) updateData.title = sanitizeInput(updateData.title)
    if (updateData.description) updateData.description = sanitizeInput(updateData.description)
    if (updateData.content) updateData.content = sanitizeInput(updateData.content)

    if (updateData.tags && Array.isArray(updateData.tags)) {
        updateData.tags = updateData.tags.map((tag: string) => sanitizeInput(tag))
    }

    if (updateData.badges && Array.isArray(updateData.badges)) {
        updateData.badges = updateData.badges.map((badge: string) => sanitizeInput(badge))
    }

    // Add updatedAt timestamp
    updateData.updatedAt = new Date()

    // Create update object with all fields that need to be updated
    const updateFields = {} as any
    Object.keys(updateData).forEach((key) => {
        updateFields[`posts.$.${key}`] = updateData[key]
    })
    updateFields["updatedAt"] = new Date()

    // Use direct update instead of fetching, modifying, and saving
    const result = await User.updateOne({ userId, "posts.identifier": postId }, { $set: updateFields })

    if (result.matchedCount === 0) {
        return res.status(404).json({
            success: false,
            message: "User or post not found",
        })
    }

    // Get the updated post to return in the response
    const updatedPost = await User.aggregate([
        { $match: { userId } },
        { $unwind: "$posts" },
        { $match: { "posts.identifier": postId } },
        { $replaceRoot: { newRoot: "$posts" } },
    ])

    // Invalidate related caches
    await invalidateCache([`users:${userId}:posts`])

    logger.info("Post updated successfully", { userId, postId })
    return res.status(200).json({
        success: true,
        message: "Post updated successfully",
        data: updatedPost[0],
    })
})

/**
 * @desc    Delete post
 * @route   DELETE /api/users/:userId/posts/:postId
 * @access  Private
 */
export const deletePost = asyncHandler(async (req: Request, res: Response) => {
    const { userId, postId } = req.params

    if (!userId || !postId) {
        return res.status(400).json({
            success: false,
            message: "User ID and Post ID are required",
        })
    }

    // Use direct update to pull the post from the array
    const result = await User.updateOne(
        { userId },
        {
            $pull: { posts: { identifier: postId } },
            $set: { updatedAt: new Date() },
        },
    )

    if (result.matchedCount === 0) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    if (result.modifiedCount === 0) {
        return res.status(404).json({
            success: false,
            message: "Post not found",
        })
    }

    // Invalidate related caches
    await invalidateCache([`users:${userId}:posts`])

    logger.info("Post deleted successfully", { userId, postId })
    return res.status(200).json({
        success: true,
        message: "Post deleted successfully",
    })
})

/**
 * @desc    Update password
 * @route   PUT /api/users/:userId/password
 * @access  Private
 */
export const updatePassword = asyncHandler(async (req: Request, res: Response) => {
    createRateLimit({ windowMs: 15 * 60 * 1000, max: 5 })(req, res, () => { })

    const { currentPassword, newPassword, confirmPassword } = req.body
    const { userId } = req.params

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({
            success: false,
            message: "Current password, new password, and confirm password are required",
        })
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({
            success: false,
            message: "New password and confirm password do not match",
        })
    }

    if (!validatePassword(newPassword)) {
        return res.status(400).json({
            success: false,
            message:
                "Password must be at least 8 characters with at least one uppercase letter, one lowercase letter, one number, and one special character",
        })
    }

    const user = await User.findOne({ userId })

    if (!user || !user.password) {
        return res.status(404).json({
            success: false,
            message: "User not found or no password set",
        })
    }

    const passwordMatch = await bcrypt.compare(currentPassword, user.password)
    if (!passwordMatch) {
        logger.warn("Password update failed: Incorrect current password", { userId })
        return res.status(400).json({
            success: false,
            message: "Current password is incorrect",
        })
    }

    // Hash the new password - use a lower cost factor for faster hashing
    user.password = await bcrypt.hash(newPassword, 10)
    user.updatedAt = new Date()

    await user.save()

    logger.info("Password updated successfully", { userId })
    return res.status(200).json({
        success: true,
        message: "Password updated successfully",
    })
})

/**
 * @desc    Setup two-factor authentication
 * @route   POST /api/users/:userId/2fa/setup
 * @access  Private
 */
export const setupTwoFactorAuth = asyncHandler(async (req: Request, res: Response) => {
    createRateLimit({ windowMs: 60 * 60 * 1000, max: 3 })(req, res, () => { })

    const { userId } = req.params

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    const user = await User.findOne({ userId })

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Check if 2FA is already enabled
    if (user.authenticatorSetup?.isEnabled) {
        return res.status(400).json({
            success: false,
            message: "Two-factor authentication is already enabled",
        })
    }

    // Generate setup data
    const { qrCode, secret, otpauthUrl } = await generateQRCode(user.email || user.username)

    // Update the authenticatorSetup fields
    user.authenticatorSetup = {
        isEnabled: false, // Not enabled until verified
        qrCode,
        secret,
        verificationCode: "",
        recoveryCodesGenerated: false,
        recoveryCodes: [],
    }

    user.updatedAt = new Date()

    await user.save()

    logger.info("Two-factor authentication setup initiated", { userId })
    return res.status(200).json({
        success: true,
        message: "Two-factor authentication setup initiated",
        data: {
            qrCodeUrl: qrCode,
            secret,
            otpauthUrl,
        },
    })
})

/**
 * @desc    Verify two-factor authentication
 * @route   POST /api/users/:userId/2fa/verify
 * @access  Private
 */
export const verifyTwoFactorAuth = asyncHandler(async (req: Request, res: Response) => {
    createRateLimit({ windowMs: 15 * 60 * 1000, max: 10 })(req, res, () => { })

    const { code } = req.body
    const { userId } = req.params

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
        return res.status(400).json({
            success: false,
            message: "Valid 6-digit verification code is required",
        })
    }

    const user = await User.findOne({ userId })

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    if (!user.authenticatorSetup?.secret) {
        return res.status(400).json({
            success: false,
            message: "Two-factor authentication not set up",
        })
    }

    const isVerified = verifyTOTP(user.authenticatorSetup.secret, code)

    if (!isVerified) {
        logger.warn("Invalid 2FA verification code", { userId })
        return res.status(400).json({
            success: false,
            message: "Invalid verification code",
        })
    }

    // Enable 2FA and store the verification code
    user.authenticatorSetup.isEnabled = true
    user.authenticatorSetup.verificationCode = code
    user.updatedAt = new Date()

    await user.save()

    logger.info("Two-factor authentication verified and enabled", { userId })
    return res.status(200).json({
        success: true,
        message: "Two-factor authentication verified and enabled successfully",
    })
})

/**
 * @desc    Disable two-factor authentication
 * @route   POST /api/users/:userId/2fa/disable
 * @access  Private
 */
export const disableTwoFactorAuth = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params
    const { confirmPassword } = req.body

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    const user = await User.findOne({ userId })

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Require password confirmation for security
    if (user.password && confirmPassword) {
        const passwordMatch = await bcrypt.compare(confirmPassword, user.password)
        if (!passwordMatch) {
            return res.status(400).json({
                success: false,
                message: "Password confirmation failed",
            })
        }
    }

    // Reset the authenticatorSetup fields
    user.authenticatorSetup = {
        isEnabled: false,
        qrCode: "",
        secret: "",
        verificationCode: "",
        recoveryCodesGenerated: false,
        recoveryCodes: [],
    }

    user.updatedAt = new Date()

    await user.save()

    logger.info("Two-factor authentication disabled", { userId })
    return res.status(200).json({
        success: true,
        message: "Two-factor authentication disabled successfully",
    })
})

/**
 * @desc    Generate recovery codes
 * @route   POST /api/users/:userId/2fa/recovery-codes
 * @access  Private
 */
export const generateRecoveryCodes = asyncHandler(async (req: Request, res: Response) => {
    createRateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 3 })(req, res, () => { })

    const { userId } = req.params

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    const user = await User.findOne({ userId })

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    if (!user.authenticatorSetup?.isEnabled) {
        return res.status(400).json({
            success: false,
            message: "Two-factor authentication is not enabled",
        })
    }

    const recoveryCodes = generateRecoveryCodesUtil()

    // Update the recovery codes
    user.authenticatorSetup.recoveryCodes = recoveryCodes
    user.authenticatorSetup.recoveryCodesGenerated = true
    user.updatedAt = new Date()

    await user.save()

    logger.info("Recovery codes generated", { userId })
    return res.status(200).json({
        success: true,
        message: "Recovery codes generated successfully",
        data: { recoveryCodes },
    })
})

/**
 * @desc    Verify email
 * @route   POST /api/users/:userId/verify/email
 * @access  Private
 */
export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
    createRateLimit({ windowMs: 15 * 60 * 1000, max: 5 })(req, res, () => { })

    const { userId } = req.params
    const { code } = req.body

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    if (!code) {
        return res.status(400).json({
            success: false,
            message: "Verification code is required",
        })
    }

    // Use direct update for better performance
    const result = await User.updateOne(
        { userId },
        {
            $set: {
                "verification.email": { verified: true, code },
                updatedAt: new Date(),
            },
        },
    )

    if (result.matchedCount === 0) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Invalidate user cache
    await invalidateCache([`users:${userId}`])

    logger.info("Email verified successfully", { userId })
    return res.status(200).json({
        success: true,
        message: "Email verified successfully",
    })
})

/**
 * @desc    Verify Discord account
 * @route   POST /api/users/:userId/verify/discord
 * @access  Private
 */
export const verifyDiscord = asyncHandler(async (req: Request, res: Response) => {
    createRateLimit({ windowMs: 15 * 60 * 1000, max: 5 })(req, res, () => { })

    const { userId } = req.params
    const { code } = req.body

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    if (!code) {
        return res.status(400).json({
            success: false,
            message: "Verification code is required",
        })
    }

    // Use projection to only get the verification field
    const user = await User.findOne({ userId }, { "verification.discord": 1 }).lean()

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    if (!user.verification?.discord) {
        return res.status(400).json({
            success: false,
            message: "No Discord verification code found. Please request a new one.",
        })
    }

    const storedCode = user.verification.discord.code

    if (!storedCode || storedCode !== code) {
        return res.status(400).json({
            success: false,
            message: "Invalid Discord verification code",
        })
    }

    // Use direct update for better performance
    await User.updateOne(
        { userId },
        {
            $set: {
                "verification.discord.verified": true,
                updatedAt: new Date(),
            },
        },
    )

    // Invalidate user cache
    await invalidateCache([`users:${userId}`])

    logger.info("Discord account verified successfully", { userId })
    return res.status(200).json({
        success: true,
        message: "Discord account verified successfully",
    })
})

/**
 * @desc    Verify SMS
 * @route   POST /api/users/:userId/verify/sms
 * @access  Private
 */
export const verifySMS = asyncHandler(async (req: Request, res: Response) => {
    createRateLimit({ windowMs: 15 * 60 * 1000, max: 5 })(req, res, () => { })

    const { userId } = req.params
    const { code } = req.body

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    if (!code) {
        return res.status(400).json({
            success: false,
            message: "Verification code is required",
        })
    }

    // In a real implementation, you would verify the code against what was sent to the user's phone
    // For this example, we'll just check if the code is 6 digits
    if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
        return res.status(400).json({
            success: false,
            message: "Invalid SMS verification code",
        })
    }

    // Use direct update for better performance
    const result = await User.updateOne(
        { userId },
        {
            $set: {
                "verification.sms": { verified: true, code },
                updatedAt: new Date(),
            },
        },
    )

    if (result.matchedCount === 0) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Invalidate user cache
    await invalidateCache([`users:${userId}`])

    logger.info("Phone number verified successfully", { userId })
    return res.status(200).json({
        success: true,
        message: "Phone number verified successfully",
    })
})

/**
 * @desc    Update privacy settings
 * @route   PUT /api/users/:userId/settings/privacy
 * @access  Private
 */
export const updatePrivacySettings = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params
    const { privacySettings } = req.body

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    if (!privacySettings) {
        return res.status(400).json({
            success: false,
            message: "Privacy settings are required",
        })
    }

    // Validate and prepare privacy settings
    const validatedSettings = {
        visibility: ["public", "followers", "private"].includes(privacySettings.profileVisibility)
            ? privacySettings.profileVisibility
            : "public",
        showOnlineState: privacySettings.showOnlineStatus !== undefined ? Boolean(privacySettings.showOnlineStatus) : true,
        showActivity: privacySettings.showActivity !== undefined ? Boolean(privacySettings.showActivity) : true,
    }

    // Use direct update for better performance
    const result = await User.updateOne(
        { userId },
        {
            $set: {
                privacySettings: validatedSettings,
                updatedAt: new Date(),
            },
        },
    )

    if (result.matchedCount === 0) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Invalidate user cache
    await invalidateCache([`users:${userId}`])

    logger.info("Privacy settings updated successfully", { userId })
    return res.status(200).json({
        success: true,
        message: "Privacy settings updated successfully",
        data: validatedSettings,
    })
})

/**
 * @desc    Update notification settings
 * @route   PUT /api/users/:userId/settings/notifications
 * @access  Private
 */
export const updateNotificationSettings = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params
    const { emailNotifications, pushNotifications } = req.body

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    // Prepare update object
    const updateObj: any = { updatedAt: new Date() }

    if (emailNotifications !== undefined) {
        updateObj.emailNotification = Boolean(emailNotifications)
    }

    if (pushNotifications !== undefined) {
        updateObj.pushNotification = Boolean(pushNotifications)
    }

    // Use direct update for better performance
    const result = await User.updateOne({ userId }, { $set: updateObj })

    if (result.matchedCount === 0) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Get updated settings to return in response
    const updatedUser = await User.findOne({ userId }, { emailNotification: 1, pushNotification: 1 }).lean()

    // Invalidate user cache
    await invalidateCache([`users:${userId}`])

    logger.info("Notification settings updated successfully", { userId })
    return res.status(200).json({
        success: true,
        message: "Notification settings updated successfully",
        data: {
            emailNotification: updatedUser?.emailNotification,
            pushNotification: updatedUser?.pushNotification,
        },
    })
})

/**
 * @desc    Update preferences
 * @route   PUT /api/users/:userId/settings/preferences
 * @access  Private
 */
export const updatePreferences = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params
    const { language, theme } = req.body

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    // Validate language
    if (language && !["en", "de", "fr", "es"].includes(language)) {
        return res.status(400).json({
            success: false,
            message: "Invalid language selection",
        })
    }

    // Validate theme
    if (theme && !["light", "dark", "system"].includes(theme)) {
        return res.status(400).json({
            success: false,
            message: "Invalid theme selection",
        })
    }

    // Prepare update object
    const updateObj: any = { updatedAt: new Date() }
    if (language) updateObj.language = language
    if (theme) updateObj.theme = theme

    // Use direct update for better performance
    const result = await User.updateOne({ userId }, { $set: updateObj })

    if (result.matchedCount === 0) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Get updated preferences to return in response
    const updatedUser = await User.findOne({ userId }, { language: 1, theme: 1 }).lean()

    // Invalidate user cache
    await invalidateCache([`users:${userId}`])

    logger.info("Preferences updated successfully", { userId })
    return res.status(200).json({
        success: true,
        message: "Preferences updated successfully",
        data: {
            language: updatedUser?.language,
            theme: updatedUser?.theme,
        },
    })
})

/**
 * @desc    Logout from all sessions
 * @route   POST /api/users/:userId/logout-all
 * @access  Private
 */
export const logoutAllSessions = asyncHandler(async (req: Request, res: Response) => {
    createRateLimit({ windowMs: 60 * 60 * 1000, max: 3 })(req, res, () => { })

    const { userId } = req.params
    const { confirmPassword } = req.body

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required",
        })
    }

    // Use projection to only get the password field
    const user = await User.findOne({ userId }, { password: 1 })

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Require password confirmation for security
    if (user.password && confirmPassword) {
        const passwordMatch = await bcrypt.compare(confirmPassword, user.password)
        if (!passwordMatch) {
            return res.status(400).json({
                success: false,
                message: "Password confirmation failed",
            })
        }
    }

    // Generate new refresh token to invalidate all existing sessions
    const newRefreshToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

    // Use direct update for better performance
    await User.updateOne(
        { userId },
        {
            $set: {
                refreshToken: newRefreshToken,
                updatedAt: new Date(),
            },
        },
    )

    logger.info("Logged out from all other devices successfully", { userId })
    return res.status(200).json({
        success: true,
        message: "Logged out from all other devices successfully",
    })
})