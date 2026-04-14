import React, { useState, useEffect } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { useUI } from '../../hooks/useUI';
import { useApi } from '../../hooks/useApi';
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
} from 'lucide-react';

const PAGE_SIZE = 20;

const getApprovalLabel = (item) => {
  if (item.approvalType === 'classTeacher') return 'Class Teacher';
  if (item.approvalType === 'mentor') return 'Mentor';
  return item.subjectName || '—';
};

const COLUMNS = [
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
      <span className="text-xs text-muted-foreground">{getApprovalLabel(row)}</span>
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
];

const FacultyHistory = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [semesterFilter, setSemesterFilter] = useState('all');
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const { showGlobalLoader } = useUI();
  const { data: response, loading, error, request: fetchHistory } = useApi(getApprovalHistory);

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
      search: debouncedSearch
    });
  }, [fetchHistory, semesterFilter, page, limit, debouncedSearch]);

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
        columns={COLUMNS}
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

    </PageWrapper>
  );
};

export default FacultyHistory;
