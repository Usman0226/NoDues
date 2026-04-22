import React, {  useMemo, useState, useEffect } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import { useApi } from '../../hooks/useApi';
import { getPendingApprovals } from '../../api/approvals';
import { 
  ClipboardCheck, 
  ArrowRight,
  UserCheck,
  Calendar,
  Layers,
  RefreshCw,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import Button from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useSSE from '../../hooks/useSSE';
import { useUI } from '../../hooks/useUI';
import GuidedTour from '../../components/ui/GuidedTour';

const FacultyDashboard = () => {
  const navigate = useNavigate();
  const { showGlobalLoader } = useUI();
  const [isTourActive, setIsTourActive] = useState(false);
  const { data: response, loading, error, request: fetchApprovals } = useApi(getPendingApprovals, { immediate: true });

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
      title: 'Faculty Dashboard',
      content: 'Welcome! This is your central hub for managing student clearance requests.'
    },
    {
      targetId: 'tour-queue-status',
      title: 'Action Queue',
      content: 'Quickly see how many students are waiting for your approval across all your duties.'
    },
    {
      targetId: 'tour-engagement-summary',
      title: 'Duty Breakdown',
      content: 'Manage approvals specifically for each class and subject role assigned to you.'
    },
    {
      targetId: 'tour-process-button',
      title: 'Start Processing',
      content: 'Click here to go to the main processing portal and clear your queue in bulk.'
    }
  ];
  
  // Real-time synchronization
  const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');
  const sseUrl  = `${apiBase}/api/sse/connect`;
  
  useSSE(sseUrl, (event) => {
    if (event?.event === 'APPROVAL_UPDATED') {
      fetchApprovals();
    }
  });

  const approvals = useMemo(() => {
    if (Array.isArray(response)) return response;
    return response?.data || [];
  }, [response]);


  const baseSummary = useMemo(() => {
    if (!approvals.length) return [];
    
    // Group by batchId
    const groups = approvals.reduce((acc, curr) => {
      if (!acc[curr.batchId]) {
        acc[curr.batchId] = {
          id: curr.batchId,
          class: curr.className || 'Unknown Class',
          role: curr.approvalType === 'subject' ? `Faculty (${curr.subjectName})` : 
                curr.approvalType === 'mentor' ? 'Mentor' : 'Class Teacher',
          pending: 0,
          total: 0, // In real world, we'd need total from batch, but for now we count current queue
          action: curr.action
        };
      }
      acc[curr.batchId].total++;
      if (curr.action === 'pending') acc[curr.batchId].pending++;
      return acc;
    }, {});

    return Object.values(groups);
  }, [approvals]);

  const baseTotalPending = useMemo(() => approvals.filter(a => a.action === 'pending').length || 0, [approvals]);

  const summary = isTourActive && baseSummary.length === 0 ? [
    {
      id: 'dummy-1',
      class: 'Computer Science - Year 4',
      role: 'Faculty (Network Security)',
      pending: 12,
      total: 60,
      action: 'pending'
    },
    {
      id: 'dummy-2',
      class: 'Information Tech - Year 3',
      role: 'Class Teacher',
      pending: 0,
      total: 45,
      action: 'approved'
    }
  ] : baseSummary;

  const totalPending = isTourActive && baseTotalPending === 0 ? 12 : baseTotalPending;

  if (loading && !response) {
    return (
      <PageWrapper title="Candidate Approvals" subtitle="Loading your duties...">
        <div className="animate-pulse">
          <div className="h-40 w-full bg-muted/10 rounded-xl mb-12"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-56 bg-muted/5 rounded-xl"></div>
            ))}
          </div>
        </div>
      </PageWrapper>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 30,
        // Using mass: 1 and velocity: 0 for performance stability
        mass: 1
      }
    }
  };

  if (loading && !response) {
    return (
      <PageWrapper title="Candidate Approvals" subtitle="System Sync Issue">
        <div className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm">
          <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
          <h2 className="text-xl font-black text-navy mb-2">Sync Error</h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{error}</p>
          <Button 
            variant="primary" 
            onClick={async () => {
              const hide = showGlobalLoader('Refreshing Dashboard...');
              await fetchApprovals();
              hide();
            }}
          >
             <RefreshCw size={14} className="mr-2" /> Retry
          </Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper 
      title="Candidate Approvals" 
      subtitle="Your active duties and pending requests"
      headerActions={
        <button 
          onClick={() => setIsTourActive(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-100 transition-all text-[10px] font-black uppercase tracking-widest"
        >
          <Sparkles size={14} /> Start Tour
        </button>
      }
    >
      <GuidedTour 
        steps={tourSteps} 
        active={isTourActive} 
        onComplete={() => setIsTourActive(false)}
        onSkip={() => setIsTourActive(false)}
        tourId="faculty_dashboard"
      />
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-10"
      >
        {/* Minimal Action Header */}
        <motion.div 
          id="tour-header"
          variants={itemVariants}
          className="lg:px-2"
        >
          <div id="tour-queue-status" className="rounded-3xl premium-card p-6 sm:p-8 bg-gradient-to-br from-white to-indigo-50/30 border-zinc-200/60 shadow-xl shadow-navy/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full translate-x-32 -translate-y-32 group-hover:scale-110 transition-transform duration-1000"></div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
              <div className="flex items-center gap-6">
                <div className="relative">
                  <div className="absolute inset-0 blur-xl bg-indigo-500/20 rounded-full animate-pulse"></div>
                  <div className="h-14 w-14 rounded-2xl bg-white border border-indigo-100 flex items-center justify-center shrink-0 shadow-sm relative">
                    <AlertCircle size={26} className="text-indigo-600" />
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-black text-navy tracking-tight mb-1">Queue Status</h2>
                  <p className="text-zinc-500 text-sm font-medium">
                    {totalPending > 0 ? (
                      <>You have <span className="text-indigo-600 font-black">{totalPending} pending requests</span> awaiting focus.</>
                    ) : (
                      "Your approval queue is fully cleared."
                    )}
                  </p>
                </div>
              </div>

              {totalPending > 0 ? (
                <Button 
                  id="tour-process-button"
                  variant="primary" 
                  className="w-full md:w-auto px-10 h-14 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-navy/20 hover:shadow-xl transition-all active:scale-95" 
                  onClick={() => navigate('/faculty/pending', { state: { from: 'faculty-dashboard' } })}
                >
                  PROCESS QUEUE <ArrowRight size={14} className="ml-2" />
                </Button>
              ) : (
                <div className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-50 border border-emerald-100/50 text-emerald-600">
                  <ClipboardCheck size={18} />
                  <span className="text-[10px] font-black uppercase tracking-widest">All Clear</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Minimal Engagement Section */}
        <motion.div id="tour-engagement-summary" variants={itemVariants} className="space-y-6">
          <div className="flex items-center gap-4 px-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400">Engagement Summary</h2>
            <div className="h-px flex-1 bg-zinc-100" />
          </div>

          {summary.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence mode="popLayout">
                {summary.map((item) => (
                  <motion.div 
                    layout
                    key={item.id} 
                    variants={itemVariants}
                  >
                    <div className="rounded-3xl premium-card p-6 scale-hover border-zinc-200/60 relative group overflow-hidden h-full flex flex-col justify-between">
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                      
                      <div className="relative z-10">
                        <div className="flex items-start justify-between mb-8">
                          <div className="min-w-0">
                            <span className="text-[9px] font-black text-navy/20 uppercase tracking-[0.2em] mb-1 block">
                              {item.role}
                            </span>
                            <h3 className="text-lg font-black text-navy tracking-tight group-hover:text-indigo-600 transition-colors truncate">
                              {item.class}
                            </h3>
                          </div>
                          <div className="relative shrink-0">
                            <div className={`absolute inset-0 blur-xl opacity-20 rounded-full transition-all duration-500 group-hover:opacity-30 ${
                              item.pending > 0 ? 'bg-amber-400' : 'bg-emerald-400'
                            }`} />
                            <div className={`h-11 w-11 rounded-2xl flex items-center justify-center relative border transition-all duration-500 group-hover:scale-110 ${
                              item.pending > 0 
                                ? 'bg-amber-50 border-amber-100/50 text-amber-600' 
                                : 'bg-emerald-50 border-emerald-100/50 text-emerald-600'
                            }`}>
                               <Layers size={18} strokeWidth={2.5} />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div>
                            <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-[0.2em] mb-2.5">
                              <span className="text-zinc-400">Sync Status</span>
                              <span className={item.pending > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                                {item.pending > 0 ? `${item.pending} Awaiting` : 'Complete'}
                              </span>
                            </div>
                            <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden border border-zinc-200/40">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${((item.total - item.pending) / item.total) * 100}%` }}
                                transition={{ duration: 1.2, ease: "circOut" }}
                                className={`h-full rounded-full transition-colors duration-500 ${
                                  item.pending > 0 
                                    ? 'bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.3)]' 
                                    : 'bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                                }`} 
                              />
                            </div>
                          </div>

                          <button 
                            onClick={() => navigate('/faculty/pending', { state: { classId: item.id, from: 'faculty-dashboard' } })} 
                            className={`w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 border group/btn relative z-10 ${
                              item.pending > 0 
                                ? 'bg-navy text-white border-navy shadow-lg shadow-navy/10 hover:shadow-xl active:scale-[0.97]' 
                                : 'bg-white text-navy border-divider hover:bg-zinc-50'
                            }`}
                          >
                            <span>{item.pending > 0 ? 'Enter Portal' : 'Audit Class'}</span>
                            <ArrowRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <motion.div 
              variants={itemVariants}
              className="group text-center py-24 bg-white/40 backdrop-blur rounded-[2rem] border border-dashed border-muted/50 transition-colors hover:border-gold/30"
            >
               <Layers size={48} className="mx-auto text-muted/10 mb-4 group-hover:text-gold/20 transition-colors" />
               <p className="text-[11px] font-black text-navy/20 uppercase tracking-[0.3em]">No active duties found</p>
               <p className="text-[10px] text-muted-foreground/40 font-medium mt-2">Check back later for new academic assignments</p>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </PageWrapper>
  );
};

export default FacultyDashboard;
