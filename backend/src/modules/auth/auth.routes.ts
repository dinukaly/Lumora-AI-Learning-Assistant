import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { requireAuth } from '../../common/middleware/auth.js';
import { authRateLimit } from '../../common/middleware/auth-rate-limit.js';

const router = Router();

router.post('/register', authRateLimit, AuthController.register);
router.post('/login', authRateLimit, AuthController.login);
router.post('/refresh', authRateLimit, AuthController.refresh);
router.post('/logout', requireAuth, AuthController.logout);
router.post('/mobile/register', authRateLimit, AuthController.mobileRegister);
router.post('/mobile/login', authRateLimit, AuthController.mobileLogin);
router.post('/mobile/refresh', authRateLimit, AuthController.mobileRefresh);
router.post('/mobile/logout', authRateLimit, AuthController.mobileLogout);
router.get('/mobile/oauth/google/start', authRateLimit, AuthController.startMobileGoogleOAuth);
router.get('/oauth/google/start', authRateLimit, AuthController.startGoogleOAuth);
router.get('/oauth/google/callback', authRateLimit, AuthController.googleOAuthCallback);
router.post('/verification/resend', requireAuth, authRateLimit, AuthController.resendVerificationEmail);
router.get('/verification/verify', authRateLimit, AuthController.verifyEmail);

export default router;
