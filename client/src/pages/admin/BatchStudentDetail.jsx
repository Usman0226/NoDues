import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import { useApi } from '../../hooks/useApi';
import { getBatchStudentDetail } from '../../api/batch';
import { 
  ArrowLeft, BookOpen, User, GraduationCap, 
  AlertTriangle, CheckCircle, Clock, Shield,
  RefreshCw, AlertCircle
} from 'lucide-react';

const getApprovalLabel = (item) => {
  if (item.type === 'class_teacher') return 'Academic Advisor (Class Teacher)';
  if (item.type === 'mentor') return 'Personal Mentor';
  if (item.type === 'office') return 'Administrative Office';
  return `${item.subjectName || 'Departmental Component'}${item.subjectCode ? ` (${item.subjectCode})` : ''}`;
};

const BatchStudentDetail = () => {
  const { batchId, studentId } = useParams();
  const { data: detail, loading, error, request: fetchDetail } = useApi(() => getBatchStudentDetail(batchId, studentId), { immediate: true });

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail, batchId, studentId]);

  if (loading && !detail) {
    return (
      <PageWrapper title="Loading Metadata..." subtitle="Fetching candidate audit trail">
         <div className="animate-pulse space-y-6">
            <div className="h-24 bg-muted/5 rounded-2xl border border-muted"></div>
            <div className="space-y-3">
               {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-muted/5 rounded-xl border border-muted"></div>)}
            </div>
         </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper title="Audit Fetch Error" subtitle="Record retrieval failed">
        <div className="text-center py-20 bg-white rounded-2xl border border-muted shadow-sm">
           <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
           <p className="text-muted-foreground font-medium mb-6">{error}</p>
           <Button variant="primary" onClick={() => fetchDetail()}>Retry Fetch</Button>
        </div>
      </PageWrapper>
    );
  }

  const student = detail || {};
  const approvals = detail?.approvals || [];

  return (
    <PageWrapper title="Candidate Progress Audit" subtitle={`Clearance trajectory for ${student.name}`}>
      <Link to={`/admin/batch/${batchId}`} className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-navy mb-8 -mt-6 transition-colors font-sans">
        <ArrowLeft size={12} strokeWidth={3} /> Return to Progress Matrix
      </Link>

      {/* Candidate Header */}
      <div className="bg-white rounded-2xl border border-muted p-8 mb-10 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5 select-none pointer-events-none">
           <GraduationCap size={120} strokeWidth={1} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-6">
            <div className="h-20 w-20 rounded-2xl bg-navy/5 flex items-center justify-center border border-navy/5 shadow-inner">
              <User size={40} className="text-navy/40" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                 <span className="font-mono text-lg font-black tracking-tight text-navy">{student.rollNo}</span>
                 <span className="h-1.5 w-1.5 rounded-full bg-gold"></span>
                 <h1 className="text-2xl font-black text-navy">{student.name}</h1>
              </div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-black">
                {student.departmentName} · Curriculum Sem {student.semester} · Session {student.academicYear}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
             <Badge status={student.overallStatus || 'pending'} className="text-xs uppercase font-black tracking-widest px-4 py-1.5 shadow-sm" />
             <p className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">{student.overallStatus === 'cleared' ? 'Academic Eligibility Confirmed' : 'Clearance Sequence Active'}</p>
          </div>
        </div>
      </div>

      {/* Progress Stakeholders */}
      <h3 className="text-[10px] uppercase font-black tracking-[0.2em] text-navy/40 mb-6 px-1">Institutional Audit Trail</h3>
      <div className="grid grid-cols-1 gap-4">
        {approvals.map((item, i) => (
          <div key={i} className="bg-white rounded-2xl border border-muted shadow-sm p-6 hover:shadow-md transition-all group">
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-start gap-5">
                <div className="h-12 w-12 rounded-xl bg-navy/5 flex items-center justify-center shrink-0 group-hover:bg-navy/10 transition-colors shadow-inner border border-navy/5">
                  {item.type === 'subject' ? <BookOpen size={20} className="text-navy/60" /> :
                   item.type === 'class_teacher' ? <Shield size={20} className="text-navy/60" /> :
                   <User size={20} className="text-navy/60" />}
                </div>
                <div>
                  <p className="text-xs font-black text-navy uppercase tracking-tight">{getApprovalLabel(item)}</p>
                  <p className="text-[10px] font-black text-muted-foreground/50 mt-1 uppercase tracking-widest">Stakeholder: <span className="text-navy/70">{item.facultyName}</span></p>
                  {item.updatedAt && (
                    <div className="text-[9px] text-muted-foreground font-black uppercase tracking-widest mt-2 flex items-center gap-2 opacity-60">
                      <Clock size={12} strokeWidth={2.5} /> Updated {new Date(item.updatedAt).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
              <Badge status={item.status || 'pending'} className="scale-110" />
            </div>

            {/* Contingency/Remarks */}
            {item.status === 'due_marked' && (
              <div className="mt-6 ml-16 p-5 rounded-2xl bg-red-50/50 border border-red-100 relative">
                <div className="absolute -left-3 top-4 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white border-4 border-white">
                  <AlertTriangle size={12} strokeWidth={3} />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-black uppercase tracking-[0.15em] text-red-600">
                    Deficiency Identified: {item.dueType || 'Overage'}
                  </span>
                </div>
                <p className="text-xs text-red-900 font-bold italic leading-relaxed">"{item.remarks || 'No specific remarks registered.'}"</p>
              </div>
            )}

            {/* HOD Governance */}
            {item.status === 'hod_override' && (
              <div className="mt-6 ml-16 p-5 rounded-2xl bg-blue-50/50 border border-blue-100 relative">
                 <div className="absolute -left-3 top-4 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white border-4 border-white">
                  <Shield size={12} strokeWidth={3} />
                </div>
                <div>
                  <p className="text-[9px] font-black text-blue-800 uppercase tracking-[0.15em] mb-1.5">Governance Override Applied</p>
                  <p className="text-xs text-blue-900 font-bold italic">"{item.remarks || 'Confirmed eligibility via departmental verification.'}"</p>
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
