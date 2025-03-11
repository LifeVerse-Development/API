import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { User } from '../models/User';
import { config } from '../configs/config';
import { logger } from '../services/logger.service';

passport.serializeUser((user: any, done) => {
    try {
        logger.info('🔄 Serializing user', { userId: user.id });
        done(null, user.id);
    } catch (error) {
        logger.error('❌ Error during user serialization', { error });
        done(error);
    }
});

passport.deserializeUser(async (id: string, done) => {
    try {
        logger.info('Deserializing user', { userId: id });

        const user = await User.findById(id).lean();
        if (user) {
            logger.info('User found during deserialization', { userId: id });
            return done(null, user);
        }

        logger.warn('User not found during deserialization', { userId: id });
        return done(null, false);
    } catch (error: any) {
        logger.error('Error during user deserialization', { error: error.message, stack: error.stack });
        return done(error);
    }
});

passport.use(new DiscordStrategy({
    clientID: config.discord.clientId,
    clientSecret: config.discord.clientSecret,
    callbackURL: config.discord.callbackUrl,
    scope: ['identify', 'email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        logger.info('Discord OAuth callback', { discordUserId: profile.id, username: profile.username });

        let user = await User.findOne({ userId: profile.id });

        if (!user) {
            logger.info('No user found, creating new user', { discordUserId: profile.id, username: profile.username });

            user = new User({
                identifier: Math.random().toString(36).substring(2, 15),
                username: profile.username,
                userId: profile.id,
                socketId: '',
                accessToken,
                refreshToken,
            });

            await user.save();
            logger.info('New user created', { userId: user.id });
        } else {
            if (user.accessToken !== accessToken || user.refreshToken !== refreshToken) {
                logger.info('Updating tokens', { userId: user.id });
                user.accessToken = accessToken;
                user.refreshToken = refreshToken;
                await user.save();
            } else {
                logger.info('User tokens unchanged, skipping DB write', { userId: user.id });
            }
        }

        done(null, user);
    } catch (error: any) {
        logger.error('Error during Discord OAuth process', { error: error.message, stack: error.stack });
        done(error);
    }
}));
