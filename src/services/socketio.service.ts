import { Server, type Socket } from "socket.io"
import { Chat } from "../models/Chat"
import { User } from "../models/User"
import { logger } from "./logger.service"
import mongoose from "mongoose"

interface SocketUser {
    userId: string
    socketId: string
}

interface ChatMessage {
    chatId: string
    senderId: string
    content: string
}

let io: Server
// Use the SocketUser interface for connected users
const connectedUsers = new Map<string, SocketUser>()

/**
 * Initialize Socket.IO server
 * @param server HTTP server instance
 */
export const initializeSocket = (server: any): void => {
    io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
        pingTimeout: 60000, // 60 seconds
        pingInterval: 25000, // 25 seconds
    })

    io.on("connection", (socket: Socket) => {
        logger.info(`Socket connected: ${socket.id}`)

        // Handle user authentication
        socket.on("authenticate", (userId: string) => {
            if (!userId) {
                socket.emit("error", { message: "User ID is required for authentication" })
                return
            }

            // Store user connection using SocketUser interface
            const socketUser: SocketUser = {
                userId,
                socketId: socket.id,
            }
            connectedUsers.set(userId, socketUser)
            logger.info(`User authenticated: ${userId}`, { socketId: socket.id })

            // Notify user of successful authentication
            socket.emit("authenticated", { userId })

            // Broadcast user online status
            socket.broadcast.emit("userOnline", { userId })
        })

        // Handle joining a chat room
        socket.on("joinChat", async ({ userId, chatId }: { userId: string; chatId: string }) => {
            try {
                if (!userId || !chatId) {
                    socket.emit("error", { message: "User ID and Chat ID are required" })
                    return
                }

                // Validate chat and user existence
                const [chat, user] = await Promise.all([Chat.findById(chatId), User.findById(userId)])

                if (!chat) {
                    socket.emit("error", { message: "Chat not found" })
                    return
                }

                if (!user) {
                    socket.emit("error", { message: "User not found" })
                    return
                }

                // Add user to chat participants if not already included
                const userObjectId = new mongoose.Types.ObjectId(userId)
                const isParticipant = chat.participants.some((participantId) => participantId.toString() === userId)

                if (!isParticipant) {
                    chat.participants.push(userObjectId)
                    await chat.save()
                }

                // Add chat to user's chats if not already included
                if (!user.chats?.includes(chatId)) {
                    if (!user.chats) user.chats = []
                    user.chats.push(chatId)
                    await user.save()
                }

                // Join the socket room for this chat
                socket.join(chatId)

                // Notify room that user joined
                io.to(chatId).emit("userJoinedChat", { userId, chatId })

                logger.info(`User ${userId} joined chat: ${chatId}`)
            } catch (error: any) {
                logger.error("Error joining chat", { error: error.message, stack: error.stack })
                socket.emit("error", { message: "Failed to join chat", error: error.message })
            }
        })

        // Handle sending messages
        socket.on("sendMessage", async ({ chatId, senderId, content }: ChatMessage) => {
            try {
                if (!chatId || !senderId || !content) {
                    socket.emit("error", { message: "Chat ID, sender ID, and content are required" })
                    return
                }

                const chat = await Chat.findById(chatId)
                if (!chat) {
                    socket.emit("error", { message: "Chat not found" })
                    return
                }

                // Create new message
                const newMessage = {
                    identifier: Math.random().toString(36).substring(2, 15),
                    sender: senderId,
                    content,
                    timestamp: new Date(),
                }

                // Add message to chat
                chat.messages.push(newMessage)
                chat.lastMessage = newMessage
                chat.updatedAt = new Date()
                await chat.save()

                // Broadcast message to all users in the chat
                io.to(chatId).emit("newMessage", {
                    ...newMessage,
                    chatId,
                })

                logger.info(`New message in chat ${chatId}`, { senderId, messageId: newMessage.identifier })
            } catch (error: any) {
                logger.error("Error sending message", { error: error.message, stack: error.stack })
                socket.emit("error", { message: "Failed to send message", error: error.message })
            }
        })

        // Handle typing indicator
        socket.on("typing", ({ chatId, userId }: { chatId: string; userId: string }) => {
            if (!chatId || !userId) return

            socket.to(chatId).emit("userTyping", { chatId, userId })
        })

        // Handle stop typing indicator
        socket.on("stopTyping", ({ chatId, userId }: { chatId: string; userId: string }) => {
            if (!chatId || !userId) return

            socket.to(chatId).emit("userStoppedTyping", { chatId, userId })
        })

        // Handle disconnection
        socket.on("disconnect", () => {
            // Find and remove the disconnected user
            for (const [userId, socketUser] of connectedUsers.entries()) {
                if (socketUser.socketId === socket.id) {
                    connectedUsers.delete(userId)

                    // Broadcast user offline status
                    socket.broadcast.emit("userOffline", { userId })

                    logger.info(`User disconnected: ${userId}`, { socketId: socket.id })
                    break
                }
            }

            logger.info(`Socket disconnected: ${socket.id}`)
        })
    })

    logger.info("Socket.IO server initialized")
}

/**
 * Get the Socket.IO server instance
 * @returns Socket.IO server instance
 */
export const getIO = (): Server => {
    if (!io) {
        throw new Error("Socket.IO not initialized")
    }
    return io
}

/**
 * Check if a user is online
 * @param userId User ID
 * @returns True if the user is online
 */
export const isUserOnline = (userId: string): boolean => {
    return connectedUsers.has(userId)
}

/**
 * Get all online users
 * @returns Array of SocketUser objects
 */
export const getOnlineUsers = (): SocketUser[] => {
    return Array.from(connectedUsers.values())
}

/**
 * Get a specific online user
 * @param userId User ID
 * @returns SocketUser object or undefined if not found
 */
export const getOnlineUser = (userId: string): SocketUser | undefined => {
    return connectedUsers.get(userId)
}

/**
 * Send a direct message to a specific user
 * @param userId User ID
 * @param event Event name
 * @param data Event data
 * @returns True if the message was sent
 */
export const sendToUser = (userId: string, event: string, data: any): boolean => {
    const socketUser = connectedUsers.get(userId)
    if (!socketUser) return false

    io.to(socketUser.socketId).emit(event, data)
    return true
}

/**
 * Send a message to all users in a chat room
 * @param chatId Chat ID
 * @param event Event name
 * @param data Event data
 */
export const sendToChat = (chatId: string, event: string, data: any): void => {
    io.to(chatId).emit(event, data)
}

/**
 * Send a message to all connected users
 * @param event Event name
 * @param data Event data
 */
export const broadcast = (event: string, data: any): void => {
    io.emit(event, data)
}

