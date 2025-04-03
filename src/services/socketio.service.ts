import { Server } from 'socket.io';
import { Chat } from '../models/Chat';
import { User } from '../models/User';
import { logger } from '../services/logger.service';

let io: Server;

export const initializeSocket = (server: any): void => {
    io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {
        logger.info(`User connected: ${socket.id}`);

        socket.on('joinChat', async ({ userId, chatId }) => {
            try {
                const chat = await Chat.findById(chatId);
                const user = await User.findById(userId);

                if (!chat) {
                    socket.emit('error', { message: 'Chat not found' });
                    return;
                }

                if (!user) {
                    socket.emit('error', { message: 'User not found' });
                    return;
                }

                if (!chat.participants.includes(user._id as any)) {
                    chat.participants.push(user._id as any);
                    await chat.save();
                }

                if (!user.chats?.includes(chatId)) {
                    user.chats?.push(chatId);
                    await user.save();
                }

                socket.join(chatId);
                io.to(chatId).emit('userJoinedChat', { userId, chatId });

                logger.info(`User ${userId} joined chat: ${chatId}`);
            } catch (error) {
                logger.error('Error joining chat', { error });
            }
        });

        socket.on('sendMessage', async ({ chatId, senderId, content }) => {
            try {
                const chat = await Chat.findById(chatId);
                if (!chat) {
                    socket.emit('error', { message: 'Chat not found' });
                    return;
                }

                const newMessage = {
                    identifier: Math.random().toString(36).substring(2, 15),
                    sender: senderId,
                    content,
                    timestamp: new Date()
                };

                chat.messages.push(newMessage);
                chat.lastMessage = newMessage;
                await chat.save();

                io.to(chatId).emit('newMessage', newMessage);
                logger.info(`New message in chat ${chatId}`, { senderId, content });
            } catch (error) {
                logger.error('Error sending message', { error });
            }
        });

        socket.on('disconnect', () => {
            logger.info(`User disconnected: ${socket.id}`);
        });
    });
};

export const getIO = (): Server => {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
};
