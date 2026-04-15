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
  Info,
  History as HistoryIcon,
  LayoutDashboard,
  ChevronLeft
} from 'lucide-react';
import { useParams, Link } from 'react-router-dom';
import { useUI } from '../../hooks/useUI';
import { motion } from 'framer-motion';

const CircularProgress = ({ cleared, total }) => {
  const percentage = total > 0 ? (cleared / total) * 100 : 0;
  const radius = 34; // Slightly reduced for mobile better fit
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col sm:flex-row items-center sm:items-center gap-6 sm:gap-10">
      <div className="relative h-24 w-24 sm:h-28 sm:w-28 flex items-center justify-center shrink-0">
        <svg className="h-full w-full -rotate-90 transform overflow-visible" viewBox="0 0 96 96">
          <defs>
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1e1b4b" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
          </defs>
          <circle cx="48" cy="48" r={radius} stroke="currentColor" strokeWidth="6" fill="transparent" className="text-zinc-100" />
          <motion.circle
            cx="48" cy="48" r={radius} stroke="url(#progressGradient)" strokeWidth="7"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashoffset }}
            transition={{ duration: 1.5, ease: [0.34, 1.56, 0.64, 1] }}
            strokeLinecap="round" fill="transparent"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center translate-y-[-1px]">
          <div className="flex items-baseline">
            <span className="text-2xl sm:text-3xl font-black text-navy leading-none tracking-tighter">{cleared}</span>
            <span className="text-xs font-bold text-navy/20 ml-0.5">/{total}</span>
          </div>
          <p className="text-[7px] sm:text-[8px] font-black text-navy/30 uppercase tracking-[0.25em] mt-1">Status</p>
        </div>
      </div>
      
      <div className="flex-1 min-w-0 text-center sm:text-left">
        <div className="flex items-center justify-center sm:justify-start gap-2.5 mb-1">
          <p className="text-[10px] font-extrabold text-navy/40 uppercase tracking-[0.15em] truncate pr-4">Verification Progress</p>
        </div>
        <span className="text-[11px] font-bold text-navy/60 italic bg-zinc-50 px-3 py-1 rounded-full border border-zinc-100">
          {total - cleared > 0 ? `${total - cleared} approvals remaining` : 'Clearance complete'}
        </span>
      </div>
    </div>
  );
};

const StudentStatus = () => {
  const { requestId } = useParams();
  const isHistoryMode = !!requestId;
  const { showGlobalLoader } = useUI();
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = React.useState('all');
  const apiOptions = React.useMemo(() => ({ immediate: false }), [requestId]); // Stabilize options
  const { data, loading, error, request: fetchStatus } = useApi(() => getStudentStatus(requestId), apiOptions);

  const clearanceData = data?.data || {};
  const approvals = clearanceData.approvals || [];

  // Production Logic: Only show global overlay for manual sync button
  const handleRefresh = React.useCallback(async (mode = 'silent') => {
    const isManual = mode === 'manual';
    const hide = isManual ? showGlobalLoader('Syncing Your Records...') : () => {};
    try {
      await fetchStatus();
    } finally {
      if (isManual) hide();
    }
  }, [fetchStatus, showGlobalLoader]);

  // Sync on mount - SILENT to prevent double-spinner flicker
  React.useEffect(() => { 
    handleRefresh('silent'); 
  }, [handleRefresh, requestId]);

  useSSE(clearanceData?.batchId && !isHistoryMode ? getBatchSSEUrl(clearanceData.batchId) : null, (event) => {
    if (event?.event?.toLowerCase() === 'approval_updated' || event?.event?.toLowerCase() === 'batch_updated') {
      handleRefresh('silent');
    }
  });

  const filteredApprovals = React.useMemo(() => {
    let list = [...approvals];
    if (activeFilter === 'pending') list = list.filter(a => a.action === 'pending');
    return list.sort((a, b) => {
      const order = { due_marked: 0, pending: 1, approved: 2, hod_override: 3 };
      return (order[a.action] ?? 99) - (order[b.action] ?? 99);
    });
  }, [approvals, activeFilter]);

  const clearedCount = approvals.filter(a => ['approved', 'hod_override'].includes(a.action)).length;

  if (loading && !data) {
    return (
      <PageWrapper title="Dashboard" subtitle="Syncing clearance data...">
        <div className="animate-pulse space-y-8 p-4 sm:p-0">
           <div className="h-48 sm:h-32 bg-zinc-50 rounded-3xl border border-zinc-100" />
           <div className="grid grid-cols-1 gap-4">
              {[1, 2, 3].map(i => <div key={i} className="h-24 bg-zinc-50 rounded-2xl border border-zinc-100" />)}
           </div>
        </div>
      </PageWrapper>
    );
  }

  if (clearanceData.status === 'no_batch') {
    return (
      <PageWrapper title="No-Dues Status">
         <div className="flex flex-col items-center justify-center text-center py-24 px-6 min-h-[60vh]">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="h-20 w-20 sm:h-24 sm:w-24 bg-zinc-50 rounded-[2rem] sm:rounded-[2.5rem] flex items-center justify-center mb-8 border border-zinc-100 shadow-inner"
            >
              <Calendar size={32} className="text-zinc-300" />
            </motion.div>
            <h2 className="text-2xl sm:text-3xl font-black text-navy tracking-tight mb-3">Not Active Cycle</h2>
            <p className="max-w-[280px] sm:max-w-[320px] text-xs sm:text-sm font-medium text-muted-foreground mx-auto mb-10 leading-relaxed pb-4">
              There is currently no active no-dues cycle initiated by your department. Please check back later or view your previous records.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto px-4 sm:px-0">
              <Link 
                to="/student/history"
                className="px-8 py-4 bg-navy text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-navy/90 hover:shadow-2xl hover:shadow-navy/20 transition-all flex items-center justify-center gap-3 active:scale-95"
              >
                <HistoryIcon size={16} strokeWidth={3} /> View Previous Records
              </Link>
              <button 
                onClick={() => handleRefresh('manual')}
                className="px-8 py-4 bg-white border border-zinc-200 text-navy rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-50 transition-all flex items-center justify-center gap-3 active:scale-95 text-nowrap"
              >
                <RefreshCw size={16} /> Reload Dashboard
              </button>
            </div>
         </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Approval Status">
      <div className="flex flex-col gap-6 sm:gap-8 pb-12 px-4 sm:px-0 mt-4 sm:mt-0">
        
        {/* Content Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-2">
          <div className="space-y-3">
            {isHistoryMode && (
              <Link 
                to="/student/history" 
                className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-navy/40 hover:text-navy transition-colors mb-2"
              >
                <ChevronLeft size={14} />
                Back to History
              </Link>
            )}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-navy tracking-tighter leading-none">
              {isHistoryMode ? 'Archived Record' : 'Current Status'}
            </h1>
            <div className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_12px_rgba(79,70,229,0.4)]" />
              <p className="text-[10px] sm:text-xs font-bold text-navy/40 uppercase tracking-[0.2em]">
                {isHistoryMode ? `Cycle: ${clearanceData.metadata?.semester || '?'} Sem | ${clearanceData.metadata?.academicYear || 'Session'}` : 'Real-time Approval Monitoring'}
              </p>
            </div>
          </div>
          
          {!isHistoryMode && (
            <button 
              onClick={() => handleRefresh('manual')}
              className="group flex items-center gap-3 px-6 py-3 bg-white border border-zinc-100 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-navy hover:bg-zinc-50 transition-all active:scale-95 shadow-sm"
            >
              <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
              Sync Now
            </button>
          )}
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="premium-card p-6 sm:p-10 relative overflow-hidden group glow-indigo rounded-[2rem] bg-white border border-zinc-100 shadow-xl shadow-navy/5"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full sm:hidden" />
          <CircularProgress cleared={clearedCount} total={approvals.length} />
        </motion.div>

        <div className="space-y-6">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-navy/40">Status Registry</h3>
            <div className="flex items-center gap-2">
              {['all', 'pending'].map(f => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-4 py-2 sm:py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                    activeFilter === f ? 'bg-navy text-white shadow-lg shadow-navy/20' : 'bg-white border text-zinc-400 hover:text-navy border-zinc-100'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredApprovals.map((item, i) => {
              const isApproved = ['approved', 'hod_override'].includes(item.action);
              const isDue = item.action === 'due_marked';
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white border border-zinc-100 rounded-3xl p-5 sm:p-6 shadow-sm group hover:shadow-xl transition-all active:ring-2 active:ring-indigo-500/10"
                >
                  <div className="flex items-center justify-between gap-4">
                     <div className="flex items-center gap-4 min-w-0">
                        <div className={`h-12 w-12 rounded-2xl shrink-0 flex items-center justify-center ${isApproved ? 'bg-emerald-50 text-emerald-600' : isDue ? 'bg-red-50 text-red-600' : 'bg-zinc-50 text-zinc-400'}`}>
                          {item.approvalType === 'subject' ? <BookOpen size={20} /> : <UserCheck size={20} />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm sm:text-base font-black text-navy tracking-tight truncate pr-2">{item.subjectName}</h4>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest truncate">{item.facultyName || 'Staff Center'}</p>
                        </div>
                     </div>
                     <Badge status={item.action} />
                  </div>
                  
                  {isDue && item.remarks && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="mt-4 p-4 bg-red-50/50 rounded-2xl border border-red-100/50"
                    >
                      <div className="flex gap-3">
                         <Info size={14} className="text-red-400 shrink-0 mt-0.5" />
                         <p className="text-[11px] font-bold text-red-900/60 leading-relaxed italic">"{item.remarks}"</p>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};

export default StudentStatus;
