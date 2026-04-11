import React, { useEffect, useMemo } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import { useApi } from '../../hooks/useApi';
import { getBatches } from '../../api/batch';
import { 
  Users, 
  Layers, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import Button from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { data: response, loading, error, request: fetchBatches } = useApi(getBatches, { immediate: true });
  const batches = response?.data || [];

  const stats = useMemo(() => {
    if (!batches) return [];
    
    const activeBatches = batches.filter(b => b.status === 'active');
    const closedBatches = batches.filter(b => b.status === 'closed');
    
    // Aggregating progress for the whole institution
    let totalCands = 0;
    let totalCleared = 0;
    let totalDues = 0;

    batches.forEach(b => {
      totalCands += b.totalStudents || 0;
      totalCleared += b.clearedCount || 0;
      totalDues += b.duesCount || 0;
    });

    return [
      { label: 'Active Cycles', value: activeBatches.length, icon: Layers, color: 'text-navy', bg: 'bg-navy/5' },
      { label: 'Total Candidates', value: totalCands.toLocaleString(), icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
      { label: 'Cleared', value: totalCleared.toLocaleString(), icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
      { label: 'In Progress', value: (totalCands - totalCleared - totalDues).toLocaleString(), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
      { label: 'Flagged', value: totalDues.toLocaleString(), icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    ];
  }, [batches]);

  const columns = [
    { key: 'className', label: 'Academic Group', render: (v) => <span className="font-black text-navy">{v}</span> },
    { key: 'academicYear', label: 'Session', render: (v, row) => <span className="text-muted-foreground/60 font-semibold">{v} · Sem {row.semester}</span> },
    { 
      key: 'progress', 
      label: 'Clearance Status', 
      render: (_, row) => {
        const pct = row.totalStudents > 0 ? Math.round((row.clearedCount / row.totalStudents) * 100) : 0;
        return (
          <div className="flex items-center gap-3 min-w-[120px]">
            <div className="flex-1 h-1.5 bg-offwhite rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all duration-1000" 
                style={{ width: `${pct}%` }} 
              />
            </div>
            <span className="text-[10px] font-black tabular-nums">{pct}%</span>
          </div>
        );
      }
    },
    { 
      key: 'status', 
      label: 'Condition', 
      render: (v) => <Badge status={v === 'active' ? 'pending' : 'cleared'}>{v.toUpperCase()}</Badge> 
    },
    {
      key: 'action',
      label: '',
      sortable: false,
      render: (_, row) => (
        <button
          type="button"
          onClick={() => navigate(`/admin/batch/${row._id}`)}
          className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 inline-flex items-center justify-center rounded-full hover:bg-muted/30 transition-colors touch-manipulation"
          aria-label="Open batch"
        >
          <ArrowRight size={14} className="text-muted-foreground/40" />
        </button>
      )
    }
  ];

  if (error) {
    return (
      <PageWrapper title="Institutional Control" subtitle="System connectivity issue">
        <div className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm">
          <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
          <h2 className="text-xl font-black text-navy mb-2">Metrics Unavailable</h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{error}</p>
          <Button variant="primary" onClick={() => fetchBatches()}>
             <RefreshCw size={14} className="mr-2" /> Refresh Data
          </Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Institutional Control" subtitle="System-wide clearance health and batch metrics">
      {/* Stats Grid */}
      <div className={`grid grid-cols-2 lg:grid-cols-5 gap-6 mb-12 ${loading && !response ? 'animate-pulse' : ''}`}>
        {stats.map((stat, i) => (
          <div key={i} className="bg-white rounded-xl p-6 border border-muted shadow-sm hover:shadow-md transition-academic group">
            <div className={`h-10 w-10 rounded-xl ${stat.bg} flex items-center justify-center mb-4 transition-transform group-hover:scale-110`}>
              <stat.icon size={20} className={stat.color} />
            </div>
            <p className="text-2xl font-black text-navy tracking-tight">{stat.value}</p>
            <p className="text-[10px] font-semibold text-muted-foreground tracking-tight">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Activity Table */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4 px-1 gap-4">
            <h2 className="text-sm font-semibold text-zinc-600">Recent batches</h2>
            <button
              type="button"
              className="text-xs font-semibold text-navy hover:text-gold shrink-0 min-h-11 px-2 sm:min-h-0 rounded-lg sm:rounded-none"
              onClick={() => navigate('/admin/batches')}
            >
              View all batches
            </button>
          </div>
          <Table columns={columns} data={batches || []} loading={loading && !response} skeletonRows={6} />
        </div>

        {/* Informational Feed */}
        <div>
          <div className="flex items-center justify-between mb-4 px-1">
             <h2 className="text-sm font-semibold text-zinc-600">Status</h2>
             <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden /> Live
             </span>
          </div>
          <div className="bg-white rounded-xl border border-muted shadow-sm p-6 space-y-6">
            <div className="flex gap-4 items-start group">
              <div className="h-2 w-2 rounded-full bg-gold mt-1.5 shrink-0 group-hover:scale-125 transition-transform" />
              <div>
                <p className="text-xs font-bold text-navy leading-relaxed">
                   The system is operating normally. All {stats[0]?.value || 0} active cycles are syncing results correctly across departments.
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 font-medium">Just now · System Health</p>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-offwhite border border-muted/50">
               <p className="text-[10px] uppercase font-black tracking-widest text-navy/40 mb-2">Batch Summary</p>
               <div className="space-y-3">
                  <div className="flex items-center justify-between">
                     <span className="text-xs font-bold text-navy/60">Active Cycles</span>
                     <span className="text-xs font-black text-navy">{stats[0]?.value || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                     <span className="text-xs font-bold text-navy/60">Critical Dues</span>
                     <span className="text-xs font-black text-status-due">{stats[4]?.value || 0}</span>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};

export default AdminDashboard;
