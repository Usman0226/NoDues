import React, { useEffect } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import { useApi } from '../../hooks/useApi';
import useSSE from '../../hooks/useSSE';
import { getStudentStatus } from '../../api/studentPortal';
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

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

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
    <PageWrapper title="Institutional Clearance" subtitle={`Current Cycle: ${data.academicYear} · Semester ${data.semester}`}>
      {/* Overall Status Banner */}
      <div className={`${cfg.banner} rounded-3xl p-10 text-white mb-14 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden transition-all duration-700`}>
        <div className="relative z-10 flex items-center gap-8">
          <div className="h-20 w-20 bg-white/20 rounded-2xl flex items-center justify-center shrink-0 backdrop-blur-md border border-white/20 shadow-inner">
             <cfg.icon size={40} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight leading-none mb-2">{cfg.label}</h2>
            <p className="text-white/80 text-sm font-bold uppercase tracking-widest">{cfg.sub}</p>
          </div>
        </div>
        <div className="relative z-10 bg-white/10 px-8 py-4 rounded-2xl border border-white/20 backdrop-blur-md text-center hover:bg-white/20 transition-all cursor-default" title="Status automatically synchronizes in real-time">
           <p className="text-[9px] uppercase tracking-[0.3em] font-black opacity-50 mb-1 leading-none">Record State</p>
           <p className="text-xs font-black flex items-center gap-2 tracking-widest uppercase">{data.overallStatus === 'cleared' ? 'Verified' : 'Active Cycle'}</p>
        </div>
        <cfg.icon size={250} className="absolute -right-12 -bottom-12 opacity-15 pointer-events-none" />
      </div>

      {/* Profile Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <div className="bg-white p-6 rounded-2xl border border-muted shadow-sm flex items-center gap-4 hover:border-navy/10 transition-colors">
          <div className="h-12 w-12 bg-navy/5 rounded-xl flex items-center justify-center text-navy/40"><GraduationCap size={24} /></div>
          <div><p className="text-[10px] uppercase font-black text-muted-foreground/50 tracking-[0.15em] mb-0.5">Identification</p><p className="text-sm font-black text-navy">{data.rollNo}</p></div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-muted shadow-sm flex items-center gap-4 hover:border-navy/10 transition-colors">
          <div className="h-12 w-12 bg-navy/5 rounded-xl flex items-center justify-center text-navy/40"><Calendar size={24} /></div>
          <div><p className="text-[10px] uppercase font-black text-muted-foreground/50 tracking-[0.15em] mb-0.5">Academic Cycle</p><p className="text-sm font-black text-navy">{data.academicYear}</p></div>
        </div>
      </div>

      {/* Approval List */}
      <div className="flex items-center justify-between mb-8 px-1">
         <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-navy/30">Stakeholder Trajectory</h2>
         <div className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.approvals?.map((item, i) => (
          <div key={i} className="bg-white rounded-2xl border border-muted shadow-sm p-8 flex items-start gap-6 hover:shadow-xl hover:translate-y-[-2px] transition-all group overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity select-none pointer-events-none">
               {item.approvalType === 'subject' ? <BookOpen size={64} /> : <UserCheck size={64} />}
            </div>
            
            <div className={`h-14 w-14 rounded-2xl bg-offwhite flex items-center justify-center shrink-0 group-hover:bg-navy/5 transition-all shadow-inner border border-muted/50`}>
               {item.approvalType === 'subject' ? <BookOpen size={24} className="text-navy/60 group-hover:text-navy" /> : <UserCheck size={24} className="text-navy/60 group-hover:text-navy" />}
            </div>
            <div className="flex-1 min-w-0 relative z-10">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-navy truncate tracking-tight uppercase">
                    {item.subjectName || (item.approvalType === 'mentor' ? 'Institutional Mentor' : 'Academic Advisor')}
                    {item.subjectCode && <span className="text-muted-foreground/30 ml-2 font-mono text-[10px]">[{item.subjectCode}]</span>}
                  </h3>
                  <p className="text-[10px] font-black text-muted-foreground/40 mt-1 uppercase tracking-widest">{item.facultyName || 'Office of Administration'}</p>
                </div>
                <Badge status={item.action} className="scale-110 shadow-sm" />
              </div>

              {item.action === 'due_marked' && (
                <div className="mt-5 p-5 rounded-2xl bg-red-50/50 border border-red-100/50 relative">
                  <div className="absolute -left-2 top-4 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[8px] text-white border-2 border-white">
                    <AlertTriangle size={8} strokeWidth={4} />
                  </div>
                  <p className="text-[9px] font-black text-red-600 uppercase tracking-[0.2em] mb-2">Deficiency Flagged: {item.dueType}</p>
                  <p className="text-xs text-red-900 font-bold italic leading-relaxed">"{item.remarks || 'No specific remarks provided.'}"</p>
                </div>
              )}

              {item.action === 'hod_override' && (
                <div className="mt-5 p-5 rounded-2xl bg-blue-50/50 border border-blue-100/50 flex items-start gap-4 relative">
                  <div className="absolute -left-2 top-4 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-[8px] text-white border-2 border-white">
                    <Shield size={8} strokeWidth={4} />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-blue-800 uppercase tracking-[0.2em] leading-none mb-2">HoD Governance Override</p>
                    <p className="text-xs text-blue-900 font-bold italic leading-relaxed">"{item.remarks || 'Confirmed academic eligibility via manual verification.'}"</p>
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
