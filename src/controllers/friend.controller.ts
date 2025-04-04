import type { Request, Response, RequestHandler } from "express"
import { Friend } from "../models/Friend"
import { User } from "../models/User"
import { logger } from "../services/logger.service"
import { asyncHandler } from "../utils/asyncHandler.util"
import { invalidateCache } from "../middlewares/cache.middleware"

// Cache key patterns for better cache management
const CACHE_KEYS = {
    ALL_FRIENDS: "friends:all",
    FRIEND_BY_ID: (id: string) => `friends:${id}`,
    USER_FRIENDS: (userId: string) => `friends:user:${userId}`,
    USER_REQUESTS: (userId: string) => `friends:requests:${userId}`,
}

/**
 * @desc    Send friend request
 * @route   POST /api/friends/request
 * @access  Private
 */
export const sendFriendRequest: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, friendId } = req.body

    if (!userId || !friendId) {
        logger.warn("Friend request failed: Missing required fields.")
        res.status(400).json({ message: "Missing required fields" })
        return
    }

    // Prevent sending request to self
    if (userId === friendId) {
        logger.warn("Friend request failed: Cannot send request to self", { userId })
        res.status(400).json({ message: "Cannot send friend request to yourself" })
        return
    }

    // Check if users exist
    const [userExists, friendExists] = await Promise.all([
        User.exists({ _id: userId }).lean().exec(),
        User.exists({ _id: friendId }).lean().exec(),
    ])

    if (!userExists || !friendExists) {
        logger.warn("Friend request failed: User or friend not found", { userId, friendId })
        res.status(404).json({ message: "User or friend not found" })
        return
    }

    // Check if request already exists in either direction
    const existingRequest = await Friend.findOne({
        $or: [
            { userId, friendId, status: "pending" },
            { userId: friendId, friendId: userId, status: "pending" },
        ],
    })
        .lean()
        .exec()

    if (existingRequest) {
        logger.warn(`Friend request failed: Request between ${userId} and ${friendId} already exists.`)
        res.status(400).json({ message: "Friend request already exists" })
        return
    }

    // Check if already friends
    const alreadyFriends = await Friend.findOne({
        $or: [
            { userId, friendId, status: "accepted" },
            { userId: friendId, friendId: userId, status: "accepted" },
        ],
    })
        .lean()
        .exec()

    if (alreadyFriends) {
        logger.warn(`Friend request failed: Users ${userId} and ${friendId} are already friends.`)
        res.status(400).json({ message: "Users are already friends" })
        return
    }

    // Create friend request with unique identifier
    const friendRequest = new Friend({
        identifier: Math.random().toString(36).substring(2, 15),
        userId,
        friendId,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
    })

    await friendRequest.save()

    // Invalidate relevant caches
    await invalidateCache([CACHE_KEYS.USER_REQUESTS(userId), CACHE_KEYS.USER_REQUESTS(friendId)])

    logger.info(`Friend request sent from ${userId} to ${friendId}.`)
    res.status(201).json({ message: "Friend request sent", friendRequest })
})

/**
 * @desc    Respond to friend request
 * @route   POST /api/friends/respond
 * @access  Private
 */
export const respondToFriendRequest: RequestHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { userId, friendId, status } = req.body

        if (!userId || !friendId || !status) {
            logger.warn("Friend request response failed: Missing required fields.")
            res.status(400).json({ message: "Missing required fields" })
            return
        }

        if (!["accepted", "rejected"].includes(status)) {
            logger.warn("Friend request response failed: Invalid status.")
            res.status(400).json({ message: "Invalid status" })
            return
        }

        // Find pending friend request
        const friendRequest = await Friend.findOne({
            userId: friendId,
            friendId: userId,
            status: "pending",
        })

        if (!friendRequest) {
            logger.warn(`Friend request response failed: No pending request from ${friendId} to ${userId}.`)
            res.status(404).json({ message: "No pending friend request found" })
            return
        }

        // Update request status and timestamp
        friendRequest.status = status
        friendRequest.updatedAt = new Date()
        friendRequest.respondedAt = new Date()

        await friendRequest.save()

        // Invalidate relevant caches
        await invalidateCache([
            CACHE_KEYS.USER_FRIENDS(userId),
            CACHE_KEYS.USER_FRIENDS(friendId),
            CACHE_KEYS.USER_REQUESTS(userId),
            CACHE_KEYS.USER_REQUESTS(friendId),
            CACHE_KEYS.FRIEND_BY_ID(friendRequest.id.toString()),
        ])

        logger.info(`Friend request ${status} by ${userId} from ${friendId}.`)
        res.status(200).json({ message: `Friend request ${status}`, friendRequest })
    },
)

/**
 * @desc    Get user's friends
 * @route   GET /api/friends/:userId
 * @access  Private
 */
export const getFriends: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params

    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Find accepted friend relationships in both directions
    const friendships = await Friend.find({
        $or: [
            { userId, status: "accepted" },
            { friendId: userId, status: "accepted" },
        ],
    })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec()

    // Get total count for pagination
    const total = await Friend.countDocuments({
        $or: [
            { userId, status: "accepted" },
            { friendId: userId, status: "accepted" },
        ],
    })

    // Extract friend IDs
    const friendIds = friendships.map((friendship) =>
        friendship.userId.toString() === userId ? friendship.friendId : friendship.userId,
    )

    // Get friend details if requested
    let friendDetails = [] as any[]
    if (req.query.includeDetails === "true" && friendIds.length > 0) {
        friendDetails = await User.find(
            { _id: { $in: friendIds } },
            { password: 0, authenticatorSetup: 0 }, // Exclude sensitive data
        )
            .lean()
            .exec()
    }

    logger.info(`Fetched friends for user ${userId}.`, { count: friendships.length })
    res.status(200).json({
        friendships,
        friendDetails: friendDetails.length > 0 ? friendDetails : undefined,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Get friend request by ID
 * @route   GET /api/friends/request/:requestId
 * @access  Private
 */
export const getFriendRequestById: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { requestId } = req.params

    // Use lean() for better performance
    const friendRequest = await Friend.findById(requestId).lean().exec()

    if (!friendRequest) {
        logger.warn(`Friend request not found for ID: ${requestId}`)
        res.status(404).json({ message: "Friend request not found" })
        return
    }

    logger.info(`Fetched friend request by ID: ${requestId}`)
    res.status(200).json(friendRequest)
})

/**
 * @desc    Get pending friend requests for a user
 * @route   GET /api/friends/requests/:userId
 * @access  Private
 */
export const getFriendRequestsByUserId: RequestHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { userId } = req.params
        const { direction = "received" } = req.query

        // Add pagination support
        const page = Number(req.query.page) || 1
        const limit = Number(req.query.limit) || 20
        const skip = (page - 1) * limit

        // Build query based on direction
        let query = {}
        if (direction === "sent") {
            query = { userId, status: "pending" }
        } else if (direction === "received") {
            query = { friendId: userId, status: "pending" }
        } else {
            query = {
                $or: [
                    { userId, status: "pending" },
                    { friendId: userId, status: "pending" },
                ],
            }
        }

        // Use lean() and exec() for better performance
        const requests = await Friend.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec()

        const total = await Friend.countDocuments(query)

        logger.info(`Fetched friend requests for user ${userId}.`, { direction, count: requests.length })
        res.status(200).json({
            requests,
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit),
                limit,
            },
        })
    },
)

/**
 * @desc    Cancel or delete friend request
 * @route   DELETE /api/friends/request/:requestId
 * @access  Private
 */
export const cancelFriendRequest: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { requestId } = req.params
    const { userId } = req.body

    if (!userId) {
        logger.warn("Friend request cancellation failed: Missing user ID")
        res.status(400).json({ message: "User ID is required" })
        return
    }

    // Find the request first to get user IDs for cache invalidation
    const friendRequest = await Friend.findById(requestId).lean().exec()

    if (!friendRequest) {
        logger.warn(`Friend request not found for cancellation: ${requestId}`)
        res.status(404).json({ message: "Friend request not found" })
        return
    }

    // Ensure the user is authorized to cancel this request
    if (friendRequest.userId.toString() !== userId && friendRequest.friendId.toString() !== userId) {
        logger.warn(`Unauthorized attempt to cancel friend request: ${requestId}`, { userId })
        res.status(403).json({ message: "Not authorized to cancel this request" })
        return
    }

    // Delete the request
    await Friend.deleteOne({ _id: requestId })

    // Invalidate relevant caches
    await invalidateCache([
        CACHE_KEYS.USER_REQUESTS(friendRequest.userId.toString()),
        CACHE_KEYS.USER_REQUESTS(friendRequest.friendId.toString()),
        CACHE_KEYS.FRIEND_BY_ID(requestId),
    ])

    logger.info(`Friend request cancelled: ${requestId}`)
    res.status(200).json({ message: "Friend request cancelled successfully" })
})

/**
 * @desc    Remove friend
 * @route   DELETE /api/friends/:userId/:friendId
 * @access  Private
 */
export const removeFriend: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, friendId } = req.params

    // Find the friendship in either direction
    const friendship = await Friend.findOne({
        $or: [
            { userId, friendId, status: "accepted" },
            { userId: friendId, friendId: userId, status: "accepted" },
        ],
    })
        .lean()
        .exec()

    if (!friendship) {
        logger.warn(`Friendship not found between ${userId} and ${friendId}`)
        res.status(404).json({ message: "Friendship not found" })
        return
    }

    // Delete the friendship
    await Friend.deleteOne({ _id: friendship._id })

    // Invalidate relevant caches
    await invalidateCache([
        CACHE_KEYS.USER_FRIENDS(userId),
        CACHE_KEYS.USER_FRIENDS(friendId),
        CACHE_KEYS.FRIEND_BY_ID(friendship._id.toString()),
    ])

    logger.info(`Friendship removed between ${userId} and ${friendId}`)
    res.status(200).json({ message: "Friend removed successfully" })
})

