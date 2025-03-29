import { Request, Response, RequestHandler } from "express";
import Product from "../models/Product";
import { logger } from "../services/logger.service";

export const getAllProducts: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { query, category } = req.query;

        const filter: any = {};
        if (query) {
            filter.name = { $regex: query as string, $options: "i" };
        }
        if (category) {
            filter.category = category as string;
        }

        const products = await Product.find(filter);
        const categories = [...new Set(products.map((product) => product.category))];

        logger.info("Fetched all products with categories", { count: products.length, categories });
        res.status(200).json({ products, categories });
    } catch (error: any) {
        logger.error("Error fetching products", { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error fetching products" });
    }
};

export const getProductById: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id: productId } = req.params;

        const product = await Product.findById(productId);
        if (!product) {
            logger.warn("Product not found", { productId });
            res.status(404).json({ message: "Product not found" });
            return;
        }

        logger.info("Fetched product by ID", { productId });
        res.status(200).json(product);
    } catch (error: any) {
        logger.error("Error fetching product by ID", { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error fetching product" });
    }
};

export const createProduct: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, price, category, description, stock } = req.body;

        const product = new Product({ name, price, category, description, stock });
        await product.save();

        logger.info("New product created", { productId: product._id });
        res.status(201).json(product);
    } catch (error: any) {
        logger.error("Error creating product", { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error creating product" });
    }
};

export const updateProduct: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id: productId } = req.params;
        const { name, price, category, description, stock } = req.body;

        const product = await Product.findByIdAndUpdate(
            productId,
            { name, price, category, description, stock },
            { new: true, runValidators: true }
        );

        if (!product) {
            logger.warn("Product not found for update", { productId });
            res.status(404).json({ message: "Product not found" });
            return;
        }

        logger.info("Product updated successfully", { productId });
        res.status(200).json(product);
    } catch (error: any) {
        logger.error("Error updating product", { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error updating product" });
    }
};

export const deleteProduct: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id: productId } = req.params;

        const product = await Product.findByIdAndDelete(productId);
        if (!product) {
            logger.warn("Product not found for deletion", { productId });
            res.status(404).json({ message: "Product not found" });
            return;
        }

        logger.info("Product deleted successfully", { productId });
        res.status(200).json({ message: "Product deleted successfully" });
    } catch (error: any) {
        logger.error("Error deleting product", { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error deleting product" });
    }
};

export const getRelatedProducts: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id: productId } = req.params;

        const product = await Product.findById(productId);
        if (!product) {
            logger.warn("Product not found for related query", { productId });
            res.status(404).json({ message: "Product not found" });
            return;
        }

        const relatedProducts = await Product.find({
            category: product.category,
            _id: { $ne: product._id },
        }).limit(5);

        logger.info("Fetched related products", { productId, count: relatedProducts.length });
        res.status(200).json(relatedProducts);
    } catch (error: any) {
        logger.error("Error fetching related products", { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error fetching related products" });
    }
};

export const getReviews: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id: productId } = req.params;

        const product = await Product.findById(productId).select("reviews");
        if (!product) {
            logger.warn("Product not found for reviews", { productId });
            res.status(404).json({ message: "Product not found" });
            return;
        }

        logger.info("Fetched product reviews", { productId, count: product.reviews?.length });
        res.status(200).json(product.reviews);
    } catch (error: any) {
        logger.error("Error fetching product reviews", { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error fetching product reviews" });
    }
};

export const addReview: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id: productId } = req.params;
        const { user, rating, comment } = req.body;

        const product = await Product.findById(productId);
        if (!product) {
            logger.warn("Product not found for adding review", { productId });
            res.status(404).json({ message: "Product not found" });
            return;
        }

        const newReview = { user, rating, comment, createdAt: new Date() };
        product.reviews?.push(newReview);
        await product.save();

        logger.info("Added review to product", { productId, review: newReview });
        res.status(201).json({ message: "Review added successfully", review: newReview });
    } catch (error: any) {
        logger.error("Error adding review", { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error adding review" });
    }
};
