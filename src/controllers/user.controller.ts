import { Request, Response, RequestHandler } from 'express';
import { User } from '../models/User';
import { logger } from '../services/logger.service';

export const createUser: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const {
            username,
            userId,
            socketId,
            accessToken,
            refreshToken,
            firstName,
            middleName,
            lastName,
            address,
        } = req.body;

        const userExists = await User.findOne({ userId });
        if (userExists) {
            logger.warn(`User creation failed: User with ID ${userId} already exists.`);
            res.status(400).json({ message: 'User already exists' });
            return;
        }

        const newUser = new User({
            identifier: Math.random().toString(36).substring(2, 15),
            username,
            userId,
            socketId,
            accessToken,
            refreshToken,
            firstName,
            middleName,
            lastName,
            address,
            chats: [],
            groups: [],
            apiKeys: [],
            payments: [],
            follower: [],
            following: [],
            posts: [],
        });

        await newUser.save();
        logger.info(`User created successfully: ${userId}`);
        res.status(201).json({ message: 'User created successfully', user: newUser });
    } catch (error: any) {
        logger.error(`User creation failed: ${error.message}`, { stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getAllUsers: RequestHandler = async (_req: Request, res: Response): Promise<void> => {
    try {
        const users = await User.find();
        logger.info('Fetched all users successfully.');
        res.status(200).json(users);
    } catch (error: any) {
        logger.error(`Fetching all users failed: ${error.message}`, { stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getUserById: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;

    try {
        const user = await User.findOne({ userId });

        if (!user) {
            logger.warn(`User fetch failed: User with ID ${userId} not found.`);
            res.status(404).json({ message: 'User not found' });
            return;
        }

        logger.info(`Fetched user successfully: ${userId}`);
        res.status(200).json(user);
    } catch (error: any) {
        logger.error(`Fetching user by ID ${userId} failed: ${error.message}`, { stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateUser: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const {
        username,
        socketId,
        accessToken,
        refreshToken,
        firstName,
        middleName,
        lastName,
        address,
    } = req.body;

    try {
        const updatedUser = await User.findOneAndUpdate(
            { userId },
            {
                username,
                socketId,
                accessToken,
                refreshToken,
                firstName,
                middleName,
                lastName,
                address,
            },
            { new: true }
        );

        if (!updatedUser) {
            logger.warn(`User update failed: User with ID ${userId} not found.`);
            res.status(404).json({ message: 'User not found' });
            return;
        }

        logger.info(`User updated successfully: ${userId}`);
        res.status(200).json({ message: 'User updated successfully', user: updatedUser });
    } catch (error: any) {
        logger.error(`Updating user ${userId} failed: ${error.message}`, { stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteUser: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;

    try {
        const deletedUser = await User.findOneAndDelete({ userId });

        if (!deletedUser) {
            logger.warn(`User deletion failed: User with ID ${userId} not found.`);
            res.status(404).json({ message: 'User not found' });
            return;
        }

        logger.info(`User deleted successfully: ${userId}`);
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error: any) {
        logger.error(`Deleting user ${userId} failed: ${error.message}`, { stack: error.stack });
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const followUser: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const { followUserId } = req.body;

    try {
        const user = await User.findOne({ userId });
        const userToFollow = await User.findOne({ userId: followUserId });

        if (!user || !userToFollow) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        if (!Array.isArray(user.following)) {
            user.following = [];
        }

        if (!Array.isArray(userToFollow.follower)) {
            userToFollow.follower = [];
        }

        if (user.following.includes(followUserId)) {
            res.status(400).json({ message: 'You are already following this user' });
            return;
        }

        user.following.push(followUserId);
        userToFollow.follower.push(userId);

        await user.save();
        await userToFollow.save();

        res.status(200).json({ message: `You are now following ${followUserId}` });
    } catch (error: any) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const unfollowUser: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const { unfollowUserId } = req.body;

    try {
        const user = await User.findOne({ userId });
        const userToUnfollow = await User.findOne({ userId: unfollowUserId });

        if (!user || !userToUnfollow) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        if (!Array.isArray(user.following)) {
            user.following = [];
        }

        if (!Array.isArray(userToUnfollow.follower)) {
            userToUnfollow.follower = [];
        }

        user.following = user.following.filter(id => id !== unfollowUserId);
        userToUnfollow.follower = userToUnfollow.follower.filter(id => id !== userId);

        await user.save();
        await userToUnfollow.save();

        res.status(200).json({ message: `You have unfollowed ${unfollowUserId}` });
    } catch (error: any) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getFollowStats: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;

    try {
        const user = await User.findOne({ userId });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        res.status(200).json({
            followersCount: user.follower?.length ?? 0,
            followingCount: user.following?.length ?? 0,
        });
    } catch (error: any) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createPost: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const { title, content, tags, description, badges, author } = req.body;

    try {
        const user = await User.findOne({ userId });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const tagsArray: string[] = Array.isArray(tags) && tags.length > 0 ? tags : ['defaultTag'];
        const badgesArray: string[] = Array.isArray(badges) && badges.length > 0 ? badges : ['defaultBadge'];

        const newPost = {
            identifier: Math.random().toString(36).substring(2, 15),
            image: '',
            title,
            description,
            content,
            tags: tagsArray,
            badges: badgesArray,
            author,
            createdAt: new Date(),
        };

        user.posts?.push(newPost);
        await user.save();

        res.status(201).json({ message: 'Post created successfully', post: newPost });
    } catch (error: any) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getAllPosts: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;

    try {
        const user = await User.findOne({ userId });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        if (!Array.isArray(user.posts) || user.posts.length === 0) {
            res.status(404).json({ message: 'No posts available for this user' });
            return;
        }

        res.status(200).json(user.posts);
    } catch (error: any) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const viewPost: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { userId, postId } = req.params;

    try {
        const user = await User.findOne({ userId });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const post = user.posts?.find((post) => post.identifier === postId);

        if (!post) {
            res.status(404).json({ message: 'Post not found' });
            return;
        }

        res.status(200).json({ message: 'Post retrieved successfully', post });
    } catch (error: any) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updatePost: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { userId, postId } = req.params;
    const { title, content, tags, description, badges, author } = req.body;

    try {
        const user = await User.findOne({ userId });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const post = user.posts?.find((post) => post.identifier === postId);

        if (!post) {
            res.status(404).json({ message: 'Post not found' });
            return;
        }

        post.title = title || post.title;
        post.content = content || post.content;
        post.description = description || post.description;
        post.author = author || post.author;
        post.tags = Array.isArray(tags) && tags.length > 0 ? tags : post.tags;
        post.badges = Array.isArray(badges) && badges.length > 0 ? badges : post.badges;

        await user.save();

        res.status(200).json({ message: 'Post updated successfully', post });
    } catch (error: any) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deletePost: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const { userId, postId } = req.params;

    try {
        const user = await User.findOne({ userId });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const postIndex = user.posts?.findIndex((post) => post.identifier === postId);

        if (postIndex === undefined || postIndex === -1) {
            res.status(404).json({ message: 'Post not found' });
            return;
        }

        user.posts?.splice(postIndex, 1);
        await user.save();

        res.status(200).json({ message: 'Post deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

