import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { getBatches, bulkCloseBatches } from '../../api/batch';
import { Eye, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { toast } from 'react-hot-toast';
import Button from '../../components/ui/Button';

const Batches = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
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

  const { data: response, loading, error, request: fetchBatches } = useApi(getBatches);
  const batches = response?.data || [];
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
        <button onClick={() => navigate(`${basePath}/batch/${v}`)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] bg-navy text-white hover:bg-navy/90 font-black uppercase tracking-widest transition-all shadow-sm shadow-navy/10">
          <Eye size={12} strokeWidth={3} /> Analyze
        </button>
      )
    },
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
          data={batches}
          loading={loading && !response}
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
