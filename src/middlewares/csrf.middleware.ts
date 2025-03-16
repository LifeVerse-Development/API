import csurf from 'csurf';
import cookieParser from 'cookie-parser';
import { Request, Response, NextFunction } from 'express';
import { application } from '../configs/application.config';

const getCookieOptions = (env: string) => ({
    httpOnly: true,
    secure: env === 'production',
    sameSite: 'Strict',
    maxAge: 24 * 60 * 60 * 1000,
});

export const csrfMiddleware = (cookieOptions: object = getCookieOptions(application.env)) => {
    return [
        cookieParser(),
        csurf({ cookie: cookieOptions }),
        (req: Request, res: Response, next: NextFunction) => {
            if (!req.cookies.csrfToken) {
                res.cookie('csrfToken', req.csrfToken(), cookieOptions);
            }            
            next();
        },
    ];
};
