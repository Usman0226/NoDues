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
  Lock,
  Archive,
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
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'archived'

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
      content: 'Welcome! This is your central hub for managing student clearance requests across current and past terms.'
    },
    {
      targetId: 'tour-queue-status',
      title: 'Queue Status & Metrics',
      content: 'Instantly view pending clearance workloads and overall student completion rates.'
    },
    {
      targetId: 'tour-cycle-tabs',
      title: 'Active vs Archived Cycles',
      content: 'Toggle between currently active clearance drives and historical archived semesters.'
    },
    {
      targetId: 'tour-engagement-summary',
      title: 'Duty Breakdown',
      content: 'Manage approvals specifically for each class, role, and subject assigned to you.'
    },
    {
      targetId: 'tour-process-button',
      title: 'Process Queue',
      content: 'Click here to jump straight to the action portal to review and approve students in bulk.'
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

  const closedBatches = useMemo(() => {
    return allBatches.filter(b => b.status === 'closed');
  }, [allBatches]);

  // Aggregate stats across batches
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

    let historicalCleared = 0;
    closedBatches.forEach(b => {
      historicalCleared += b.approvedCount || 0;
    });

    const activeCompletionRate = totalSum > 0 ? Math.round((approvedSum / totalSum) * 100) : 100;

    return {
      pendingSum,
      approvedSum,
      dueSum,
      totalSum,
      activeCompletionRate,
      historicalCleared,
      activeBatchesCount: activeBatches.length,
      closedBatchesCount: closedBatches.length
    };
  }, [activeBatches, closedBatches]);

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
      <PageWrapper title="Candidate Approvals" subtitle="Hydrating Clearance Duties...">
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
      <PageWrapper title="Candidate Approvals" subtitle="Sync Notice">
        <div className="text-center py-20 bg-white rounded-2xl border border-zinc-200 shadow-sm max-w-lg mx-auto">
          <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
          <h2 className="text-xl font-black text-navy mb-2">Sync Error</h2>
          <p className="text-zinc-500 mb-6 text-sm px-6">{error}</p>
          <Button 
            variant="primary" 
            onClick={async () => {
              const hide = showGlobalLoader('Refreshing Dashboard...');
              await refreshAll();
              hide();
            }}
          >
            <RefreshCw size={14} className="mr-2" /> Retry Connection
          </Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper 
      title="Faculty Clearance Hub" 
      subtitle="Institutional clearance workflow & historical archive"
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
                      Clearance Protocol
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                      Live
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-navy tracking-tight">
                    {totalPending > 0 ? (
                      <>You have <span className="text-indigo-600 font-black">{totalPending} candidate requests</span> awaiting review</>
                    ) : (
                      "Your approval queue is completely cleared"
                    )}
                  </h2>
                  <p className="text-zinc-500 text-xs sm:text-sm font-medium mt-0.5">
                    {totalPending > 0 
                      ? 'Action pending clearance approvals to unblock student hall tickets.'
                      : 'All assigned student clearance duties for active academic cycles have been verified.'}
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
                    PROCESS QUEUE <ArrowRight size={14} className="ml-2" />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full md:w-auto px-6 h-12 font-black text-[10px] uppercase tracking-[0.2em] border-zinc-200 text-navy hover:bg-zinc-50 transition-all"
                    onClick={() => navigate('/faculty/pending', { state: { from: 'faculty-dashboard' } })}
                  >
                    VIEW CLEARANCE PORTAL
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
            <p className="text-[10px] text-zinc-500 font-medium mt-1">Pending approval in active cycles</p>
          </div>

          <div className="rounded-2xl bg-white border border-zinc-200/70 p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Active Clearances</span>
              <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <ClipboardCheck size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-600">{metrics.approvedSum}</span>
              <span className="text-xs font-bold text-zinc-400">approved</span>
            </div>
            <p className="text-[10px] text-zinc-500 font-medium mt-1">Approved students this semester</p>
          </div>

          <div className="rounded-2xl bg-white border border-zinc-200/70 p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Cycle Completion</span>
              <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <TrendingUp size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-navy">{metrics.activeCompletionRate}%</span>
              <span className="text-xs font-bold text-zinc-400">progress</span>
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
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Historical Cleared</span>
              <div className="h-8 w-8 rounded-lg bg-zinc-100 text-zinc-600 flex items-center justify-center">
                <Archive size={16} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-navy">{metrics.historicalCleared}</span>
              <span className="text-xs font-bold text-zinc-400">archived</span>
            </div>
            <p className="text-[10px] text-zinc-500 font-medium mt-1">Across {closedBatches.length} past academic cycles</p>
          </div>
        </motion.div>

        {/* Section Tabs: Active Duties vs Past / Archived Cycles */}
        <motion.div id="tour-cycle-tabs" variants={itemVariants} className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200/60 pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('active')}
                className={`h-9 px-4 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                  activeTab === 'active'
                    ? 'bg-navy text-white shadow-sm'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                <Layers size={14} />
                <span>Active Duties</span>
                {metrics.pendingSum > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                    activeTab === 'active' ? 'bg-amber-400 text-navy' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {metrics.pendingSum}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('archived')}
                className={`h-9 px-4 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                  activeTab === 'archived'
                    ? 'bg-navy text-white shadow-sm'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                <Archive size={14} />
                <span>Archived Semesters</span>
                <span className="px-1.5 py-0.2 rounded-full bg-zinc-200 text-zinc-700 text-[9px] font-bold">
                  {closedBatches.length}
                </span>
              </button>
            </div>

            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
              {activeTab === 'active' 
                ? `${summary.length} active class responsibility units` 
                : `${closedBatches.length} previous academic cycles archived`}
            </span>
          </div>

          {/* Tab 1: Active Duties */}
          {activeTab === 'active' && (
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
                                  <span className={item.pending > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                                    {item.pending > 0 ? `${item.pending} Awaiting` : '100% Cleared'}
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
                                  <span>{item.pending > 0 ? 'Review Pending' : 'Audit Class Roster'}</span>
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
                  <h3 className="text-navy font-bold text-base mb-1">All Clear in Ongoing Cycles</h3>
                  <p className="text-zinc-500 text-xs max-w-sm mx-auto mb-4">
                    There are no pending student clearance requests requiring your review in active batches.
                  </p>
                  <Button 
                    variant="outline"
                    size="sm"
                    className="text-[10px] font-black uppercase tracking-wider"
                    onClick={() => setActiveTab('archived')}
                  >
                    Browse Archived Batches
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Previous / Archived Batches */}
          {activeTab === 'archived' && (
            <div>
              {closedBatches.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {closedBatches.map((batch) => (
                    <div 
                      key={batch._id}
                      className="rounded-2xl p-6 bg-zinc-50/70 border border-zinc-200 hover:border-zinc-300 transition-all flex flex-col justify-between h-full group"
                    >
                      <div>
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <span className="text-[9px] font-bold text-zinc-500 bg-zinc-200/60 px-2 py-0.5 rounded uppercase tracking-wider inline-flex items-center gap-1">
                              <Lock size={10} /> Archived Cycle
                            </span>
                            <h3 className="text-base font-black text-navy mt-1.5 tracking-tight group-hover:text-indigo-600 transition-colors">
                              {batch.name}
                            </h3>
                            <p className="text-xs text-zinc-500 font-medium">
                              {batch.academicYear || 'Academic Year'} · Semester {batch.semester || '—'}
                            </p>
                          </div>
                          <div className="h-9 w-9 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-zinc-400 shrink-0">
                            <Archive size={16} />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 py-3 px-3.5 bg-white rounded-xl border border-zinc-100 text-center my-3">
                          <div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block">Total</span>
                            <span className="text-sm font-black text-navy">{batch.totalCount || 0}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 block">Cleared</span>
                            <span className="text-sm font-black text-emerald-600">{batch.approvedCount || 0}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-red-500 block">Dues</span>
                            <span className="text-sm font-black text-red-500">{batch.dueCount || 0}</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2">
                        <button 
                          onClick={() => navigate('/faculty/pending', { 
                            state: { 
                              classId: batch._id, 
                              from: 'faculty-dashboard' 
                            } 
                          })} 
                          className="w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100 hover:text-navy"
                        >
                          <Lock size={11} />
                          <span>View Read-Only Records</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-zinc-200">
                  <Archive size={40} className="mx-auto text-zinc-300 mb-3" />
                  <h3 className="text-navy font-bold text-base mb-1">No Archived Batches</h3>
                  <p className="text-zinc-500 text-xs max-w-sm mx-auto">
                    Previous semester clearance batches will appear here once they are officially closed.
                  </p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </PageWrapper>
  );
};

export default FacultyDashboard;
