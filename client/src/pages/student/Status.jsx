import React, { useEffect } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import { useApi } from '../../hooks/useApi';
import useSSE from '../../hooks/useSSE';
import { getStudentStatus } from '../../api/student';
import { getBatchSSEUrl } from '../../api/sse';
import { 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Shield, 
  Calendar, 
  GraduationCap,
  BookOpen,
  UserCheck,
  RefreshCw
} from 'lucide-react';

const STATUS_CONFIG = {
  cleared: { banner: 'bg-emerald-500', icon: CheckCircle, label: 'No Outstanding Dues', sub: 'Your clearance is verified for the current cycle.' },
  hod_override: { banner: 'bg-blue-600', icon: Shield, label: 'Clearance Overridden', sub: 'Administrative exception applied by HoD.' },
  pending: { banner: 'bg-amber-500', icon: Clock, label: 'Clearance in Progress', sub: 'Some faculty approvals are still pending action.' },
  has_dues: { banner: 'bg-red-500', icon: AlertTriangle, label: 'Action Required: Dues Flagged', sub: 'Please resolve the highlighted dues to proceed.' },
};

const StudentStatus = () => {
  const { data, loading, error, request: fetchStatus } = useApi(getStudentStatus, { immediate: true });

  // Real-time listener for status changes
  useSSE(data?.batchId ? getBatchSSEUrl(data.batchId) : null, (event) => {
    if (event.type === 'approval_updated' || event.type === 'batch_updated') {
      fetchStatus();
    }
  });

  if (loading && !data) {
    return (
      <PageWrapper title="My Clearance" subtitle="Fetching your status...">
        <div className="flex flex-col items-center justify-center min-h-[400px] animate-pulse">
           <div className="h-48 w-full bg-muted/5 rounded-2xl border border-muted mb-12 shadow-inner"></div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full px-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted/5 rounded-xl border border-muted"></div>)}
           </div>
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper title="My Clearance" subtitle="Error loading status">
        <div className="text-center py-24 px-6 bg-white rounded-3xl border border-muted shadow-sm">
          <div className="h-20 w-20 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
             <AlertTriangle className="text-red-500" size={40} />
          </div>
          <h2 className="text-2xl font-black text-navy mb-3 italic">Sync Disruption</h2>
          <p className="text-muted-foreground mb-8 max-w-xs mx-auto text-sm leading-relaxed">{error}</p>
          <button 
            onClick={() => fetchStatus()}
            className="px-8 py-3 bg-navy text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-navy/90 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 mx-auto shadow-xl shadow-navy/10"
          >
            <RefreshCw size={14} strokeWidth={3} /> Re-establish Link
          </button>
        </div>
      </PageWrapper>
    );
  }

  if (!data) return null;

  const cfg = STATUS_CONFIG[data.overallStatus] || STATUS_CONFIG.pending;

  return (
    <PageWrapper title="Institutional Clearance" subtitle={`Cycle: ${data.academicYear} · Sem ${data.semester}`}>
      {/* Overall Status Banner */}
      <div className={`${cfg.banner} rounded-3xl p-6 sm:p-8 md:p-10 text-white mb-8 sm:mb-14 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8 relative overflow-hidden transition-all duration-700`}>
        <div className="relative z-10 flex flex-col sm:flex-row items-center text-center sm:text-left gap-4 sm:gap-8">
          <div className="h-16 w-16 sm:h-20 sm:w-20 bg-white/20 rounded-2xl flex items-center justify-center shrink-0 backdrop-blur-md border border-white/20 shadow-inner">
             <cfg.icon className="w-8 h-8 sm:w-10 sm:h-10" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight leading-tight mb-1 sm:mb-2">{cfg.label}</h2>
            <p className="text-white/80 text-[10px] sm:text-xs font-bold uppercase tracking-widest leading-relaxed max-w-sm">{cfg.sub}</p>
          </div>
        </div>
        <div className="relative z-10 bg-white/10 px-6 py-3 sm:px-8 sm:py-4 rounded-2xl border border-white/20 backdrop-blur-md text-center hover:bg-white/20 transition-all cursor-default w-full sm:w-auto">
           <p className="text-[8px] sm:text-[9px] uppercase tracking-[0.3em] font-black opacity-50 mb-1 leading-none">Record State</p>
           <p className="text-[10px] sm:text-xs font-black flex items-center justify-center sm:justify-start gap-2 tracking-widest uppercase">{data.overallStatus === 'cleared' ? 'Verified' : 'Active Cycle'}</p>
        </div>
        <cfg.icon className="absolute -right-8 sm:-right-12 -bottom-8 sm:-bottom-12 w-48 h-48 sm:w-64 sm:h-64 opacity-15 pointer-events-none" />
      </div>

      {/* Profile Metrics */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-10 sm:mb-12">
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-muted shadow-sm flex items-center gap-3 sm:gap-4 hover:border-navy/10 transition-colors">
          <div className="h-10 w-10 sm:h-12 sm:w-12 bg-navy/5 rounded-xl flex items-center justify-center text-navy/40 shrink-0"><GraduationCap size={20} className="sm:w-6 sm:h-6" /></div>
          <div className="min-w-0"><p className="text-[8px] sm:text-[10px] uppercase font-black text-muted-foreground/50 tracking-[0.15em] mb-0.5 truncate">Identification</p><p className="text-xs sm:text-sm font-black text-navy truncate">{data.rollNo}</p></div>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-muted shadow-sm flex items-center gap-3 sm:gap-4 hover:border-navy/10 transition-colors">
          <div className="h-10 w-10 sm:h-12 sm:w-12 bg-navy/5 rounded-xl flex items-center justify-center text-navy/40 shrink-0"><Calendar size={20} className="sm:w-6 sm:h-6" /></div>
          <div className="min-w-0"><p className="text-[8px] sm:text-[10px] uppercase font-black text-muted-foreground/50 tracking-[0.15em] mb-0.5 truncate">Academic Cycle</p><p className="text-xs sm:text-sm font-black text-navy truncate">{data.academicYear}</p></div>
        </div>
      </div>

      {/* Approval List */}
      <div className="flex items-center justify-between mb-6 sm:mb-8 px-1">
         <h2 className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.25em] text-navy/30">Stakeholder Trajectory</h2>
         <div className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {data.approvals?.map((item, i) => (
          <div key={i} className="bg-white rounded-2xl border border-muted shadow-sm p-6 sm:p-8 flex items-start gap-4 sm:gap-6 hover:shadow-xl hover:translate-y-[-2px] transition-all group overflow-hidden relative">
            <div className="absolute top-0 right-0 p-6 sm:p-8 opacity-5 group-hover:opacity-10 transition-opacity select-none pointer-events-none">
               {item.approvalType === 'subject' ? <BookOpen size={48} className="sm:w-16 sm:h-16" /> : <UserCheck size={48} className="sm:w-16 sm:h-16" />}
            </div>
            
            <div className={`h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-offwhite flex items-center justify-center shrink-0 group-hover:bg-navy/5 transition-all shadow-inner border border-muted/50`}>
               {item.approvalType === 'subject' ? <BookOpen size={20} className="text-navy/60 group-hover:text-navy sm:w-6 sm:h-6" /> : <UserCheck size={20} className="text-navy/60 group-hover:text-navy sm:w-6 sm:h-6" />}
            </div>
            <div className="flex-1 min-w-0 relative z-10">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4 mb-3">
                <div className="min-w-0">
                  <h3 className="text-[12px] sm:text-sm font-black text-navy truncate tracking-tight uppercase">
                    {item.subjectName || (item.approvalType === 'mentor' ? 'Institutional Mentor' : 'Academic Advisor')}
                  </h3>
                  {item.subjectCode && <p className="text-[9px] font-mono text-muted-foreground/30 mt-0.5">[{item.subjectCode}]</p>}
                  <p className="text-[8px] sm:text-[10px] font-black text-muted-foreground/40 mt-1 uppercase tracking-widest truncate">{item.facultyName || 'Office of Administration'}</p>
                </div>
                <Badge status={item.action} className="scale-100 sm:scale-110 shadow-sm shrink-0" />
              </div>

              {item.action === 'due_marked' && (
                <div className="mt-4 sm:mt-5 p-4 sm:p-5 rounded-2xl bg-red-50/50 border border-red-100/50 relative">
                  <div className="absolute -left-1 sm:-left-2 top-3 sm:top-4 w-3 h-3 sm:w-4 sm:h-4 bg-red-500 rounded-full flex items-center justify-center text-[6px] sm:text-[8px] text-white border-2 border-white">
                    <AlertTriangle size={8} strokeWidth={4} />
                  </div>
                  <p className="text-[8px] sm:text-[9px] font-black text-red-600 uppercase tracking-[0.2em] mb-1 sm:mb-2">Deficiency Flagged: {item.dueType}</p>
                  <p className="text-[10px] sm:text-xs text-red-900 font-bold italic leading-relaxed">"{item.remarks || 'No specific remarks provided.'}"</p>
                </div>
              )}

              {item.action === 'hod_override' && (
                <div className="mt-4 sm:mt-5 p-4 sm:p-5 rounded-2xl bg-blue-50/50 border border-blue-100/50 flex items-start gap-3 sm:gap-4 relative">
                  <div className="absolute -left-1 sm:-left-2 top-3 sm:top-4 w-3 h-3 sm:w-4 sm:h-4 bg-blue-500 rounded-full flex items-center justify-center text-[6px] sm:text-[8px] text-white border-2 border-white">
                    <Shield size={8} strokeWidth={4} />
                  </div>
                  <div>
                    <p className="text-[8px] sm:text-[9px] font-black text-blue-800 uppercase tracking-[0.2em] leading-none mb-1 sm:mb-2">HoD Governance Override</p>
                    <p className="text-[10px] sm:text-xs text-blue-900 font-bold italic leading-relaxed">"{item.remarks || 'Confirmed academic eligibility via manual verification.'}"</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </PageWrapper>
  );
};

export default StudentStatus;
