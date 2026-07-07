import { Router } from 'express';
import { DocumentsController } from './documents.controller.js';
import { upload } from './documents.service.js';
import { requireAuth, requireVerified } from '../../common/middleware/auth.js';

const router = Router();

router.use(requireAuth, requireVerified);

router.post('/upload', upload.single('file'), DocumentsController.upload);
router.get('/', DocumentsController.list);
router.get('/:id/view', DocumentsController.view);
router.get('/:id', DocumentsController.getById);
router.delete('/:id', DocumentsController.remove);

export default router;
