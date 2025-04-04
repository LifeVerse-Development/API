import { Express } from 'express';
import { DiscordUser } from './DiscordUser';

declare global {
    namespace Express {
        interface User {
            user?: DiscordUser;
            userId: string;
            role: string;
        }
    }
}