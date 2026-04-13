import React, { useEffect, useMemo } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import { useApi } from '../../hooks/useApi';
import { getHodOverview, getHodActivity } from '../../api/hod';
import useSSE from '../../hooks/useSSE';
import { getDepartmentSSEUrl } from '../../api/sse';
import { useAuth } from '../../context/AuthContext';
import { 
  Building2, 
  AlertCircle, 
  Layers, 
  ChevronRight,
  TrendingUp,
  Clock,
  RefreshCw,
  Activity,
  CheckCircle2,
  XCircle,
  ShieldCheck
} from 'lucide-react';
import Button from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Modal from '../../components/ui/Modal';
import { initiateDepartmentBatch } from '../../api/batch';


const ACTIVITY_ICONS = {
  CLEARANCE: { icon: CheckCircle2, cls: 'text-emerald-500 bg-emerald-50' },
  DUE_FLAG: { icon: XCircle, cls: 'text-red-500 bg-red-50' },
  HOD_OVERRIDE: { icon: ShieldCheck, cls: 'text-blue-500 bg-blue-50' }
};

const HodDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const { data: overview, loading, error, request: fetchOverview } = useApi(getHodOverview, { immediate: true });
  const { data: activity, request: fetchActivity } = useApi(getHodActivity, { immediate: true });

  const [isBulkModalOpen, setIsBulkModalOpen] = React.useState(false);
  const [deadline, setDeadline] = React.useState('');
  const [isInitiating, setIsInitiating] = React.useState(false);

  const handleBulkInitiate = async (e) => {
    e.preventDefault();
    if (isInitiating) return;

    try {
      setIsInitiating(true);
      const res = await initiateDepartmentBatch({ deadline: deadline || null });
      
      if (res.success) {
        const { summary } = res.data;
        if (summary.failed > 0) {
          toast.error(`Initiated ${summary.initiated} cycles, but ${summary.failed} failed.`);
        } else {
          toast.success(`Successfully initiated ${summary.initiated} clearance cycles.`);
        }
        setIsBulkModalOpen(false);
        setDeadline('');
        fetchOverview();
        fetchActivity();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Department initiation failed');
    } finally {
      setIsInitiating(false);
    }
  };

  // Real-time awareness (§9)
  useSSE(user?.departmentId ? getDepartmentSSEUrl(user.departmentId) : null, (event) => {
    // Refresh both stats and timeline on any departmental change
    fetchOverview();
    fetchActivity();
  });

  const avgCompletion = useMemo(() => {
    const list = overview?.data || [];
    if (!list.length) return 0;
    const totalProgress = list.reduce((acc, b) => {
      const pct = b.total > 0 ? (b.cleared / b.total) * 100 : 0;
      return acc + pct;
    }, 0);
    return Math.round(totalProgress / list.length);
  }, [overview]);

  const totalDues = useMemo(() => {
    const list = overview?.data || [];
    return list.reduce((acc, b) => acc + (b.hasDues || 0), 0);
  }, [overview]);

  if (loading && !overview) {
    return (
      <PageWrapper title="HOD Dashboard" subtitle="Loading metrics...">
        <div className="animate-pulse space-y-8">
           <div className="h-20 w-full bg-red-50/20 rounded-xl"></div>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[1, 2, 3].map(i => <div key={i} className="h-64 bg-muted/5 rounded-xl border border-muted"></div>)}
           </div>
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper title="HOD Dashboard" subtitle="Connection Error">
        <div className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm">
          <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
          <h2 className="text-xl font-black text-navy mb-2">Data Load Failed</h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{error}</p>
          <Button variant="primary" onClick={() => fetchOverview()}>
             <RefreshCw size={14} className="mr-2" /> Retry
          </Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="HOD Dashboard" subtitle={`Overview for ${user?.department || 'Your Department'}`}>
      {/* Alert Banner - Blocks Visibility (§6.4) */}
      {totalDues > 0 && (
        <div className="mb-8 sm:mb-10 p-5 rounded-xl bg-red-50/40 border border-red-100 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm shadow-red-100/20">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="h-10 w-10 bg-red-100 rounded-lg flex items-center justify-center text-red-600 shrink-0">
               <AlertCircle size={22} />
            </div>
            <div>
              <h2 className="text-red-950 font-black text-xs sm:text-sm uppercase tracking-tight">Active Dues Found</h2>
              <p className="text-red-700 text-[10px] sm:text-xs font-medium">{totalDues} students have dues flagged requiring review.</p>
            </div>
          </div>
          <button onClick={() => navigate('/hod/dues')} className="w-full sm:w-auto px-5 py-2 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors shadow-sm shadow-red-600/20">
            Review Dues
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Content: Batches (§6.4) */}
        <div className="lg:col-span-8 space-y-8">
          <div className="px-1 flex items-center justify-between">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-navy/40">Active Clearance Cycles</h2>
            <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
              <button 
                onClick={() => setIsBulkModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy text-white hover:bg-navy/90 transition-all shadow-sm shadow-navy/20"
              >
                <Layers size={12} /> Bulk Initiate
              </button>
              <span className="flex items-center gap-1.5 border-l border-muted pl-4"><TrendingUp size={12} strokeWidth={3} className="text-emerald-500" /> {avgCompletion}% Completion</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {(Array.isArray(overview?.data) ? overview.data : []).map((batch) => {
              const progress = batch.total > 0 ? Math.round((batch.cleared / batch.total) * 100) : 0;
              return (
                <div key={batch.batchId} onClick={() => navigate(`/hod/batch/${batch.batchId}`)} className="bg-white rounded-xl border border-muted shadow-sm p-6 hover:shadow-md transition-academic group cursor-pointer">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-black text-navy tracking-tight group-hover:text-gold transition-colors">{batch.className}</h3>
                    <ChevronRight size={18} className="text-muted-foreground/20 group-hover:text-gold group-hover:translate-x-1 transition-all" />
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                        <span>Progress</span>
                        <span className="text-navy">{progress}%</span>
                      </div>
                      <div className="h-1.5 bg-offwhite rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-navy rounded-full transition-all duration-1000" 
                          style={{ width: `${progress}%` }} 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-offwhite/50 rounded-xl border border-muted/50 text-center">
                        <p className="text-sm font-black text-navy">{batch.total - batch.cleared}</p>
                        <p className="text-[8px] uppercase tracking-widest text-muted-foreground font-bold">Pending</p>
                      </div>
                      <div className={`p-3 rounded-xl border text-center ${batch.hasDues > 0 ? 'bg-red-50 border-red-100' : 'bg-offwhite/50 border-muted/50'}`}>
                        <p className={`text-sm font-black ${batch.hasDues > 0 ? 'text-red-700' : 'text-navy'}`}>{batch.hasDues}</p>
                        <p className="text-[8px] uppercase tracking-widest text-muted-foreground font-bold">Dues</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="bg-offwhite/50 rounded-xl border border-dashed border-muted/80 flex flex-col items-center justify-center p-8 text-center hover:bg-white hover:border-navy/20 transition-all cursor-pointer group" onClick={() => navigate('/hod/dues')}>
               <div className="h-12 w-12 rounded-full bg-white shadow-sm flex items-center justify-center text-navy/40 group-hover:text-gold transition-colors mb-4">
                  <AlertCircle size={24} />
               </div>
               <h4 className="text-sm font-bold text-navy/60 group-hover:text-navy transition-colors uppercase tracking-widest">Override Center</h4>
            </div>
          </div>
        </div>

        {/* Sidebar Actions: Recent Activity (§6.4) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-xl border border-muted shadow-sm p-6">
            <div className="flex items-center gap-2 mb-6">
              <Activity size={18} className="text-navy" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-navy">Recent Activity</h2>
            </div>
            
            <div className="space-y-6">
              {activity?.data?.length > 0 ? (
                activity.data.map((item) => {
                  const Config = ACTIVITY_ICONS[item.type] || ACTIVITY_ICONS.CLEARANCE;
                  const Icon = Config.icon;
                  return (
                    <div key={item.id} className="relative pl-6 pb-6 border-l border-muted last:pb-0 last:border-0">
                      <div className={`absolute -left-3 top-0 h-6 w-6 rounded-full border-4 border-white flex items-center justify-center ${Config.cls}`}>
                        <Icon size={10} strokeWidth={3} />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-navy leading-none mb-1">
                          {item.student} <span className="text-muted-foreground/60 font-medium whitespace-nowrap">via {item.actor}</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
                          {item.context}
                        </p>
                        <span className="text-[9px] text-muted-foreground/40 font-mono mt-1 block">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-10 opacity-40">
                  <Clock size={32} className="mx-auto mb-2" />
                  <p className="text-[10px] uppercase font-black tracking-widest">No activities</p>
                </div>
              )}
            </div>
            
            <button 
              onClick={() => navigate('/hod/overrides')}
              className="w-full mt-6 py-3 border-t border-muted text-[10px] font-black uppercase tracking-widest text-navy/40 hover:text-navy transition-colors flex items-center justify-center gap-2"
            >
              View Override Logs <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
      {/* Bulk Initiation Modal */}
      <Modal 
        isOpen={isBulkModalOpen} 
        onClose={() => !isInitiating && setIsBulkModalOpen(false)}
        title="Start Department Clearance"
      >
        <form onSubmit={handleBulkInitiate} className="space-y-6">
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
            <AlertCircle className="text-amber-600 shrink-0" size={20} />
            <div className="space-y-1">
              <p className="text-xs font-black text-amber-900 uppercase tracking-tight">Important Notice</p>
              <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                This will trigger No-Dues clearance for <strong>all eligible classes</strong> in your department. 
                Classes with existing active sessions or no students will be skipped automatically.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
              Submission Deadline (Optional)
            </label>
            <input 
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite/50 focus:bg-white focus:ring-2 focus:ring-navy/5 outline-none transition-all text-sm font-medium"
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button 
              type="button"
              variant="secondary" 
              className="flex-1" 
              onClick={() => setIsBulkModalOpen(false)}
              disabled={isInitiating}
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              variant="primary" 
              className="flex-1"
              isLoading={isInitiating}
            >
              Confirm Initiation
            </Button>
          </div>
        </form>
      </Modal>
    </PageWrapper>
  );
};

export default HodDashboard;
