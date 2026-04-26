import express from 'express';
import { 
    getCoCurricularTypes, 
    createCoCurricularType, 
    updateCoCurricularType, 
    deleteCoCurricularType,
    submitCoCurricular,
    assignCoCurricularToMentors,
} from '../Controllers/coCurricularController.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getCoCurricularTypes)
    .post(RoleGuard(['admin', 'hod', 'ao']), createCoCurricularType);

router.route('/:id')
    .patch(RoleGuard(['admin', 'hod', 'ao']), updateCoCurricularType)
    .delete(RoleGuard(['admin', 'hod', 'ao']), deleteCoCurricularType);

router.route('/:id/assign-mentors')
    .post(RoleGuard(['admin', 'hod', 'ao']), assignCoCurricularToMentors);

router.route('/:id/assign-class-teachers')
    .post(RoleGuard(['admin', 'hod', 'ao']), assignCoCurricularToMentors);

router.route('/:typeId/submit')
    .post(RoleGuard(['student']), submitCoCurricular);

export default router;