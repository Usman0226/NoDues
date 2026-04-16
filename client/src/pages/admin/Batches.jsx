import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';
import { getBatches, bulkCloseBatches } from '../../api/batch';
import { Eye, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { toast } from 'react-hot-toast';
import Button from '../../components/ui/Button';
import { useUI } from '../../hooks/useUI';

const Batches = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showGlobalLoader } = useUI();
  const basePath = user?.role === 'hod' ? '/hod' : '/admin';
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkClose, setShowBulkClose] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Pagination & Search State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const { data: response, loading, error, request: fetchBatches } = useApi(getBatches, {
    queryKey: ['batches', { 
      page, 
      limit, 
      search: debouncedSearch, 
      status: statusFilter,
      departmentId: user?.role === 'hod' ? user.departmentId : undefined
    }],
    immediate: false
  });
  const batches = useMemo(() => response?.data || [], [response?.data]);
  const total = response?.pagination?.total || 0;

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchValue);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchValue]);

  React.useEffect(() => {
    const params = { 
      page, 
      limit, 
      search: debouncedSearch,
      status: statusFilter === 'all' ? undefined : statusFilter
    };
    if (user?.role === 'hod') params.departmentId = user.departmentId;
    fetchBatches(params);
  }, [fetchBatches, user?.role, user?.departmentId, page, limit, debouncedSearch, statusFilter]);


  const batchStats = useMemo(() => {
    // Note: Stats now reflect current page/filter if server provides them, 
    // but for now we'll just show what's in the current batch list or total count if available.
    return { total: total, visible: batches.length };
  }, [total, batches]);

  const handleBulkCloseConfirm = async () => {
    setSubmitting(true);
    try {
      await bulkCloseBatches(selectedIds);
      toast.success(`${selectedIds.length} batches closed`);
      setShowBulkClose(false);
      setSelectedIds([]);
      fetchBatches();
    } catch (err) {
      toast.error(err?.message || 'Failed to close batches');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      label: 'Class',
      key: 'className',
      width: '24%',
      render: (v, row) => (
        <div className="flex flex-col">
          <span className="font-black text-navy truncate block">{v}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
             <span className="text-[9px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-black uppercase">SEM {row.semester}</span>
             <span className="text-[10px] text-zinc-400 font-medium italic">{row.academicYear}</span>
          </div>
        </div>
      )
    },
    {
      label: 'Department',
      key: 'departmentId',
      width: '14%',
      render: (v) => <span className="text-zinc-500 font-bold truncate block">{v?.name || '—'}</span>
    },
    {
      label: 'Completion',
      key: 'clearedCount',
      width: '16%',
      render: (v, row) => {
        const cleared = Number(v) || 0;
        const total = Number(row.totalStudents) || 0;
        const remaining = Math.max(0, total - cleared);
        return (
          <div className="flex flex-col">
             <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest leading-tight">{cleared} Cleared</span>
             <span className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-tighter">{remaining} Remaining</span>
          </div>
        );
      }
    },
    {
      label: 'Started By',
      key: 'initiatedBy',
      width: '15%',
      render: (v, row) => (
        <div className="flex flex-col">
          <span className="text-navy font-bold truncate block">{v?.name || 'System'}</span>
          <span className="text-[9px] text-zinc-400 font-black uppercase tracking-widest">
            {new Date(row.initiatedAt).toLocaleDateString()}
          </span>
        </div>
      )
    },
    {
      label: 'Status',
      key: 'status',
      width: '12%',
      align: 'center',
      render: (v) => (
        <span className={`
          px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest
          ${v === 'active' ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100' : 'bg-zinc-100 text-zinc-500'}
        `}>
          {v}
        </span>
      )
    },
    {
      label: 'Action',
      key: 'actions',
      width: '15%',
      align: 'right',
      render: (_, row) => (
        <button 
          onClick={(e) => { e.stopPropagation(); navigate(`${basePath}/batch/${row._id}`); }} 
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] bg-navy text-white hover:bg-navy/90 font-black uppercase tracking-widest transition-all shadow-sm shadow-navy/10"
        >
          <Eye size={12} strokeWidth={3} /> View Detail
        </button>
      )
    }
  ];

  return (
    <PageWrapper title="Batches" subtitle="All academic clearance batches across departments">
      <div className="flex flex-wrap items-center gap-3 mb-6 text-[10px] font-black uppercase tracking-widest text-navy">
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-muted shadow-sm">
          {total} total records
        </span>
        <span className="text-[11px] font-semibold normal-case tracking-normal text-muted-foreground">
          Table shows {batchStats.visible} row{batchStats.visible === 1 ? '' : 's'} with the current filter.
        </span>
      </div>

      <div className="flex items-center justify-between mb-8 px-1">
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-3 bg-white p-1 rounded-3xl border border-muted shadow-sm">
             {['all', 'active', 'closed'].map((f) => (
                <button key={f} onClick={() => { setStatusFilter(f); setPage(1); }}
                  className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all
                    ${statusFilter === f ? 'bg-navy text-white shadow-md' : 'text-muted-foreground hover:bg-offwhite'}`}>
                  {f}
                </button>
             ))}
           </div>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={async () => {
            const hide = showGlobalLoader('Refetching Batch Data...');
            await fetchBatches();
            hide();
          }} 
          className="text-muted-foreground"
        >
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
          data={batches}
          loading={loading}
          pagination={{
            total,
            page,
            limit,
            onPageChange: (p) => setPage(p),
            onLimitChange: (l) => { setLimit(l); setPage(1); }
          }}
          searchable
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          searchPlaceholder="Search by class name..."
          selectable
          selection={selectedIds}
          onSelectionChange={setSelectedIds}
          fixedLayout={true}
          bulkActions={[
            { 
              label: 'Close Selected', 
              icon: CheckCircle, 
              onClick: () => setShowBulkClose(true) 
            }
          ]}
        />
      )}

      <ConfirmModal
        isOpen={showBulkClose}
        onClose={() => setShowBulkClose(false)}
        onConfirm={handleBulkCloseConfirm}
        title="Close Multiple Batches"
        description={`Are you sure you want to close ${selectedIds.length} academic clearance batches? This will finalize all approvals and notify students.`}
        confirmText="Close All"
        isDestructive={false}
        loading={submitting}
      />
    </PageWrapper>
  );
};

export default Batches;
