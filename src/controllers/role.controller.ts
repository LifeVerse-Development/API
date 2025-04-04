import type { Request, Response, RequestHandler } from "express"
import { Role } from "../models/Role"
import { User } from "../models/User"
import { logger } from "../services/logger.service"
import { asyncHandler } from "../utils/asyncHandler.util"
import { invalidateCache } from "../middlewares/cache.middleware"

// Cache key patterns for better cache management
const CACHE_KEYS = {
    ALL_ROLES: "roles:all",
    ROLE_BY_ID: (id: string) => `roles:${id}`,
    ROLE_BY_NAME: (name: string) => `roles:name:${name}`,
    USERS_BY_ROLE: (roleId: string) => `users:role:${roleId}`,
}

/**
 * @desc    Create a new role
 * @route   POST /api/roles
 * @access  Private/Admin
 */
export const createRole: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { color, name, permissions } = req.body

    if (!color || !name || !permissions || !Array.isArray(permissions)) {
        logger.warn("Missing color, name, or permissions", { color, name, permissions })
        res.status(400).json({ message: "Color, name, and permissions are required" })
        return;
    }

    // Check if role already exists - use lean() for better performance
    const roleExists = await Role.findOne({ name }).lean().exec()
    if (roleExists) {
        logger.warn("Role already exists", { name })
        res.status(400).json({ message: "Role already exists" })
        return;
    }

    const newRole = new Role({
        identifier: Math.random().toString(36).substring(2, 15),
        color,
        name,
        permissions,
        createdAt: new Date(),
        updatedAt: new Date(),
    })

    await newRole.save()

    // Invalidate relevant caches
    await invalidateCache([CACHE_KEYS.ALL_ROLES, CACHE_KEYS.ROLE_BY_NAME(name)])

    logger.info("Role created successfully", { name, permissions })
    res.status(201).json({ message: "Role created successfully", role: newRole })
    return;
})

/**
 * @desc    Get all roles
 * @route   GET /api/roles
 * @access  Private/Admin
 */
export const getAllRoles: RequestHandler = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    // Use lean() and exec() for better performance
    const roles = await Role.find().lean().exec()

    logger.info("Fetched all roles", { count: roles.length })
    res.status(200).json(roles)
    return;
})

/**
 * @desc    Get role by ID with users
 * @route   GET /api/roles/:roleId
 * @access  Private/Admin
 */
export const getRoleById: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { roleId } = req.params

    // Use Promise.all for parallel queries
    const [role, usersWithRole] = await Promise.all([
        Role.findById(roleId).lean().exec(),
        User.find({ role: roleId }, { password: 0, authenticatorSetup: 0 }).lean().exec(),
    ])

    if (!role) {
        logger.warn("Role not found", { roleId })
        res.status(404).json({ message: "Role not found" })
        return;
    }

    logger.info("Role fetched successfully", { roleId, userCount: usersWithRole.length })
    res.status(200).json({ role, users: usersWithRole })
    return;
})

/**
 * @desc    Update role
 * @route   PUT /api/roles/:roleId
 * @access  Private/Admin
 */
export const updateRole: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { roleId } = req.params
    const { color, name, permissions } = req.body

    if (!color || !name || !permissions || !Array.isArray(permissions)) {
        logger.warn("Missing color, name, or permissions for update", { color, name, permissions })
        res.status(400).json({ message: "Color, name, and permissions are required" })
        return;
    }

    // Get the original role for cache invalidation
    const originalRole = await Role.findById(roleId).lean().exec()

    if (!originalRole) {
        logger.warn("Role not found for update", { roleId })
        res.status(404).json({ message: "Role not found" })
        return;
    }

    // Use updateOne for better performance
    const result = await Role.updateOne(
        { _id: roleId },
        {
            $set: {
                color,
                name,
                permissions,
                updatedAt: new Date(),
            },
        },
    )

    if (result.matchedCount === 0) {
        logger.warn("Role not found for update", { roleId })
        res.status(404).json({ message: "Role not found" })
        return;
    }

    // Get the updated role to return in the response
    const updatedRole = await Role.findById(roleId).lean().exec()

    // Invalidate relevant caches
    await invalidateCache([
        CACHE_KEYS.ALL_ROLES,
        CACHE_KEYS.ROLE_BY_ID(roleId),
        CACHE_KEYS.ROLE_BY_NAME(originalRole.name),
        CACHE_KEYS.ROLE_BY_NAME(name),
        CACHE_KEYS.USERS_BY_ROLE(roleId),
    ])

    logger.info("Role updated successfully", { roleId, updatedRole })
    res.status(200).json({ message: "Role updated successfully", role: updatedRole })
    return;
})

/**
 * @desc    Delete role
 * @route   DELETE /api/roles/:roleId
 * @access  Private/Admin
 */
export const deleteRole: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { roleId } = req.params

    // Get the role for cache invalidation
    const role = await Role.findById(roleId).lean().exec()

    if (!role) {
        logger.warn("Role not found for deletion", { roleId })
        res.status(404).json({ message: "Role not found" })
        return;
    }

    // Check if any users have this role
    const usersWithRole = await User.countDocuments({ role: roleId })

    if (usersWithRole > 0) {
        logger.warn("Cannot delete role with assigned users", { roleId, usersCount: usersWithRole })
        res.status(400).json({
            message: "Cannot delete role with assigned users. Please reassign users first.",
            usersCount: usersWithRole,
        })
        return;
    }

    // Use deleteOne for better performance
    await Role.deleteOne({ _id: roleId })

    // Invalidate relevant caches
    await invalidateCache([
        CACHE_KEYS.ALL_ROLES,
        CACHE_KEYS.ROLE_BY_ID(roleId),
        CACHE_KEYS.ROLE_BY_NAME(role.name),
        CACHE_KEYS.USERS_BY_ROLE(roleId),
    ])

    logger.info("Role deleted successfully", { roleId })
    res.status(200).json({ message: "Role deleted successfully" })
    return;
})

/**
 * @desc    Assign role to user
 * @route   POST /api/roles/assign
 * @access  Private/Admin
 */
export const assignRoleToUser: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, roleId } = req.body

    if (!userId || !roleId) {
        logger.warn("Missing userId or roleId", { userId, roleId })
        res.status(400).json({ message: "userId and roleId are required" })
        return;
    }

    // Use Promise.all for parallel queries
    const [role, user] = await Promise.all([Role.findById(roleId).lean().exec(), User.findById(userId).lean().exec()])

    if (!role) {
        logger.warn("Role not found", { roleId })
        res.status(404).json({ message: "Role not found" })
        return;
    }

    if (!user) {
        logger.warn("User not found", { userId })
        res.status(404).json({ message: "User not found" })
        return;
    }

    // Use updateOne for better performance
    await User.updateOne(
        { _id: userId },
        {
            $set: {
                role: roleId,
                updatedAt: new Date(),
            },
        },
    )

    // Invalidate relevant caches
    await invalidateCache(
        [
            `users:${userId}`,
            CACHE_KEYS.USERS_BY_ROLE(roleId),
            user.role ? CACHE_KEYS.USERS_BY_ROLE(user.role.toString()) : "",
        ].filter(Boolean),
    )

    logger.info("Role assigned to user successfully", { userId, roleId })
    res.status(200).json({ message: "Role assigned successfully" })
    return;
})

/**
 * @desc    Get users by role
 * @route   GET /api/roles/:roleId/users
 * @access  Private/Admin
 */
export const getUsersByRole: RequestHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { roleId } = req.params

    // Add pagination support
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const skip = (page - 1) * limit

    // Check if role exists
    const roleExists = await Role.exists({ _id: roleId })

    if (!roleExists) {
        logger.warn("Role not found", { roleId })
        res.status(404).json({ message: "Role not found" })
        return;
    }

    // Use projection to exclude sensitive data
    const users = await User.find({ role: roleId }, { password: 0, authenticatorSetup: 0 })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec()

    const total = await User.countDocuments({ role: roleId })

    logger.info("Fetched users by role", { roleId, count: users.length })
    res.status(200).json({
        users,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
        },
    })
    return;
})

