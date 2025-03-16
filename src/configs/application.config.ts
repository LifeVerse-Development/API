import dotenv from 'dotenv';

dotenv.config();

export const application = {
    env: String(process.env.ENVIRONMENT || 'development'),
    port: parseInt(process.env.PORT || '3000'),
    cors: {
        allowedOrigins: String(process.env.CORS_ALLOWED_ORIGINS),
    },
    bodyParser: {
        jsonLimit: String(process.env.BODY_PARSER_JSON_LIMIT),
        urlencodedLimit: String(process.env.BODY_PARSER_URLENCODED_LIMIT),
        extended: Boolean(process.env.BODY_PARSER_EXTENDED),
        jsonTypes: String(process.env.BODY_PARSER_JSON_TYPES),
        urlencodedTypes: String(process.env.BODY_PARSER_URLENCODED_TYPES),
    },
    session: {
        secret: String(process.env.SESSION_SECRET),
        cookie: {
            maxAge: Number(process.env.SESSION_COOKIE_MAX_AGE),
            secure: Boolean(process.env.SESSION_COOKIE_SECURE),
        },
        resave: Boolean(process.env.SESSION_RESAVE),
        saveUninitialized: Boolean(process.env.SESSION_SAVE_UNINITIALIZED),
        name: String(process.env.SESSION_NAME),  
    }
}