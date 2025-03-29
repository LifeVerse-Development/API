import express from "express";
import { 
    getAllProducts, 
    getProductById, 
    getRelatedProducts,
    createProduct, 
    updateProduct, 
    deleteProduct 
} from "../controllers/product.controller";
import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';

const router = express.Router();

router.get("/", getAllProducts);
router.get("/search", getAllProducts);
router.get("/:productId", getProductById);
router.get("/:productId/related", getRelatedProducts);

router.post("/", isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), createProduct);
router.put("/:productId", isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), updateProduct);
router.delete("/:productId", isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deleteProduct);

export default router;
