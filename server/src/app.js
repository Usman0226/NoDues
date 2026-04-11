import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middlewares/errorHandler.js';
import { responseTimeLogger } from './middlewares/responseTime.js';
import logger from './utils/logger.js';

// ── Route imports ─────────────────────────────────────────────────────────────
import authRoutes          from './Routes/auth.routes.js';
import departmentRoutes    from './Routes/department.routes.js';
import subjectRoutes       from './Routes/subject.routes.js';
import classRoutes         from './Routes/class.routes.js';
import facultyRoutes       from './Routes/faculty.routes.js';
import studentRoutes       from './Routes/student.routes.js';
import batchRoutes         from './Routes/batch.routes.js';
import approvalRoutes      from './Routes/approval.routes.js';
import hodRoutes           from './Routes/hod.routes.js';
import studentPortalRoutes from './Routes/studentPortal.routes.js';
import sseRoutes           from './Routes/sse.routes.js';
import importRoutes        from './Routes/import.routes.js';

const app = express();

app.use(responseTimeLogger);

app.use(helmet());
app.use(
  cors({
    origin:      process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

app.use(compression({ level: 6, threshold: 1024 }));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status:    'healthy',
      timestamp: Date.now(),   // Date.now() is faster than new Date().toISOString()
      env:       process.env.NODE_ENV || 'development',
    },
  });
});

app.use('/api/auth',        authRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/subjects',    subjectRoutes);
app.use('/api/classes',     classRoutes);
app.use('/api/faculty',     facultyRoutes);
app.use('/api/students',    studentRoutes);
app.use('/api/batch',       batchRoutes);
app.use('/api/approvals',   approvalRoutes);
app.use('/api/hod',         hodRoutes);
app.use('/api/student',     studentPortalRoutes);
app.use('/api/sse',         sseRoutes);
app.use('/api/import',      importRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code:       'NOT_FOUND',
      message:    'The requested resource does not exist',
      statusCode: 404,
    },
  });
});

// ── Central error handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

export default app;