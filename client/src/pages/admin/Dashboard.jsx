import React from 'react';
import { Link } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import { Building2, Users, GraduationCap, BookOpen, Layers, Clock, CheckCircle, AlertTriangle, Eye } from 'lucide-react';

const STATS = [
  { label: 'Active Batches', value: 3, icon: Layers, color: 'text-navy' },
  { label: 'Total Students', value: 1847, icon: GraduationCap, color: 'text-emerald-600' },
  { label: 'Cleared', value: 1203, icon: CheckCircle, color: 'text-emerald-500' },
  { label: 'Pending', value: 412, icon: Clock, color: 'text-amber-500' },
  { label: 'Has Dues', value: 187, icon: AlertTriangle, color: 'text-red-500' },
];

const ACTIVE_BATCHES = [
  { id: 'b1', className: 'CSE-A Sem 5', semester: 5, year: '2025-26', initiatedAt: '2026-04-28', cleared: 48, pending: 10, dues: 2, total: 60 },
  { id: 'b2', className: 'CSE-B Sem 5', semester: 5, year: '2025-26', initiatedAt: '2026-04-28', cleared: 35, pending: 20, dues: 5, total: 60 },
  { id: 'b3', className: 'ECE-A Sem 7', semester: 7, year: '2025-26', initiatedAt: '2026-04-25', cleared: 55, pending: 3, dues: 0, total: 58 },
];

const RECENT_ACTIVITY = [
  { time: '2 min ago', text: 'Dr. Sharma approved Arun Kumar for DBMS', type: 'approved' },
  { time: '5 min ago', text: 'Dr. Patel marked due for Priya Sharma — Lab (Networks)', type: 'due_marked' },
  { time: '12 min ago', text: 'Dr. Gupta approved Deepa Nair for OS', type: 'approved' },
  { time: '18 min ago', text: 'HoD Dr. Kumar overrode dues for Rahul Verma', type: 'hod_override' },
  { time: '25 min ago', text: 'Dr. Sharma approved Sneha R. for DBMS', type: 'approved' },
];

const BATCH_COLUMNS = [
  { key: 'className', label: 'Class' },
  { key: 'year', label: 'Year' },
  { key: 'initiatedAt', label: 'Initiated' },
  {
    key: 'cleared', label: 'Cleared', render: (v) => (
      <span className="text-emerald-600 font-semibold">{v}</span>
    )
  },
  {
    key: 'pending', label: 'Pending', render: (v) => (
      <span className="text-amber-600 font-semibold">{v}</span>
    )
  },
  {
    key: 'dues', label: 'Dues', render: (v) => (
      <span className={`font-semibold ${v > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{v}</span>
    )
  },
  {
    key: 'id', label: 'Action', sortable: false, render: (v) => (
      <Link to={`/admin/batch/${v}`} className="inline-flex items-center gap-1 text-xs text-navy hover:text-gold font-semibold transition-colors">
        <Eye size={14} /> View Grid
      </Link>
    )
  },
];

const ACTIVITY_DOT = {
  approved: 'bg-emerald-500',
  due_marked: 'bg-red-500',
  hod_override: 'bg-blue-500',
  pending: 'bg-amber-500',
};

const AdminDashboard = () => (
  <PageWrapper title="Dashboard" subtitle="Administrative overview of the NoDues platform">
    {/* Stats Row */}
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
      {STATS.map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.label} className="bg-white rounded-2xl border border-muted shadow-sm p-5 hover:shadow-md transition-shadow">
            <Icon size={22} className={`${stat.color} mb-3`} />
            <p className="text-2xl font-bold text-navy">{stat.value.toLocaleString()}</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mt-1">{stat.label}</p>
          </div>
        );
      })}
    </div>

    {/* Active Batches Table (PRD §6.4) */}
    <div className="mb-8">
      <h2 className="text-xl font-serif text-navy mb-4">Active Batches</h2>
      <Table columns={BATCH_COLUMNS} data={ACTIVE_BATCHES} />
    </div>

    {/* Recent Activity Feed (PRD §6.4) */}
    <div>
      <h2 className="text-xl font-serif text-navy mb-4">Recent Activity</h2>
      <div className="bg-white rounded-2xl border border-muted shadow-sm divide-y divide-muted">
        {RECENT_ACTIVITY.map((item, i) => (
          <div key={i} className="flex items-start gap-3 p-4">
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${ACTIVITY_DOT[item.type] || ACTIVITY_DOT.pending}`}></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-navy">{item.text}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{item.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </PageWrapper>
);

export default AdminDashboard;
