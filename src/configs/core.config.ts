import dotenv from 'dotenv';

dotenv.config();

export const core = {
    name: String(process.env.NAME),
    version: String(process.env.VERSION),
    repository: String(process.env.REPOSITORY),
    documentation: String(process.env.DOCUMENTATION),
}