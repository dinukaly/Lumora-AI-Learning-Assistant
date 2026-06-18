import { Router } from 'express';
import { DocumentsController } from './documents.controller.js';
import { upload } from './documents.service.js';
import { requireAuth } from '../../common/middleware/auth.js';

const router = Router();

router.post('/upload', requireAuth, upload.single('file'), DocumentsController.upload);
router.get('/', requireAuth, DocumentsController.list);
router.get('/:id', requireAuth, DocumentsController.getById);
router.delete('/:id', requireAuth, DocumentsController.remove);

export default router;