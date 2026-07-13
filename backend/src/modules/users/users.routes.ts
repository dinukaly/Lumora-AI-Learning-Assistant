import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.js';
import { UsersController } from './users.controller.js';
import { avatarUpload, getAvatarUploadErrorMessage } from './users.service.js';

const router = Router();

router.get('/me', requireAuth, UsersController.getProfile);
router.patch('/me', requireAuth, UsersController.updateProfile);
router.post('/me/avatar', requireAuth, handleAvatarUpload, UsersController.updateAvatar);
router.patch('/me/password', requireAuth, UsersController.changePassword);
router.post('/me/push-tokens', requireAuth, UsersController.registerPushToken);
router.delete('/me/push-tokens', requireAuth, UsersController.removePushToken);

export default router;

function handleAvatarUpload(req: Request, res: Response, next: NextFunction) {
  avatarUpload.single('avatar')(req, res, (error: unknown) => {
    if (error) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: getAvatarUploadErrorMessage(error),
        },
      });
    }

    next();
  });
}
