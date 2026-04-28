import Notification from '../models/Notification.js';
import asyncHandler from '../utils/asyncHandler.js';
import ErrorResponse from '../utils/errorResponse.js';

export const getMyNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ user: req.user.userId })
    .sort({ createdAt: -1 })
    .limit(200);

  res.status(200).json({
    success: true,
    data: notifications
  });
});

export const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (id) {
    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: req.user.userId },
      { read: true },
      { new: true }
    );``

    if (!notification) {
      throw new ErrorResponse('Notification not found', 404);
    }
  } else {
    await Notification.updateMany(
      { user: req.user.userId, read: false },
      { read: true }
    );
  }

  res.status(200).json({
    success: true,
    message: 'Notifications marked as read'
  });
});

export const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (id) {
    const notification = await Notification.findOneAndDelete({
      _id: id,
      user: req.user.userId
    });

    if (!notification) {
      throw new ErrorResponse('Notification not found', 404);
    }
  } else {
    await Notification.deleteMany({ user: req.user.userId, read: true });
  }

  res.status(200).json({
    success: true,
    message: 'Notifications deleted'
  });
});

/**
 * Utility function to create a notification
 * Can be used by other controllers
 */
export const createNotification = async ({ user, userModel, title, message, type, link }) => {
  try {
    return await Notification.create({
      user,
      userModel,
      title,
      message,
      type,
      link
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    // We don't throw here to avoid breaking the main process
    return null;
  }
};
