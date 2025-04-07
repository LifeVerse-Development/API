export interface IPost {
    identifier: string;
    image?: string;
    title?: string;
    description?: string;
    content: string;
    tags: string[];
    badges: string[];
    author: string;
    createdAt: Date;
    updatedAt: Date;
}
