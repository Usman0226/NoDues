import Task from '../models/Task.js';
import asyncHandler from '../utils/asyncHandler.js';
import ErrorResponse from '../utils/errorResponse.js';

/**
 * @desc    Get user's background tasks
 * @route   GET /api/tasks
 * @access  Private
 */
export const getMyTasks = asyncHandler(async (req, res, next) => {
  const tasks = await Task.find({ actor: req.user.userId })
    .sort({ createdAt: -1 })
    .limit(20);

  res.status(200).json({
    success: true,
    data: tasks
  });
});

export const deleteTask = asyncHandler(async (req, res, next) => {
  const task = await Task.findById(req.params.id);

  if (!task) {
    return next(new ErrorResponse('Task not found', 404));
  }

  // Ensure owner
  if (task.actor.toString() !== req.user.userId) {
    return next(new ErrorResponse('Not authorized to clear this task', 403));
  }

  await task.deleteOne();

  res.status(200).json({
    success: true,
    data: {}
  });
});

/**
 * @desc    Clear all finished tasks for user
 * @route   DELETE /api/tasks
 * @access  Private
 */
export const clearFinishedTasks = asyncHandler(async (req, res, next) => {
  await Task.deleteMany({
    actor: req.user.userId,
    status: { $in: ['success', 'error'] }
  });

  res.status(200).json({
    success: true,
    data: {}
  });
});
