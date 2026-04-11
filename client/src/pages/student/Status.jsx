import React from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import { BookOpen, User, GraduationCap, AlertTriangle, CheckCircle, Clock, Shield, XCircle } from 'lucide-react';

const STATUS_ICON = {
  approved:     { icon: CheckCircle, color: 'text-emerald-600' },
  pending:      { icon: Clock,       color: 'text-amber-500' },
  due_marked:   { icon: XCircle,     color: 'text-red-600' },
  hod_override: { icon: Shield,      color: 'text-blue-600' },
};

const MOCK_APPROVALS = [
  { subjectName: 'DBMS', subjectCode: 'CS501', facultyName: 'Dr. Sharma', approvalType: 'subject', action: 'approved', dueType: null, remarks: null, actionedAt: '2026-05-10T14:32:00Z' },
  { subjectName: 'OS', subjectCode: 'CS502', facultyName: 'Dr. Sharma', approvalType: 'subject', action: 'pending', dueType: null, remarks: null, actionedAt: null },
  { subjectName: 'Networks', subjectCode: 'CS503', facultyName: 'Dr. Patel', approvalType: 'subject', action: 'due_marked', dueType: 'lab', remarks: 'Lab record not submitted', actionedAt: '2026-05-09T10:15:00Z' },
  { subjectName: 'Machine Learning', subjectCode: 'CS601', facultyName: 'Dr. Rao', approvalType: 'subject', action: 'approved', dueType: null, remarks: null, actionedAt: '2026-05-08T10:00:00Z' },
  { subjectName: null, subjectCode: null, facultyName: 'Dr. Patel', approvalType: 'classTeacher', action: 'approved', dueType: null, remarks: null, actionedAt: '2026-05-07T14:00:00Z' },
  { subjectName: null, subjectCode: null, facultyName: 'Dr. Meena', approvalType: 'mentor', action: 'pending', dueType: null, remarks: null, actionedAt: null },
];

const getOverallStatus = (approvals) => {
  if (approvals.some((a) => a.action === 'due_marked')) return 'has_dues';
  if (approvals.every((a) => a.action === 'approved')) return 'cleared';
  return 'pending';
};

const OVERALL_BANNER = {
  cleared:  { text: 'You are Cleared', emoji: '🟢', bg: 'bg-emerald-50 border-emerald-200', color: 'text-emerald-700' },
  pending:  { text: 'Approvals Pending', emoji: '🟡', bg: 'bg-amber-50 border-amber-200', color: 'text-amber-700' },
  has_dues: { text: 'Dues Flagged', emoji: '🔴', bg: 'bg-red-50 border-red-200', color: 'text-red-700' },
  hod_override: { text: 'Cleared by HoD', emoji: '🔷', bg: 'bg-blue-50 border-blue-200', color: 'text-blue-700' },
};

const getApprovalLabel = (item) => {
  if (item.approvalType === 'classTeacher') return 'Class Teacher';
  if (item.approvalType === 'mentor') return 'Mentor';
  return `${item.subjectName}${item.subjectCode ? ` (${item.subjectCode})` : ''}`;
};

const StudentStatus = () => {
  const { user } = useAuth();
  const overallStatus = getOverallStatus(MOCK_APPROVALS);
  const banner = OVERALL_BANNER[overallStatus];

  return (
    <PageWrapper title="" subtitle="">
      {/* Student Header — Roll No FIRST (PRD §6.7) */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <GraduationCap size={24} className="text-navy" />
          <div>
            <h1 className="text-2xl lg:text-3xl font-serif text-navy">
              <span className="font-mono tracking-wider">{user?.rollNo}</span>
              <span className="text-muted-foreground mx-2">·</span>
              {user?.name}
            </h1>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              {user?.department} · Semester {user?.semester} · {user?.academicYear}
            </p>
          </div>
        </div>
      </div>

      {/* Overall Status Banner */}
      <div className={`p-5 rounded-2xl border mb-8 flex items-center gap-4 ${banner.bg}`}>
        <span className="text-3xl">{banner.emoji}</span>
        <div>
          <p className={`text-lg font-bold ${banner.color}`}>{banner.text}</p>
          <p className="text-xs text-muted-foreground">
            {MOCK_APPROVALS.filter((a) => a.action === 'approved').length} of {MOCK_APPROVALS.length} approvals completed
          </p>
        </div>
      </div>

      {/* Approval Cards */}
      <div className="space-y-3">
        {MOCK_APPROVALS.map((item, i) => {
          const statusConfig = STATUS_ICON[item.action] || STATUS_ICON.pending;
          const StatusIcon = statusConfig.icon;

          return (
            <div key={i} className="bg-white rounded-2xl border border-muted shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-navy/5 flex items-center justify-center shrink-0 mt-0.5">
                    {item.approvalType === 'subject' ? <BookOpen size={18} className="text-navy" /> :
                     item.approvalType === 'classTeacher' ? <User size={18} className="text-navy" /> :
                     <GraduationCap size={18} className="text-navy" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy">{getApprovalLabel(item)}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground">{item.facultyName}</span>
                      {item.approvalType !== 'subject' && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-navy/5 text-navy font-semibold uppercase tracking-wider">
                          {item.approvalType === 'classTeacher' ? 'Class Teacher' : 'Mentor'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge status={item.action} />
                </div>
              </div>

              {/* Due details (PRD §6.7) */}
              {item.action === 'due_marked' && item.dueType && (
                <div className="mt-3 ml-13 p-3 rounded-xl bg-red-50 border border-red-100">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={12} className="text-red-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-600">
                      Due: {item.dueType}
                    </span>
                  </div>
                  {item.remarks && <p className="text-sm text-red-700">"{item.remarks}"</p>}
                </div>
              )}

              {/* HoD Override display */}
              {item.action === 'hod_override' && (
                <div className="mt-3 ml-13 p-3 rounded-xl bg-blue-50 border border-blue-100">
                  <p className="text-xs font-semibold text-blue-700">✔ Cleared by HoD</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PageWrapper>
  );
};

export default StudentStatus;
