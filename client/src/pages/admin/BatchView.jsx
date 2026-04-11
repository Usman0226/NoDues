import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import BatchSummaryChips from '../../components/batch/BatchSummaryChips';
import Button from '../../components/ui/Button';
import { useApi } from '../../hooks/useApi';
import useSSE from '../../hooks/useSSE';
import { getBatch, closeBatch } from '../../api/batch';
import { getBatchSSEUrl } from '../../api/sse';
import { STATUSES } from '../../utils/constants';
import { ArrowLeft, X, Filter, ChevronRight, Info, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

const ICON_MAP = {
  [STATUSES.APPROVED]: { icon: '✅', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  [STATUSES.PENDING]: { icon: '⏳', cls: 'bg-amber-50 text-amber-700 border-amber-100' },
  [STATUSES.DUE_MARKED]: { icon: '❌', cls: 'bg-red-50 text-red-700 border-red-100' },
  [STATUSES.HOD_OVERRIDE]: { icon: '🛡️', cls: 'bg-blue-50 text-blue-700 border-blue-100' },
};

const BatchView = () => {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [popover, setPopover] = useState(null);

  const { data: batch, loading, error, request: fetchBatch } = useApi(() => getBatch(batchId), { immediate: true });

  // Real-time updates via SSE
  useSSE(batchId ? getBatchSSEUrl(batchId) : null, (event) => {
    if (event.type === 'approval_updated' || event.type === 'batch_updated') {
      fetchBatch();
    }
  });

  useEffect(() => {
    fetchBatch();
  }, [fetchBatch, batchId]);

  const handleCloseBatch = async () => {
    if (!window.confirm('Are you sure you want to CLOSE this academic cycle? This will lock all student records.')) return;
    try {
      await closeBatch(batchId);
      toast.success('Batch cycle closed successfully');
      fetchBatch();
    } catch (err) {
      // toast handled
    }
  };

  const filtered = useMemo(() => {
    if (!batch?.students) return [];
    let list = batch.students;
    if (filter === 'has_dues') list = list.filter((r) => r.status === STATUSES.HAS_DUES);
    if (filter === 'pending') list = list.filter((r) => r.status === STATUSES.PENDING);
    if (filter === 'cleared') list = list.filter((r) => r.status === STATUSES.CLEARED);
    return list;
  }, [batch, filter]);

  const summary = useMemo(() => {
    if (!batch?.students) return { [STATUSES.CLEARED]: 0, [STATUSES.PENDING]: 0, [STATUSES.HAS_DUES]: 0, [STATUSES.HOD_OVERRIDE]: 0 };
    return batch.students.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {});
  }, [batch]);

  if (loading && !batch) {
    return (
      <PageWrapper title="Batch Clearance Matrix" subtitle="Fetching institutional grid...">
        <div className="animate-pulse">
           <div className="h-24 w-full bg-muted/5 rounded-xl mb-10"></div>
           <div className="h-96 w-full bg-muted/5 rounded-xl border border-muted"></div>
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper title="Batch Clearance Matrix" subtitle="State retrieval failed">
        <div className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm">
          <AlertTriangle className="mx-auto text-status-due mb-4" size={48} />
          <h2 className="text-xl font-black text-navy mb-2">Grid Sync Error</h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{error}</p>
          <Button variant="primary" onClick={() => fetchBatch()}>
             <RefreshCw size={14} className="mr-2" /> Retry Fetch
          </Button>
        </div>
      </PageWrapper>
    );
  }

  if (!batch) return null;

  return (
    <PageWrapper title="Batch Clearance Matrix" subtitle={`${batch.batch?.className} · Cycle ${batch.batch?.academicYear}`}>
      <Link to="/admin/batches" className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-navy mb-8 -mt-6 transition-colors font-sans">
        <ArrowLeft size={12} strokeWidth={3} /> Return to History
      </Link>

      <BatchSummaryChips counts={summary} />

      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-10 mb-6 bg-white p-4 rounded-xl border border-muted shadow-sm">
        <div className="flex items-center gap-2">
          {['all', 'has_dues', 'pending', 'cleared'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all
                ${filter === f ? 'bg-navy text-white shadow-md' : 'text-muted-foreground hover:bg-offwhite'}`}>
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Badge status={batch.batch?.status === 'active' ? 'pending' : 'cleared'} className="bg-navy/5 text-navy/70 border-none px-4">
            Cycle State: {batch.batch?.status?.toUpperCase()}
          </Badge>
          {batch.batch?.status === 'active' && (
            <Button variant="danger" size="sm" className="h-9" onClick={handleCloseBatch}><X size={14} /> Close Cycle</Button>
          )}
        </div>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto rounded-xl border border-muted shadow-sm bg-white">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-offwhite/40 border-b border-muted/60">
              <th className="text-left px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground sticky left-0 bg-offwhite z-10 min-w-[220px]">Candidate Details</th>
              <th className="text-center px-4 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-l border-muted/30">Result</th>
              {batch.faculty?.map((f) => (
                <th key={f._id} className="text-center px-4 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-l border-muted/30">
                  <span className="block">{f.name}</span>
                  <span className="text-[8px] font-bold text-navy/40 mt-0.5">{f.subjectName || f.type.toUpperCase()}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-muted/30">
            {filtered.map((row) => (
              <tr key={row._id} className="hover:bg-offwhite/30 transition-colors group">
                <td className="px-6 py-4 sticky left-0 bg-white z-10 border-r border-muted/30">
                  <Link to={`/admin/batch/${batchId}/students/${row._id}`} className="flex items-center justify-between group/link">
                    <div className="flex flex-col">
                      <span className="font-mono text-xs font-black tracking-tight text-navy">{row.rollNo}</span>
                      <span className="text-navy/70 font-bold text-[11px] mt-0.5">{row.name}</span>
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground/30 group-hover/link:text-gold group-hover/link:translate-x-1 transition-all" />
                  </Link>
                </td>
                <td className="px-4 py-4 text-center border-l border-muted/30">
                  <Badge status={row.status} className="scale-90" />
                </td>
                {batch.faculty?.map((fac) => {
                  const data = row.approvals?.[fac._id];
                  const action = data?.status || STATUSES.PENDING;
                  const config = ICON_MAP[action] || ICON_MAP[STATUSES.PENDING];
                  
                  return (
                    <td key={fac._id} className="px-4 py-4 border-l border-muted/30 text-center">
                      <button onClick={() => setPopover({ ...data, faculty: fac.name, student: row.name, subject: fac.subjectName || fac.type, action })}
                        className={`
                          w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black border transition-all
                          hover:scale-110 shadow-sm mx-auto
                          ${config.cls}
                        `}
                        title={action.replace('_', ' ')}>
                        {config.icon}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Popover Detail Modal */}
      {popover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={() => setPopover(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full border border-muted animate-in zoom-in-95 duration-200">
            <button onClick={() => setPopover(null)} className="absolute top-4 right-4 text-muted-foreground hover:text-navy transition-colors"><X size={20} /></button>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 bg-offwhite rounded-xl flex items-center justify-center">
                <Info size={20} className="text-navy" />
              </div>
              <h3 className="text-lg font-black text-navy tracking-tight">Status Insight</h3>
            </div>
            <div className="space-y-4">
               <div>
                 <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1 leading-none">Stakeholder</p>
                 <p className="text-sm font-bold text-navy">{popover.subject} · {popover.faculty}</p>
               </div>
               <div>
                 <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1 leading-none">Decision State</p>
                 <Badge status={popover.action} />
               </div>
               {popover.action === STATUSES.DUE_MARKED && (
                 <div className="p-4 rounded-xl bg-red-50 border border-red-100">
                    <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                      <AlertTriangle size={10} strokeWidth={3} /> Decisive: {popover.dueType || 'Overage'}
                    </p>
                    <p className="text-xs text-red-800 font-medium italic leading-relaxed">"{popover.remarks || 'No specific remarks provided.'}"</p>
                 </div>
               )}
            </div>
            <Button variant="secondary" className="w-full mt-8" onClick={() => setPopover(null)}>Dismiss Insight</Button>
          </div>
        </div>
      )}
    </PageWrapper>
  );
};

export default BatchView;
