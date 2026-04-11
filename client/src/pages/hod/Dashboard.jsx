import React from 'react';
import { Link } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import { Layers, GraduationCap, CheckCircle, Clock, AlertTriangle, ArrowRight, Eye } from 'lucide-react';

const STATS = [
  { label: 'Active Batches', value: 2, icon: Layers, color: 'text-navy' },
  { label: 'Total Students', value: 120, icon: GraduationCap, color: 'text-emerald-600' },
  { label: 'Cleared', value: 83, icon: CheckCircle, color: 'text-emerald-500' },
  { label: 'Pending', value: 30, icon: Clock, color: 'text-amber-500' },
  { label: 'Has Dues', value: 7, icon: AlertTriangle, color: 'text-red-500' },
];

const BATCH_CARDS = [
  { id: 'b1', className: 'CSE-A Sem 5', cleared: 48, pending: 10, dues: 2, total: 60 },
  { id: 'b2', className: 'CSE-B Sem 5', cleared: 35, pending: 20, dues: 5, total: 60 },
];

const HodDashboard = () => {
  const { user } = useAuth();

  return (
    <PageWrapper title="Department Overview" subtitle={`${user?.department || 'CSE'} Department — No-Due Status`}>
      {/* Alert Banner (PRD §6.6) */}
      <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3">
        <AlertTriangle size={20} className="text-red-500 shrink-0" />
        <div>
          <p className="text-sm font-bold text-red-700">7 students have blocked clearances requiring override</p>
          <Link to="/hod/dues" className="text-xs text-red-600 hover:text-red-800 inline-flex items-center gap-1 mt-0.5 font-semibold">
            Review Dues <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {STATS.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl border border-muted shadow-sm p-5">
              <Icon size={22} className={`${stat.color} mb-3`} />
              <p className="text-2xl font-bold text-navy">{stat.value.toLocaleString()}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Batch Summary Cards (PRD §6.6) */}
      <h2 className="text-xl font-serif text-navy mb-4">Active Batch Summary</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {BATCH_CARDS.map((b) => (
          <div key={b.id} className="bg-white rounded-2xl border border-muted shadow-sm p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-navy">{b.className}</h3>
              <Link to={`/admin/batch/${b.id}`} className="inline-flex items-center gap-1 text-xs text-navy hover:text-gold font-semibold">
                <Eye size={14} /> View Grid
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-2 rounded-lg bg-emerald-50">
                <p className="text-lg font-bold text-emerald-600">{b.cleared}</p>
                <p className="text-[9px] uppercase tracking-widest text-emerald-600/70 font-semibold">Cleared</p>
              </div>
              <div className="p-2 rounded-lg bg-amber-50">
                <p className="text-lg font-bold text-amber-600">{b.pending}</p>
                <p className="text-[9px] uppercase tracking-widest text-amber-600/70 font-semibold">Pending</p>
              </div>
              <div className="p-2 rounded-lg bg-red-50">
                <p className="text-lg font-bold text-red-600">{b.dues}</p>
                <p className="text-[9px] uppercase tracking-widest text-red-600/70 font-semibold">Dues</p>
              </div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(b.cleared / b.total) * 100}%` }}></div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{Math.round((b.cleared / b.total) * 100)}% of {b.total} students cleared</p>
          </div>
        ))}
      </div>
    </PageWrapper>
  );
};

export default HodDashboard;
