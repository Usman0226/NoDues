import React, { useState, useMemo } from 'react';
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
import Modal from '../../components/ui/Modal';
import { ArrowLeft, X, ChevronRight, Info, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { useUI } from '../../context/UIContext';


const ICON_MAP = {
  [STATUSES.APPROVED]: { icon: '✅', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  [STATUSES.PENDING]: { icon: '⏳', cls: 'bg-amber-50 text-amber-700 border-amber-100' },
  [STATUSES.DUE_MARKED]: { icon: '❌', cls: 'bg-red-50 text-red-700 border-red-100' },
  [STATUSES.HOD_OVERRIDE]: { icon: '🛡️', cls: 'bg-blue-50 text-blue-700 border-blue-100' },
};

const BatchView = () => {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showGlobalLoader } = useUI();
  const isHod = user?.role === 'hod';
  const basePath = isHod ? '/hod' : '/admin';

  const [filter, setFilter] = useState('all');
  const [popover, setPopover] = useState(null);

  const { data: batch, loading, error, request: fetchBatch } = useApi(() => getBatch(batchId), { 
    immediate: true,
    queryKey: ['batch', batchId]
  });

  // Real-time updates via SSE
  useSSE(batchId ? getBatchSSEUrl(batchId) : null, (event) => {
    if (event.type === 'approval_updated' || event.type === 'batch_updated') {
      fetchBatch();
    }
  });

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
      <PageWrapper title="Clearance Overview" subtitle="Fetching status list...">
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
          <Button 
            variant="primary" 
            onClick={async () => {
              const hide = showGlobalLoader('Syncing Grid Data...');
              await fetchBatch();
              hide();
            }}
          >
             <RefreshCw size={14} className="mr-2" /> Retry Fetch
          </Button>
        </div>
      </PageWrapper>
    );
  }

  if (!batch) return null;

  return (
    <PageWrapper 
      title="Clearance Overview" 
      subtitle={`${batch.batch?.className} · Cycle ${batch.batch?.academicYear}`}
      backTitle="Return to History"
      backFallback={`${basePath}/batches`}
    >

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
            Batch Status: {batch.batch?.status?.toUpperCase()}
          </Badge>
          {batch.batch?.status === 'active' && (
            <Button variant="danger" size="sm" className="h-9" onClick={handleCloseBatch}><X size={14} /> Close Cycle</Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground font-semibold mb-4 -mt-2">
        Showing <span className="text-navy font-black tabular-nums">{filtered.length}</span> of{' '}
        <span className="text-navy font-black tabular-nums">{batch.students?.length ?? 0}</span> students
        {filter !== 'all' ? (
          <span className="text-muted-foreground/80">
            {' '}
            · filter: <span className="uppercase tracking-wider font-black text-[10px]">{filter.replace('_', ' ')}</span>
          </span>
        ) : null}
        . Select a cell for faculty decision details.
      </p>

      {/* Matrix */}
      <div className="overflow-x-auto rounded-xl border border-muted shadow-sm bg-white">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-offwhite/40 border-b border-muted/60">
              <th className="text-left px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground sticky left-0 bg-offwhite z-10 min-w-[220px]">Student Details</th>
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
                  <Link to={`${basePath}/batch/${batchId}/students/${row._id}`} className="flex items-center justify-between group/link">
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
                      <button
                        type="button"
                        onClick={() => setPopover({ ...data, faculty: fac.name, student: row.name, subject: fac.subjectName || fac.type, action })}
                        className={`
                          min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 rounded-full inline-flex items-center justify-center text-xs font-black border transition-all
                          hover:scale-110 shadow-sm mx-auto touch-manipulation
                          ${config.cls}
                        `}
                        title={action.replace('_', ' ')}
                        aria-label={`${fac.name}: ${action.replace('_', ' ')}`}
                      >
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

      <Modal
        isOpen={!!popover}
        onClose={() => setPopover(null)}
        title="Status Details"
        size="sm"
      >
        {popover && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-offwhite rounded-xl flex items-center justify-center shrink-0">
                <Info size={20} className="text-navy" />
              </div>
              <p className="text-xs text-muted-foreground font-semibold leading-snug">
                {popover.student ? (
                  <>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 block mb-0.5">Candidate</span>
                    {popover.student}
                  </>
                ) : null}
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1 leading-none">Assigned Faculty</p>
                <p className="text-sm font-bold text-navy">{popover.subject} · {popover.faculty}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1 leading-none">Approval Status</p>
                <Badge status={popover.action} />
              </div>
              {popover.action === STATUSES.DUE_MARKED && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-100">
                  <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle size={10} strokeWidth={3} /> Decisive: {popover.dueType || 'Overage'}
                  </p>
                  <p className="text-xs text-red-800 font-medium italic leading-relaxed">
                    {`"${popover.remarks || 'No specific remarks provided.'}"`}
                  </p>
                </div>
              )}
            </div>
            <Button variant="secondary" className="w-full" onClick={() => setPopover(null)}>
              Close
            </Button>
          </>
        )}
      </Modal>
    </PageWrapper>
  );
};

export default BatchView;
