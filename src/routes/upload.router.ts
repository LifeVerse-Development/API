import express from 'express';
import { uploadSingle } from '../services/multer.service';
import {
    createUpload,
    getUpload,
    getAllUploads,
    updateUpload,
    deleteUpload,
    getUploadsByUser,
    getUploadsByType,
} from '../controllers/upload.controller';
import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';
import { cacheMiddleware } from '../middlewares/cache.middleware';

const router = express.Router();

router.use(cacheMiddleware());

router.post('/', uploadSingle('file'), isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), createUpload);
router.get('/', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getAllUploads);
router.get('/:uploadId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getUpload);
router.put('/:uploadId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), updateUpload);
router.delete('/:uploadId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deleteUpload);

router.get('/user/:userId', isAuthenticated, getUploadsByUser);
router.get('/type/:fileType', isAuthenticated, getUploadsByType);

export default router;
