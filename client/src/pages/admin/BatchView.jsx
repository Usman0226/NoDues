import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import BatchSummaryChips from '../../components/batch/BatchSummaryChips';
import Button from '../../components/ui/Button';
import { STATUSES } from '../../utils/constants';
import { ArrowLeft, X, Filter, CheckCircle, Clock, AlertTriangle, XCircle } from 'lucide-react';

const BATCH_META = { className: 'CSE-A Sem 5', semester: 5, year: '2025-26', initiated: '2026-04-28', deadline: '2026-05-15', status: 'active' };

/* Faculty as columns (PRD §6.4 — columns = each unique faculty, cells = subject abbreviation + status icon) */
const FACULTY_COLS = [
  { id: 'f1', name: 'Dr. Sharma', subjects: ['DS', 'DBMS'] },
  { id: 'f2', name: 'Dr. Patel', subjects: ['Net'], role: 'classTeacher' },
  { id: 'f3', name: 'Dr. Gupta', subjects: ['OS'] },
  { id: 'f4', name: 'Dr. Meena', subjects: [], role: 'mentor' },
];

const MOCK_GRID = [
  { studentId: 's1', rollNo: '21CSE001', name: 'Arun Kumar', status: STATUSES.CLEARED,
    cells: { f1: [{ sub: 'DS', action: STATUSES.APPROVED }, { sub: 'DBMS', action: STATUSES.APPROVED }], f2: [{ sub: 'Net', action: STATUSES.APPROVED }, { sub: 'CT', action: STATUSES.APPROVED }], f3: [{ sub: 'OS', action: STATUSES.APPROVED }], f4: [{ sub: 'Mentor', action: STATUSES.APPROVED }] } },
  { studentId: 's2', rollNo: '21CSE002', name: 'Priya Sharma', status: STATUSES.PENDING,
    cells: { f1: [{ sub: 'DS', action: STATUSES.APPROVED }, { sub: 'DBMS', action: STATUSES.PENDING }], f2: [{ sub: 'Net', action: STATUSES.PENDING }, { sub: 'CT', action: STATUSES.PENDING }], f3: [{ sub: 'OS', action: STATUSES.APPROVED }], f4: [{ sub: 'Mentor', action: STATUSES.PENDING }] } },
  { studentId: 's3', rollNo: '21CSE003', name: 'Rahul Verma', status: STATUSES.HAS_DUES,
    cells: { f1: [{ sub: 'DS', action: STATUSES.APPROVED }, { sub: 'DBMS', action: STATUSES.APPROVED }], f2: [{ sub: 'Net', action: STATUSES.DUE_MARKED, dueType: 'lab', remarks: 'Lab record missing' }, { sub: 'CT', action: STATUSES.APPROVED }], f3: [{ sub: 'OS', action: STATUSES.APPROVED }], f4: [{ sub: 'Mentor', action: STATUSES.APPROVED }] } },
  { studentId: 's4', rollNo: '21CSE004', name: 'Deepa Nair', status: STATUSES.PENDING,
    cells: { f1: [{ sub: 'DS', action: STATUSES.PENDING }, { sub: 'DBMS', action: STATUSES.PENDING }], f2: [{ sub: 'Net', action: STATUSES.APPROVED }, { sub: 'CT', action: STATUSES.APPROVED }], f3: [{ sub: 'OS', action: STATUSES.PENDING }], f4: [{ sub: 'Mentor', action: STATUSES.APPROVED }] } },
  { studentId: 's5', rollNo: '21CSE005', name: 'Sneha R.', status: STATUSES.HOD_OVERRIDE,
    cells: { f1: [{ sub: 'DS', action: STATUSES.APPROVED }, { sub: 'DBMS', action: STATUSES.APPROVED }], f2: [{ sub: 'Net', action: STATUSES.APPROVED }, { sub: 'CT', action: STATUSES.APPROVED }], f3: [{ sub: 'OS', action: STATUSES.APPROVED }], f4: [{ sub: 'Mentor', action: STATUSES.APPROVED }] } },
];

const ICON_MAP = {
  [STATUSES.APPROVED]: { icon: '✅', cls: 'bg-emerald-50 text-emerald-700' },
  [STATUSES.PENDING]: { icon: '⏳', cls: 'bg-amber-50 text-amber-700' },
  [STATUSES.DUE_MARKED]: { icon: '❌', cls: 'bg-red-50 text-red-700' },
};

const SUMMARY = { 
  [STATUSES.CLEARED]: 1, 
  [STATUSES.PENDING]: 2, 
  [STATUSES.HAS_DUES]: 1, 
  [STATUSES.HOD_OVERRIDE]: 1 
};

const BatchView = () => {
  const { batchId } = useParams();
  const [filter, setFilter] = useState('all');
  const [popover, setPopover] = useState(null);

  const filtered = filter === 'all' ? MOCK_GRID :
    filter === 'has_dues' ? MOCK_GRID.filter((r) => r.status === 'has_dues') :
    filter === 'pending' ? MOCK_GRID.filter((r) => r.status === 'pending') :
    MOCK_GRID;

  return (
    <PageWrapper title="Batch Status Grid" subtitle={`${BATCH_META.className} · Semester ${BATCH_META.semester} · ${BATCH_META.year}`}>
      <Link to="/admin/batches" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-navy mb-4 -mt-4">
        <ArrowLeft size={14} /> Back to Batches
      </Link>

      {/* Batch Metadata */}
      <div className="bg-white rounded-2xl border border-muted p-5 mb-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-muted-foreground">Initiated: <strong className="text-navy">{BATCH_META.initiated}</strong></span>
          <span className="text-muted-foreground">Deadline: <strong className="text-navy">{BATCH_META.deadline}</strong></span>
          <Badge status={BATCH_META.status === 'active' ? 'pending' : 'cleared'}>{BATCH_META.status === 'active' ? 'Active' : 'Closed'}</Badge>
          <Button variant="danger" size="sm" className="ml-auto"><X size={14} /> Close Batch</Button>
        </div>
      </div>

      {/* Summary Chips */}
      <BatchSummaryChips cleared={SUMMARY.cleared} pending={SUMMARY.pending} dues={SUMMARY.has_dues} overrides={SUMMARY.hod_override} />

      {/* Filter */}
      <div className="flex items-center gap-2 mb-4 mt-6">
        <Filter size={14} className="text-muted-foreground" />
        {['all', 'has_dues', 'pending'].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
              ${filter === f ? 'bg-navy text-white' : 'bg-offwhite text-muted-foreground hover:text-navy'}`}>
            {f === 'all' ? 'All' : f === 'has_dues' ? 'Has Dues' : 'Pending'}
          </button>
        ))}
      </div>

      {/* Grid — faculty as columns (PRD §6.4) */}
      <div className="overflow-x-auto rounded-2xl border border-muted shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy text-white">
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-bold sticky left-0 bg-navy z-10 min-w-[180px]">Student</th>
              <th className="text-center px-3 py-3 text-[10px] uppercase tracking-widest font-bold min-w-[60px]">Status</th>
              {FACULTY_COLS.map((f) => (
                <th key={f.id} className="text-center px-3 py-3 text-[10px] uppercase tracking-widest font-bold min-w-[100px]">
                  <div>{f.name.replace('Dr. ', '')}</div>
                  {f.role && <div className="text-gold text-[8px] font-normal mt-0.5">{f.role === 'classTeacher' ? '+ CT' : '+ Mentor'}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-muted">
            {filtered.map((row) => (
              <tr key={row.studentId} className="hover:bg-offwhite/50 transition-colors">
                <td className="px-4 py-3 sticky left-0 bg-white z-10">
                  <Link to={`/admin/batch/${batchId}/students/${row.studentId}`} className="hover:text-gold transition-colors">
                    <span className="font-mono text-xs tracking-wider text-navy">{row.rollNo}</span>
                    <span className="text-muted-foreground mx-1.5">·</span>
                    <span className="text-navy font-medium">{row.name}</span>
                  </Link>
                </td>
                <td className="px-3 py-3 text-center"><Badge status={row.status} /></td>
                {FACULTY_COLS.map((fac) => {
                  const cells = row.cells[fac.id] || [];
                  return (
                    <td key={fac.id} className="px-3 py-3 text-center">
                      <div className="flex flex-wrap gap-1 justify-center">
                        {cells.map((cell, ci) => {
                          const style = ICON_MAP[cell.action] || ICON_MAP.pending;
                          return (
                            <button key={ci} onClick={() => setPopover({ ...cell, faculty: fac.name, student: row.name })}
                              className={`px-2 py-1 rounded-md text-[10px] font-semibold ${style.cls} hover:opacity-80 transition-opacity cursor-pointer`}
                              title={`${cell.sub}: ${cell.action}`}>
                              {style.icon} {cell.sub}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Popover Detail */}
      {popover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setPopover(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-muted p-5 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPopover(null)} className="absolute top-3 right-3 text-muted-foreground hover:text-navy"><X size={16} /></button>
            <h3 className="text-base font-semibold text-navy mb-3">Approval Detail</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Subject:</span> <strong className="text-navy">{popover.sub}</strong></p>
              <p><span className="text-muted-foreground">Faculty:</span> <strong className="text-navy">{popover.faculty}</strong></p>
              <p><span className="text-muted-foreground">Action:</span> <Badge status={popover.action} /></p>
              {popover.dueType && <p><span className="text-muted-foreground">Due Type:</span> <span className="text-red-600 font-semibold uppercase">{popover.dueType}</span></p>}
              {popover.remarks && <p><span className="text-muted-foreground">Remarks:</span> <span className="text-red-700">"{popover.remarks}"</span></p>}
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
};

export default BatchView;
