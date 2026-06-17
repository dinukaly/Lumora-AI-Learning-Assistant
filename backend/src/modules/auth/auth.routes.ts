import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { requireAuth } from '../../common/middleware/auth.js';

const router = Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/refresh', AuthController.refresh);
router.post('/logout', requireAuth, AuthController.logout);

export default router;
