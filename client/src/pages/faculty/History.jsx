import React, { useState, useEffect } from 'react';
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
import {
  History,
  Filter,
  Calendar,
  Layers,
  RefreshCw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  UserCheck,
  FileText,
  Clock,
  ExternalLink,
} from 'lucide-react';

const PAGE_SIZE = 20;

const getApprovalLabel = (item) => {
  if (item.roleTag === 'ao') return 'AO Approval';
  if (item.approvalType === 'hodApproval' || item.approvalType === 'office' || item.roleTag === 'hod') return 'HoD Approval';
  if (item.approvalType === 'classTeacher') return 'Class Teacher';
  if (item.approvalType === 'mentor') return 'Mentor';
  return item.subjectName || '—';
};

const getColumns = (user, setReviewModal) => [
  {
    key: 'studentRollNo',
    label: 'Roll No',
    render: (v) => <span className="font-mono text-xs font-black text-navy">{v || '—'}</span>,
  },
  {
    key: 'studentName',
    label: 'Student Name',
    render: (v) => <span className="font-bold">{v || '—'}</span>,
  },
  {
    key: 'subjectName',
    label: 'Subject / Type',
    render: (_, row) => (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{getApprovalLabel(row)}</span>
        {user?.userId !== row.facultyId && row.facultyName && (
           <span className="text-[9px] font-bold text-zinc-400 whitespace-nowrap">
             Assigned to: {row.facultyName}
           </span>
        )}
      </div>
    ),
  },
  {
    key: 'className',
    label: 'Batch',
    render: (v, row) => (
      <span className="text-xs text-muted-foreground">
        {v || '—'}{row.semester ? ` · S${row.semester}` : ''}{row.academicYear ? ` (${row.academicYear})` : ''}
      </span>
    ),
  },
  {
    key: 'action',
    label: 'Action Taken',
    render: (v, row) => (
      <div className="flex flex-col gap-1">
        <Badge status={v} />
        {v === 'due_marked' && row.dueType && (
          <span className="text-[9px] font-black uppercase tracking-widest text-red-500">
            {row.dueType}
          </span>
        )}
      </div>
    ),
  },
  {
    key: 'actionedAt',
    label: 'Timestamp',
    render: (v) => (
      <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
        <Calendar size={12} />
        {v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
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
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [reviewModal, setReviewModal] = useState(null);

  // Resolve facultyId: prefer live navigation state, fall back to sessionStorage on refresh
  const [facultyId, setFacultyId] = useState(() => {
    if (location.state?.facultyId != null) return location.state.facultyId;
    try {
      const saved = JSON.parse(sessionStorage.getItem(HISTORY_CTX_KEY) || 'null');
      return saved?.facultyId ?? null;
    } catch { return null; }
  });

  const { showGlobalLoader } = useUI();
  const { user } = useAuth();
  const { data: response, loading, error, request: fetchHistory } = useApi(getApprovalHistory);

  // Persist / clear context on navigation
  useEffect(() => {
    if (location.state?.facultyId) {
      sessionStorage.setItem(HISTORY_CTX_KEY, JSON.stringify({ facultyId: location.state.facultyId }));
      setFacultyId(location.state.facultyId);
    } else if (!location.state) {
      sessionStorage.removeItem(HISTORY_CTX_KEY);
    }
  }, [location.key]);

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
      page,
      limit,
      search: debouncedSearch,
      facultyId: facultyId || undefined
    });
  }, [fetchHistory, semesterFilter, page, limit, debouncedSearch, facultyId]);

  const rows = React.useMemo(() => response?.data || [], [response?.data]);
  const total = response?.pagination?.total || 0;

  const handleSemesterChange = (val) => {
    setSemesterFilter(val);
    setPage(1);
  };

  if (error) {
    return (
      <PageWrapper title="Action History" subtitle="Archive of all past clearance approvals and dues">
        <div className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm">
          <AlertTriangle className="mx-auto text-status-due mb-4" size={48} />
          <h2 className="text-xl font-black text-navy mb-2">Sync Error</h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto text-sm">{error}</p>
          <Button variant="primary" onClick={() => fetchHistory()}>
            <RefreshCw size={14} className="mr-2" /> Retry
          </Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Action History" subtitle="Your archive of all past clearance approvals and dues">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-muted shadow-sm">
          <Filter size={14} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground shrink-0">Semester</span>
          <SearchableSelect 
            options={[
              { value: 'all', label: 'All Semesters', subLabel: 'Entire History' },
              ...[8, 7, 6, 5, 4, 3, 2, 1].map((s) => ({
                value: s,
                label: `Semester ${s}`,
                subLabel: 'Academic Term'
              }))
            ]}
            value={semesterFilter}
            onChange={(val) => handleSemesterChange(val)}
            placeholder="Select Sem"
            className="w-[180px]"
          />
        </div>

        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-muted shadow-sm">
          <Layers size={14} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground shrink-0">
            {total != null ? `${total} total records` : 'Loading…'}
          </span>
        </div>

        <Button 
          variant="ghost" 
          size="sm" 
          onClick={async () => {
             const hide = showGlobalLoader('Refreshing History Archive...');
             await fetchHistory({ semester: semesterFilter !== 'all' ? semesterFilter : undefined, page, limit, search: debouncedSearch });
             hide();
          }} 
          disabled={loading} 
          className="ml-auto"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </Button>
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
        searchPlaceholder="Search by student or roll no..."
      />

      {/* Empty state when no records at all */}
      {!loading && rows.length === 0 && !error && (
        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-muted mt-4">
          <History size={40} className="text-muted-foreground mx-auto mb-3 opacity-20" />
          <p className="text-muted-foreground text-sm font-medium">No past actions recorded.</p>
          {semesterFilter !== 'all' && (
            <button
              className="mt-2 text-[10px] uppercase tracking-widest font-black text-navy/40 hover:text-navy"
              onClick={() => handleSemesterChange('all')}
            >
              Clear semester filter
            </button>
          )}
        </div>
      )}

      {/* Review Modal */}
      <Modal
        isOpen={!!reviewModal}
        onClose={() => setReviewModal(null)}
        title="Review Clearance Submission"
        size="md"
      >
        {reviewModal && (
          <div className="space-y-6">
             <div className="flex items-start gap-4 p-4 rounded-2xl bg-zinc-50 border border-zinc-100">
                <div className="h-12 w-12 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-zinc-400 shrink-0">
                   <UserCheck size={24} />
                </div>
                <div className="min-w-0">
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-1">Student Candidate</p>
                   <h3 className="text-lg font-black text-navy leading-none mb-1">{reviewModal.studentName}</h3>
                   <p className="text-xs font-bold text-zinc-500 font-mono tracking-tighter">{reviewModal.studentRollNo} · {reviewModal.className}</p>
                </div>
             </div>

             <div className="space-y-4">
                <div className="flex items-center gap-2">
                   <FileText size={16} className="text-indigo-600" />
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-navy">Submission Details</h4>
                </div>
                
                <div className="grid grid-cols-1 gap-3">
                   {!reviewModal.submission ? (
                      <div className="p-8 text-center bg-offwhite rounded-2xl border border-dashed border-muted/50">
                         <Clock className="mx-auto text-muted-foreground/30 mb-2" size={32} />
                         <p className="text-sm font-bold text-muted-foreground">No documentation submitted yet.</p>
                      </div>
                   ) : (
                      Object.entries(reviewModal.submission.data || {}).map(([key, value]) => (
                        <div key={key} className="p-4 rounded-xl bg-white border border-zinc-100 shadow-sm">
                           <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400 mb-1">{key.replace(/_/g, ' ')}</p>
                           <p className="text-sm font-bold text-navy break-all">
                              {value?.toString().match(/^https?:\/\//) ? (
                                <a href={value} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-1">
                                   View Document <ExternalLink size={12} />
                                </a>
                              ) : value || '—'}
                           </p>
                        </div>
                      ))
                   )}
                </div>
             </div>

             <div className="flex items-center gap-3 pt-6 border-t border-zinc-100">
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
