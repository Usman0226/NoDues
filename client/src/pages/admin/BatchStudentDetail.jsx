import React from 'react';
import { useParams, Link } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import { 
  ArrowLeft, BookOpen, User, GraduationCap, 
  AlertTriangle, CheckCircle, Clock, Shield 
} from 'lucide-react';

const MOCK_STUDENT = { 
  name: 'Arun Kumar', 
  rollNo: '21CSE001', 
  department: 'CSE', 
  semester: 5, 
  academicYear: '2025-26',
  overallStatus: 'has_dues' 
};

const MOCK_APPROVALS = [
  { subjectName: 'DBMS', subjectCode: 'CS501', facultyName: 'Dr. Sharma', approvalType: 'subject', action: 'approved', dueType: null, remarks: null, actionedAt: '2026-05-10T14:32:00Z' },
  { subjectName: 'OS', subjectCode: 'CS502', facultyName: 'Dr. Sharma', approvalType: 'subject', action: 'pending', dueType: null, remarks: null, actionedAt: null },
  { subjectName: 'Networks', subjectCode: 'CS503', facultyName: 'Dr. Patel', approvalType: 'subject', action: 'due_marked', dueType: 'lab', remarks: 'Lab record not submitted', actionedAt: '2026-05-09T10:15:00Z' },
  { subjectName: 'Machine Learning', subjectCode: 'CS601', facultyName: 'Dr. Rao', approvalType: 'subject', action: 'approved', dueType: null, remarks: null, actionedAt: '2026-05-08T10:00:00Z' },
  { subjectName: null, subjectCode: null, facultyName: 'Dr. Patel', approvalType: 'classTeacher', action: 'approved', dueType: null, remarks: null, actionedAt: '2026-05-07T14:00:00Z' },
  { subjectName: null, subjectCode: null, facultyName: 'Dr. Meena', approvalType: 'mentor', action: 'pending', dueType: null, remarks: null, actionedAt: null },
];

const getApprovalLabel = (item) => {
  if (item.approvalType === 'classTeacher') return 'Class Teacher';
  if (item.approvalType === 'mentor') return 'Mentor';
  return `${item.subjectName}${item.subjectCode ? ` (${item.subjectCode})` : ''}`;
};

const BatchStudentDetail = () => {
  const { batchId, studentId } = useParams();

  return (
    <PageWrapper title="Student Status Detail" subtitle={`Clearance status for ${MOCK_STUDENT.name}`}>
      <Link to={`/admin/batch/${batchId}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-navy mb-6 -mt-4">
        <ArrowLeft size={14} /> Back to Batch Grid
      </Link>

      {/* Student Header (PRD §6.4 — Roll No | Name | Dept) */}
      <div className="bg-white rounded-2xl border border-muted p-6 mb-8 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-navy/5 flex items-center justify-center">
              <GraduationCap size={32} className="text-navy" />
            </div>
            <div>
              <h1 className="text-2xl font-serif text-navy leading-none mb-1">
                <span className="font-mono tracking-tight">{MOCK_STUDENT.rollNo}</span>
                <span className="text-muted-foreground mx-2">·</span>
                {MOCK_STUDENT.name}
              </h1>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
                {MOCK_STUDENT.department} · {MOCK_STUDENT.semester}th Semester · {MOCK_STUDENT.academicYear}
              </p>
            </div>
          </div>
          <Badge status={MOCK_STUDENT.overallStatus} className="text-sm scale-110" />
        </div>
      </div>

      {/* Per-Approval Cards (PRD §6.4 — listed vertically) */}
      <div className="grid grid-cols-1 gap-4">
        {MOCK_APPROVALS.map((item, i) => (
          <div key={i} className="bg-white rounded-2xl border border-muted shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-navy/5 flex items-center justify-center shrink-0 mt-0.5">
                  {item.approvalType === 'subject' ? <BookOpen size={18} className="text-navy" /> :
                   item.approvalType === 'classTeacher' ? <User size={18} className="text-navy" /> :
                   <GraduationCap size={18} className="text-navy" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-navy">{getApprovalLabel(item)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Assigned Faculty: <span className="font-semibold text-navy/70">{item.facultyName}</span></p>
                  {item.actionedAt && (
                    <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock size={10} /> {new Date(item.actionedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <Badge status={item.action} />
            </div>

            {/* Due details (PRD §6.4) */}
            {item.action === 'due_marked' && (
              <div className="mt-4 ml-14 p-4 rounded-xl bg-red-50 border border-red-100">
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertTriangle size={14} className="text-red-500" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-red-600">
                    Due Flagged: {item.dueType}
                  </span>
                </div>
                <p className="text-sm text-red-800 italic leading-relaxed">"{item.remarks}"</p>
              </div>
            )}

            {/* HoD Override display */}
            {item.action === 'hod_override' && (
              <div className="mt-4 ml-14 p-4 rounded-xl bg-blue-50 border border-blue-100 flex items-start gap-3">
                <Shield size={16} className="text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-blue-800 uppercase tracking-widest">Cleared by HoD</p>
                  <p className="text-sm text-blue-700 italic mt-1">"Verified: Document submitted via email"</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </PageWrapper>
  );
};

export default BatchStudentDetail;
