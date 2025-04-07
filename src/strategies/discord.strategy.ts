import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { User } from '../models/User';
import { discord } from '../configs/discord.config';
import { logger } from '../services/logger.service';
import { invalidateCache } from '../middlewares/cache.middleware';

// Define types for better type safety
interface DiscordProfile {
    id: string;
    username: string;
    email?: string;
    avatar?: string;
}

// Cache key patterns for better cache management
const CACHE_KEYS = {
    USER_BY_ID: (id: string) => `users:${id}`,
    USER_BY_DISCORD_ID: (id: string) => `users:discord:${id}`,
};

// Serialize user to session - only store the ID
passport.serializeUser((user: any, done) => {
    try {
        logger.debug('Serializing user', { userId: user.id });
        done(null, user.id);
    } catch (error) {
        logger.error('Error during user serialization', { error });
        done(error);
    }
});

// Deserialize user from session - retrieve user from database
passport.deserializeUser(async (id: string, done) => {
    try {
        const user = await User.findById(id, {
            username: 1,
            userId: 1,
            email: 1,
            accessToken: 1,
            roles: 1,
            profilePicture: 1
        }).lean().exec();

        if (user) {
            logger.debug('User deserialized', { userId: id });
            return done(null, user);
        }

        logger.warn('User not found during deserialization', { userId: id });
        return done(null, false);
    } catch (error: any) {
        logger.error('Error during user deserialization', {
            error: error.message,
            userId: id
        });
        return done(error);
    }
});

// Configure Discord strategy
passport.use(
    new DiscordStrategy(
        {
            clientID: discord.clientId,
            clientSecret: discord.clientSecret,
            callbackURL: discord.callbackUrl,
            scope: ['identify', 'email'],
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const discordProfile = profile as unknown as DiscordProfile;
                logger.info('Processing Discord authentication', {
                    discordUserId: discordProfile.id
                });

                const user = await User.findOneAndUpdate(
                    { userId: discordProfile.id },
                    {
                        $set: {
                            accessToken,
                            refreshToken,
                            updatedAt: new Date()
                        },
                        $setOnInsert: {
                            identifier: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
                            username: discordProfile.username,
                            userId: discordProfile.id,
                            email: discordProfile.email,
                            profilePicture: discordProfile.avatar ?
                                `https://cdn.discordapp.com/avatars/${discordProfile.id}/${discordProfile.avatar}.png` :
                                undefined,
                            createdAt: new Date(),
                        }
                    },
                    {
                        new: true,
                        upsert: true,
                        runValidators: true,
                        lean: true
                    }
                );

                // Invalidate user cache
                await invalidateCache([
                    CACHE_KEYS.USER_BY_ID(user?._id.toString() as string),
                    CACHE_KEYS.USER_BY_DISCORD_ID(discordProfile.id)
                ]);

                logger.info('Discord authentication successful', {
                    userId: user?._id,
                    isNewUser: user?.createdAt === user?.updatedAt
                });

                done(null, user as any);
            } catch (error: any) {
                // More specific error handling
                if (error.name === 'MongoServerError' && error.code === 11000) {
                    logger.error('Duplicate key error during Discord OAuth', {
                        error: error.message,
                        keyPattern: error.keyPattern
                    });
                } else {
                    logger.error('Error during Discord OAuth process', {
                        error: error.message,
                        stack: error.stack
                    });
                }
                done(error);
            }
        },
    ),
);
