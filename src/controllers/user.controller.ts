import type { Request, Response } from "express"
import { User } from "../models/User"
import { logger } from "../services/logger.service"
import bcrypt from "bcryptjs"
import mongoose from "mongoose"
import { generateQRCode, verifyTOTP, generateRecoveryCodes as generateRecoveryCodesUtil } from "../utils/2fa.util"
import { validateEmail, validatePassword, sanitizeInput } from "../utils/validation.util"
import { redisClient } from "../utils/redis.util"
import { asyncHandler } from "../utils/asyncHandler.util"
import { createRateLimit } from "../middlewares/rateLimit.middleware"
import { uploadSingle, deleteFile } from "../services/multer.service"

// Cache TTL in seconds
const CACHE_TTL = 300 // 5 minutes

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

    // Check if user already exists
    const userExists = await User.findOne({
        $or: [{ userId }, { username }, ...(email ? [{ email }] : [])],
    })

    if (userExists) {
        logger.warn("User creation failed: User already exists", { userId, username })
        return res.status(409).json({
            success: false,
            message: "User already exists",
        })
    }

    // Hash password if provided
    let hashedPassword
    if (password) {
        hashedPassword = await bcrypt.hash(password, 12)
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

    logger.info("User created successfully", { userId, username })

    // Remove sensitive information before sending response
    const userResponse = newUser.toObject()
    delete userResponse.password
    userResponse.authenticatorSetup?.secret
    userResponse.authenticatorSetup?.recoveryCodes

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

    // Check cache first
    const cacheKey = `users:all:${page}:${limit}`
    const cachedData = await redisClient.get(cacheKey)

    if (cachedData) {
        return res.status(200).json(JSON.parse(cachedData))
    }

    // Count total users for pagination
    const total = await User.countDocuments()

    // Fetch users with pagination and projection to exclude sensitive data
    const users = await User.find(
        {},
        {
            password: 0,
            "authenticatorSetup.secret": 0,
            "authenticatorSetup.recoveryCodes": 0,
        },
    )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()

    const response = {
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
    }

    // Cache the response
    await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(response))

    logger.info("Fetched all users", { count: users.length, page, limit })
    return res.status(200).json(response)
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

    // Check cache first
    const cacheKey = `users:${userId}`
    const cachedData = await redisClient.get(cacheKey)

    if (cachedData) {
        return res.status(200).json(JSON.parse(cachedData))
    }

    const user = await User.findOne(
        { userId },
        {
            password: 0,
            "authenticatorSetup.secret": 0,
            "authenticatorSetup.recoveryCodes": 0,
        },
    ).lean()

    if (!user) {
        logger.warn("User not found", { userId })
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Transform file paths to full URLs if needed
    if (user.profilePicture) {
        user.profilePicture = `/api/uploads/${user.profilePicture}`
    }

    if (user.titlePicture) {
        user.titlePicture = `/api/uploads/${user.titlePicture}`
    }

    const response = {
        success: true,
        message: "User fetched successfully",
        data: user,
    }

    // Cache the response
    await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(response))

    logger.info("Fetched user by ID", { userId })
    return res.status(200).json(response)
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

    // Check if user exists before updating
    const existingUser = await User.findOne({ userId })
    if (!existingUser) {
        logger.warn("User not found for update", { userId })
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Check if username is being changed and if it's already taken
    if (updateData.username && updateData.username !== existingUser.username) {
        const usernameExists = await User.findOne({ username: updateData.username })
        if (usernameExists) {
            return res.status(409).json({
                success: false,
                message: "Username already taken",
            })
        }
    }

    // Check if email is being changed and if it's already taken
    if (updateData.email && updateData.email !== existingUser.email) {
        const emailExists = await User.findOne({ email: updateData.email })
        if (emailExists) {
            return res.status(409).json({
                success: false,
                message: "Email already in use",
            })
        }
    }

    // Delete old profile picture if a new one is being uploaded
    if (updateData.profilePicture && existingUser.profilePicture) {
        deleteFile(existingUser.profilePicture)
    }

    // Delete old title picture if a new one is being uploaded
    if (updateData.titlePicture && existingUser.titlePicture) {
        deleteFile(existingUser.titlePicture)
    }

    const updatedUser = await User.findOneAndUpdate(
        { userId },
        { $set: updateData },
        {
            new: true,
            runValidators: true,
            projection: {
                password: 0,
                "authenticatorSetup.secret": 0,
                "authenticatorSetup.recoveryCodes": 0,
            },
        },
    )

    // Transform file paths to full URLs for response
    if (updatedUser?.profilePicture) {
        updatedUser.profilePicture = `http://localhost:3001/api/uploads/${updatedUser.profilePicture}`
    }

    if (updatedUser?.titlePicture) {
        updatedUser.titlePicture = `http://localhost:3001/api/uploads/${updatedUser.titlePicture}`
    }

    // Invalidate cache
    await redisClient.del(`users:${userId}`)

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

    const user = await User.findOne({ userId })

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
        deleteFile(user.profilePicture)
    }

    if (user.titlePicture) {
        deleteFile(user.titlePicture)
    }

    // Perform deletion
    await User.findOneAndDelete({ userId })

    // Invalidate cache
    await redisClient.del(`users:${userId}`)
    const allUsersCacheKeys = await redisClient.keys(`users:all:*`)
    if (allUsersCacheKeys.length > 0) {
        await redisClient.del(allUsersCacheKeys)
    }

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

    // Save both users in a transaction
    const session = await mongoose.startSession()
    session.startTransaction()

    try {
        await user.save({ session })
        await userToFollow.save({ session })
        await session.commitTransaction()
    } catch (error) {
        await session.abortTransaction()
        throw error
    } finally {
        session.endSession()
    }

    // Invalidate caches
    await Promise.all([
        redisClient.del(`users:${userId}`),
        redisClient.del(`users:${followUserId}`),
        redisClient.del(`users:${userId}:follow-stats`),
        redisClient.del(`users:${followUserId}:follow-stats`),
    ])

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

    // Save both users in a transaction
    const session = await mongoose.startSession()
    session.startTransaction()

    try {
        await user.save({ session })
        await userToUnfollow.save({ session })
        await session.commitTransaction()
    } catch (error) {
        await session.abortTransaction()
        throw error
    } finally {
        session.endSession()
    }

    // Invalidate caches
    await Promise.all([
        redisClient.del(`users:${userId}`),
        redisClient.del(`users:${unfollowUserId}`),
        redisClient.del(`users:${userId}:follow-stats`),
        redisClient.del(`users:${unfollowUserId}:follow-stats`),
    ])

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

    // Check cache first
    const cacheKey = `users:${userId}:follow-stats`
    const cachedData = await redisClient.get(cacheKey)

    if (cachedData) {
        return res.status(200).json(JSON.parse(cachedData))
    }

    const user = await User.findOne({ userId })

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

    const response = {
        success: true,
        message: "Follow stats fetched successfully",
        data: stats,
    }

    // Cache the response
    await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(response))

    return res.status(200).json(response)
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

    // Initialize posts array if it doesn't exist
    if (!user.posts) {
        user.posts = []
    }

    user.posts.push(newPost)
    user.updatedAt = new Date()

    await user.save()

    // Invalidate cache
    await redisClient.del(`users:${userId}`)
    await redisClient.del(`users:${userId}:posts`)

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

    // Check cache first
    const cacheKey = `users:${userId}:posts:${page}:${limit}`
    const cachedData = await redisClient.get(cacheKey)

    if (cachedData) {
        return res.status(200).json(JSON.parse(cachedData))
    }

    const user = await User.findOne({ userId })

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

    const response = {
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
    }

    // Cache the response
    await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(response))

    return res.status(200).json(response)
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

    // Check cache first
    const cacheKey = `users:${userId}:posts:${postId}`
    const cachedData = await redisClient.get(cacheKey)

    if (cachedData) {
        return res.status(200).json(JSON.parse(cachedData))
    }

    const user = await User.findOne({ userId })

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    const post = user.posts?.find((post) => post.identifier === postId)

    if (!post) {
        return res.status(404).json({
            success: false,
            message: "Post not found",
        })
    }

    const response = {
        success: true,
        message: "Post fetched successfully",
        data: post,
    }

    // Cache the response
    await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(response))

    return res.status(200).json(response)
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

    const user = await User.findOne({ userId })

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    if (!user.posts) {
        return res.status(404).json({
            success: false,
            message: "No posts found",
        })
    }

    const postIndex = user.posts.findIndex((post) => post.identifier === postId)

    if (postIndex === -1) {
        return res.status(404).json({
            success: false,
            message: "Post not found",
        })
    }

    // Update post fields while preserving fields not in the request
    const updatedPost = {
        ...user.posts[postIndex],
        ...updateData,
    }

    user.posts[postIndex] = updatedPost
    user.updatedAt = new Date()

    await user.save()

    // Invalidate caches
    await Promise.all([redisClient.del(`users:${userId}`), redisClient.del(`users:${userId}:posts:${postId}`)])

    const postsCacheKeys = await redisClient.keys(`users:${userId}:posts:*`)
    if (postsCacheKeys.length > 0) {
        await redisClient.del(postsCacheKeys)
    }

    logger.info("Post updated successfully", { userId, postId })
    return res.status(200).json({
        success: true,
        message: "Post updated successfully",
        data: updatedPost,
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

    const user = await User.findOne({ userId })

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    if (!user.posts) {
        return res.status(404).json({
            success: false,
            message: "No posts found",
        })
    }

    const postIndex = user.posts.findIndex((post) => post.identifier === postId)

    if (postIndex === -1) {
        return res.status(404).json({
            success: false,
            message: "Post not found",
        })
    }

    // Remove the post
    user.posts.splice(postIndex, 1)
    user.updatedAt = new Date()

    await user.save()

    // Invalidate caches
    await Promise.all([redisClient.del(`users:${userId}`), redisClient.del(`users:${userId}:posts:${postId}`)])

    const postsCacheKeys = await redisClient.keys(`users:${userId}:posts:*`)
    if (postsCacheKeys.length > 0) {
        await redisClient.del(postsCacheKeys)
    }

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

    // Hash the new password
    user.password = await bcrypt.hash(newPassword, 12) // Higher rounds for production
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

    const user = await User.findOne({ userId })

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Initialize verification object if it doesn't exist
    if (!user.verification) {
        user.verification = {
            email: { verified: false, code: "" },
            discord: { verified: false, code: "" },
            sms: { verified: false, code: "" },
        }
    }

    // In a real implementation, you would verify the code against what was sent to the user's email
    // For this example, we'll just check if the code is not empty
    if (!code) {
        return res.status(400).json({
            success: false,
            message: "Invalid verification code",
        })
    }

    // Update verification status
    user.verification.email = { verified: true, code }
    user.updatedAt = new Date()

    await user.save()

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

    const user = await User.findOne({ userId })

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    if (!user.verification) {
        return res.status(400).json({
            success: false,
            message: "No Discord verification code found. Please request a new one.",
        })
    }

    const storedCode = user.verification.discord?.code

    if (!storedCode || storedCode !== code) {
        return res.status(400).json({
            success: false,
            message: "Invalid Discord verification code",
        })
    }

    user.verification.discord.verified = true
    user.updatedAt = new Date()

    await user.save()

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

    const user = await User.findOne({ userId })

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Initialize verification object if it doesn't exist
    if (!user.verification) {
        user.verification = {
            email: { verified: false, code: "" },
            discord: { verified: false, code: "" },
            sms: { verified: false, code: "" },
        }
    }

    // In a real implementation, you would verify the code against what was sent to the user's phone
    // For this example, we'll just check if the code is 6 digits
    if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
        return res.status(400).json({
            success: false,
            message: "Invalid SMS verification code",
        })
    }

    // Update verification status
    user.verification.sms = { verified: true, code }
    user.updatedAt = new Date()

    await user.save()

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

    const user = await User.findOne({ userId })

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Update privacy settings with validation
    user.privacySettings = {
        visibility: ["public", "followers", "private"].includes(privacySettings.profileVisibility)
            ? privacySettings.profileVisibility
            : "public",
        showOnlineState: privacySettings.showOnlineStatus !== undefined ? Boolean(privacySettings.showOnlineStatus) : true,
        showActivity: privacySettings.showActivity !== undefined ? Boolean(privacySettings.showActivity) : true,
    }

    user.updatedAt = new Date()

    await user.save()

    // Invalidate cache
    await redisClient.del(`users:${userId}`)

    logger.info("Privacy settings updated successfully", { userId })
    return res.status(200).json({
        success: true,
        message: "Privacy settings updated successfully",
        data: user.privacySettings,
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

    const user = await User.findOne({ userId })

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        })
    }

    // Update notification settings
    if (emailNotifications !== undefined) {
        user.emailNotification = Boolean(emailNotifications)
    }

    if (pushNotifications !== undefined) {
        user.pushNotification = Boolean(pushNotifications)
    }

    user.updatedAt = new Date()

    await user.save()

    // Invalidate cache
    await redisClient.del(`users:${userId}`)

    logger.info("Notification settings updated successfully", { userId })
    return res.status(200).json({
        success: true,
        message: "Notification settings updated successfully",
        data: {
            emailNotification: user.emailNotification,
            pushNotification: user.pushNotification,
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

    const user = await User.findOne({ userId })

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
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

    // Update preferences
    if (language) user.language = language
    if (theme) user.theme = theme

    user.updatedAt = new Date()

    await user.save()

    // Invalidate cache
    await redisClient.del(`users:${userId}`)

    logger.info("Preferences updated successfully", { userId })
    return res.status(200).json({
        success: true,
        message: "Preferences updated successfully",
        data: {
            language: user.language,
            theme: user.theme,
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

    // Generate new refresh token to invalidate all existing sessions
    const newRefreshToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    user.refreshToken = newRefreshToken
    user.updatedAt = new Date()

    await user.save()

    logger.info("Logged out from all other devices successfully", { userId })
    return res.status(200).json({
        success: true,
        message: "Logged out from all other devices successfully",
    })
})

// Export middleware for file uploads
export const uploadProfileImages = (req: Request, res: Response, next: Function) => {
    try {
        const uploadFields = [
            { name: "profilePicture", maxCount: 1 },
            { name: "titlePicture", maxCount: 1 },
        ]

        // Use the multer service to handle multiple file uploads
        const uploadMiddleware = (req: Request, res: Response, next: Function) => {
            uploadFields.forEach((field) => {
                if (req.body[field.name]) {
                    uploadSingle(field.name)(req, res, (err: any) => {
                        if (err) {
                            logger.error(`Error uploading ${field.name}`, { error: err.message })
                        }
                    })
                }
            })
            next()
        }

        uploadMiddleware(req, res, next)
    } catch (error) {
        logger.error("Error in uploadProfileImages middleware", { error })
        next(error)
    }
}

