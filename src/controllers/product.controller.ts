import type { Request, Response, RequestHandler, NextFunction } from "express"
import Product from "../models/Product"
import { logger } from "../services/logger.service"
import { asyncHandler } from "../utils/asyncHandler.util"
import { invalidateCache } from "../middlewares/cache.middleware"
import { uploadSingle, getFileUrl, deleteFile } from "../services/multer.service"
import multer from "multer"

// Cache key patterns for better cache management
const CACHE_KEYS = {
    ALL_PRODUCTS: "products:all",
    PRODUCT_BY_ID: (id: string) => `products:${id}`,
    PRODUCTS_BY_CATEGORY: (category: string) => `products:category:${category}`,
    RELATED_PRODUCTS: (id: string) => `products:related:${id}`,
    PRODUCT_REVIEWS: (id: string) => `products:${id}:reviews`,
    BESTSELLERS: "products:bestsellers",
    NEW_PRODUCTS: "products:new",
}

/**
 * @desc    Get all products with pagination and filtering
 * @route   GET /api/products
 * @access  Public
 */
export const getAllProducts: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Add filtering options
    const filter: any = {}

    if (req.query.query) {
        filter.name = { $regex: req.query.query as string, $options: "i" }
    }

    if (req.query.category) {
        filter.category = req.query.category as string
    }

    if (req.query.minPrice) {
        filter.price = { ...filter.price, $gte: Number(req.query.minPrice) }
    }

    if (req.query.maxPrice) {
        filter.price = { ...filter.price, $lte: Number(req.query.maxPrice) }
    }

    // Use lean() and exec() for better performance
    const products = await Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec()

    const total = await Product.countDocuments(filter)

    // Get unique categories for filtering UI
    const categories = await Product.distinct("category").exec()

    logger.info("Fetched all products with categories", { count: products.length, categories })
    res.status(200).json({
        products,
        categories,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Get product by ID
 * @route   GET /api/products/:id
 * @access  Public
 */
export const getProductById: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id: productId } = req.params

    // Use lean() for better performance
    const product = await Product.findById(productId).lean().exec()

    if (!product) {
        logger.warn("Product not found", { productId })
        res.status(404).json({ message: "Product not found" })
        return
    }

    logger.info("Fetched product by ID", { productId })
    res.status(200).json(product)
})

/**
 * Middleware for handling product image uploads
 */
export const handleProductImageUpload = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Only process if there's an image to upload
        if (req.body.uploadImage === 'true' || req.query.uploadImage === 'true') {
            await new Promise<void>((resolve, reject) => {
                uploadSingle('productImage', {
                    fileTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] 
                })(req, res, (err: any) => {
                    if (err) {
                        logger.error(`Error uploading product image`, { error: err.message });
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
            
            // If image was uploaded successfully, add it to the images array
            if (req.file) {
                const imageUrl = getFileUrl(req.file.filename);
                if (!req.body.images) {
                    req.body.images = [imageUrl];
                } else if (Array.isArray(req.body.images)) {
                    req.body.images.push(imageUrl);
                } else {
                    req.body.images = [req.body.images, imageUrl];
                }
            }
        }
        
        next();
    } catch (error: any) {
        logger.error("Error in handleProductImageUpload middleware", { error: error.message, stack: error.stack });
        res.status(400).json({
            message: "Product image upload failed",
            error: error.message
        });
        return;
    }
});

/**
 * Middleware for handling multiple product image uploads
 */
export const handleMultipleProductImages = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Configure multer for multiple file uploads
        const upload = multer({
            storage: multer.diskStorage({
                destination: (_req, _file, cb) => {
                    cb(null, './uploads');
                },
                filename: (_req, file, cb) => {
                    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                    cb(null, file.fieldname + '-' + uniqueSuffix + '.' + file.originalname.split('.').pop());
                }
            }),
            limits: {
                fileSize: 5 * 1024 * 1024, // 5MB
            },
            fileFilter: (_req, file, cb) => {
                if (file.mimetype.startsWith('image/')) {
                    cb(null, true);
                } else {
                    cb(new Error('Only image files are allowed'));
                }
            }
        }).array('productImages', 5); // Allow up to 5 images

        // Process the upload
        await new Promise<void>((resolve, reject) => {
            upload(req, res, (err: any) => {
                if (err) {
                    logger.error(`Error uploading multiple product images`, { error: err.message });
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        // If images were uploaded successfully, add them to the images array
        if (req.files && Array.isArray(req.files)) {
            const imageUrls = (req.files as Express.Multer.File[]).map(file => getFileUrl(file.filename));
            
            if (!req.body.images) {
                req.body.images = imageUrls;
            } else if (Array.isArray(req.body.images)) {
                req.body.images = [...req.body.images, ...imageUrls];
            } else {
                req.body.images = [req.body.images, ...imageUrls];
            }
        }
        
        next();
    } catch (error: any) {
        logger.error("Error in handleMultipleProductImages middleware", { error: error.message, stack: error.stack });
        res.status(400).json({
            message: "Multiple product images upload failed",
            error: error.message
        });
        return;
    }
});

/**
 * @desc    Create product
 * @route   POST /api/products
 * @access  Private/Admin
 */
export const createProduct: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, price, category, description, stock, images } = req.body

    if (!name || !price || !category) {
        res.status(400).json({ message: "Name, price, and category are required" })
        return
    }

    // Process images from file uploads if available
    const productImages = req.files ?
        Array.isArray(req.files) ?
            (req.files as Express.Multer.File[]).map(file => getFileUrl(file.filename)) :
            req.file ? [getFileUrl(req.file.filename)] : images || []
        : images || [];

    const product = new Product({
        name,
        price,
        category,
        description,
        stock: stock || 0,
        images: productImages,
        createdAt: new Date(),
        updatedAt: new Date(),
    })

    await product.save()

    // Invalidate relevant caches
    await invalidateCache([CACHE_KEYS.ALL_PRODUCTS, CACHE_KEYS.PRODUCTS_BY_CATEGORY(category), CACHE_KEYS.NEW_PRODUCTS])

    logger.info("New product created", { productId: product._id, name })
    res.status(201).json(product)
})

/**
 * @desc    Update product
 * @route   PUT /api/products/:id
 * @access  Private/Admin
 */
export const updateProduct: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id: productId } = req.params
    const updateData = { ...req.body, updatedAt: new Date() }

    // Get the original product for cache invalidation
    const originalProduct = await Product.findById(productId).lean().exec()

    if (!originalProduct) {
        logger.warn("Product not found for update", { productId })
        res.status(404).json({ message: "Product not found" })
        return
    }

    // Handle image updates
    if (req.files && Array.isArray(req.files) && (req.files as Express.Multer.File[]).length > 0) {
        // Add new images to the existing ones
        const newImageUrls = (req.files as Express.Multer.File[]).map(file => getFileUrl(file.filename));
        
        if (!updateData.images) {
            updateData.images = [...(originalProduct.images || []), ...newImageUrls];
        } else if (Array.isArray(updateData.images)) {
            updateData.images = [...updateData.images, ...newImageUrls];
        } else {
            updateData.images = [updateData.images, ...newImageUrls];
        }
    } else if (req.file) {
        // Single file upload
        const newImageUrl = getFileUrl(req.file.filename);
        
        if (!updateData.images) {
            updateData.images = [...(originalProduct.images || []), newImageUrl];
        } else if (Array.isArray(updateData.images)) {
            updateData.images.push(newImageUrl);
        } else {
            updateData.images = [updateData.images, newImageUrl];
        }
    }

    // Handle image deletions if specified
    if (req.body.deleteImages && Array.isArray(req.body.deleteImages) && req.body.deleteImages.length > 0) {
        // Delete the specified images
        for (const imageUrl of req.body.deleteImages) {
            // Extract filename from URL
            const filename = imageUrl.split('/').pop();
            if (filename) {
                await deleteFile(filename);
            }
        }
        
        // Remove deleted images from the images array
        if (updateData.images && Array.isArray(updateData.images)) {
            updateData.images = updateData.images.filter((img: string) => !req.body.deleteImages.includes(img));
        } else if (originalProduct.images) {
            updateData.images = originalProduct.images.filter(img => !req.body.deleteImages.includes(img));
        }
    }

    // Use findOneAndUpdate with projection for better performance
    const product = await Product.findByIdAndUpdate(productId, { $set: updateData }, { new: true, runValidators: true })
        .lean()
        .exec()

    // Prepare cache keys to invalidate
    const keysToInvalidate = [
        CACHE_KEYS.ALL_PRODUCTS,
        CACHE_KEYS.PRODUCT_BY_ID(productId),
        CACHE_KEYS.RELATED_PRODUCTS(productId),
    ]

    // Add category-related cache keys if category changed
    if (originalProduct.category !== product?.category) {
        keysToInvalidate.push(
            CACHE_KEYS.PRODUCTS_BY_CATEGORY(originalProduct.category),
            CACHE_KEYS.PRODUCTS_BY_CATEGORY(product?.category as string),
        )
    }

    // Invalidate bestsellers and new products caches if price or stock changed
    if (originalProduct.price !== product?.price || originalProduct.stock !== product.stock) {
        keysToInvalidate.push(CACHE_KEYS.BESTSELLERS)
    }

    // Invalidate relevant caches
    await invalidateCache(keysToInvalidate)

    logger.info("Product updated successfully", { productId, name: product?.name })
    res.status(200).json(product)
})

/**
 * @desc    Delete product
 * @route   DELETE /api/products/:id
 * @access  Private/Admin
 */
export const deleteProduct: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id: productId } = req.params

    // Get the product for cache invalidation
    const product = await Product.findById(productId).lean().exec()

    if (!product) {
        logger.warn("Product not found for deletion", { productId })
        res.status(404).json({ message: "Product not found" })
        return
    }

    // Delete all associated images
    if (product.images && Array.isArray(product.images)) {
        for (const imageUrl of product.images) {
            // Extract filename from URL
            const filename = imageUrl.split('/').pop();
            if (filename) {
                await deleteFile(filename);
            }
        }
    }

    // Delete the product
    await Product.deleteOne({ _id: productId })

    // Invalidate relevant caches
    await invalidateCache([
        CACHE_KEYS.ALL_PRODUCTS,
        CACHE_KEYS.PRODUCT_BY_ID(productId),
        CACHE_KEYS.PRODUCTS_BY_CATEGORY(product.category),
        CACHE_KEYS.RELATED_PRODUCTS(productId),
        CACHE_KEYS.PRODUCT_REVIEWS(productId),
        CACHE_KEYS.BESTSELLERS,
        CACHE_KEYS.NEW_PRODUCTS,
    ])

    logger.info("Product deleted successfully", { productId, name: product.name })
    res.status(200).json({ message: "Product deleted successfully" })
})

/**
 * @desc    Get related products
 * @route   GET /api/products/:id/related
 * @access  Public
 */
export const getRelatedProducts: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id: productId } = req.params
    const limit = Number(req.query.limit) || 5

    // Get the product to find its category
    const product = await Product.findById(productId).lean().exec()

    if (!product) {
        logger.warn("Product not found for related query", { productId })
        res.status(404).json({ message: "Product not found" })
        return
    }

    // Find related products by category, excluding the current product
    const relatedProducts = await Product.find({
        category: product.category,
        _id: { $ne: productId },
    })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec()

    logger.info("Fetched related products", { productId, count: relatedProducts.length })
    res.status(200).json(relatedProducts)
})

/**
 * @desc    Get product reviews
 * @route   GET /api/products/:id/reviews
 * @access  Public
 */
export const getReviews: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id: productId } = req.params

    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 10
    const skip = (page - 1) * limit

    // Use projection to only get the reviews field for better performance
    const product = await Product.findById(productId, { reviews: 1 }).lean().exec()

    if (!product) {
        logger.warn("Product not found for reviews", { productId })
        res.status(404).json({ message: "Product not found" })
        return
    }

    // Sort reviews by date in descending order (newest first)
    const reviews = product.reviews || []
    reviews.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Apply pagination
    const paginatedReviews = reviews.slice(skip, skip + limit)
    const total = reviews.length

    logger.info("Fetched product reviews", { productId, count: paginatedReviews.length })
    res.status(200).json({
        reviews: paginatedReviews,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
})

/**
 * @desc    Add review to product
 * @route   POST /api/products/:id/reviews
 * @access  Private
 */
export const addReview: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id: productId } = req.params
    const { user, rating, comment } = req.body

    if (!user || !rating) {
        res.status(400).json({ message: "User and rating are required" })
        return
    }

    // Check if user already reviewed this product
    const existingReview = await Product.findOne({
        _id: productId,
        "reviews.user": user,
    })
        .lean()
        .exec()

    if (existingReview) {
        // Update existing review
        await Product.updateOne(
            { _id: productId, "reviews.user": user },
            {
                $set: {
                    "reviews.$.rating": rating,
                    "reviews.$.comment": comment,
                    "reviews.$.updatedAt": new Date(),
                },
                updatedAt: new Date(),
            },
        )
    } else {
        // Add new review
        const newReview = {
            user,
            rating,
            comment,
            createdAt: new Date(),
            updatedAt: new Date(),
        }

        await Product.updateOne(
            { _id: productId },
            {
                $push: { reviews: newReview },
                $set: { updatedAt: new Date() },
            },
        )
    }

    // Recalculate average rating
    const product = await Product.findById(productId, { reviews: 1 }).lean().exec()

    if (product && product.reviews && product.reviews.length > 0) {
        const totalRating = product.reviews.reduce((sum: number, review: any) => sum + review.rating, 0)
        const averageRating = totalRating / product.reviews.length

        await Product.updateOne({ _id: productId }, { $set: { averageRating: Math.round(averageRating * 10) / 10 } })
    }

    // Invalidate relevant caches
    await invalidateCache([CACHE_KEYS.PRODUCT_BY_ID(productId), CACHE_KEYS.PRODUCT_REVIEWS(productId)])

    logger.info("Added review to product", { productId, user })
    res.status(201).json({ message: "Review added successfully" })
})

/**
 * @desc    Get bestseller products
 * @route   GET /api/products/bestsellers
 * @access  Public
 */
export const getBestsellers: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = Number(req.query.limit) || 10

    // Find products with highest sales count
    const bestsellers = await Product.find({ stock: { $gt: 0 } })
        .sort({ salesCount: -1, averageRating: -1 })
        .limit(limit)
        .lean()
        .exec()

    logger.info("Fetched bestseller products", { count: bestsellers.length })
    res.status(200).json(bestsellers)
})

/**
 * @desc    Get new products (added in the last 2 weeks)
 * @route   GET /api/products/new
 * @access  Public
 */
export const getNewProducts: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = Number(req.query.limit) || 10

    // Calculate date 2 weeks ago
    const twoWeeksAgo = new Date()
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

    // Find products created in the last 2 weeks
    const newProducts = await Product.find({
        createdAt: { $gte: twoWeeksAgo },
        stock: { $gt: 0 },
    })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec()

    logger.info("Fetched new products", { count: newProducts.length })
    res.status(200).json(newProducts)
})

