import { Schema } from 'mongoose';
import { Server, Socket } from 'socket.io';
import { User, IUser } from '../models/User';
import { Chat } from '../models/Chat';
import { logger } from '../services/logger.service';

export class SocketIOService {
    private io: Server;
    private users: Record<string, string> = {};
    private groups: Record<string, string[]> = {};

    constructor(io: Server) {
        this.io = io;
        this.setupListeners();
    }

    private setupListeners() {
        this.io.on('connection', (socket: Socket) => {
            logger.info(`User connected: ${socket.id}`);

            socket.on('join', (username: string) => this.handleJoin(socket, username));
            socket.on('private-message', (data: { to: string, message: string }) => this.handlePrivateMessage(socket, data));
            socket.on('create-group', (groupName: string) => this.handleCreateGroup(socket, groupName));
            socket.on('join-group', (groupName: string) => this.handleJoinGroup(socket, groupName));
            socket.on('group-message', (data: { groupName: string, message: string }) => this.handleGroupMessage(socket, data));
            socket.on('disconnect', () => this.handleDisconnect(socket));
        });
    }

    private async handleJoin(socket: Socket, username: string) {
        if (!username) {
            logger.warn(`Invalid join attempt, missing username from socket ${socket.id}`);
            return;
        }

        try {
            const user = new User({ username, socketId: socket.id });
            await user.save();
            this.users[socket.id] = username;
            logger.info(`User joined: ${username}`, { socketId: socket.id });
        } catch (error: any) {
            logger.error(`Error joining user: ${username}`, { error: error.message, stack: error.stack });
        }
    }

    private async handlePrivateMessage(socket: Socket, { to, message }: { to: string, message: string }) {
        if (!to || !message) {
            logger.warn(`Invalid private message from socket ${socket.id}: missing recipient or message`);
            return;
        }

        try {
            const recipientSocketId = Object.keys(this.users).find(id => this.users[id] === to);
            if (recipientSocketId) {
                const sender = await User.findOne({ socketId: socket.id });
                const recipient = await User.findOne({ socketId: recipientSocketId });

                if (sender && recipient) {
                    let chat = await Chat.findOne({ participants: { $all: [sender._id, recipient._id] }, chatType: 'one-to-one' });
                    if (!chat) {
                        chat = new Chat({
                            participants: [sender._id, recipient._id],
                            chatType: 'one-to-one',
                            createdAt: new Date(),
                            updatedAt: new Date()
                        });
                        await chat.save();
                    }

                    const newMessage = {
                        identifier: Math.random().toString(36).substring(2, 15),
                        sender: sender._id as Schema.Types.ObjectId,
                        content: message,
                        timestamp: new Date()
                    };

                    chat.messages.push(newMessage);
                    await chat.save();

                    this.io.to(recipientSocketId).emit('private-message', {
                        from: sender.username,
                        message
                    });
                }
            } else {
                logger.warn(`Recipient ${to} not found for socket ${socket.id}`);
            }
        } catch (error: any) {
            logger.error(`Error handling private message from ${socket.id}`, { error: error.message, stack: error.stack });
        }
    }

    private async handleCreateGroup(socket: Socket, groupName: string) {
        if (!groupName) {
            logger.warn(`Invalid group creation attempt: missing group name from socket ${socket.id}`);
            return;
        }

        try {
            const groupChat = new Chat({
                participants: [socket.id],
                chatType: 'group',
                groupName,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            await groupChat.save();
            this.groups[groupName] = [socket.id];
            socket.join(groupName);
            logger.info(`Group created: ${groupName} by ${socket.id}`);
        } catch (error: any) {
            logger.error(`Error creating group: ${groupName}`, { error: error.message, stack: error.stack });
        }
    }

    private async handleJoinGroup(socket: Socket, groupName: string) {
        if (!groupName) {
            logger.warn(`Invalid group join attempt: missing group name from socket ${socket.id}`);
            return;
        }

        try {
            const group = await Chat.findOne({ groupName, chatType: 'group' });
            if (group) {
                const user = await User.findOne({ socketId: socket.id }) as IUser | null;

                if (user && user._id instanceof Schema.Types.ObjectId) {
                    group.participants.push(user._id);
                    await group.save();
                    socket.join(groupName);
                    logger.info(`${this.users[socket.id]} joined group: ${groupName}`);
                } else {
                    logger.warn(`User with socketId ${socket.id} does not exist or is invalid`);
                }
            } else {
                logger.warn(`Group ${groupName} not found`);
            }
        } catch (error: any) {
            logger.error(`Error joining group ${groupName}`, { error: error.message, stack: error.stack });
        }
    }

    private async handleGroupMessage(socket: Socket, { groupName, message }: { groupName: string, message: string }) {
        if (!groupName || !message) {
            logger.warn(`Invalid group message from socket ${socket.id}: missing group name or message`);
            return;
        }

        try {
            const group = await Chat.findOne({ groupName, chatType: 'group' });
            if (group) {
                const sender = await User.findOne({ socketId: socket.id });
                if (sender) {
                    const newMessage = {
                        identifier: Math.random().toString(36).substring(2, 15),
                        sender: sender._id as Schema.Types.ObjectId,
                        content: message,
                        timestamp: new Date()
                    };
                    group.messages.push(newMessage);
                    await group.save();

                    this.io.to(groupName).emit('group-message', {
                        from: sender.username,
                        message
                    });
                } else {
                    logger.warn(`User ${socket.id} not found for group message`);
                }
            } else {
                logger.warn(`Group ${groupName} not found`);
            }
        } catch (error: any) {
            logger.error(`Error handling group message for ${groupName} from ${socket.id}`, { error: error.message, stack: error.stack });
        }
    }

    private async handleDisconnect(socket: Socket) {
        try {
            logger.info(`User disconnected: ${socket.id}`);
            await User.findOneAndDelete({ socketId: socket.id });
            delete this.users[socket.id];
        } catch (error: any) {
            logger.error(`Error handling disconnect for ${socket.id}`, { error: error.message, stack: error.stack });
        }
    }
}
