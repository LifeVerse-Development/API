import { Router } from 'express';
import {
    createMaintenance,
    getAllMaintenance,
    getMaintenanceById,
    updateMaintenance,
    deleteMaintenance,
} from '../controllers/maintenance.controller';
import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';
import { cacheMiddleware } from '../middlewares/cache.middleware';

const router = Router();

router.use(cacheMiddleware());

router.post('/', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), createMaintenance);
router.get('/', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getAllMaintenance);
router.get('/:maintenanceId', getMaintenanceById);
router.put('/:maintenanceId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), updateMaintenance);
router.delete('/:maintenanceId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), deleteMaintenance);

export default router;
