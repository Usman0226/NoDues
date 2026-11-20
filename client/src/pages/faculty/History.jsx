import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { useUI } from '../../hooks/useUI';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';
import { getApprovalHistory } from '../../api/approvals';
import { getMyBatches } from '../../api/faculty';
import {
  History,
  Filter,
  Calendar,
  Layers,
  RefreshCw,
  AlertTriangle,
  Eye,
  UserCheck,
  FileText,
  Clock,
  ExternalLink,
  Download,
  Lock,
  CheckCircle2
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const getApprovalLabel = (item) => {
  if (item.approvalType === 'classTeacher') return 'Class Teacher';
  if (item.approvalType === 'mentor') return 'Mentor';
  if (item.approvalType === 'coCurricular') return item.itemTypeName || 'Co-Curricular';
  return item.subjectName || '—';
};

const getColumns = (user, setReviewModal) => [
  {
    key: 'studentRollNo',
    label: 'Roll No',
    sortable: true,
    render: (v) => (
      <span className="font-mono text-xs sm:text-sm font-black text-navy px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200/60">
        {v || '—'}
      </span>
    ),
  },
  {
    key: 'studentName',
    label: 'Student Name',
    sortable: true,
    render: (v) => <span className="font-bold text-zinc-900">{v || '—'}</span>,
  },
  {
    key: 'subjectName',
    label: 'Subject / Type',
    render: (_, row) => (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-zinc-700">{getApprovalLabel(row)}</span>
        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
          {row.roleTag || row.approvalType}
        </span>
        {user?.userId !== row.facultyId && row.facultyName && (
           <span className="text-[9px] font-bold text-zinc-400 whitespace-nowrap">
             By: {row.facultyName}
           </span>
        )}
      </div>
    ),
  },
  {
    key: 'className',
    label: 'Batch & Term',
    render: (v, row) => (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-bold text-zinc-800">{v || '—'}</span>
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
          {row.semester && <span>Sem {row.semester}</span>}
          {row.academicYear && <span>· {row.academicYear}</span>}
          {row.isBatchClosed ? (
            <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
              <Lock size={8} /> Closed
            </span>
          ) : (
            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
              Active
            </span>
          )}
        </div>
      </div>
    ),
  },
  {
    key: 'action',
    label: 'Action Taken',
    render: (v, row) => (
      <div className="flex flex-col gap-1">
        <Badge status={v} />
        {v === 'due_marked' && (
          <span className="text-[9px] font-black uppercase tracking-widest text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200/80 w-fit">
            {row.dueType || 'Due'}
          </span>
        )}
        {row.remarks && (
          <span className="text-[10px] text-zinc-500 italic truncate max-w-[140px]" title={row.remarks}>
            "{row.remarks}"
          </span>
        )}
      </div>
    ),
  },
  {
    key: 'actionedAt',
    label: 'Timestamp',
    render: (v) => (
      <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] font-medium whitespace-nowrap">
        <Calendar size={12} className="text-zinc-400" />
        {v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
      </div>
    ),
  },
  {
    key: 'actions',
    label: '',
    render: (_, row) => {
      if (row.approvalType === 'coCurricular') {
        return (
          <div className="flex items-center justify-end">
            <button
              onClick={(e) => { e.stopPropagation(); setReviewModal(row); }}
              className="p-1.5 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-all shadow-sm"
              title="Review Submission"
            >
              <Eye size={14} />
            </button>
          </div>
        );
      }
      return null;
    }
  }
];

const HISTORY_CTX_KEY = 'history_nav_ctx';

const FacultyHistory = () => {
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [semesterFilter, setSemesterFilter] = useState('all');
  const [academicYearFilter, setAcademicYearFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [reviewModal, setReviewModal] = useState(null);

  // Resolve facultyId: prefer live navigation state, fall back to sessionStorage on refresh
  const storedFacultyId = (() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(HISTORY_CTX_KEY) || 'null');
      return saved?.facultyId ?? null;
    } catch { return null; }
  })();
  const facultyId = location.state?.facultyId ?? storedFacultyId;

  const { showGlobalLoader } = useUI();
  const { user } = useAuth();
  const { data: response, loading, error, request: fetchHistory } = useApi(getApprovalHistory);
  const { data: batchesRes } = useApi(getMyBatches, { immediate: true });

  const batches = useMemo(() => batchesRes?.data || [], [batchesRes?.data]);

  const academicYearOptions = useMemo(() => {
    const years = [...new Set(batches.map(b => b.academicYear).filter(Boolean))];
    return [
      { id: 'all', name: 'All Academic Years' },
      ...years.map(y => ({ id: y, name: y }))
    ];
  }, [batches]);

  const activeBatches = useMemo(() => batches.filter(b => b.status === 'active'), [batches]);

  const batchOptions = useMemo(() => {
    return [
      { id: 'all', name: 'All Batches / Classes' },
      ...activeBatches.map(b => ({
        id: b._id,
        name: `${b.name}${b.semester ? ` (Sem ${b.semester})` : ''}`
      }))
    ];
  }, [activeBatches]);

  // Sync navigation context with sessionStorage
  useEffect(() => {
    if (location.state?.facultyId) {
      sessionStorage.setItem(HISTORY_CTX_KEY, JSON.stringify({ facultyId: location.state.facultyId }));
    } else if (!location.state) {
      sessionStorage.removeItem(HISTORY_CTX_KEY);
    }
  }, [location.key, location.state]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchValue);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchValue]);

  useEffect(() => {
    fetchHistory({
      semester: semesterFilter !== 'all' ? semesterFilter : undefined,
      academicYear: academicYearFilter !== 'all' ? academicYearFilter : undefined,
      batchId: batchFilter !== 'all' ? batchFilter : undefined,
      action: actionFilter !== 'all' ? actionFilter : undefined,
      page,
      limit,
      search: debouncedSearch,
      facultyId: facultyId || undefined
    });
  }, [fetchHistory, semesterFilter, academicYearFilter, batchFilter, actionFilter, page, limit, debouncedSearch, facultyId]);

  const rows = useMemo(() => response?.data || [], [response?.data]);
  const total = response?.pagination?.total || 0;

  const handleExportCSV = () => {
    if (!rows.length) {
      toast.error('No clearance records available to export');
      return;
    }
    const headers = [
      'Roll No',
      'Student Name',
      'Class / Batch',
      'Semester',
      'Academic Year',
      'Batch Status',
      'Requirement',
      'Role Tag',
      'Action Taken',
      'Deficiency Category',
      'Remarks',
      'Actioned Timestamp'
    ];
    const csvLines = [headers.join(',')];
    rows.forEach(r => {
      const line = [
        `"${r.studentRollNo || ''}"`,
        `"${(r.studentName || '').replace(/"/g, '""')}"`,
        `"${(r.className || '').replace(/"/g, '""')}"`,
        `"${r.semester || ''}"`,
        `"${r.academicYear || ''}"`,
        `"${r.batchStatus || ''}"`,
        `"${(getApprovalLabel(r) || '').replace(/"/g, '""')}"`,
        `"${r.roleTag || ''}"`,
        `"${r.action || ''}"`,
        `"${r.dueType || ''}"`,
        `"${(r.remarks || '').replace(/"/g, '""')}"`,
        `"${r.actionedAt ? new Date(r.actionedAt).toLocaleString('en-IN') : ''}"`
      ];
      csvLines.push(line.join(','));
    });
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Clearance_Action_History_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Clearance history exported successfully');
  };

  if (error) {
    return (
      <PageWrapper title="Action History" subtitle="Unable to load">
        <div className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm">
          <AlertTriangle className="mx-auto text-status-due mb-4" size={48} />
          <h2 className="text-xl font-black text-navy mb-2">Couldn't load history</h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto text-sm">{error}</p>
          <Button variant="primary" onClick={() => fetchHistory()}>
            <RefreshCw size={14} className="mr-2" /> Try again
          </Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper 
      title="Action History" 
      subtitle="Record of student approvals and dues you have processed"
      headerActions={
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 text-xs font-bold text-navy"
            disabled={!rows.length}
          >
            <Download size={13} /> Export CSV
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={async () => {
              const hide = showGlobalLoader('Refreshing history...');
              await fetchHistory({
                semester: semesterFilter !== 'all' ? semesterFilter : undefined,
                academicYear: academicYearFilter !== 'all' ? academicYearFilter : undefined,
                batchId: batchFilter !== 'all' ? batchFilter : undefined,
                action: actionFilter !== 'all' ? actionFilter : undefined,
                page,
                limit,
                search: debouncedSearch
              });
              hide();
            }} 
            disabled={loading}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      }
    >
      {/* Multi-Dimensional Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-3 rounded-2xl border border-zinc-200/70 shadow-xs">
        {/* Academic Year Filter */}
        <div className="flex-1 sm:flex-initial min-w-[160px]">
          <SearchableSelect 
            options={academicYearOptions}
            value={academicYearFilter}
            onChange={(val) => { setAcademicYearFilter(val || 'all'); setPage(1); }}
            placeholder="Academic Year"
            labelKey="name"
            idKey="id"
            size="sm"
            clearable={academicYearFilter !== 'all'}
          />
        </div>

        {/* Batch / Class Filter */}
        <div className="flex-1 sm:flex-initial min-w-[200px]">
          <SearchableSelect 
            options={batchOptions}
            value={batchFilter}
            onChange={(val) => { setBatchFilter(val || 'all'); setPage(1); }}
            placeholder="Filter Batch"
            labelKey="name"
            idKey="id"
            size="sm"
            clearable={batchFilter !== 'all'}
          />
        </div>

        {/* Semester Filter */}
        <div className="flex-1 sm:flex-initial min-w-[140px]">
          <SearchableSelect 
            options={[
              { id: 'all', name: 'All Semesters' },
              ...[8, 7, 6, 5, 4, 3, 2, 1].map((s) => ({ id: s.toString(), name: `Semester ${s}` }))
            ]}
            value={semesterFilter}
            onChange={(val) => { setSemesterFilter(val || 'all'); setPage(1); }}
            placeholder="Semester"
            labelKey="name"
            idKey="id"
            size="sm"
            clearable={semesterFilter !== 'all'}
          />
        </div>

        {/* Action Type Filter */}
        <div className="flex-1 sm:flex-initial min-w-[140px]">
          <SearchableSelect 
            options={[
              { id: 'all', name: 'All Actions' },
              { id: 'approved', name: 'Approved Only' },
              { id: 'due_marked', name: 'Dues Flagged Only' }
            ]}
            value={actionFilter}
            onChange={(val) => { setActionFilter(val || 'all'); setPage(1); }}
            placeholder="Action Type"
            labelKey="name"
            idKey="id"
            size="sm"
            clearable={actionFilter !== 'all'}
          />
        </div>

        {/* Total Count Pill */}
        <div className="h-9 flex items-center gap-1.5 px-3 rounded-xl bg-zinc-50 border border-zinc-200/60 text-xs font-bold text-zinc-600 ml-auto shrink-0">
          <Layers size={13} className="text-zinc-400" />
          <span>{total} records</span>
        </div>
      </div>

      {/* Main Table */}
      <Table
        columns={getColumns(user, setReviewModal)}
        data={rows}
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
        searchPlaceholder="Search by student roll number or name..."
      />

      {/* Empty State */}
      {!loading && rows.length === 0 && !error && (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-zinc-200 mt-4">
          <History size={40} className="text-zinc-300 mx-auto mb-3" />
          <h4 className="text-base font-bold text-navy mb-1">No Historical Records Found</h4>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            No clearance actions match your current filter selection. Try selecting a different semester, academic year, or clearing the search.
          </p>
          {(semesterFilter !== 'all' || academicYearFilter !== 'all' || batchFilter !== 'all' || actionFilter !== 'all' || searchValue) && (
            <button
              className="mt-4 px-4 py-2 rounded-xl bg-zinc-100 text-[10px] uppercase tracking-wider font-black text-navy hover:bg-zinc-200 transition-all"
              onClick={() => {
                setSemesterFilter('all');
                setAcademicYearFilter('all');
                setBatchFilter('all');
                setActionFilter('all');
                setSearchValue('');
              }}
            >
              Clear All Filters
            </button>
          )}
        </div>
      )}

      {/* Review Modal for Co-Curricular */}
      <Modal
        isOpen={!!reviewModal}
        onClose={() => setReviewModal(null)}
        title="Approval Record Details"
        size="md"
      >
        {reviewModal && (
          <div className="space-y-6">
             <div className="flex items-start gap-4 p-4 rounded-2xl bg-zinc-50 border border-zinc-100">
                <div className="h-12 w-12 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-zinc-400 shrink-0">
                   <UserCheck size={24} />
                </div>
                <div className="min-w-0">
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-1">Student</p>
                   <h3 className="text-lg font-black text-navy leading-none mb-1">{reviewModal.studentName}</h3>
                   <p className="text-xs font-bold text-zinc-500 font-mono tracking-tighter">{reviewModal.studentRollNo} · {reviewModal.className}</p>
                </div>
             </div>

             <div className="space-y-4">
                <div className="flex items-center gap-2">
                   <FileText size={16} className="text-indigo-600" />
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-navy">Approval Details</h4>
                </div>
                
                <div className="p-4 rounded-xl bg-white border border-zinc-100 shadow-xs space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-zinc-100">
                    <span className="text-zinc-400">Action:</span>
                    <span className="font-bold uppercase text-navy">{reviewModal.action}</span>
                  </div>
                  {reviewModal.dueType && (
                    <div className="flex justify-between py-1 border-b border-zinc-100">
                      <span className="text-zinc-400">Deficiency Category:</span>
                      <span className="font-bold text-red-600 uppercase">{reviewModal.dueType}</span>
                    </div>
                  )}
                  {reviewModal.remarks && (
                    <div className="flex justify-between py-1 border-b border-zinc-100">
                      <span className="text-zinc-400">Remarks:</span>
                      <span className="font-medium text-zinc-800">{reviewModal.remarks}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1">
                    <span className="text-zinc-400">Actioned Date:</span>
                    <span className="font-medium text-zinc-800">
                      {reviewModal.actionedAt ? new Date(reviewModal.actionedAt).toLocaleString('en-IN') : '—'}
                    </span>
                  </div>
                </div>
             </div>

             <div className="flex items-center gap-3 pt-4 border-t border-zinc-100">
                <Button 
                   variant="ghost" 
                   className="flex-1" 
                   onClick={() => setReviewModal(null)}
                >
                   Close
                </Button>
             </div>
          </div>
        )}
      </Modal>
    </PageWrapper>
  );
};

export default FacultyHistory;
