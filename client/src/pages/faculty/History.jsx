import React, { useState, useMemo } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
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
  const [semesterFilter, setSemesterFilter] = useState('all');

  const { data: response, loading, error, request: refetch } = useApi(
    () => getApprovalHistory({
      semester: semesterFilter !== 'all' ? semesterFilter : undefined,
      page,
      limit: PAGE_SIZE,
    }),
    { immediate: false }
  );

  // Re-fetch whenever filter or page changes (including on mount via initial state)
  React.useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semesterFilter, page]);

  const rows       = response?.data        || [];
  const pagination = response?.pagination  || {};
  const totalPages = pagination.pages      || 1;

  // Derive unique semesters from loaded data for dynamic filter options
  const semesterOptions = useMemo(() => {
    const sems = [...new Set(rows.map((r) => r.semester).filter(Boolean))].sort((a, b) => b - a);
    return sems;
  }, [rows]);

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
          <Button variant="primary" onClick={() => refetch()}>
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
          <select
            className="text-xs font-semibold bg-transparent border-none focus:ring-0 cursor-pointer"
            value={semesterFilter}
            onChange={(e) => handleSemesterChange(e.target.value)}
          >
            <option value="all">All Semesters</option>
            {semesterOptions.map((s) => (
              <option key={s} value={s}>Semester {s}</option>
            ))}
            {/* Static fallback options so filter always works even before data loads */}
            {![...semesterOptions].includes(5) && <option value="5">Semester 5</option>}
            {![...semesterOptions].includes(4) && <option value="4">Semester 4</option>}
            {![...semesterOptions].includes(3) && <option value="3">Semester 3</option>}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-muted shadow-sm">
          <Layers size={14} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground shrink-0">
            {pagination.total != null ? `${pagination.total} total records` : 'Loading…'}
          </span>
        </div>

        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={loading} className="ml-auto">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {/* Main Table */}
      <Table
        columns={COLUMNS}
        data={rows}
        loading={loading}
        searchable
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-muted/30">
          <p className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </PageWrapper>
  );
};

export default FacultyHistory;
