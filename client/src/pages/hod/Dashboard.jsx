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
  ClipboardCheck,
  Users,
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
import { formatRole } from '../../utils/formatters';
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
import {motion} from 'framer-motion'

const ACTIVITY_ICONS = {
  CLEARANCE: { icon: CheckCircle2, cls: 'text-emerald-500 bg-emerald-50' },
  DUE_FLAG: { icon: XCircle, cls: 'text-red-500 bg-red-50' },
  HOD_OVERRIDE: { icon: ShieldCheck, cls: 'text-blue-500 bg-blue-50' }
};

const HodDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showGlobalLoader, refreshTasks } = useUI();
  
  const { data: overview, loading, error, request: fetchOverview } = useApi(getHodOverview, { immediate: true });
  const { data: activity, request: fetchActivity } = useApi(getHodActivity, { immediate: true });

  const [isBulkModalOpen, setIsBulkModalOpen] = React.useState(false);
  const [deadline, setDeadline] = React.useState('');
  const [isInitiating, setIsInitiating] = React.useState(false);
  const [isMounted, setIsMounted] = React.useState(false);

  const { data: previewResponse, loading: loadingPreview, request: fetchPreview } = useApi(getInitiationPreview);
  const previewData = useMemo(() => previewResponse?.data || [], [previewResponse?.data]);

  useEffect(() => {
    // Delay mounting charts to ensure container dimensions are calculated
    const timer = setTimeout(() => setIsMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

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

    const hide = showGlobalLoader('Initiating Department-wide Clearance...');
    try {
      setIsInitiating(true);
      const res = await initiateDepartmentBatch({ deadline: deadline || null });
      
      if (res.success) {
        toast.success(res.data.message || 'Bulk initiation started');
        setIsBulkModalOpen(false);
        setDeadline('');
        if (refreshTasks) refreshTasks();
      }
    } catch (err) {
      toast.error(err.message || 'Bulk initiation failed');
    } finally {
      setIsInitiating(false);
      hide();
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
      <PageWrapper title={`${formatRole(user?.role)} Dashboard`} subtitle="Loading metrics...">
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
      <PageWrapper title={`${formatRole(user?.role)} Dashboard`} subtitle="Connection Error">
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
    <PageWrapper title={`${formatRole(user?.role)} Dashboard`} subtitle={`Overview — ${user?.department || 'Department'}`}>
      
      {/* Minimal Hero Section */}
      <div className="flex flex-col lg:flex-row gap-6 mb-10">
        {/* Progress Card */}
        <div className="flex-1 bg-white rounded-3xl premium-card p-8 flex flex-col md:flex-row items-center gap-10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/[0.03] rounded-full translate-x-20 -translate-y-20 transition-transform group-hover:scale-110 duration-700" />
          
          <div className="relative h-44 w-44 shrink-0">
             {/* Progress Circle container */}
             <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-4xl font-black text-navy leading-none">{stats.completionRate}%</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mt-2 flex items-center gap-1.5">
                   <ShieldCheck size={12} /> Progress
                </span>
             </div>
             {/* Using a simple SVG for the progress circle for a custom feel */}
             <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle 
                   cx="50" cy="50" r="45" 
                   fill="none" 
                   stroke="#f1f5f9" 
                   strokeWidth="8" 
                />
                <motion.circle 
                   cx="50" cy="50" r="45" 
                   fill="none" 
                   stroke="currentColor" 
                   strokeWidth="8" 
                   strokeDasharray="283"
                   strokeDashoffset={283 - (283 * stats.completionRate / 100)}
                   strokeLinecap="round"
                   className="text-emerald-500 transition-all duration-1000"
                   initial={{ strokeDashoffset: 283 }}
                   animate={{ strokeDashoffset: 283 - (283 * stats.completionRate / 100) }}
                />
             </svg>
          </div>

          <div className="flex-1 space-y-6 relative z-10 w-full">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Total Students</p>
                <div className="flex items-center gap-2">
                   <p className="text-xl font-black text-navy">{stats.total}</p>
                   <Users size={14} className="text-zinc-300" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Classes</p>
                <div className="flex items-center gap-2">
                   <p className="text-xl font-black text-navy">{stats.activeCycles}</p>
                   <Layers size={14} className="text-zinc-300" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Cleared</p>
                <p className="text-xl font-black text-emerald-600">{stats.cleared}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-red-500">With Dues</p>
                <p className="text-xl font-black text-red-500">{stats.dues}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Primary Action Card */}
        <div className="w-full lg:w-[380px] bg-navy rounded-3xl p-8 text-white flex flex-col justify-between relative overflow-hidden shadow-2xl shadow-navy/20 group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-transparent pointer-events-none" />
          <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-gold/10 rounded-full blur-3xl" />
          
          <div className="relative z-10">
             <div className="h-12 w-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center mb-6">
                <ClipboardCheck size={24} className="text-gold" />
             </div>
             <h3 className="text-2xl font-black tracking-tight mb-2 text-white ">Start New Process</h3>
             <p className="text-xs text-white/50 leading-relaxed font-medium">Create clearance cycles for all eligible classes across the department.</p>
          </div>

          <button 
             onClick={() => setIsBulkModalOpen(true)}
             className="mt-8 w-full py-4 bg-white text-navy rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-lg hover:shadow-gold/20 active:scale-95 transition-all relative z-10 flex items-center justify-center gap-3 group/btn"
          >
             INITIALIZE NODUES <RefreshCw size={14} className="group-hover/btn:rotate-180 transition-transform duration-700" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
        <div className="rounded-3xl lg:col-span-8 premium-card bg-white p-8 relative group overflow-hidden">
           <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/[0.02] rounded-full translate-x-32 -translate-y-32" />
           <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-10 relative z-10">
              <div>
                <h3 className="text-base font-black text-navy uppercase tracking-[0.2em] mb-1">Status per Class</h3>
                <p className="text-[11px] text-zinc-400 font-medium">Progress overview across batches</p>
              </div>
           </div>
           
           <div className="h-[320px] w-full relative min-h-[320px]">
              {chartData.batches.length > 0 && isMounted ? (
                <ResponsiveContainer width="100%" height="100%" minHeight={320}>
                  <BarChart data={chartData.batches} margin={{ top: 20, right: 30, left: 0, bottom: 0 }} barGap={8}>
                    <defs>
                      <linearGradient id="colorCleared" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                      </linearGradient>
                      <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1}/>
                      </linearGradient>
                      <linearGradient id="colorDues" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="6 6" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 9, fontWeight: 900, fill: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }} 
                      dy={15}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#94a3b8' }} />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc', radius: 8 }}
                      contentStyle={{ 
                        borderRadius: '20px', 
                        border: '1px solid #f1f5f9', 
                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', 
                        padding: '16px',
                        background: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(10px)'
                      }}
                    />
                    <Legend 
                      verticalAlign="top" 
                      align="right" 
                      iconType="circle" 
                      wrapperStyle={{ paddingBottom: '30px', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#64748b' }} 
                    />
                    <Bar dataKey="cleared" fill="url(#colorCleared)" radius={[8, 8, 4, 4]} barSize={24} />
                    <Bar dataKey="pending" fill="url(#colorPending)" radius={[8, 8, 4, 4]} barSize={24} />
                    <Bar dataKey="dues" fill="url(#colorDues)" radius={[8, 8, 4, 4]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-50/50 rounded-xl border border-dashed border-zinc-200">
                   <div className="h-12 w-12 rounded-full bg-white shadow-sm flex items-center justify-center text-zinc-300 mb-4">
                      <Layers size={24} />
                   </div>
                   <h4 className="text-xs font-black text-navy/40 uppercase tracking-widest leading-none mb-2">No active cycles</h4>
                   <p className="text-[10px] text-muted-foreground font-medium mb-6">Start your first process to see progress here.</p>
                   <button 
                    onClick={() => setIsBulkModalOpen(true)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-navy text-white text-[10px] font-black uppercase tracking-widest hover:bg-navy/90 transition-all shadow-lg shadow-navy/20"
                   >
                     <RefreshCw size={12} className="animate-spin-slow" /> Start NoDue's for this SEM
                   </button>
                </div>
              )}
           </div>
        </div>

        {/* Distribution Doughnut (§10.1) */}
        <div className="rounded-3xl lg:col-span-4 premium-card bg-white p-8 flex flex-col items-center relative overflow-hidden">
           {/* <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-indigo-500 to-amber-500 opacity-50" /> */}
           <div className="w-full text-left mb-8">
              <h3 className="text-sm font-black text-navy uppercase tracking-[0.2em]">Departmental Stats</h3>
              <p className="text-[10px] text-zinc-400 font-medium tracking-tight">System-wide status distribution</p>
           </div>
           
           <div className="h-64 w-full relative min-h-[256px]">
              {chartData.distribution.length > 0 && isMounted ? (
                <>
                  <ResponsiveContainer width="100%" height="100%" minHeight={256}>
                    <PieChart>
                      <Pie
                        data={chartData.distribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={95}
                        paddingAngle={10}
                        cornerRadius={12}
                        dataKey="value"
                      >
                        {chartData.distribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          borderRadius: '16px', 
                          border: 'none', 
                          boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', 
                          padding: '12px',
                          background: 'rgba(255, 255, 255, 0.95)',
                          backdropFilter: 'blur(8px)'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-black text-navy leading-none tracking-tighter">{stats.completionRate}%</span>
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 mt-2">Certified</span>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-10 grayscale scale-90 pointer-events-none">
                   <Activity size={64} className="mb-2" />
                   <p className="text-[9px] font-black uppercase tracking-widest">Awaiting Pulse</p>
                </div>
              )}
           </div>

           <div className="w-full space-y-3 mt-6">
              {chartData.distribution.length > 0 ? chartData.distribution.map((item) => (
                <div key={item.name} className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50/50 hover:bg-zinc-50 border border-transparent hover:border-zinc-200/50 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)]" style={{ backgroundColor: item.color }} />
                    <span className="text-[10px] font-black text-navy uppercase tracking-[0.1em] group-hover:translate-x-0.5 transition-transform">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-navy">{Math.round((item.value / stats.total) * 100)}%</span>
                    <span className="h-1 w-1 rounded-full bg-zinc-200" />
                    <span className="text-[10px] font-bold text-zinc-400">{item.value} Units</span>
                  </div>
                </div>
              )) : (
                <div className="p-4 text-center border border-dashed border-muted rounded-xl opacity-40">
                   <p className="text-[9px] font-black uppercase tracking-widest">Calibration Pending</p>
                </div>
              )}
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Active Batches List (Simplified) */}
        <div className="lg:col-span-8">
          <div className="px-1 flex items-center justify-between mb-6">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-navy/40">Active Batches</h2>
            <button 
              onClick={() => navigate('/hod/dues')}
              className="text-[10px] font-black uppercase tracking-widest text-gold hover:underline"
            >
              Manage Overrides
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
             {(Array.isArray(overview?.data) ? overview.data : []).map((batch) => {
               const progress = Math.round((batch.cleared / batch.total) * 100);
               return (
                <div 
                  key={batch.batchId} 
                  onClick={() => navigate(`/hod/batch/${batch.batchId}`)} 
                  className="rounded-3xl premium-card p-6 bg-white group cursor-pointer relative overflow-hidden"
                >
                    <div className="absolute top-0 left-0 h-1 bg-zinc-50 w-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className={`h-full ${progress === 100 ? 'bg-emerald-500' : 'bg-indigo-500'} transition-all duration-1000`}
                      />
                    </div>
                    <div className="flex items-center justify-between mb-6">
                      <div className="h-12 w-12 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all duration-500">
                        <GraduationCap size={24} strokeWidth={2.5} />
                      </div>
                      <div className="text-right">
                        <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-md ${
                          progress === 100 ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-400'
                        }`}>
                          {progress}% SYNC
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-lg font-black text-navy tracking-tight group-hover:text-indigo-600 transition-colors">
                        {batch.className}
                      </h4>
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Sem {batch.semester}</p>
                        <span className="h-1 w-1 rounded-full bg-zinc-200" />
                        <p className="text-[10px] font-bold text-zinc-400">{batch.total} STUDENTS</p>
                      </div>
                    </div>
                </div>
               );
             })}
          </div>
        </div>

        {/* Activity: Polished Bento-style sidebar (§10.1) */}
        <div className="lg:col-span-4 space-y-6">
           <div className="premium-card bg-white rounded-[2rem] p-8 overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-6 opacity-[0.02] pointer-events-none group-hover:rotate-12 transition-transform duration-1000">
               <History size={120} />
            </div>
            
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Activity size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-navy">Recent Activity</h2>
                  <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Live updates</p>
                </div>
              </div>
              <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
            </div>
            
            <div className="space-y-0 relative z-10">
              {activity?.data?.length > 0 ? (
                activity.data.map((item, idx) => {
                  const Config = ACTIVITY_ICONS[item.type] || ACTIVITY_ICONS.CLEARANCE;
                  const Icon = Config.icon;
                  return (
                    <div key={item.id} className="relative pl-8 pb-10 last:pb-2 group/item">
                      {idx !== activity.data.length - 1 && (
                        <div className="absolute left-[13px] top-8 bottom-0 w-px bg-gradient-to-b from-zinc-100 to-transparent" />
                      )}
                      <div className={`absolute left-0 top-0 h-7 w-7 rounded-2xl border-2 border-white flex items-center justify-center shadow-lg shadow-black/5 z-10 transition-transform group-hover/item:scale-110 ${Config.cls}`}>
                        <Icon size={12} strokeWidth={3} />
                      </div>
                      <div className="transition-all group-hover/item:translate-x-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[12px] font-black text-navy leading-none">
                            {item.student}
                          </p>
                          <span className="text-[8px] text-zinc-300 font-black uppercase">
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-400 font-medium leading-relaxed">
                           <span className="font-black text-indigo-600/60 uppercase text-[9px] tracking-wide">{item.actor}</span>
                           <span className="mx-1">•</span>
                           {item.context}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 opacity-30">
                  <Clock size={48} strokeWidth={1.5} className="mx-auto mb-4 text-zinc-300" />
                  <p className="text-[10px] uppercase font-black tracking-[0.2em] text-zinc-400">Stream Calibrating...</p>
                </div>
              )}
            </div>
            
            <button 
              onClick={() => navigate('/hod/overrides')}
              className="w-full mt-10 py-4 bg-zinc-50 rounded-2xl border border-zinc-100 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 hover:text-indigo-600 hover:bg-white hover:border-indigo-100/50 transition-all flex items-center justify-center gap-3 group/btn"
            >
              VIEW HISTORY <ChevronRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
      {/* Bulk Initiation Modal */}
      <Modal 
        isOpen={isBulkModalOpen} 
        onClose={() => !isInitiating && setIsBulkModalOpen(false)}
        title="Start Clearance Process"
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
              loading={isInitiating}
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
                <p className="text-xs font-black text-navy uppercase tracking-tight">Overview</p>
                <p className="text-[11px] text-navy/60 font-medium leading-relaxed">
                  Only classes with students and no active cycles can be started.
                </p>
              </div>
            </div>

            <div className="flex-1">
              <form id="bulk-initiate-form" onSubmit={handleBulkInitiate} className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Deadline
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
                    Set a date for faculty to finish their work.
                  </p>
                </div>
              </form>
            </div>
          </div>

          {/* Right Panel: Class Selection Preview */}
          <div className="lg:col-span-7 flex flex-col border-l border-zinc-100 lg:pl-10 mt-8 lg:mt-0">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Class Status</h4>
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
                          <span className="text-[9px] font-black uppercase text-emerald-600 tracking-widest">Ready</span>
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
