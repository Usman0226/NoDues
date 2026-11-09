import { z } from 'zod';
import logger from '../utils/logger.js';
import Batch from '../models/Batch.js';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import { setFeatureFlag, isFeatureEnabled } from '../utils/featureFlags.js';

/**
 * Action Registry — Centralized, atomic, auditable backend operation registry
 * TRD Reference: FR-D1 to FR-D4, MON-1
 */
class ActionRegistry {
  constructor() {
    this.actions = new Map();
  }

  /**
   * Registers a new action with schema validation and handler function.
   * TRD Reference: FR-D1
   *
   * @param {Object} actionDef
   * @param {string} actionDef.id
   * @param {string} actionDef.description
   * @param {z.ZodType} actionDef.schema
   * @param {Function} actionDef.handler - async (input, context) => result
   */
  register(actionDef) {
    if (!actionDef.id || typeof actionDef.id !== 'string') {
      throw new Error('Action must declare a string id.');
    }
    if (!actionDef.handler || typeof actionDef.handler !== 'function') {
      throw new Error(`Action "${actionDef.id}" must declare a handler function.`);
    }

    this.actions.set(actionDef.id, {
      id: actionDef.id,
      description: actionDef.description || '',
      schema: actionDef.schema || z.any(),
      handler: actionDef.handler,
    });
  }

  /**
   * Retrieves an action by ID
   * @param {string} id
   */
  get(id) {
    return this.actions.get(id);
  }

  /**
   * Lists all registered action descriptors (excluding handlers)
   */
  list() {
    return Array.from(this.actions.values()).map(a => ({
      id: a.id,
      description: a.description,
    }));
  }

  /**
   * Executes an action atomically with validation and structured audit logging.
   * TRD Reference: FR-D1, FR-D3, FR-D4, MON-1
   *
   * @param {string} id
   * @param {Object} rawInput
   * @param {Object} [context] - { user, req, ip }
   * @returns {Promise<any>}
   */
  async execute(id, rawInput, context = {}) {
    const action = this.actions.get(id);
    if (!action) {
      const error = new Error(`Action "${id}" is not registered in Action Registry.`);
      error.code = 'ACTION_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const startTime = Date.now();
    const actorId = context.user?._id || context.actor || 'system';

    // 1. Zod Input Schema Validation
    let validatedInput = rawInput;
    if (action.schema && typeof action.schema.parse === 'function') {
      try {
        validatedInput = action.schema.parse(rawInput);
      } catch (validationErr) {
        const issues = validationErr.issues || validationErr.errors || [];
        const error = new Error(`Validation failed for action "${id}": ${issues.map(i => i.message).join('; ')}`);
        error.code = 'VAL_001';
        error.statusCode = 400;
        error.details = issues;
        throw error;
      }
    }

    // 2. Handler Execution
    try {
      const result = await action.handler(validatedInput, context);
      const durationMs = Date.now() - startTime;

      // 3. Structured Audit Logging (FR-D4, MON-1)
      logger.info('Action executed successfully', {
        action_id: id,
        actor: actorId,
        duration_ms: durationMs,
        isAudit: true,
        log_type: 'AUDIT',
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error('Action execution failed', {
        action_id: id,
        actor: actorId,
        error_code: err.code || 'SRV_001',
        message: err.message,
        duration_ms: durationMs,
        isAudit: true,
        log_type: 'AUDIT',
        timestamp: new Date().toISOString(),
      });
      throw err;
    }
  }
}

export const registry = new ActionRegistry();

// ── Register Core Built-In Phase 1 Actions ─────────────────────────────────────

// Action: batch.create (FR-A1)
registry.register({
  id: 'batch.create',
  description: 'Creates a new academic batch (e.g. 2024-2028)',
  schema: z.object({
    label: z.string().min(4),
    startYear: z.number().int().min(2000),
    endYear: z.number().int().min(2000),
    currentSemester: z.number().int().min(1).max(8).default(1),
  }),
  handler: async (input, context) => {
    const existing = await Batch.findOne({ label: input.label });
    if (existing) {
      const err = new Error(`Batch with label "${input.label}" already exists.`);
      err.code = 'DB_003';
      err.statusCode = 409;
      throw err;
    }

    const batch = await Batch.create({
      ...input,
      isActive: true,
      createdBy: context.user?._id || null,
    });
    return batch;
  },
});

// Action: batch.advanceSemester (FR-A4, FR-A5, FR-A6, NFR-3)
registry.register({
  id: 'batch.advanceSemester',
  description: 'Increments currentSemester by 1 and cascades to all linked classes and students (except overrides)',
  schema: z.object({
    batchId: z.string().min(1),
  }),
  handler: async (input) => {
    const batch = await Batch.findById(input.batchId);
    if (!batch) {
      const err = new Error('Batch not found.');
      err.code = 'DB_002';
      err.statusCode = 404;
      throw err;
    }

    if (!batch.isActive) {
      const err = new Error('Cannot advance a graduated/inactive batch.');
      err.code = 'VAL_002';
      err.statusCode = 400;
      throw err;
    }

    const nextSemester = batch.currentSemester + 1;

    // FR-A5: If semester exceeds 8, mark as graduated (isActive: false)
    if (nextSemester > 8) {
      batch.isActive = false;
      await batch.save();
      return {
        batchId: batch._id,
        currentSemester: batch.currentSemester,
        graduated: true,
        isActive: false,
        message: 'Batch completed semester 8 and is now marked graduated.',
      };
    }

    batch.currentSemester = nextSemester;
    await batch.save();

    // NFR-3: Cascade in single bulk operations, never per-document loops
    // Update all classes linked to this batch
    const classUpdateResult = await Class.updateMany(
      { batchId: batch._id, isActive: true },
      { $set: { semester: nextSemester } }
    );

    // Update students linked to this batch WITHOUT a semesterOverride (FR-A4, FR-A6)
    const studentUpdateResult = await Student.updateMany(
      {
        batchId: batch._id,
        isActive: true,
        $or: [{ semesterOverride: null }, { semesterOverride: { $exists: false } }],
      },
      {
        $set: {
          currentSemester: nextSemester,
          semester: nextSemester, // keep legacy field in sync (NC-5)
        },
      }
    );

    return {
      batchId: batch._id,
      newSemester: nextSemester,
      classesUpdated: classUpdateResult.modifiedCount,
      studentsUpdated: studentUpdateResult.modifiedCount,
      graduated: false,
    };
  },
});

// Action: class.setSemesterSubjects (FR-B2, FR-B3)
registry.register({
  id: 'class.setSemesterSubjects',
  description: 'Sets semester subjects for a class, archiving previous entries',
  schema: z.object({
    classId: z.string().min(1),
    semester: z.number().int().min(1).max(8),
    subjects: z.array(
      z.object({
        subjectId: z.string().min(1),
        subjectName: z.string().optional(),
        subjectCode: z.string().optional(),
        facultyId: z.string().optional().nullable(),
        facultyName: z.string().optional().nullable(),
        coFacultyIds: z.array(z.string()).optional(),
        source: z.enum(['timetable_parse', 'manual', 'cloned']).default('manual'),
      })
    ),
  }),
  handler: async (input) => {
    const cls = await Class.findById(input.classId);
    if (!cls) {
      const err = new Error('Class not found.');
      err.code = 'DB_002';
      err.statusCode = 404;
      throw err;
    }

    if (!cls.semesterSubjects) {
      cls.semesterSubjects = new Map();
    }

    // Archive any active prior semester entries (FR-B3)
    for (const [, entry] of cls.semesterSubjects.entries()) {
      if (entry && entry.status === 'active') {
        entry.status = 'archived';
        entry.archivedAt = new Date();
      }
    }

    cls.semesterSubjects.set(String(input.semester), {
      subjects: input.subjects,
      status: 'active',
      setAt: new Date(),
      archivedAt: null,
    });

    cls.semester = input.semester;
    cls.subjectAssignments = input.subjects.map(s => ({
      subjectId: s.subjectId,
      subjectName: s.subjectName || '',
      subjectCode: s.subjectCode || '',
      facultyId: s.facultyId || null,
      facultyName: s.facultyName || null,
    }));

    await cls.save();
    return {
      classId: cls._id,
      semester: input.semester,
      subjectCount: input.subjects.length,
    };
  },
});

// Action: featureFlag.toggle (FR-F3, FR-F5)
registry.register({
  id: 'featureFlag.toggle',
  description: 'Toggles a database feature flag',
  schema: z.object({
    name: z.string().min(1),
    enabled: z.boolean(),
    description: z.string().optional(),
  }),
  handler: async (input, context) => {
    const flag = await setFeatureFlag(
      input.name,
      input.enabled,
      input.description || '',
      context.user?._id || null
    );
    return { name: flag.name, enabled: flag.enabled };
  },
});

export default registry;
