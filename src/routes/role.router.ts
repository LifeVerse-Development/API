import { Router } from 'express';
import { createRole, getAllRoles, getRoleById, updateRole, deleteRole, assignRoleToUser } from '../controllers/role.controller';
import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';
import { cacheMiddleware } from '../middlewares/cache.middleware';

const router = Router();

router.use(cacheMiddleware());

router.post('/', isAuthenticated, hasRole('Admin', 'Moderator'), createRole);
router.get('/', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getAllRoles);
router.get('/:roleId', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getRoleById);
router.put('/:roleId', isAuthenticated, hasRole('Admin', 'Moderator'), updateRole);
router.delete('/:roleId', isAuthenticated, hasRole('Admin'), deleteRole);
router.post('/assign', isAuthenticated, hasRole('Admin', 'Moderator'), assignRoleToUser);

export default router;
