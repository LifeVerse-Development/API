import { Request, Response, RequestHandler } from 'express';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { logger } from '../services/logger.service';
import { asyncHandler } from '../utils/asyncHandler.util';
import { withCache } from '../utils/withCache.util';

export const createRole: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const { color, name, permissions } = req.body;

            if (!color || !name || !permissions || !Array.isArray(permissions)) {
                logger.warn('Missing color, name, or permissions', { color, name, permissions });
                res.status(400).json({ message: 'Color, name, and permissions are required' });
                return;
            }

            logger.info('Checking if role already exists', { name });
            const roleExists = await Role.findOne({ name });
            if (roleExists) {
                logger.warn('Role already exists', { name });
                res.status(400).json({ message: 'Role already exists' });
                return;
            }

            const newRole = new Role({
                identifier: Math.random().toString(36).substring(2, 15),
                color,
                name,
                permissions,
            });
            await newRole.save();

            logger.info('Role created successfully', { name, permissions });
            res.status(201).json({ message: 'Role created successfully', role: newRole });
        } catch (error: any) {
            logger.error('Error creating role', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Internal server error' });
        }
    }),
);

export const getAllRoles: RequestHandler = withCache(
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
        try {
            const roles = await Role.find();
            logger.info('Fetched all roles', { count: roles.length });
            res.status(200).json(roles);
        } catch (error: any) {
            logger.error('Error fetching roles', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Error fetching roles' });
        }
    }),
);

export const getRoleById: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const { roleId } = req.params;
            const role = await Role.findById(roleId);
            if (!role) {
                logger.warn('Role not found', { roleId });
                res.status(404).json({ message: 'Role not found' });
                return;
            }

            const usersWithRole = await User.find({ role: roleId });
            logger.info('Role fetched successfully', { roleId, role });

            res.status(200).json({ role, users: usersWithRole });
        } catch (error: any) {
            logger.error('Error fetching role by ID', { roleId: req.params.roleId, error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Error fetching role' });
        }
    }),
);

export const updateRole: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const { roleId } = req.params;
            const { color, name, permissions } = req.body;

            if (!color || !name || !permissions || !Array.isArray(permissions)) {
                logger.warn('Missing color, name, or permissions for update', { color, name, permissions });
                res.status(400).json({ message: 'Color, name, and permissions are required' });
                return;
            }

            const updatedRole = await Role.findByIdAndUpdate(roleId, { color, name, permissions }, { new: true });

            if (!updatedRole) {
                logger.warn('Role not found for update', { roleId });
                res.status(404).json({ message: 'Role not found' });
                return;
            }

            logger.info('Role updated successfully', { roleId, updatedRole });
            res.status(200).json({ message: 'Role updated successfully', role: updatedRole });
        } catch (error: any) {
            logger.error('Error updating role', { roleId: req.params.roleId, error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Error updating role' });
        }
    }),
);

export const deleteRole: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const { roleId } = req.params;
            const deletedRole = await Role.findByIdAndDelete(roleId);
            if (!deletedRole) {
                logger.warn('Role not found for deletion', { roleId });
                res.status(404).json({ message: 'Role not found' });
                return;
            }

            logger.info('Role deleted successfully', { roleId });
            res.status(200).json({ message: 'Role deleted successfully' });
        } catch (error: any) {
            logger.error('Error deleting role', { roleId: req.params.roleId, error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Error deleting role' });
        }
    }),
);

export const assignRoleToUser: RequestHandler = withCache(
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        try {
            const { userId, roleId } = req.body;

            if (!userId || !roleId) {
                logger.warn('Missing userId or roleId', { userId, roleId });
                res.status(400).json({ message: 'userId and roleId are required' });
                return;
            }

            const role = await Role.findById(roleId);
            if (!role) {
                logger.warn('Role not found', { roleId });
                res.status(404).json({ message: 'Role not found' });
                return;
            }

            const user = await User.findById(userId);
            if (!user) {
                logger.warn('User not found', { userId });
                res.status(404).json({ message: 'User not found' });
                return;
            }

            user.role = roleId;
            await user.save();

            logger.info('Role assigned to user successfully', { userId, roleId });
            res.status(200).json({ message: 'Role assigned successfully', user });
        } catch (error: any) {
            logger.error('Error assigning role to user', { error: error.message, stack: error.stack });
            res.status(500).json({ message: 'Error assigning role to user' });
        }
    }),
);
