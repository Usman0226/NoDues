import Feedback from '../models/Feedback.js';
import * as emailService from '../services/emailService.js';
import asyncHandler from '../utils/asyncHandler.js';
import ErrorResponse from '../utils/errorResponse.js';
import logger from '../utils/logger.js';

export const submitFeedback = asyncHandler(async (req, res, next) => {
  const { type, description, page, userAgent } = req.body;

  if (!type || !description || !page) {
    return next(new ErrorResponse('Please provide type, description and page', 400));
  }

  const submittedBy = {
    userId: req.user.userId || req.user._id,
    name: req.user.name || 'User',
    role: req.user.role,
    identifier: req.user.rollNo || req.user.email || 'N/A'
  };

  const feedback = await Feedback.create({
    type,
    description,
    submittedBy,
    page,
    userAgent
  });

  emailService.sendFeedbackEmail({ type, description, page, userAgent }, req.user)
    .catch(err => logger.error('Feedback email dispatch failed', { error: err.message }));

  res.status(201).json({
    success: true,
    data: feedback
  });
});
