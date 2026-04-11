import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import { useApi } from '../../hooks/useApi';
import { getBatches } from '../../api/batch';
import { Eye, RefreshCw, AlertCircle } from 'lucide-react';
import Button from '../../components/ui/Button';

const Batches = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('all');
  const { data: response, loading, error, request: fetchBatches } = useApi(getBatches, { immediate: true });
  const batches = response?.data || [];


  const filtered = useMemo(() => {
    if (!batches) return [];
    if (statusFilter === 'all') return batches;
    return batches.filter((b) => {
      if (statusFilter === 'active') return b.status === 'active';
      return b.status === 'closed';
    });
  }, [batches, statusFilter]);

  const batchStats = useMemo(() => {
    const active = batches.filter((b) => b.status === 'active').length;
    const closed = batches.filter((b) => b.status === 'closed').length;
    return { total: batches.length, active, closed, visible: filtered.length };
  }, [batches, filtered]);

  const columns = [
    { key: 'className', label: 'Identity', render: (v) => <span className="font-black text-navy">{v}</span> },
    { key: 'departmentName', label: 'Department' },
    { key: 'academicYear', label: 'Year', render: (v, row) => <span className="font-semibold text-muted-foreground/60">{v} · S{row.semester}</span> },
    { key: 'initiatorName', label: 'Originator' },
    { 
      key: 'clearedCount', 
      label: 'Clearance Status', 
      render: (v, row) => (
        <div className="flex flex-col">
           <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">{v} Cleared</span>
           <span className="text-[9px] font-bold text-muted-foreground/40">{row.totalStudents - v} Remaining</span>
        </div>
      ) 
    },
    { 
      key: 'duesCount', 
      label: 'Flags', 
      render: (v) => <span className={`font-black tabular-nums ${v > 0 ? 'text-status-due' : 'text-muted-foreground/20'}`}>{v}</span> 
    },
    { key: 'status', label: 'State', render: (v) => <Badge status={v} /> },
    {
      key: '_id', label: 'Oversight', sortable: false, render: (v) => (
        <button onClick={() => navigate(`/admin/batch/${v}`)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] bg-navy text-white hover:bg-navy/90 font-black uppercase tracking-widest transition-all shadow-sm shadow-navy/10">
          <Eye size={12} strokeWidth={3} /> Analyze
        </button>
      )
    },
  ];

  return (
    <PageWrapper title="Batches" subtitle="All academic clearance batches across departments">
      <div className="flex flex-wrap items-center gap-3 mb-6 text-[10px] font-black uppercase tracking-widest text-navy">
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-muted shadow-sm">
          {batchStats.total} total
        </span>
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-800">
          {batchStats.active} active
        </span>
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-50 border border-muted text-muted-foreground">
          {batchStats.closed} closed
        </span>
        <span className="text-[11px] font-semibold normal-case tracking-normal text-muted-foreground">
          Table shows {batchStats.visible} row{batchStats.visible === 1 ? '' : 's'} with the current filter.
        </span>
      </div>

      <div className="flex items-center justify-between mb-8 px-1">
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-3 bg-white p-1 rounded-xl border border-muted shadow-sm">
             {['all', 'active', 'closed'].map((f) => (
               <button key={f} onClick={() => setStatusFilter(f)}
                 className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all
                   ${statusFilter === f ? 'bg-navy text-white shadow-md' : 'text-muted-foreground hover:bg-offwhite'}`}>
                 {f}
               </button>
             ))}
           </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => fetchBatches()} className="text-muted-foreground">
          <RefreshCw size={14} /> Refetch
        </Button>
      </div>

      {error ? (
        <div className="text-center py-16 bg-white rounded-xl border border-muted shadow-sm">
           <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
           <p className="text-muted-foreground font-medium">{error}</p>
        </div>
      ) : (
        <Table
          columns={columns}
          data={filtered}
          loading={loading && !response}
          searchable
          searchPlaceholder="Search by class name..."
        />
      )}
    </PageWrapper>
  );
};

export default Batches;
