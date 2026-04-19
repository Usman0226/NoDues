import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import ErrorResponse from '../utils/errorResponse.js';
import cache from '../config/cache.js';
import logger from '../utils/logger.js';

const SUBJECTS_TTL = 120; 

export const getSubjects = async (req, res, next) => {
  try {
    const { semester, isElective, search, page = 1, limit = 20 } = req.query;

    const query = { isActive: true };
    if (semester)   query.semester   = Number(semester);
    if (isElective !== undefined) query.isElective = isElective === 'true';

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const [subjects, total] = await Promise.all([
      Subject.find(query)
        .select('_id name code semester isElective createdAt') // project only what the response returns
        .sort({ semester: 1, name: 1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Subject.countDocuments(query),
    ]);

    // Subjects change very rarely — allow browser to cache list for 5 min
    // Student/faculty portals benefit greatly at 500 concurrent users: zero repeat requests
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json({
      success: true,
      data: subjects.map((s) => ({
        _id:       s._id,
        name:      s.name,
        code:      s.code,
        semester:  s.semester,
        isElective: s.isElective,
        createdAt: s.createdAt,
      })),
      pagination: {
        page:  Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/subjects ────────────────────────────────────────────────────────
export const createSubject = async (req, res, next) => {
  try {
    const { name, code, semester, isElective } = req.body;
    if (!name || !code) {
      return next(new ErrorResponse('name and code are required', 400, 'VALIDATION_ERROR'));
    }

    const subject = await Subject.create({ name, code, semester, isElective: isElective ?? false });

    logger.info('subject_created', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'CREATE_SUBJECT',
      resource_id: subject._id.toString(),
    });

    return res.status(201).json({
      success: true,
      data: {
        _id:        subject._id,
        name:       subject.name,
        code:       subject.code,
        semester:   subject.semester,
        isElective: subject.isElective,
        createdAt:  subject.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getSubjectById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const cacheKey = `subject:${id}`;
    const cached   = cache.get(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached });

    const subject = await Subject.findOne({ _id: id, isActive: true }).lean();
    if (!subject) {
      return next(new ErrorResponse('Subject not found', 404, 'NOT_FOUND'));
    }

    const usedInClasses = await Class.countDocuments({
      'subjectAssignments.subjectId': id,
      isActive: true,
    });

    const data = {
      _id:         subject._id,
      name:        subject.name,
      code:        subject.code,
      semester:    subject.semester,
      isElective:  subject.isElective,
      usedInClasses,
      createdAt:   subject.createdAt,
    };

    cache.set(cacheKey, data, SUBJECTS_TTL);
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const updateSubject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, semester, isElective } = req.body;

    const subject = await Subject.findOne({ _id: id, isActive: true });
    if (!subject) {
      return next(new ErrorResponse('Subject not found', 404, 'NOT_FOUND'));
    }

    if (name      !== undefined) subject.name      = name;
    if (code      !== undefined) subject.code      = code;
    if (semester  !== undefined) subject.semester  = semester;
    if (isElective !== undefined) subject.isElective = isElective;

    await subject.save();

    // Cache invalidated automatically by Mongoose subject save hook

    logger.info('subject_updated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'UPDATE_SUBJECT',
      resource_id: id,
    });

    return res.status(200).json({
      success: true,
      data: {
        _id:        subject._id,
        name:       subject.name,
        code:       subject.code,
        semester:   subject.semester,
        isElective: subject.isElective,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const deleteSubject = async (req, res, next) => {
  try {
    const { id } = req.params;

    const subject = await Subject.findOne({ _id: id, isActive: true });
    if (!subject) {
      return next(new ErrorResponse('Subject not found', 404, 'NOT_FOUND'));
    }

    subject.isActive = false;
    await subject.save();

    // Cache invalidated automatically by Mongoose subject save hook

    logger.info('subject_deleted', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'DELETE_SUBJECT',
      resource_id: id,
    });

    return res.status(200).json({
      success: true,
      data: { message: 'Subject deleted successfully' },
    });
  } catch (err) {
    next(err);
  }
};

// ── BATCH OPERATIONS ─────────────────────────────────────────────────────────

export const bulkDeleteSubjects = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return next(new ErrorResponse('IDs array is required', 400));
    }

    const result = await Subject.updateMany(
      { _id: { $in: ids }, isActive: true },
      { isActive: false }
    );

    // Cache invalidated automatically by Mongoose subject hooks

    logger.info('subjects_bulk_deleted', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'BULK_DELETE_SUBJECT',
      details: { count: result.modifiedCount, requested: ids.length }
    });

    return res.status(200).json({
      success: true,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (err) {
    next(err);
  }
};
