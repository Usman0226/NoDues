import { Router } from 'express';
import multer from 'multer';
import {
  inspectTimetablePdf,
  previewTimetable,
  commitTimetable,
  bulkCommitTimetable,
  batchImportTimetable,
  getClassSubjectHistory,
} from '../Controllers/timetableController.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';

const router = Router();

// Configure in-memory upload for PDF parsing (max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF timetable files are permitted.'));
    }
  },
});

router.use(protect);
router.use(RoleGuard(['admin', 'hod', 'ao']));

// Timetable parser inspect, preview, commit, and batch import (FR-C1 to FR-C8, Multi-Page Ingestion)
router.post('/inspect', upload.single('file'), inspectTimetablePdf);
router.post('/preview', upload.single('file'), previewTimetable);
router.post('/commit', commitTimetable);
router.post('/bulk-commit', upload.single('file'), bulkCommitTimetable);
router.post('/batch-import', upload.single('file'), batchImportTimetable);

// Class subject history across archived and active semesters (FR-B5)
router.get('/history/:classId', getClassSubjectHistory);

export default router;
