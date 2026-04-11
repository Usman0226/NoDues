import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import { Eye, Filter } from 'lucide-react';

const MOCK_BATCHES = [
  { id: 'b1', className: 'CSE-A Sem 5', department: 'CSE', semester: 5, year: '2025-26', status: 'pending', initiated: '2026-04-28', cleared: 48, pending: 10, dues: 2, total: 60 },
  { id: 'b2', className: 'CSE-B Sem 5', department: 'CSE', semester: 5, year: '2025-26', status: 'pending', initiated: '2026-04-28', cleared: 35, pending: 20, dues: 5, total: 60 },
  { id: 'b3', className: 'ECE-A Sem 7', department: 'ECE', semester: 7, year: '2025-26', status: 'cleared', initiated: '2026-04-25', cleared: 55, pending: 3, dues: 0, total: 58 },
  { id: 'b4', className: 'CSE-A Sem 4', department: 'CSE', semester: 4, year: '2024-25', status: 'cleared', initiated: '2025-11-10', cleared: 58, pending: 0, dues: 2, total: 60 },
];

const COLUMNS = [
  { key: 'className', label: 'Class' },
  { key: 'department', label: 'Dept' },
  { key: 'semester', label: 'Sem' },
  { key: 'year', label: 'Year' },
  { key: 'initiated', label: 'Initiated' },
  { key: 'cleared', label: 'Cleared', render: (v) => <span className="text-emerald-600 font-semibold">{v}</span> },
  { key: 'pending', label: 'Pending', render: (v) => <span className="text-amber-600 font-semibold">{v}</span> },
  { key: 'dues', label: 'Dues', render: (v) => <span className={`font-semibold ${v > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{v}</span> },
  { key: 'status', label: 'Status', render: (v) => <Badge status={v === 'pending' ? 'pending' : 'cleared'} /> },
  {
    key: 'id', label: 'Action', sortable: false, render: (v) => (
      <Link to={`/admin/batch/${v}`} className="inline-flex items-center gap-1 text-xs text-navy hover:text-gold font-semibold transition-colors">
        <Eye size={14} /> View
      </Link>
    )
  },
];

const Batches = () => {
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = statusFilter === 'all' ? MOCK_BATCHES : MOCK_BATCHES.filter((b) => {
    if (statusFilter === 'active') return b.status === 'pending';
    return b.status === 'cleared';
  });

  return (
    <PageWrapper title="Batches" subtitle="All no-due batches across departments">
      <div className="flex items-center gap-3 mb-6">
        <Filter size={14} className="text-muted-foreground" />
        <div className="flex gap-1 bg-offwhite rounded-xl p-1">
          {['all', 'active', 'closed'].map((f) => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
                ${statusFilter === f ? 'bg-white text-navy shadow-sm' : 'text-muted-foreground hover:text-navy'}`}>
              {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Closed'}
            </button>
          ))}
        </div>
      </div>

      <Table columns={COLUMNS} data={filtered} searchable searchPlaceholder="Search by class name..." />
    </PageWrapper>
  );
};

export default Batches;
