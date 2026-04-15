import { z } from 'zod';
import mongoose from 'mongoose';

/**
 * Custom Zod validator for MongoDB ObjectIds
 */
export const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: 'Invalid MongoDB ObjectId',
});

/**
 * Higher-order middleware function to validate request data against a Zod schema.
 * Automatically handles 400 Bad Request responses with structured error messages.
 */
export const validate = (schema) => (req, res, next) => {
  try {
    // Validate body, query, and params combined if needed, 
    // but usually we validate body for POST/PATCH
    schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.errors.map((err) => ({
        path:    err.path.join('.'),
        message: err.message,
      }));
      
      return res.status(400).json({
        success: false,
        error: {
          code:       'VALIDATION_ERROR',
          message:    'Input validation failed',
          details,
          statusCode: 400,
        },
      });
    }
    next(error);
  }
};

/**
 * SCHEMAS for Batch Operations
 */
export const Schemas = {
  Batch: {
    Initiate: z.object({
      classId:  objectIdSchema,
      deadline: z.string().datetime().optional().or(z.string().length(0)).or(z.null()),
    }),
    
    InitiateDept: z.object({
      deadline: z.string().datetime().optional().or(z.string().length(0)).or(z.null()),
    }),
    
    AddStudent: z.object({
      studentId: objectIdSchema,
    }),
    
    BulkClose: z.object({
      ids: z.array(objectIdSchema).min(1),
    }),
  },
  
  Auth: {
    Login: z.object({
      email:    z.string().email(),
      password: z.string().min(1),
    }),
    
    ChangePassword: z.object({
      currentPassword: z.string().min(1),
      newPassword:     z.string().min(6),
    }),
  }
};
