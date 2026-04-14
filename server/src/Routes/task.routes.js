import express from 'express';
import { getMyTasks, deleteTask, clearFinishedTasks } from '../Controllers/task.controller.js';
import { protect } from '../middlewares/auth.js';

const router = express.Router();

router.use(protect); // All task routes require authentication

router.route('/')
  .get(getMyTasks)
  .delete(clearFinishedTasks);

router.route('/:id')
  .delete(deleteTask);

export default router;
