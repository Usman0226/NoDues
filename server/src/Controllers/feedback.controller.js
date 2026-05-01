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
  const { rating, description, page, userAgent } = req.body;

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
    description,
    submittedBy,
    page,
    userAgent
  });

  // Non-blocking email notification to admin
  emailService.sendFeedbackEmail({ rating, description, page, userAgent }, req.user)
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
  const { page = 1, limit = 10, rating } = req.query;

  const query = {};
  if (rating) query.rating = Number(rating);

  console.log('Feedback Query:', query);
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

  console.log('Feedback Found:', feedback.length, 'Total:', total);

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

/**
 * @desc    Update feedback status
 * @route   PATCH /api/feedback/:id
 * @access  Private/Admin
 */
export const updateFeedback = asyncHandler(async (req, res, next) => {
  const { status } = req.body;

  let feedback = await Feedback.findById(req.params.id);

  if (!feedback) {
    return next(new ErrorResponse('Feedback not found', 404, 'FEEDBACK_NOT_FOUND'));
  }

  feedback = await Feedback.findByIdAndUpdate(req.params.id, { status }, {
    new: true,
    runValidators: true
  });

  // Audit event
  logger.audit('FEEDBACK_UPDATED', { 
    actor: req.user.userId, 
    resource_id: feedback._id,
    action: `Status set to ${status}`
  });

  res.status(200).json({
    success: true,
    data: feedback
  });
});

/**
 * @desc    Delete feedback
 * @route   DELETE /api/feedback/:id
 * @access  Private/Admin
 */
export const deleteFeedback = asyncHandler(async (req, res, next) => {
  const feedback = await Feedback.findById(req.params.id);

  if (!feedback) {
    return next(new ErrorResponse('Feedback not found', 404, 'FEEDBACK_NOT_FOUND'));
  }

  await Feedback.findByIdAndDelete(req.params.id);

  // Audit event
  logger.audit('FEEDBACK_DELETED', { 
    actor: req.user.userId, 
    resource_id: req.params.id 
  });

  res.status(200).json({
    success: true,
    data: {}
  });
});
