import express from 'express';
import * as notificationController from '../Controllers/notification.controller.js';
import { protect } from '../middlewares/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', notificationController.getMyNotifications);
router.patch('/read', notificationController.markAsRead);
router.patch('/read/:id', notificationController.markAsRead);
router.delete('/', notificationController.deleteNotification);
router.delete('/:id', notificationController.deleteNotification);

export default router;
