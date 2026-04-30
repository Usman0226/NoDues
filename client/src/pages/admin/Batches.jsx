import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';
import { getBatches, bulkCloseBatches, closeBatch } from '../../api/batch';
import { Eye, RefreshCw, AlertCircle, CheckCircle, Layers, Users, CheckCircle2, Clock, Calendar, XCircle } from 'lucide-react';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { toast } from 'react-hot-toast';
import Button from '../../components/ui/Button';
import { useUI } from '../../hooks/useUI';
import { Link } from 'react-router-dom';

const Batches = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showGlobalLoader } = useUI();
  const isStaff = user?.role === 'hod' || user?.role === 'ao';
  const basePath = isStaff ? '/hod' : '/admin';
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
      departmentId: isStaff ? user.departmentId : undefined
    }],
    immediate: false
  });
  
  const batches = useMemo(() => response?.data || [], [response?.data]);
  const summary = useMemo(() => response?.summary || { active: 0, closed: 0, totalStudents: 0 }, [response?.summary]);
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
    if (isStaff) params.departmentId = user.departmentId;
    fetchBatches(params);
  }, [fetchBatches, user?.role, user?.departmentId, page, limit, debouncedSearch, statusFilter]);


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

  const handleIndividualClose = async (id, name) => {
    if (!window.confirm(`Are you sure you want to CLOSE the clearance cycle for ${name}?`)) return;
    const hide = showGlobalLoader(`Closing ${name}...`);
    try {
      await closeBatch(id);
      toast.success(`${name} clearance cycle closed`);
      fetchBatches();
    } catch (err) {
      toast.error(err?.message || 'Failed to close batch');
    } finally {
      hide();
    }
  };

  const columns = [
    {
      label: 'Academic Group',
      key: 'className',
      width: '22%',
      render: (v, row) => (
        <div className="flex flex-col">
          <Link 
            to={`${basePath}/class/${row.classId}`}
            className="font-black text-navy truncate block text-sm hover:text-gold transition-colors w-fit"
          >
            {v}
          </Link>
          <div className="flex items-center gap-1.5 mt-1">
             <span className="text-[9px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-black uppercase ring-1 ring-zinc-200/50">SEM {row.semester}</span>
             <span className="text-[10px] text-zinc-400 font-bold italic tracking-tight">{row.academicYear}</span>
          </div>
        </div>
      )
    },
    {
      label: 'Department',
      key: 'departmentId',
      width: '14%',
      render: (v) => <span className="text-zinc-500 font-bold truncate block text-xs">{v?.name || '—'}</span>
    },
    {
      label: 'Clearance Progress',
      key: 'clearedCount',
      width: '20%',
      render: (v, row) => {
        const cleared = Number(v) || 0;
        const total = Number(row.totalStudents) || 0;
        const percentage = total > 0 ? Math.round((cleared / total) * 100) : 0;
        const remaining = Math.max(0, total - cleared);
        
        return (
          <div className="flex flex-col gap-2 pr-4">
            <div className="flex items-center justify-between">
               <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">{cleared} / {total} Cleared</span>
               <span className="text-[10px] font-black text-navy/40">{percentage}%</span>
            </div>
            <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden border border-zinc-200/30">
               <div 
                 className={`h-full transition-all duration-1000 ease-out ${percentage === 100 ? 'bg-emerald-500' : 'bg-gold'}`}
                 style={{ width: `${percentage}%` }}
               />
            </div>
            {remaining > 0 && row.status === 'active' && (
              <span className="text-[8px] font-bold text-muted-foreground/40 uppercase tracking-tighter">
                {remaining} student{remaining === 1 ? '' : 's'} still pending
              </span>
            )}
          </div>
        );
      }
    },
    {
      label: 'Schedule',
      key: 'deadline',
      width: '15%',
      render: (v, row) => {
        const deadline = v ? new Date(v) : null;
        const isPast = deadline && deadline < new Date();
        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-zinc-400">
               <Calendar size={10} />
               <span className="text-[9px] font-black uppercase tracking-widest">
                 {new Date(row.initiatedAt).toLocaleDateString()}
               </span>
            </div>
            {deadline ? (
              <div className={`flex items-center gap-1.5 font-bold text-[10px] ${isPast && row.status === 'active' ? 'text-status-due' : 'text-zinc-500'}`}>
                <Clock size={10} />
                <span>{deadline.toLocaleDateString()}</span>
                {isPast && row.status === 'active' && <span className="text-[8px] font-black uppercase bg-status-due/10 px-1 rounded">Overdue</span>}
              </div>
            ) : (
              <span className="text-[9px] text-zinc-300 italic font-medium">No deadline</span>
            )}
          </div>
        );
      }
    },
    {
      label: 'Status',
      key: 'status',
      width: '10%',
      align: 'center',
      render: (v) => (
        <span className={`
          px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.15em]
          ${v === 'active' ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100' : 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200'}
        `}>
          {v}
        </span>
      )
    },
    {
      label: 'Actions',
      key: 'actions',
      width: '19%',
      align: 'right',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-2">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={(e) => { e.stopPropagation(); navigate(`${basePath}/batch/${row._id}`); }} 
            className="text-navy border border-navy/10 hover:bg-navy hover:text-white group h-8"
          >
            <Eye size={12} className="mr-2 group-hover:scale-110 transition-transform" />
            <span className="text-[9px] font-black uppercase tracking-widest">View </span>
          </Button>
          
          {row.status === 'active' && (
            <button 
              onClick={(e) => { e.stopPropagation(); handleIndividualClose(row._id, row.className); }} 
              className="h-8 w-8 rounded-full bg-status-due/5 text-status-due hover:bg-status-due hover:text-white flex items-center justify-center transition-all border border-status-due/10 group relative"
              title="Close Batch"
            >
              <XCircle size={14} strokeWidth={2.5} />
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-status-due text-[8px] font-black uppercase text-white rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">Close</span>
            </button>
          )}
        </div>
      )
    }
  ];

  const stats = [
    { label: 'Active Cycles', value: summary.active, icon: Layers, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Closed History', value: summary.closed, icon: CheckCircle2, color: 'text-zinc-500', bg: 'bg-zinc-100' },
    { label: 'Student Impact', value: summary.totalStudents, icon: Users, color: 'text-navy', bg: 'bg-navy/5' },
    { label: 'Current List', value: total, icon: RefreshCw, color: 'text-gold', bg: 'bg-gold/5' },
  ];

  return (
    <PageWrapper title="Batches" subtitle="Academic clearance lifecycles across the institution">
      
      {/* Quick Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {stats.map((s, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 border border-muted shadow-sm flex items-center gap-4 group hover:border-navy/20 transition-all">
             <div className={`h-12 w-12 rounded-xl ${s.bg} ${s.color} flex items-center justify-center transition-transform group-hover:scale-110`}>
                <s.icon size={22} strokeWidth={2.5} />
             </div>
             <div>
                <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/60 mb-0.5">{s.label}</p>
                <p className="text-xl font-black text-navy leading-tight">{s.value}</p>
             </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 px-1">
        <div className="flex items-center gap-3 bg-white p-1 rounded-3xl border border-muted shadow-sm overflow-x-auto max-w-full no-scrollbar">
          {['all', 'active', 'closed'].map((f) => (
            <button key={f} onClick={() => { setStatusFilter(f); setPage(1); }}
              className={`px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap
                ${statusFilter === f ? 'bg-navy text-white shadow-md' : 'text-muted-foreground hover:bg-offwhite'}`}>
              {f}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={async () => {
              const hide = showGlobalLoader('Refreshing batches...');
              await fetchBatches();
              hide();
            }} 
            className="text-muted-foreground h-10 px-4 hover:bg-white border-transparent hover:border-muted rounded-2xl"
          >
            <RefreshCw size={14} className={`${loading ? 'animate-spin' : ''}`} />
            <span className="ml-2 text-[10px] font-black uppercase tracking-widest">Reload</span>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-muted shadow-sm">
           <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
           <h3 className="text-navy font-black text-lg mb-1">Data Fetch Failed</h3>
           <p className="text-muted-foreground font-medium text-sm">{error}</p>
           <Button variant="primary" className="mt-6" onClick={() => fetchBatches()}>Retry Connection</Button>
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
              icon: XCircle, 
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
        isDestructive={true}
        loading={submitting}
      />
    </PageWrapper>
  );
};

export default Batches;
