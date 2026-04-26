import express from 'express';
import multer from 'multer';
import {
  previewStudents,
  commitStudents,
  previewFaculty,
  commitFaculty,
  previewElectives,
  commitElectives,
  previewMentors,
  commitMentors,
  previewSubjects,
  commitSubjects,
  getTemplate
} from '../Controllers/import.controller.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);
router.use(RoleGuard(['admin', 'hod', 'ao']));

// Templates
router.get('/template/:type', getTemplate);

// Students
router.post('/students/preview', upload.single('file'), previewStudents);
router.post('/students/commit', commitStudents);

// Faculty
router.post('/faculty/preview', upload.single('file'), previewFaculty);
router.post('/faculty/commit', commitFaculty);

// Electives
router.post('/electives/preview', upload.single('file'), previewElectives);
router.post('/electives/commit', commitElectives);

// Mentors
router.post('/mentors/preview', upload.single('file'), previewMentors);
router.post('/mentors/commit', commitMentors);

// Subjects
router.post('/subjects/preview', upload.single('file'), previewSubjects);
router.post('/subjects/commit', commitSubjects);

export default router;
