import { Router } from 'express';
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  followUser,
  unfollowUser,
  getFollowStats,
  createPost,
  getAllPosts,
  getPostById,
  updatePost,
  deletePost,
  updatePassword,
  setupTwoFactorAuth,
  verifyTwoFactorAuth,
  disableTwoFactorAuth,
  generateRecoveryCodes,
  verifyEmail,
  verifyDiscord,
  verifySMS,
  updatePrivacySettings,
  updateNotificationSettings,
  updatePreferences,
  logoutAllSessions
} from '../controllers/user.controller';
import { hasRole } from '../middlewares/authorization.middleware';
import { isAuthenticated } from '../middlewares/authentication.middleware';

const router = Router();

// User CRUD operations
router.post('/', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer'), createUser);
router.get('/', isAuthenticated, hasRole('Admin', 'Moderator', 'Developer', 'Content', 'Supporter'), getAllUsers);
router.get('/:userId', getUserById);
router.put('/:userId', isAuthenticated, updateUser);
router.delete('/:userId', isAuthenticated, deleteUser);

// Follow/Unfollow operations
router.post('/:userId/follow', isAuthenticated, followUser);
router.post('/:userId/unfollow', isAuthenticated, unfollowUser);
router.get('/:userId/follow-stats', getFollowStats);

// Post management
router.post('/:userId/post', isAuthenticated, createPost);
router.get('/:userId/posts', isAuthenticated, getAllPosts);
router.get('/:userId/post/:postId', isAuthenticated, getPostById);
router.put('/:userId/post/:postId', isAuthenticated, updatePost);
router.delete('/:userId/post/:postId', isAuthenticated, deletePost);

// Security settings
router.put('/:userId/password', isAuthenticated, updatePassword);
router.post('/:userId/2fa/setup', isAuthenticated, setupTwoFactorAuth);
router.post('/:userId/2fa/verify', isAuthenticated, verifyTwoFactorAuth);
router.post('/:userId/2fa/disable', isAuthenticated, disableTwoFactorAuth);
router.post('/:userId/2fa/recovery-codes', isAuthenticated, generateRecoveryCodes);

// Verification routes
router.post('/:userId/verify/email', isAuthenticated, verifyEmail);
router.post('/:userId/verify/discord', isAuthenticated, verifyDiscord);
router.post('/:userId/verify/sms', isAuthenticated, verifySMS);

// User settings
router.put('/:userId/settings/privacy', isAuthenticated, updatePrivacySettings);
router.put('/:userId/settings/notifications', isAuthenticated, updateNotificationSettings);
router.put('/:userId/settings/preferences', isAuthenticated, updatePreferences);

// Session management
router.post('/:userId/logout-all', isAuthenticated, logoutAllSessions);

export default router;