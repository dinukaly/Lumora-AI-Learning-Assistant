import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../common/middleware/auth.js';
import { AdminController } from './admin.controller.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/users', AdminController.listUsers);
router.patch('/users/:id/role', AdminController.updateUserRole);
router.patch('/users/:id/disable', AdminController.setUserDisabled);

export default router;
