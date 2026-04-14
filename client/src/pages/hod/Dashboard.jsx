import React, { useEffect, useMemo } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import { useApi } from '../../hooks/useApi';
import { getHodOverview, getHodActivity } from '../../api/hod';
import useSSE from '../../hooks/useSSE';
import { getDepartmentSSEUrl } from '../../api/sse';
import { useAuth } from '../../hooks/useAuth';
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
  ShieldCheck,
  Users,
  Check,
  Info,
  Archive,
  GraduationCap,
  FileCheck2,
  AlertTriangle,
  History
} from 'lucide-react';
import Button from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Modal from '../../components/ui/Modal';
import { initiateDepartmentBatch, getInitiationPreview } from '../../api/batch';
import { useUI } from '../../hooks/useUI';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area
} from 'recharts';


const ACTIVITY_ICONS = {
  CLEARANCE: { icon: CheckCircle2, cls: 'text-emerald-500 bg-emerald-50' },
  DUE_FLAG: { icon: XCircle, cls: 'text-red-500 bg-red-50' },
  HOD_OVERRIDE: { icon: ShieldCheck, cls: 'text-blue-500 bg-blue-50' }
};

const HodDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showGlobalLoader } = useUI();
  
  const { data: overview, loading, error, request: fetchOverview } = useApi(getHodOverview, { immediate: true });
  const { data: activity, request: fetchActivity } = useApi(getHodActivity, { immediate: true });

  const [isBulkModalOpen, setIsBulkModalOpen] = React.useState(false);
  const [deadline, setDeadline] = React.useState('');
  const [isInitiating, setIsInitiating] = React.useState(false);

  const { data: previewResponse, loading: loadingPreview, request: fetchPreview } = useApi(getInitiationPreview);
  const previewData = useMemo(() => previewResponse?.data || [], [previewResponse?.data]);

  useEffect(() => {
    if (isBulkModalOpen) {
      fetchPreview();
    }
  }, [isBulkModalOpen, fetchPreview]);

  const readyClassesCount = useMemo(() => {
    return previewData.filter(c => c.status === 'READY').length;
  }, [previewData]);

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
  useSSE(user?.departmentId ? getDepartmentSSEUrl(user.departmentId) : null, () => {
    fetchOverview();
    fetchActivity();
  });


  const stats = useMemo(() => {
    const list = overview?.data || [];
    const total = list.reduce((acc, b) => acc + b.total, 0);
    const cleared = list.reduce((acc, b) => acc + b.cleared + (b.overridden || 0), 0);
    const dues = list.reduce((acc, b) => acc + b.hasDues, 0);
    const pending = list.reduce((acc, b) => acc + b.pending, 0);
    
    return {
      total,
      cleared,
      dues,
      pending,
      completionRate: total > 0 ? Math.round((cleared / total) * 100) : 0,
      activeCycles: list.length
    };
  }, [overview]);

  const chartData = useMemo(() => {
    const list = overview?.data || [];
    
    // 1. Overall Status Distribution
    const distribution = [
      { name: 'Cleared', value: list.reduce((acc, b) => acc + b.cleared + (b.overridden || 0), 0), color: '#10b981' },
      { name: 'Pending', value: list.reduce((acc, b) => acc + b.pending, 0), color: '#f59e0b' },
      { name: 'Dues', value: list.reduce((acc, b) => acc + b.hasDues, 0), color: '#ef4444' }
    ].filter(d => d.value > 0);

    // 2. Class-wise Progress
    const batches = list.map(b => ({
      name: b.className,
      cleared: b.cleared + (b.overridden || 0),
      pending: b.pending,
      dues: b.hasDues,
      batchId: b.batchId
    }));

    return { distribution, batches };
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
          <Button 
            variant="primary" 
            onClick={async () => {
              const hide = showGlobalLoader('Refreshing Dashboard...');
              await fetchOverview();
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
    <PageWrapper title="HOD Dashboard" subtitle={`Advanced Analytics — ${user?.department || 'Department'}`}>
      
      {/* Top row: High Impact Stats Card (§10.1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-muted/60 shadow-sm flex items-center gap-4 hover-lift">
          <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <Users size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Total Enrollment</p>
            <p className="text-xl font-black text-navy">{stats.total}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-muted/60 shadow-sm flex items-center gap-4 hover-lift">
          <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Completion Rate</p>
            <p className="text-xl font-black text-navy">{stats.completionRate}%</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-muted/60 shadow-sm flex items-center gap-4 hover-lift">
          <div className="h-12 w-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Active Dues</p>
            <p className="text-xl font-black text-navy">{stats.dues}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-muted/60 shadow-sm flex items-center gap-4 hover-lift">
          <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <FileCheck2 size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Active Cycles</p>
            <p className="text-xl font-black text-navy">{stats.activeCycles}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
        {/* Progress Chart: Main Visualized Form (§10.1) */}
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-muted shadow-sm">
           <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-sm font-black text-navy uppercase tracking-widest">Class-wise Performance</h3>
                <p className="text-[10px] text-muted-foreground font-medium">Comparative clearance status across all batches</p>
              </div>
              <button 
                onClick={() => setIsBulkModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-navy text-white text-[10px] font-black uppercase tracking-widest hover:bg-navy/90 transition-all shadow-sm shadow-navy/20"
              >
                <Layers size={14} /> NEW CYCLE
              </button>
           </div>
           
           <div className="h-[320px] w-full relative">
              {chartData.batches.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.batches} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} 
                      dy={10}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                    />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }} />
                    <Bar dataKey="cleared" type="monotone" fill="#10b981" radius={[4, 4, 0, 0]} barSize={32} />
                    <Bar dataKey="pending" type="monotone" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={32} />
                    <Bar dataKey="dues" type="monotone" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-50/50 rounded-xl border border-dashed border-zinc-200">
                   <div className="h-12 w-12 rounded-full bg-white shadow-sm flex items-center justify-center text-zinc-300 mb-4">
                      <Layers size={24} />
                   </div>
                   <h4 className="text-xs font-black text-navy/40 uppercase tracking-widest leading-none mb-2">No Active Records Found</h4>
                   <p className="text-[10px] text-muted-foreground font-medium mb-6">Start your first clearance cycle to see analytics.</p>
                   <button 
                    onClick={() => setIsBulkModalOpen(true)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-navy text-white text-[10px] font-black uppercase tracking-widest hover:bg-navy/90 transition-all shadow-lg shadow-navy/20"
                   >
                     <RefreshCw size={12} className="animate-spin-slow" /> Initiate Bulk Process
                   </button>
                </div>
              )}
           </div>
        </div>

        {/* Distribution Doughnut (§10.1) */}
        <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-muted shadow-sm flex flex-col items-center">
           <div className="w-full text-left mb-4">
              <h3 className="text-sm font-black text-navy uppercase tracking-widest">Global Status</h3>
              <p className="text-[10px] text-muted-foreground font-medium">Departmental aggregation</p>
           </div>
           
           <div className="h-64 w-full relative">
              {chartData.distribution.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData.distribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={8}
                        dataKey="value"
                      >
                        {chartData.distribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-black text-navy leading-none">{stats.completionRate}%</span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground mt-1">Cleared</span>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20 grayscale scale-90 pointer-events-none">
                   <Activity size={64} className="mb-2" />
                   <p className="text-[9px] font-black uppercase tracking-widest">No Distribution</p>
                </div>
              )}
           </div>

           <div className="w-full space-y-2 mt-4">
              {chartData.distribution.length > 0 ? chartData.distribution.map((item) => (
                <div key={item.name} className="flex items-center justify-between p-2.5 rounded-xl bg-offwhite hover:bg-white border border-transparent hover:border-muted transition-academic">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-[10px] font-black text-navy uppercase tracking-tight">{item.name}</span>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground">{item.value} Students</span>
                </div>
              )) : (
                <div className="p-4 text-center border border-dashed border-muted rounded-xl opacity-40">
                   <p className="text-[9px] font-black uppercase tracking-widest">Awaiting Data Points</p>
                </div>
              )}
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Active Batches List (Simplified) */}
        <div className="lg:col-span-8">
          <div className="px-1 flex items-center justify-between mb-6">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-navy/40">Active Department Batches</h2>
            <button 
              onClick={() => navigate('/hod/dues')}
              className="text-[10px] font-black uppercase tracking-widest text-gold hover:underline"
            >
              Manage Overrides
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             {(Array.isArray(overview?.data) ? overview.data : []).map((batch) => (
               <div key={batch.batchId} onClick={() => navigate(`/hod/batch/${batch.batchId}`)} className="bg-white p-4 rounded-xl border border-muted/60 hover:shadow-lg hover:shadow-navy/5 transition-all group cursor-pointer flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-offwhite flex items-center justify-center text-navy/30 group-hover:text-navy transition-colors">
                      <GraduationCap size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-navy leading-none mb-1 group-hover:text-gold transition-colors">{batch.className}</h4>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Sem {batch.semester} • {Math.round((batch.cleared / batch.total) * 100)}% Done</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground/20 group-hover:text-gold group-hover:translate-x-1 transition-all" />
               </div>
             ))}
          </div>
        </div>

        {/* Activity: Polished Bento-style sidebar (§10.1) */}
        <div className="lg:col-span-4 space-y-6">
           <div className="bg-white rounded-2xl border border-muted shadow-sm p-6 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none">
               <History size={80} />
            </div>
            
            <div className="flex items-center gap-2 mb-8">
              <Activity size={18} className="text-navy" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-navy">Live Activity</h2>
            </div>
            
            <div className="space-y-6 relative z-10">
              {activity?.data?.length > 0 ? (
                activity.data.map((item) => {
                  const Config = ACTIVITY_ICONS[item.type] || ACTIVITY_ICONS.CLEARANCE;
                  const Icon = Config.icon;
                  return (
                    <div key={item.id} className="relative pl-6 pb-6 border-l border-muted/50 last:pb-0 last:border-0 hover-lift group">
                      <div className={`absolute -left-3.5 top-0 h-7 w-7 rounded-full border-4 border-white flex items-center justify-center shadow-sm ${Config.cls}`}>
                        <Icon size={12} strokeWidth={3} />
                      </div>
                      <div className="transition-all group-hover:translate-x-1">
                        <p className="text-[11px] font-black text-navy leading-none mb-1">
                          {item.student}
                        </p>
                        <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-tight">
                           Action by <span className="font-bold text-navy/60">{item.actor}</span> • {item.context}
                        </p>
                        <span className="text-[8px] text-muted-foreground/30 font-black uppercase mt-1.5 block">
                           {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-10 opacity-40">
                  <Clock size={32} className="mx-auto mb-2" />
                  <p className="text-[10px] uppercase font-black tracking-widest">No Recent Stream</p>
                </div>
              )}
            </div>
            
            <button 
              onClick={() => navigate('/hod/overrides')}
              className="w-full mt-8 py-3 bg-offwhite rounded-xl border border-muted text-[10px] font-black uppercase tracking-widest text-navy/60 hover:text-navy hover:bg-white transition-all flex items-center justify-center gap-2"
            >
              Full History <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
      {/* Bulk Initiation Modal */}
      <Modal 
        isOpen={isBulkModalOpen} 
        onClose={() => !isInitiating && setIsBulkModalOpen(false)}
        title="Start Department Clearance"
        size="xl"
        footer={(
          <div className="flex justify-end gap-3">
            <Button 
              type="button"
              variant="secondary" 
              className="px-8" 
              onClick={() => setIsBulkModalOpen(false)}
              disabled={isInitiating}
            >
              Cancel
            </Button>
            <Button 
              form="bulk-initiate-form"
              type="submit"
              variant="primary" 
              className="min-w-[240px]"
              isLoading={isInitiating}
              disabled={loadingPreview || readyClassesCount === 0}
            >
              {readyClassesCount > 0 ? `Initiate ${readyClassesCount} Classes` : 'No Eligible Classes'}
            </Button>
          </div>
        )}
      >
        <div className="lg:grid lg:grid-cols-12 lg:gap-10 h-full">
          {/* Left Panel: Configuration & Context */}
          <div className="lg:col-span-5 flex flex-col space-y-8">
            <div className="p-5 bg-indigo-50/40 rounded-2xl border border-indigo-100 flex gap-4">
              <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-indigo-600 shadow-sm shrink-0">
                <Info size={20} />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-black text-navy uppercase tracking-tight">Eligibility Overview</p>
                <p className="text-[11px] text-navy/60 font-medium leading-relaxed">
                  We've analyzed your department's classes. Only sessions with enrolled students and no existing active cycles can be initiated.
                </p>
              </div>
            </div>

            <div className="flex-1">
              <form id="bulk-initiate-form" onSubmit={handleBulkInitiate} className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Global Submission Deadline
                    </label>
                    <span className="text-[9px] font-bold text-navy/30 uppercase">Optional</span>
                  </div>
                  <input 
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl border border-zinc-200 bg-zinc-50/50 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm font-semibold text-navy"
                    min={new Date().toISOString().split('T')[0]}
                  />
                  <p className="text-[10px] text-muted-foreground/60 italic ml-1">
                    Set a target date for faculty to complete their dues clearance.
                  </p>
                </div>
              </form>
            </div>
          </div>

          {/* Right Panel: Class Selection Preview */}
          <div className="lg:col-span-7 flex flex-col border-l border-zinc-100 lg:pl-10 mt-8 lg:mt-0">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Class Scan Results</h4>
              <div className="px-2 py-0.5 rounded-md bg-zinc-100 text-[9px] font-bold text-zinc-500 uppercase">
                {previewData.length} Total
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto pr-4 custom-scrollbar space-y-3">
              {loadingPreview ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-20 w-full bg-slate-50 animate-pulse rounded-2xl border border-zinc-100" />
                  ))}
                </div>
              ) : previewData.length > 0 ? (
                previewData.map((cls) => (
                  <div key={cls.classId} className={`group p-4 rounded-2xl border transition-all duration-300 ${
                    cls.status === 'READY' 
                      ? 'bg-white border-zinc-100 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-500/5' 
                      : 'bg-zinc-50/50 border-dashed border-zinc-200 opacity-60'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex gap-4">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${
                          cls.status === 'READY' ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-200/50 text-zinc-400'
                        }`}>
                          {cls.status === 'READY' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-navy leading-none mb-1.5">{cls.className}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Sem {cls.semester}</span>
                            <span className="h-1 w-1 rounded-full bg-zinc-300" />
                            <span className="text-[10px] text-muted-foreground font-medium">{cls.academicYear}</span>
                          </div>
                        </div>
                      </div>
                      
                      {cls.status === 'READY' ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[9px] font-black uppercase text-emerald-600 tracking-widest">Compatible</span>
                          <div className="flex items-center gap-1.5">
                            <Users size={12} className="text-neutral-400" />
                            <span className="text-xs font-bold text-navy">{cls.studentCount}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[9px] font-bold uppercase text-red-500 bg-red-50 px-2 py-1 rounded-md">
                          {cls.reason}
                        </span>
                      )}
                    </div>

                    {cls.status === 'READY' && (
                      <div className="mt-4 pt-3 border-t border-zinc-50">
                        {cls.warnings.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                             {cls.warnings.map((w, idx) => (
                               <div key={idx} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 text-amber-700">
                                 <AlertCircle size={10} />
                                 <span className="text-[9px] font-black uppercase tracking-tight">{w}</span>
                               </div>
                             ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-emerald-600">
                             <ShieldCheck size={12} />
                             <span className="text-[9px] font-black uppercase tracking-tight">Verified & Ready</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-20 opacity-30">
                  <Archive size={40} className="mx-auto mb-4" />
                  <p className="text-xs font-black uppercase tracking-widest italic">No classes found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </PageWrapper>
  );
};

export default HodDashboard;
