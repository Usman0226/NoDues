import React, { useMemo, useState, useEffect, useCallback } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import { useApi } from '../../hooks/useApi';
import { getPendingApprovals } from '../../api/approvals';
import { getMyBatches } from '../../api/faculty';
import { 
  ClipboardCheck, 
  ArrowRight,
  Layers,
  RefreshCw,
  AlertCircle,
  Sparkles,
  History,
  CheckCircle2,
  TrendingUp,
  Clock,
  UserCheck
} from 'lucide-react';
import Button from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useSSE from '../../hooks/useSSE';
import { getSSEConnectUrl } from '../../api/sse';
import { useUI } from '../../hooks/useUI';
import GuidedTour from '../../components/ui/GuidedTour';

const FacultyDashboard = () => {
  const navigate = useNavigate();
  const { showGlobalLoader } = useUI();
  const [isTourActive, setIsTourActive] = useState(false);

  const { data: response, loading: approvalsLoading, error: approvalsError, request: fetchApprovals } = useApi(getPendingApprovals, { immediate: true });
  const { data: batchesResponse, loading: batchesLoading, error: batchesError, request: fetchBatches } = useApi(getMyBatches, { immediate: true });

  const loading = approvalsLoading || batchesLoading;
  const error = approvalsError || batchesError;

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchApprovals(), fetchBatches()]);
  }, [fetchApprovals, fetchBatches]);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('tour_completed_faculty_dashboard');
    if (!hasSeenTour && !loading && response) {
      const timer = setTimeout(() => setIsTourActive(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [loading, response]);

  const tourSteps = [
    {
      targetId: 'tour-header',
      title: 'Faculty Clearance Hub',
      content: 'Welcome! This is your central hub for reviewing and approving student clearance requests.'
    },
    {
      targetId: 'tour-queue-status',
      title: 'Queue Status & Metrics',
      content: 'Quickly see pending approvals, approved students, and overall progress across your classes.'
    },
    {
      targetId: 'tour-cycle-tabs',
      title: 'Your Classes & Subjects',
      content: 'See clearance progress and pending counts for each class and subject assigned to you.'
    },
    {
      targetId: 'tour-engagement-summary',
      title: 'Approval Groups',
      content: 'Review and approve students for each specific class or role.'
    },
    {
      targetId: 'tour-process-button',
      title: 'Review Pending',
      content: 'Click here to jump straight to reviewing and approving student requests.'
    }
  ];
  
  // Real-time synchronization
  const sseUrl = getSSEConnectUrl();
  useSSE(sseUrl, (event) => {
    if (event?.event === 'APPROVAL_UPDATED' || event?.event === 'BATCH_CLOSED') {
      refreshAll();
    }
  });

  const approvals = useMemo(() => {
    if (Array.isArray(response)) return response;
    return response?.data || [];
  }, [response]);

  const allBatches = useMemo(() => {
    return batchesResponse?.data || [];
  }, [batchesResponse]);

  const activeBatches = useMemo(() => {
    return allBatches.filter(b => b.status === 'active');
  }, [allBatches]);

  // Aggregate stats across active batches
  const metrics = useMemo(() => {
    let pendingSum = 0;
    let approvedSum = 0;
    let dueSum = 0;
    let totalSum = 0;

    activeBatches.forEach(b => {
      pendingSum += b.pendingCount || 0;
      approvedSum += b.approvedCount || 0;
      dueSum += b.dueCount || 0;
      totalSum += b.totalCount || 0;
    });

    const activeCompletionRate = totalSum > 0 ? Math.round((approvedSum / totalSum) * 100) : 100;

    return {
      pendingSum,
      approvedSum,
      dueSum,
      totalSum,
      activeCompletionRate,
      activeBatchesCount: activeBatches.length
    };
  }, [activeBatches]);

  // Active duty breakdown grouped by batchId + approvalType
  const baseSummary = useMemo(() => {
    if (!approvals.length) return [];
    
    const groups = approvals.reduce((acc, curr) => {
      const key = `${curr.batchId}-${curr.approvalType}-${curr.itemTypeId || ''}`;
      if (!acc[key]) {
        acc[key] = {
          id: key,
          batchId: curr.batchId,
          itemTypeId: curr.itemTypeId,
          approvalType: curr.approvalType,
          class: curr.className || 'Unknown Class',
          semester: curr.semester,
          academicYear: curr.academicYear,
          isBatchClosed: curr.isBatchClosed,
          role: curr.approvalType === 'subject' ? `Faculty (${curr.subjectName})` : 
                curr.approvalType === 'mentor' ? 'Mentor' : 
                curr.approvalType === 'coCurricular' ? (curr.itemTypeName || 'Co-Curricular') : 'Class Teacher',
          pending: 0,
          total: 0,
          action: curr.action
        };
      }
      acc[key].total++;
      if (curr.action === 'pending' || curr.action === 'not_submitted') acc[key].pending++;
      return acc;
    }, {});

    return Object.values(groups);
  }, [approvals]);

  const summary = isTourActive && baseSummary.length === 0 ? [
    {
      id: 'dummy-1',
      class: 'Computer Science - Year 4',
      role: 'Faculty (Network Security)',
      pending: 12,
      total: 60,
      action: 'pending',
      semester: 7,
      academicYear: '2026-27'
    },
    {
      id: 'dummy-2',
      class: 'Information Tech - Year 3',
      role: 'Class Teacher',
      pending: 0,
      total: 45,
      action: 'approved',
      semester: 5,
      academicYear: '2026-27'
    }
  ] : baseSummary;

  const totalPending = isTourActive && metrics.pendingSum === 0 ? 12 : metrics.pendingSum;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        type: "spring",
        stiffness: 320,
        damping: 30,
        mass: 1
      }
    }
  };

  if (loading && !response && !batchesResponse) {
    return (
      <PageWrapper title="Faculty Approvals" subtitle="Loading your approvals...">
        <div className="animate-pulse space-y-8">
          <div className="h-44 w-full bg-zinc-100 rounded-2xl"></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 bg-zinc-100 rounded-2xl"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 bg-zinc-100 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (error && !response && !batchesResponse) {
    return (
      <PageWrapper title="Faculty Approvals" subtitle="Unable to load">
        <div className="text-center py-20 bg-white rounded-2xl border border-zinc-200 shadow-sm max-w-lg mx-auto">
          <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
          <h2 className="text-xl font-black text-navy mb-2">Couldn't load approvals</h2>
          <p className="text-zinc-500 mb-6 text-sm px-6">{error}</p>
          <Button 
            variant="primary" 
            onClick={async () => {
              const hide = showGlobalLoader('Refreshing approvals...');
              await refreshAll();
              hide();
            }}
          >
            <RefreshCw size={14} className="mr-2" /> Try again
          </Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper 
      title="Faculty Clearance Hub" 
      subtitle="Manage student clearance approvals for your classes"
      headerActions={
        <div className="flex items-center gap-2">
          <button 
            onClick={() => navigate('/faculty/mentoring')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-zinc-200 text-zinc-600 hover:text-indigo-600 hover:border-indigo-100 transition-all text-[10px] font-black uppercase tracking-wider"
          >
            <UserCheck size={13} /> Mentoring Portal
          </button>
          <button 
            onClick={() => navigate('/faculty/history')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-zinc-200 text-zinc-600 hover:text-indigo-600 hover:border-indigo-100 transition-all text-[10px] font-black uppercase tracking-wider"
          >
            <History size={13} /> Action History
          </button>
          <button 
            onClick={() => setIsTourActive(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-100 transition-all text-[10px] font-black uppercase tracking-wider"
          >
            <Sparkles size={13} /> Quick Tour
          </button>
        </div>
      }
    >
      <AnimatePresence>
        {isTourActive && (
          <GuidedTour 
            steps={tourSteps} 
            onComplete={() => setIsTourActive(false)}
            onSkip={() => setIsTourActive(false)}
            tourId="faculty_dashboard"
          />
        )}
      </AnimatePresence>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-8"
      >
        {/* Top Hero Banner */}
        <motion.div 
          id="tour-header"
          variants={itemVariants}
        >
          <div id="tour-queue-status" className="rounded-2xl p-6 sm:p-8 bg-gradient-to-br from-white via-white to-indigo-50/40 border border-zinc-200/80 shadow-xl shadow-navy/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full translate-x-32 -translate-y-32 group-hover:scale-110 transition-transform duration-1000"></div>
            
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
              <div className="flex items-center gap-5">
                <div className="relative shrink-0">
                  <div className={`absolute inset-0 blur-xl rounded-full ${totalPending > 0 ? 'bg-amber-400/30' : 'bg-emerald-400/30'} animate-pulse`}></div>
                  <div className={`h-14 w-14 rounded-2xl bg-white border flex items-center justify-center shadow-sm relative ${
                    totalPending > 0 ? 'border-amber-100 text-amber-600' : 'border-emerald-100 text-emerald-600'
                  }`}>
                    {totalPending > 0 ? <AlertCircle size={28} /> : <CheckCircle2 size={28} />}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                      Approval Queue
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                      Live
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-navy tracking-tight">
                    {totalPending > 0 ? (
                      <>You have <span className="text-indigo-600 font-black">{totalPending} student requests</span> awaiting review</>
                    ) : (
                      "Your approval queue is completely cleared"
                    )}
                  </h2>
                  <p className="text-zinc-500 text-xs sm:text-sm font-medium mt-0.5">
                    {totalPending > 0 
                      ? 'Review and approve pending student requests for your classes.'
                      : 'All assigned student clearance approvals for your classes are complete.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                {totalPending > 0 ? (
                  <Button 
                    id="tour-process-button"
                    variant="primary" 
                    className="w-full md:w-auto px-8 h-12 font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-navy/20 hover:shadow-xl transition-all active:scale-95 flex items-center justify-center" 
                    onClick={() => navigate('/faculty/pending', { state: { from: 'faculty-dashboard' } })}
                  >
                    REVIEW PENDING <ArrowRight size={14} className="ml-2" />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full md:w-auto px-6 h-12 font-black text-[10px] uppercase tracking-[0.2em] border-zinc-200 text-navy hover:bg-zinc-50 transition-all"
                    onClick={() => navigate('/faculty/pending', { state: { from: 'faculty-dashboard' } })}
                  >
                    VIEW APPROVALS
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* High-Level Institutional Metrics */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-white border border-zinc-200/70 p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Action Queue</span>
              <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-navy">{metrics.pendingSum}</span>
              <span className="text-xs font-bold text-zinc-400">students</span>
            </div>
            <p className="text-[10px] text-zinc-500 font-medium mt-1">Pending approval in active classes</p>
          </div>

          <div className="rounded-2xl bg-white border border-zinc-200/70 p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Approved</span>
              <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <ClipboardCheck size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-600">{metrics.approvedSum}</span>
              <span className="text-xs font-bold text-zinc-400">students</span>
            </div>
            <p className="text-[10px] text-zinc-500 font-medium mt-1">Approved students this semester</p>
          </div>

          <div className="rounded-2xl bg-white border border-zinc-200/70 p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Progress</span>
              <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <TrendingUp size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-navy">{metrics.activeCompletionRate}%</span>
              <span className="text-xs font-bold text-zinc-400">completed</span>
            </div>
            <div className="w-full bg-zinc-100 h-1.5 rounded-full mt-2 overflow-hidden">
              <div 
                className="bg-indigo-600 h-full rounded-full transition-all duration-700" 
                style={{ width: `${metrics.activeCompletionRate}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-zinc-200/70 p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Flagged Dues</span>
              <div className="h-8 w-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                <AlertCircle size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-red-600">{metrics.dueSum}</span>
              <span className="text-xs font-bold text-zinc-400">students</span>
            </div>
            <p className="text-[10px] text-zinc-500 font-medium mt-1">Students with dues to resolve</p>
          </div>
        </motion.div>

        {/* Assigned Classes & Subjects Section */}
        <motion.div id="tour-cycle-tabs" variants={itemVariants} className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200/60 pb-3">
            <div className="flex items-center gap-2">
              <div className="h-9 px-4 rounded-xl text-[11px] font-black uppercase tracking-wider bg-navy text-white shadow-sm flex items-center gap-2">
                <Layers size={14} />
                <span>Your Classes</span>
                {metrics.pendingSum > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-amber-400 text-navy">
                    {metrics.pendingSum}
                  </span>
                )}
              </div>
            </div>

            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
              {summary.length} {summary.length === 1 ? 'class' : 'classes'} assigned
            </span>
          </div>

          <div id="tour-engagement-summary">
            {summary.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                  {summary.map((item) => (
                    <motion.div 
                      layout
                      key={item.id} 
                      variants={itemVariants}
                    >
                      <div className="rounded-2xl p-6 bg-white border border-zinc-200/70 hover:border-indigo-200 hover:shadow-xl hover:shadow-navy/5 transition-all duration-300 flex flex-col justify-between h-full group relative overflow-hidden">
                        <div className="relative z-10">
                          <div className="flex items-start justify-between mb-6">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider">
                                  {item.role}
                                </span>
                                {item.semester && (
                                  <span className="text-[9px] font-bold text-zinc-400">
                                    Sem {item.semester}
                                  </span>
                                )}
                              </div>
                              <h3 className="text-lg font-black text-navy tracking-tight group-hover:text-indigo-600 transition-colors truncate">
                                {item.class}
                              </h3>
                            </div>

                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border ${
                              item.pending > 0 
                                ? 'bg-amber-50 border-amber-200/60 text-amber-600' 
                                : 'bg-emerald-50 border-emerald-200/60 text-emerald-600'
                            }`}>
                              <Layers size={16} strokeWidth={2.5} />
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest mb-2">
                                <span className="text-zinc-400">Review Progress</span>
                                <span className={item.pending > 0 ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}>
                                  {item.pending > 0 ? `${item.pending} Pending` : 'All Approved'}
                                </span>
                              </div>
                              <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-700 ${
                                    item.pending > 0 ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${item.total > 0 ? ((item.total - item.pending) / item.total) * 100 : 100}%` }}
                                />
                              </div>
                            </div>

                            <div className="pt-2">
                              <button 
                                onClick={() => navigate('/faculty/pending', { 
                                  state: { 
                                    classId: item.batchId, 
                                    approvalType: item.approvalType,
                                    itemTypeId: item.itemTypeId,
                                    from: 'faculty-dashboard' 
                                  } 
                                })} 
                                className={`w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border ${
                                  item.pending > 0 
                                    ? 'bg-navy text-white border-navy shadow-md hover:bg-navy/90 active:scale-[0.98]' 
                                    : 'bg-white text-navy border-zinc-200 hover:bg-zinc-50'
                                }`}
                              >
                                <span>{item.pending > 0 ? 'Review Pending' : 'View Student List'}</span>
                                <ArrowRight size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-zinc-200">
                <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
                <h3 className="text-navy font-bold text-base mb-1">No Pending Approvals</h3>
                <p className="text-zinc-500 text-xs max-w-sm mx-auto">
                  You have no pending student clearance approvals for your active classes.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </PageWrapper>
  );
};

export default FacultyDashboard;
