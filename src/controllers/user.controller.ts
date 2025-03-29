import { Request, Response, RequestHandler } from 'express';
import { User } from '../models/User';
import { logger } from '../services/logger.service';
import bcrypt from 'bcryptjs';
import { setupAuthenticator, verifyAuthenticator, generateRecoveryCodes as generateRecoveryCodesUtil } from '../utils/2fa.util';

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
            logger.warn('User creation failed: User already exists', { userId });
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
        logger.info('User created successfully', { userId });
        res.status(201).json({ message: 'User created successfully', user: newUser });
    } catch (error: any) {
        logger.error('Error creating user', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error creating user' });
    }
};

export const getAllUsers: RequestHandler = async (_req: Request, res: Response): Promise<void> => {
    try {
        const users = await User.find();
        logger.info('Fetched all users', { count: users.length });
        res.status(200).json(users);
    } catch (error: any) {
        logger.error('Error fetching users', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error fetching users' });
    }
};

export const getUserById: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await User.findOne({ userId: req.params.userId });

        if (!user) {
            logger.warn('User not found', { userId: req.params.userId });
            res.status(404).json({ message: 'User not found' });
            return;
        }

        logger.info('Fetched user by ID', { userId: user.userId });
        res.status(200).json(user);
    } catch (error: any) {
        logger.error('Error fetching user by ID', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error fetching user' });
    }
};

export const updateUser: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const updatedUser = await User.findOneAndUpdate(
            { userId: req.params.userId },
            { ...req.body },
            { new: true }
        );

        if (!updatedUser) {
            logger.warn('User not found for update', { userId: req.params.userId });
            res.status(404).json({ message: 'User not found' });
            return;
        }

        logger.info('User updated successfully', { userId: updatedUser.userId });
        res.status(200).json({ message: 'User updated successfully', user: updatedUser });
    } catch (error: any) {
        logger.error('Error updating user', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error updating user' });
    }
};

export const deleteUser: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const deletedUser = await User.findOneAndDelete({ userId: req.params.userId });

        if (!deletedUser) {
            logger.warn('User not found for deletion', { userId: req.params.userId });
            res.status(404).json({ message: 'User not found' });
            return;
        }

        logger.info('User deleted successfully', { userId: deletedUser.userId });
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error: any) {
        logger.error('Error deleting user', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error deleting user' });
    }
};

export const followUser: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId } = req.params;
        const { followUserId } = req.body;

        const user = await User.findOne({ userId });
        const userToFollow = await User.findOne({ userId: followUserId });

        if (!user || !userToFollow) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        if (user.following?.includes(followUserId)) {
            res.status(400).json({ message: 'Already following this user' });
            return;
        }

        user.following?.push(followUserId);
        userToFollow.follower?.push(userId);

        await user.save();
        await userToFollow.save();

        res.status(200).json({ message: 'Followed user successfully' });
    } catch (error: any) {
        res.status(500).json({ message: 'Error following user' });
    }
};

export const unfollowUser: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId } = req.params;
        const { unfollowUserId } = req.body;

        const user = await User.findOne({ userId });
        const userToUnfollow = await User.findOne({ userId: unfollowUserId });

        if (!user || !userToUnfollow) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        user.following = user.following?.filter(id => id !== unfollowUserId);
        userToUnfollow.follower = userToUnfollow.follower?.filter(id => id !== userId);

        await user.save();
        await userToUnfollow.save();

        res.status(200).json({ message: 'Unfollowed user successfully' });
    } catch (error: any) {
        res.status(500).json({ message: 'Error unfollowing user' });
    }
};

export const getFollowStats: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await User.findOne({ userId: req.params.userId });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        res.status(200).json({
            followersCount: user.follower?.length ?? 0,
            followingCount: user.following?.length ?? 0,
        });
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching follow stats' });
    }
};

export const createPost: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId } = req.params;
        const { image, title, content, tags, description, badges, author } = req.body;

        const user = await User.findOne({ userId });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const tagsArray = Array.isArray(tags) ? tags : ['defaultTag'];
        const badgesArray = Array.isArray(badges) ? badges : ['defaultBadge'];

        const newPost = {
            identifier: Math.random().toString(36).substring(2, 15),
            image,
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
        res.status(500).json({ message: 'Error creating post' });
    }
};

export const getAllPosts: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await User.findOne({ userId: req.params.userId });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        res.status(200).json(user.posts);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching posts' });
    }
};

export const viewPost: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await User.findOne({ userId: req.params.userId });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const post = user.posts?.find((post) => post.identifier === req.params.postId);

        if (!post) {
            res.status(404).json({ message: 'Post not found' });
            return;
        }

        res.status(200).json(post);
    } catch (error: any) {
        res.status(500).json({ message: 'Error viewing post' });
    }
};

export const updatePost: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await User.findOne({ userId: req.params.userId });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const post = user.posts?.find((post) => post.identifier === req.params.postId);

        if (!post) {
            res.status(404).json({ message: 'Post not found' });
            return;
        }

        Object.assign(post, req.body);
        await user.save();

        res.status(200).json({ message: 'Post updated successfully', post });
    } catch (error: any) {
        res.status(500).json({ message: 'Error updating post' });
    }
};

export const deletePost: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await User.findOne({ userId: req.params.userId });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const postIndex = user.posts?.findIndex((post) => post.identifier === req.params.postId);

        if (postIndex === undefined || postIndex === -1) {
            res.status(404).json({ message: 'Post not found' });
            return;
        }

        user.posts?.splice(postIndex, 1);
        await user.save();

        res.status(200).json({ message: 'Post deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ message: 'Error deleting post' });
    }
};

export const updateUserAccount: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.params.userId;
        const user = await User.findOne({ userId });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const updatedUser = await User.findOneAndUpdate(
            { userId },
            { ...req.body },
            { new: true }
        );

        res.status(200).json({
            message: 'Account updated successfully',
            user: updatedUser,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while updating the account' });
    }
};

export const updatePassword: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const userId = req.params.userId;

        const user = await User.findOne({ userId });

        if (!user || !user.password) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const passwordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatch) {
            res.status(400).json({ message: 'Current password is incorrect' });
            return;
        }

        if (newPassword !== confirmPassword) {
            res.status(400).json({ message: 'Passwords do not match' });
            return;
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating password' });
    }
};

export const enableTwoFactorAuthentication = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.params.userId;

        if (!userId) {
            res.status(401).json({ message: 'User ID is missing' });
            return;
        }

        const user = await User.findOne({ userId });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const setup = await setupAuthenticator(user);
        user.twoFactorSecret = setup.secret;
        user.isTwoFactorEnabled = true;
        await user.save();

        res.status(200).json({
            message: 'Two-factor authentication enabled',
            qrCode: setup.qrCode,
            secret: setup.secret,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while enabling two-factor authentication' });
    }
};

export const disableTwoFactorAuthentication = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.params.userId;

        if (!userId) {
            res.status(401).json({ message: 'User ID is missing' });
            return;
        }

        const user = await User.findOne({ userId });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        user.isTwoFactorEnabled = false;
        user.twoFactorSecret = "";
        user.twoFactorBackupCodes = [];
        await user.save();

        res.status(200).json({ message: 'Two-factor authentication disabled' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while disabling two-factor authentication' });
    }
};

export const verifyTwoFactorCode = async (req: Request, res: Response): Promise<void> => {
    try {
        const { verificationCode } = req.body;
        const userId = req.params.userId;

        if (!userId) {
            res.status(401).json({ message: 'User ID is missing' });
            return;
        }

        const user = await User.findOne({ userId });

        if (!user || !user.isTwoFactorEnabled) {
            res.status(404).json({ message: 'User or 2FA not found' });
            return;
        }

        const isVerified = await verifyAuthenticator(user.twoFactorSecret as string, verificationCode);

        if (!isVerified) {
            res.status(400).json({ message: 'Invalid verification code' });
            return;
        }

        res.status(200).json({ message: 'Two-factor authentication verified successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while verifying the two-factor code' });
    }
};

export const generateRecoveryCodes = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.params.userId;

        if (!userId) {
            res.status(401).json({ message: 'User ID is missing' });
            return;
        }

        const user = await User.findOne({ userId });

        if (!user || !user.isTwoFactorEnabled) {
            res.status(404).json({ message: 'User or 2FA not found' });
            return;
        }

        const recoveryCodes = generateRecoveryCodesUtil();
        user.twoFactorBackupCodes = recoveryCodes;
        await user.save();

        res.status(200).json({ message: 'Recovery codes generated', recoveryCodes });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while generating recovery codes' });
    }
};