import React from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import { useApi } from '../../hooks/useApi';
import useSSE from '../../hooks/useSSE';
import { getStudentStatus } from '../../api/student';
import { getBatchSSEUrl } from '../../api/sse';
import { useAuth } from '../../hooks/useAuth';
import { 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Shield, 
  Calendar, 
  BookOpen,
  UserCheck,
  RefreshCw,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Info,
  FileText
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useUI } from '../../hooks/useUI';

const STATUS_CONFIG = {
  cleared: { banner: 'bg-emerald-500', icon: CheckCircle, label: 'No Outstanding Dues', sub: 'Your clearance is verified for the current cycle.' },
  hod_override: { banner: 'bg-blue-600', icon: Shield, label: 'Clearance Overridden', sub: 'Administrative exception applied by HoD.' },
  pending: { banner: 'bg-amber-500', icon: Clock, label: 'Clearance in Progress', sub: 'Some faculty approvals are still pending action.' },
  has_dues: { banner: 'bg-red-500', icon: AlertTriangle, label: 'Action Required: Dues Flagged', sub: 'Please resolve the highlighted dues to proceed.' },
  no_batch: { banner: 'bg-zinc-500', icon: Calendar, label: 'Cycle Not Initiated', sub: 'The clearance cycle for your current academic group has not started yet.' },
};

const CircularProgress = ({ cleared, total }) => {
  const { user } = useAuth();
  const percentage = total > 0 ? (cleared / total) * 100 : 0;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex items-center gap-6 sm:gap-8">
      {/* Circular SVG Container */}
      <div className="relative h-24 w-24 sm:h-28 sm:w-28 flex items-center justify-center shrink-0">
        <svg className="h-full w-full -rotate-90 transform overflow-visible" viewBox="0 0 96 96">
          <defs>
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--color-navy)" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          {/* Background Track */}
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke="currentColor"
            strokeWidth="5"
            fill="transparent"
            className="text-zinc-100"
          />
          {/* Progress Stroke */}
          <motion.circle
            cx="48"
            cy="48"
            r={radius}
            stroke="url(#progressGradient)"
            strokeWidth="6"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashoffset }}
            transition={{ duration: 1.5, ease: [0.34, 1.56, 0.64, 1] }}
            strokeLinecap="round"
            fill="transparent"
            style={{ filter: percentage > 0 ? 'url(#glow)' : 'none' }}
          />
        </svg>
        
        <div className="absolute inset-0 flex flex-col items-center justify-center translate-y-[-1px]">
          <div className="flex items-baseline">
            <span className="text-2xl sm:text-3xl font-black text-navy leading-none tracking-tighter">{cleared}</span>
            <span className="text-xs font-bold text-navy/20 ml-0.5">/{total}</span>
          </div>
          <p className="text-[8px] font-black text-navy/30 uppercase tracking-[0.25em] mt-1">Status</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xl sm:text-2xl font-black text-navy truncate tracking-tight">
            {user?.rollNo || 'Roll No'}
          </h2>
          <div className={`h-2.5 w-2.5 rounded-full ${cleared === total ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]' : 'bg-primary animate-pulse shadow-[0_0_12px_rgba(99,102,241,0.4)]'}`}></div>
        </div>
        
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-extrabold text-navy/40 uppercase tracking-[0.15em] truncate">
            Verification Progress
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-navy/60 italic bg-zinc-50 px-2 py-0.5 rounded-md border border-zinc-100">
              {total - cleared > 0 ? `${total - cleared} approvals remaining` : 'Academic clearance complete'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const StudentStatus = () => {
  const { showGlobalLoader } = useUI();
  const [activeFilter, setActiveFilter] = React.useState('all');
  const apiOptions = React.useMemo(() => ({ immediate: false }), []);
  const { data, loading, error, request: fetchStatus } = useApi(getStudentStatus, apiOptions);

  const clearanceData = data?.data || {};

  console.log('[SSE Debug] useApi data:', data);
  console.log('[SSE Debug] clearanceData:', clearanceData);
  console.log('[SSE Debug] Target SSE URL:', clearanceData?.batchId ? getBatchSSEUrl(clearanceData.batchId) : null);

  const handleRefresh = React.useCallback(async (silent = false) => {
    const hide = !silent ? showGlobalLoader('Syncing Your Records...') : () => {};
    try {
      await fetchStatus();
    } finally {
      if (!silent) hide();
    }
  }, [fetchStatus, showGlobalLoader]);

  React.useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  useSSE(clearanceData?.batchId ? getBatchSSEUrl(clearanceData.batchId) : null, (event) => {
    if (event?.event?.toLowerCase() === 'approval_updated' || event?.event?.toLowerCase() === 'batch_updated') {
      // Background updates should be silent as requested
      handleRefresh(true);
    }
  });

  const approvals = React.useMemo(() => clearanceData.approvals || [], [clearanceData.approvals]);

  const clearedCount = React.useMemo(() => approvals.filter(a => ['approved', 'hod_override'].includes(a.action)).length, [approvals]);

  const filteredApprovals = React.useMemo(() => {
    let list = [...approvals];
    
    if (activeFilter === 'pending') {
      list = list.filter(a => a.action === 'pending');
    }

    return list.sort((a, b) => {
      const order = { due_marked: 0, pending: 1, approved: 2, hod_override: 3 };
      return (order[a.action] ?? 99) - (order[b.action] ?? 99);
    });
  }, [approvals, activeFilter]);

  const totalCount = approvals.length;

  if (loading && !data) {
    return (
      <PageWrapper title="Dashboard" subtitle="Syncing clearance data...">
        <div className="animate-pulse flex flex-col gap-8">
           <div className="h-32 bg-muted/5 rounded-2xl border border-muted/50"></div>
           <div className="grid grid-cols-1 gap-4">
              {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted/5 rounded-2xl border border-muted/50"></div>)}
           </div>
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper title="Dashboard" subtitle="Connection Error">
        <div className="text-center py-20 px-6 bg-white rounded-2xl border border-red-100 shadow-sm border-b-4 border-b-red-500">
          <div className="h-16 w-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
             <AlertTriangle className="text-red-500" size={32} />
          </div>
          <h2 className="text-xl font-bold text-navy mb-2">Sync Error</h2>
          <p className="text-muted-foreground mb-8 text-xs font-medium max-w-[240px] mx-auto">{error}</p>
          <button 
            onClick={handleRefresh}
            className="px-6 py-2.5 bg-navy text-white rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-navy/90 transition-all flex items-center gap-2 mx-auto"
          >
            <RefreshCw size={12} strokeWidth={3} /> Try Re-Syncing
          </button>
        </div>
      </PageWrapper>
    );
  }

  if (!data) return null;

  return (
    <PageWrapper 
      title="Approval Status" 
      // subtitle={`${user?.rollNo || 'Candidate'} · Session ${clearanceData.academicYear} · Sem ${clearanceData.semester}`}
    >
      <div className="flex flex-col gap-8 pb-12">
        {/* Simplified Header Metric */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="premium-card p-6 sm:p-10 relative overflow-hidden group glow-indigo rounded-3xl"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-navy/[0.03] rounded-full translate-x-32 -translate-y-32 group-hover:scale-110 transition-transform duration-1000"></div>
          <CircularProgress cleared={clearedCount} total={totalCount} />
        </motion.div>

        {/* Action List Section */}
        <div className="space-y-6 ">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
               <div className="flex items-center gap-3">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-navy/40">Status Registry</h3>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-500/20">
                    <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter">Live Sync</span>
                  </div>
               </div>
            </div>

            <div className="flex items-center gap-2 px-1">
              {[
                { id: 'all', label: 'All Items' },
                { id: 'pending', label: 'Pending' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap ${
                    activeFilter === f.id 
                    ? 'bg-navy text-white shadow-lg shadow-navy/20 active:scale-95' 
                    : 'bg-white border border-zinc-200/60 text-zinc-400 hover:border-navy/20 hover:text-navy/50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {filteredApprovals.map((item, i) => {
              const isDue = item.action === 'due_marked';
              const isOverride = item.action === 'hod_override';
              const isApproved = item.action === 'approved';

              return (
                <motion.div 
                  key={item.id || i} 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`rounded-2xl premium-card p-5 sm:p-6 flex flex-col gap-6 border border-zinc-200/50 relative group hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-navy/5 transition-all duration-500 ${
                    isDue ? 'border-l-[6px] border-l-red-500' : 
                    isOverride ? 'border-l-[6px] border-l-indigo-500' : 
                    isApproved ? 'border-l-[6px] border-l-emerald-500' : 'border-l-[6px] border-l-amber-400'
                  }`}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[2rem] pointer-events-none" />

                  <div className="flex items-start justify-between gap-4 relative">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="relative shrink-0">
                        <div className={`absolute inset-0 blur-2xl opacity-10 rounded-full transition-all duration-500 group-hover:opacity-20 ${
                          isApproved ? 'bg-emerald-500' : isDue ? 'bg-red-500' : 'bg-amber-500'
                        }`} />
                        <div className={`h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center relative border transition-all duration-500 group-hover:scale-110 ${
                          isApproved ? 'bg-emerald-50 border-emerald-100/50 text-emerald-600 shadow-sm shadow-emerald-500/10' : 
                          isDue ? 'bg-red-50 border-red-100/50 text-red-600 shadow-sm shadow-red-500/10' : 
                          'bg-zinc-50 border-zinc-100 text-zinc-400 shadow-sm'
                        }`}>
                          {item.approvalType === 'subject' ? 
                            <BookOpen size={24} strokeWidth={2.5} /> : 
                            <UserCheck size={24} strokeWidth={2.5} />
                          }
                        </div>
                      </div>
                      
                      <div className="min-w-0 pt-0.5">
                        <div className="flex flex-col gap-1 mb-1.5">
                          {item.subjectCode && (
                            <span className="text-[8px] font-black text-navy/30 uppercase tracking-[0.2em]">
                              {item.subjectCode}
                            </span>
                          )}
                          <h4 className="text-base sm:text-lg font-black text-navy truncate leading-none tracking-tight group-hover:text-indigo-600 transition-colors">
                            {item.subjectName}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2">
                           <span className="text-[9px] font-black uppercase tracking-widest text-zinc-300">Authority</span>
                           <div className="h-px w-2 bg-zinc-200" />
                           <span className="text-[11px] font-bold text-zinc-500/80 truncate">{item.facultyName || 'Administrative Dept.'}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-2">
                      <Badge status={item.action} className="shrink-0 shadow-sm" />
                      {isApproved && (
                         <div className="flex items-center gap-1.5 text-emerald-500/80 px-2 py-0.5 bg-emerald-50/50 rounded-lg border border-emerald-100/50">
                            <CheckCircle size={10} strokeWidth={3} />
                            <span className="text-[8px] font-black uppercase tracking-tighter">Verified</span>
                         </div>
                      )}
                    </div>
                  </div>

                  {(isDue || isOverride) && (
                    <motion.div 
                      initial={{ scale: 0.98, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={`p-4 rounded-2xl border ${isDue ? 'bg-red-50/40 border-red-100/60 shadow-inner' : 'bg-indigo-50/40 border-indigo-100/60 shadow-inner'}`}
                    >
                      {isDue && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 text-red-600">
                            <AlertTriangle size={14} strokeWidth={3} />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Deficiency Detected</span>
                          </div>
                          <div className="space-y-1">
                             <p className="text-[9px] font-black uppercase text-red-800/30 tracking-wider">Type</p>
                             <p className="text-sm font-bold text-red-900/70 leading-snug">{item.dueType || 'Pending Dues'}</p>
                          </div>
                          {item.remarks && (
                            <div className="pt-2.5 mt-1 border-t border-red-200/30">
                               <p className="text-[9px] font-black uppercase text-red-800/30 tracking-wider mb-1">Remarks</p>
                               <p className="text-xs font-semibold text-red-900/60 italic leading-relaxed">"{item.remarks}"</p>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {isOverride && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 text-indigo-600">
                            <Shield size={14} strokeWidth={3} />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">HoD Authorization</span>
                          </div>
                          <div className="space-y-1">
                             <p className="text-[9px] font-black uppercase text-indigo-800/30 tracking-wider">Note</p>
                             <p className="text-sm font-bold text-indigo-900/70 leading-snug">{item.remarks || 'Electronic override authorized by department head.'}</p>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-zinc-100/80">
                    <div className="flex items-center gap-4">
                       <div className="flex items-center gap-1.5 text-zinc-400">
                          <Clock size={11} />
                          <p className="text-[9px] font-black uppercase tracking-[0.15em]">
                            {item.actionedAt ? new Date(item.actionedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Pending Update'}
                          </p>
                       </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-[9px] font-bold text-zinc-300 uppercase tracking-widest">#{item.id ? item.id.slice(-6).toUpperCase() : '----'}</p>
                      <button className="h-6 w-6 rounded-lg border border-zinc-100 flex items-center justify-center text-zinc-300 hover:text-navy hover:border-navy/20 transition-all">
                        <Info size={12} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {totalCount === 0 && (
              <div className="col-span-full py-12 flex flex-col items-center justify-center text-center opacity-40">
                <div className="h-12 w-12 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
                  <Clock size={24} className="text-zinc-400" />
                </div>
                <p className="text-xs font-bold text-navy uppercase tracking-widest">No clearance data found</p>
              </div>
            )}
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-zinc-100/60 text-center pb-8">
          <p className="text-[10px] uppercase tracking-[0.2em] font-black text-zinc-300">
            Platform built by
          </p>
          <p className="text-[11px] font-brand text-navy mt-1 opacity-70">
            ARC Club <span className="text-gold">-</span> Community
          </p>
        </div>
      </div>
    </PageWrapper>
  );
};

export default StudentStatus;
