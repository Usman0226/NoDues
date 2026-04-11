import React, {  useMemo } from 'react';
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
  AlertCircle
} from 'lucide-react';
import Button from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';

const FacultyDashboard = () => {
  const navigate = useNavigate();
  const { data: approvals, loading, error, request: fetchApprovals } = useApi(getPendingApprovals, { immediate: true });


  const summary = useMemo(() => {
    if (!approvals) return [];
    
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

  const totalPending = approvals?.filter(a => a.action === 'pending').length || 0;

  if (loading && !approvals) {
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

  if (error) {
    return (
      <PageWrapper title="Candidate Approvals" subtitle="System Sync Issue">
        <div className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm">
          <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
          <h2 className="text-xl font-black text-navy mb-2">Sync Error</h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{error}</p>
          <Button variant="primary" onClick={() => fetchApprovals()}>
             <RefreshCw size={14} className="mr-2" /> Retry
          </Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Candidate Approvals" subtitle="Your active duties and pending requests">
      {/* Global Action Banner */}
      <div className="mb-8 sm:mb-12 bg-navy rounded-xl p-6 sm:p-8 text-white relative overflow-hidden shadow-2xl shadow-navy/20">
        <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-2">Attention Required</h2>
            <p className="text-white/60 text-xs sm:text-sm max-w-sm font-medium leading-relaxed">
              You have {totalPending > 0 ? (
                <><span className="text-gold font-black">{totalPending} pending actions</span> across {summary.length} academic groups.</>
              ) : (
                "No pending actions right now. All clearances are up to date."
              )}
            </p>
          </div>
          {totalPending > 0 && (
            <Button variant="accent" size="lg" className="w-full sm:w-auto whitespace-nowrap shadow-xl shadow-gold/20" onClick={() => navigate('/faculty/pending')}>
              Process Queue <ArrowRight size={16} />
            </Button>
          )}
        </div>
        <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
          <ClipboardCheck size={200} />
        </div>
      </div>

      <h2 className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-navy/40 mb-6 px-1 text-center sm:text-left">Engagement Summary</h2>

      {summary.length > 0 ? (
        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8">
          {summary.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-muted shadow-sm p-5 sm:p-6 hover:shadow-md transition-academic group">
              <div className="flex items-start justify-between mb-4 sm:mb-6">
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-black text-navy tracking-tight group-hover:text-gold transition-colors truncate">{item.class}</h3>
                  <div className="flex items-center gap-1.5 mt-1 text-muted-foreground/60 min-w-0">
                     <UserCheck size={12} className="shrink-0" />
                     <p className="text-[8px] sm:text-[9px] uppercase font-black tracking-widest leading-none truncate">{item.role}</p>
                  </div>
                </div>
                <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center shrink-0 ${item.pending > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                   <Layers size={18} className="sm:w-5 sm:h-5" />
                </div>
              </div>

              <div className="space-y-4 sm:space-y-5">
                <div>
                  <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                    <span>Status</span>
                    <span className={item.pending > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                      {item.pending > 0 ? `${item.pending} TO GO` : 'COMPLETED'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-offwhite rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${item.pending > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                      style={{ width: `${((item.total - item.pending) / item.total) * 100}%` }} 
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-muted/30">
                  <div className="flex items-center gap-2 text-[9px] sm:text-[10px] font-bold text-muted-foreground">
                    <Calendar size={12} />
                    <span className="truncate">Active Session</span>
                  </div>
                  <button onClick={() => navigate('/faculty/pending')} className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-gold hover:text-navy transition-colors flex items-center gap-1 shrink-0">
                    {item.pending > 0 ? 'Resolve' : 'View'} <ArrowRight size={12} strokeWidth={3} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-muted">
           <p className="text-sm font-black text-navy/20 uppercase tracking-widest">No active duties assigned</p>
        </div>
      )}
    </PageWrapper>
  );
};

export default FacultyDashboard;
