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
  FileText,
  Info,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  History as HistoryIcon,
  Plus,
  ExternalLink,
  FileUp,
  X,
} from 'lucide-react';
import { useParams, Link } from 'react-router-dom';
import { useUI } from '../../hooks/useUI';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { submitCoCurricular } from '../../api/coCurricular';
import { toast } from 'react-hot-toast';

const CircularProgress = ({ cleared, total, rollNo }) => {
  const percentage = total > 0 ? (cleared / total) * 100 : 0;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex items-center gap-6 sm:gap-8 relative z-10">
      <div className="relative h-24 w-24 sm:h-28 sm:w-28 flex items-center justify-center shrink-0">
        <svg className="h-full w-full -rotate-90 transform overflow-visible" viewBox="0 0 96 96">
          <defs>
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1e1b4b" />
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
            {rollNo || 'Roll No'}
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

const REGISTRY_GROUPS = [
  { 
    id: 'subjects', 
    label: 'Academic Subjects', 
    filter: (a) => a.approvalType === 'subject', 
    icon: BookOpen,
    gradient: 'from-blue-500 to-indigo-600'
  },
  { 
    id: 'mentor', 
    label: 'Mentorship & Advisory', 
    filter: (a) => ['mentor', 'classTeacher'].includes(a.roleTag) && !a.itemTypeId, 
    icon: UserCheck,
    gradient: 'from-emerald-500 to-teal-600'
  },
  { 
    id: 'hod', 
    label: 'Department', 
    filter: (a) => a.roleTag === 'hod', 
    icon: Shield,
    gradient: 'from-purple-500 to-navy'
  },
  {
    id: 'co-curricular',
    label: 'Co-Curricular',
    filter: (a) => a.approvalType === 'coCurricular' || !!a.itemTypeId,
    icon: ClipboardCheck, 
    gradient: 'from-amber-500 to-orange-600'
  },
  { 
    id: 'other', 
    label: 'Other Clearances', 
    filter: (a, seenIds) => !seenIds.has(a.id), 
    icon: FileText,
    gradient: 'from-zinc-400 to-zinc-600'
  }
];
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
      ease: [0.22, 1, 0.36, 1],
      duration: 0.6
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1]
    }
  }
};

const MemoizedClearanceCard = React.memo(({ 
  item, 
  index, 
  handleOpenSubmission, 
  canSubmit, 
  isCoCurricular,
  isApproved,
  isRejected,
  isNotSubmitted,
  isPendingCoordinator,
  isDue,
  isOverride
}) => {
  return (
    <motion.div 
      variants={itemVariants}
      whileHover={{ y: -8, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }}
      className={`rounded-2xl premium-card p-5 sm:p-6 flex flex-col gap-2 border border-zinc-200/50 relative group hover:shadow-xl hover:shadow-navy/5 ${
        isDue || isRejected ? 'border-l-[6px] border-l-red-500' : 
        isOverride ? 'border-l-[6px] border-l-indigo-500' : 
        isApproved ? 'border-l-[6px] border-l-emerald-500' : 
        isPendingCoordinator ? 'border-l-[6px] border-l-amber-400' : 'border-l-[6px] border-l-zinc-300'
      }`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[2rem] pointer-events-none" />

      {/* Top Right Status Logo */}
      <div className="absolute top-5 right-5 sm:top-6 sm:right-6 z-10 flex items-center justify-center">
        {isApproved ? (
          <div className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center border border-emerald-100 shadow-sm" title="Verified">
            <CheckCircle size={14} strokeWidth={3} />
          </div>
        ) : isRejected || isDue ? (
          <div className="h-8 w-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center border border-red-100 shadow-sm" title={isRejected ? "Rejected" : "Action Required"}>
            <AlertTriangle size={14} strokeWidth={3} />
          </div>
        ) : isPendingCoordinator ? (
          <div className="h-8 w-8 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center border border-amber-100 shadow-sm" title="Pending Verification">
            <Clock size={14} strokeWidth={3} />
          </div>
        ) : isNotSubmitted ? (
          <div className="h-8 w-8 rounded-full bg-zinc-50 text-zinc-400 flex items-center justify-center border border-zinc-200 shadow-sm" title={item.formFields?.length > 0 ? "Not Submitted" : "Pending Coordinator"}>
            <Clock size={14} strokeWidth={3} />
          </div>
        ) : (
          <div className="h-8 w-8 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center border border-amber-100 shadow-sm" title="Pending">
            <Clock size={14} strokeWidth={3} />
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-start justify-between gap-6 relative">
        <div className="flex items-start gap-4 sm:gap-6 min-w-0 w-full sm:w-auto">
          <div className="relative shrink-0">
            {/* Removed Expensive Blur for Mobile Performance */}
            <div 
              style={{ transition: 'all 0.8s var(--ease-lux)' }}
              className={`h-14 w-14 sm:h-16 sm:w-16 rounded-[1.5rem] flex items-center justify-center relative border group-hover:rotate-6 group-hover:scale-110 ${
              isApproved ? 'bg-emerald-50 border-emerald-100/50 text-emerald-600 shadow-sm shadow-emerald-500/10' : 
              (isDue || isRejected) ? 'bg-red-50 border-red-100/50 text-red-600 shadow-sm shadow-red-500/10' : 
              'bg-zinc-50 border-zinc-100 text-zinc-400 shadow-sm'
            }`}>
              {item.approvalType === 'subject' ? 
                <BookOpen size={28} strokeWidth={2.5} /> : 
                item.approvalType === 'coCurricular' ?
                <ClipboardCheck size={28} strokeWidth={2.5} /> :
                <UserCheck size={28} strokeWidth={2.5} />
              }
            </div>
          </div>
          
          <div className="min-w-0 flex-1 pt-1 pr-10 sm:pr-12">
            <div className="flex flex-col gap-2 mb-3">
              {(item.subjectCode || item.itemCode) && (
                <div className="flex">
                  <span className="px-2 py-0.5 rounded-md bg-navy/[0.04] border border-navy/[0.06] text-[9px] font-black text-navy/50 uppercase tracking-[0.2em]">
                    {item.subjectCode || item.itemCode}
                  </span>
                </div>
              )}
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-base sm:text-lg font-black text-navy leading-tight tracking-tight">
                    {item.subjectName}
                  </h4>
                  {item.isOptional && (
                    <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400 border border-zinc-200 px-1.5 py-0.5 rounded-md">Optional</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
               <div className="flex items-center gap-1.5">
                  <div className="h-4 w-4 rounded-full bg-zinc-100 flex items-center justify-center">
                     <Shield size={10} className="text-zinc-400" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    {item.roleTag === 'coCurricular_classTeacher' ? 'Class Teacher' : (isCoCurricular ? 'Coordinator' : 'Faculty')}
                  </span>
               </div>
               <div className="hidden sm:block h-3 w-px bg-zinc-200" />
               <span className="text-xs sm:text-[13px] font-bold text-navy/70">{item.facultyName || 'Department'}</span>
            </div>
          </div>
        </div>
      </div>

      {(isDue || isOverride || isRejected) && (
        <motion.div 
          initial={{ scale: 0.98, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`p-4 rounded-2xl border ${isDue || isRejected ? 'bg-red-50/40 border-red-100/60 shadow-inner' : 'bg-indigo-50/40 border-indigo-100/60 shadow-inner'}`}
        >
          {(isDue || isRejected) && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-red-600">
                <AlertTriangle size={14} strokeWidth={3} />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">{isRejected ? 'Submission Rejected' : 'Deficiency Detected'}</span>
              </div>
              <div className="space-y-1">
                 <p className="text-[9px] font-black uppercase text-red-800/30 tracking-wider font-sans">{isRejected ? 'Coordinator Feedback' : 'Type'}</p>
                 <p className="text-sm font-bold text-red-900/70 leading-snug">{isRejected ? (item.remarks || 'Insufficient documentation provided.') : (item.dueType || 'Pending Dues')}</p>
              </div>
              {!isRejected && item.remarks && (
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
                {item.actionedAt || item.submission?.submittedAt ? new Date(item.actionedAt || item.submission?.submittedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Pending Update'}
              </p>
           </div>
        </div>
        <div className="flex items-center gap-3">
          {canSubmit && (
            <button 
              onClick={() => handleOpenSubmission(item)}
              style={{ transition: 'all 0.6s var(--ease-lux)' }}
              className="flex items-center gap-1.5 px-3 py-1 bg-navy text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-navy/90 active:scale-95 shadow-lg shadow-navy/20"
            >
              {isRejected ? 'Resubmit' : 'Complete Form'}
              <ExternalLink size={10} />
            </button>
          )}
          {!canSubmit && (
            <>
              <p className="text-[9px] font-bold text-zinc-300 uppercase tracking-widest">#{item.id ? (item.id.toString()).slice(-6).toUpperCase() : '----'}</p>
              <button className="h-6 w-6 rounded-lg border border-zinc-100 flex items-center justify-center text-zinc-300 hover:text-navy hover:border-navy/20 transition-all">
                <Info size={12} />
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
});


const StudentStatus = () => {
  const { requestId } = useParams();
  const isHistoryMode = !!requestId;
  const { showGlobalLoader } = useUI();
  const { user: _user } = useAuth();
  const [activeFilter, setActiveFilter] = React.useState('all');
  const [submissionModal, setSubmissionModal] = React.useState({ open: false, item: null });
  const [submitting, setSubmitting] = React.useState(false);
  const [formData, setFormData] = React.useState({});
  const {user} = useAuth();

  const apiFunc = React.useCallback(() => getStudentStatus(requestId), [requestId]);
  const apiOptions = React.useMemo(() => ({ 
    immediate: false,
    queryKey: ['student_status', requestId || 'active']
  }), [requestId]);
  
  const { data, loading, error, request: fetchStatus } = useApi(apiFunc, apiOptions);

  const clearanceData = data?.data || {};
  
  const approvals = React.useMemo(() => 
    clearanceData.approvals || []
  , [clearanceData.approvals]);

  const handleRefresh = React.useCallback(async (mode = 'silent') => {
    const isManual = mode === 'manual';
    const hide = isManual ? showGlobalLoader('Syncing Your Records...') : () => {};
    try {
      await fetchStatus();
    } finally {
      if (isManual) hide();
    }
  }, [fetchStatus, showGlobalLoader]);

  React.useEffect(() => { 
    if (!error) {
      handleRefresh('silent'); 
    }
  }, [handleRefresh, requestId, error]);

  useSSE(clearanceData?.batchId && !isHistoryMode ? getBatchSSEUrl(clearanceData.batchId) : null, (event) => {
    if (event?.event?.toLowerCase() === 'approval_updated' || event?.event?.toLowerCase() === 'batch_updated') {
      handleRefresh('silent');
    }
  });

  const filteredApprovals = React.useMemo(() => {
    let list = [...approvals];
    if (activeFilter === 'pending') {
      list = list.filter(a => ['pending', 'not_submitted', 'rejected'].includes(a.action));
    } else if (activeFilter === 'approved') {
      list = list.filter(a => ['approved', 'hod_override'].includes(a.action));
    }
    return list.sort((a, b) => {
      const order = { rejected: 0, not_submitted: 1, due_marked: 2, pending: 3, approved: 4, hod_override: 5 };
      return (order[a.action] ?? 99) - (order[b.action] ?? 99);
    });
  }, [approvals, activeFilter]);

  // ── DYNAMIC GROUPING ENGINE
  const groupedApprovals = React.useMemo(() => {
    const groups = {};
    const seenIds = new Set();

    REGISTRY_GROUPS.forEach(group => {
      const items = filteredApprovals.filter(a => group.filter(a, seenIds));
      if (items.length > 0) {
        groups[group.id] = items;
        items.forEach(i => seenIds.add(i.id));
      }
    });

    return groups;
  }, [filteredApprovals]);

  const handleOpenSubmission = (item) => {
    setSubmissionModal({ open: true, item });
    const initialData = {};
    if (item.submission?.data) {
      Object.assign(initialData, item.submission.data);
    }
    setFormData(initialData);
  };

  const handleSubmissionSubmit = async () => {
    setSubmitting(true);
    try {
      await submitCoCurricular(submissionModal.item.itemTypeId, formData);
      toast.success('Submitted to coordinator');
      setSubmissionModal({ open: false, item: null });
      handleRefresh('silent');
    } catch (err) {
      toast.error(err?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const clearedCount = approvals.filter(a => {
    if (['approved', 'hod_override'].includes(a.action)) return true;
    if (a.isOptional && a.action !== 'due_marked') return true;
    return false;
  }).length;
  
  const totalCount = approvals.length;

  if (loading && !data) {
    return (
      <PageWrapper title="Approval Status" subtitle="Syncing clearance data...">
        <div className="space-y-8 px-4 sm:px-0">
           {/* Progress Card Skeleton */}
           <div className="h-48 sm:h-56 bg-zinc-50 rounded-3xl border border-zinc-100 animate-pulse relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-sweep" />
           </div>
           
           {/* Section Skeleton */}
           <div className="space-y-6">
              <div className="h-4 w-32 bg-zinc-50 rounded-full animate-pulse" />
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                 {[1, 2, 3, 4].map(i => (
                   <div key={i} className="h-32 bg-zinc-50 rounded-2xl border border-zinc-100 animate-pulse relative overflow-hidden">
                     <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-sweep" />
                   </div>
                 ))}
              </div>
           </div>
        </div>
      </PageWrapper>
    );
  }

  if (clearanceData.status === 'no_batch') {
    return (
      <PageWrapper title="Approval Status">
         <div className="flex flex-col items-center justify-center text-center py-24 px-6 min-h-[60vh]">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="h-20 w-20 sm:h-24 sm:w-24 bg-zinc-50 rounded-[2rem] sm:rounded-[2.5rem] flex items-center justify-center mb-8 border border-zinc-100 shadow-inner"
            >
              <Calendar size={32} className="text-zinc-300" />
            </motion.div>
            <h2 className="text-2xl sm:text-3xl font-black text-navy tracking-tight mb-3">No Active Cycle</h2>
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
      <div className="flex flex-col gap-6 pb-12 px-4 sm:px-0 mt-4 sm:mt-0 touch-pan-y selection:bg-navy/5">
        
        {/* Navigation - Only visible in history mode */}
        {isHistoryMode && (
          <div className="flex items-center justify-between gap-4 mb-2">
            <div className="space-y-1">
              <Link 
                to="/student/history" 
                className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-navy/40 hover:text-navy transition-colors"
              >
                <ChevronLeft size={14} /> Back to History
              </Link>
            </div>
          </div>
        )}

        {/* Core Progress Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="premium-card p-6 sm:p-10 relative overflow-hidden group glow-indigo rounded-3xl"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-navy/[0.03] rounded-full translate-x-32 -translate-y-32 group-hover:scale-110 transition-transform duration-1000 pointer-events-none"></div>
          <CircularProgress 
             cleared={clearedCount} 
             total={totalCount} 
             rollNo={clearanceData.rollNo || user?.rollNo} 
          />
        </motion.div>

        {/* Registry Section */}
        <div className="space-y-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
               <div className="flex items-center gap-3">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-navy/40">Status Registry</h3>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-500/20">
                    <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter">Live Status</span>
                  </div>
               </div>
            </div>

            <div className="flex items-center gap-2 px-1">
              {[
                { id: 'all', label: 'All' },
                { id: 'pending', label: 'Pending' },
                { id: 'approved', label: 'Approved' }
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

          <div className="space-y-12">
            {REGISTRY_GROUPS.map(group => {
              const groupItems = groupedApprovals[group.id];
              if (!groupItems) return null;

              const GroupIcon = group.icon;
              const clearedInGroup = groupItems.filter(a => ['approved', 'hod_override'].includes(a.action)).length;

              return (
                <div key={group.id} className="space-y-6">
                  {/* Section Header */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-4">
                      <div className={`h-8 w-8 rounded-xl bg-gradient-to-br ${group.gradient} flex items-center justify-center text-white shadow-lg shadow-indigo-500/10`}>
                        <GroupIcon size={16} strokeWidth={2.5} />
                      </div>
                      <div>
                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-navy">{group.label}</h3>
                        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-tighter mt-0.5">
                          {groupItems.length} {groupItems.length === 1 ? 'Item' : 'Items'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 bg-zinc-50 rounded-full border border-zinc-100">
                      <span className="text-[9px] font-black text-navy/40 uppercase tracking-tighter">
                        {clearedInGroup}/{groupItems.length}
                      </span>
                      <div className="h-1 w-8 bg-zinc-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 transition-all duration-1000" 
                          style={{ width: `${(clearedInGroup / groupItems.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <motion.div 
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 xl:grid-cols-2 gap-5"
                  >
                    {groupItems.map((item, i) => (
                      <MemoizedClearanceCard 
                        key={item.id || i}
                        item={item}
                        index={i}
                        handleOpenSubmission={handleOpenSubmission}
                        canSubmit={item.approvalType === 'coCurricular' && item.formFields?.length > 0 && (!item.submission || item.submission.status === 'not_submitted' || item.submission.status === 'rejected')}
                        isCoCurricular={item.approvalType === 'coCurricular'}
                        isRejected={item.submission?.status === 'rejected'}
                        isNotSubmitted={!item.submission || item.submission.status === 'not_submitted' || item.submission.status === 'rejected'}
                        isPendingCoordinator={item.submission?.status === 'submitted'}
                        isApproved={item.action === 'approved' || item.submission?.status === 'approved'}
                        isDue={item.action === 'due'}
                        isOverride={!!item.overriddenBy}
                      />
                    ))}
                  </motion.div>

                </div>
              );
            })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {submissionModal.open && (
          <Modal 
            isOpen={submissionModal.open} 
            onClose={() => setSubmissionModal({ open: false, item: null })}
            title={`Clearance Submission: ${submissionModal.item?.subjectName}`}
            className="max-w-xl"
          >
             <div className="space-y-6">
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-4">
                   <div className="h-10 w-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
                      <Info size={18} />
                   </div>
                   <div className="space-y-1">
                      <p className="text-xs font-bold text-amber-900">Submission Requirements</p>
                      <p className="text-[10px] text-amber-800/70 font-medium leading-relaxed">
                         Please provide accurate documentation. This will be verified by <strong>{submissionModal.item?.facultyName}</strong> for final clearance.
                      </p>
                   </div>
                </div>

                <div className="space-y-5">
                   {submissionModal.item?.formFields?.map((field, idx) => {
                      const label = field.label || 'Field';
                      const type = field.type || 'text';
                      const required = field.required;
                      
                      return (
                        <div key={idx}>
                           <label className="block text-[10px] uppercase tracking-widest font-black text-navy/40 mb-2">
                              {label} {required && <span className="text-status-due">*</span>}
                           </label>
                           {type === 'text' ? (
                              <input 
                                type="text"
                                className="w-full px-4 py-3 rounded-xl border border-zinc-100 bg-zinc-50/50 text-sm font-bold focus:ring-2 focus:ring-navy/5 outline-none transition-all"
                                placeholder={`Enter ${label.toLowerCase()}...`}
                                value={formData[label] || ''}
                                onChange={(e) => setFormData({ ...formData, [label]: e.target.value })}
                              />
                           ) : type === 'date' ? (
                              <input 
                                type="date"
                                className="w-full px-4 py-3 rounded-xl border border-zinc-100 bg-zinc-50/50 text-sm font-bold focus:ring-2 focus:ring-navy/5 outline-none transition-all"
                                value={formData[label] || ''}
                                onChange={(e) => setFormData({ ...formData, [label]: e.target.value })}
                              />
                           ) : (
                              <div className="relative group">
                                 <input 
                                   type="text"
                                   className="w-full px-4 py-3 rounded-xl border border-zinc-100 bg-zinc-50/50 text-sm font-bold focus:ring-2 focus:ring-navy/5 outline-none transition-all pr-12"
                                   placeholder="Paste public link to document (Drive/S3)..."
                                   value={formData[label] || ''}
                                   onChange={(e) => setFormData({ ...formData, [label]: e.target.value })}
                                 />
                                 <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-300 group-focus-within:text-navy transition-colors">
                                    <FileUp size={16} />
                                 </div>
                              </div>
                           )}
                        </div>
                      );
                   })}
                </div>

                <div className="pt-6 border-t border-zinc-100 flex justify-end gap-3">
                   <Button variant="ghost" onClick={() => setSubmissionModal({ open: false, item: null })}>Cancel</Button>
                   <Button 
                    variant="primary" 
                    onClick={handleSubmissionSubmit} 
                    loading={submitting}
                    className="gap-2 px-8"
                  >
                     <Plus size={16} />  Submit
                   </Button>
                </div>
             </div>
          </Modal>
        )}
      </AnimatePresence>
    </PageWrapper>
  );
};

export default StudentStatus;