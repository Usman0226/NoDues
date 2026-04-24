import Feedback from '../models/Feedback.js';
import * as emailService from '../services/emailService.js';
import asyncHandler from '../utils/asyncHandler.js';
import ErrorResponse from '../utils/errorResponse.js';
import logger from '../utils/logger.js';

/**
 * @desc    Submit new feedback
 * @route   POST /api/feedback
 * @access  Private
 */
export const submitFeedback = asyncHandler(async (req, res, next) => {
  const { rating, category, description, page, userAgent } = req.body;

  if (!rating || !description || !page) {
    return next(new ErrorResponse('Please provide rating, description and page', 400, 'FEEDBACK_MISSING_FIELDS'));
  }

  // Determine role model for refPath
  let roleModel = 'Student';
  if (req.user.role === 'admin') roleModel = 'Admin';
  else if (req.user.role === 'faculty' || req.user.role === 'hod') roleModel = 'Faculty';

  const submittedBy = {
    user: req.user.userId || req.user._id,
    roleModel,
    name: req.user.name || 'User',
    role: req.user.role,
    identifier: req.user.rollNo || req.user.email || 'N/A'
  };

  const feedback = await Feedback.create({
    rating,
    category,
    description,
    submittedBy,
    page,
    userAgent
  });

  // Non-blocking email notification to admin
  emailService.sendFeedbackEmail({ rating, category, description, page, userAgent }, req.user)
    .catch(err => logger.error('Feedback email dispatch failed', { error: err.message }));

  // Audit event
  logger.audit('FEEDBACK_SUBMITTED', { 
    actor: req.user.userId, 
    resource_id: feedback._id 
  });

  res.status(201).json({
    success: true,
    data: feedback
  });
});

/**
 * @desc    Get all feedback (Admin only)
 * @route   GET /api/feedback
 * @access  Private/Admin
 */
export const getFeedback = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, category, rating } = req.query;

  const query = {};
  if (category) query.category = category;
  if (rating) query.rating = rating;

  const skip = (Number(page) - 1) * Number(limit);

  const [feedback, total] = await Promise.all([
    Feedback.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('submittedBy.user', 'name email rollNo departmentId')
      .lean(),
    Feedback.countDocuments(query)
  ]);

  res.status(200).json({
    success: true,
    data: feedback,
    pagination: {
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit))
    }
  });
});
