import React from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import { ClipboardCheck, Clock, CheckCircle } from 'lucide-react';

const FacultyDashboard = () => (
  <PageWrapper title="Faculty Dashboard" subtitle="Your approval workload at a glance">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[
        { label: 'Pending Approvals', value: 18, icon: Clock, color: 'text-status-pending', bg: 'bg-status-pending/10' },
        { label: 'Approved Today', value: 7, icon: CheckCircle, color: 'text-status-approved', bg: 'bg-status-approved/10' },
        { label: 'Total Assigned', value: 65, icon: ClipboardCheck, color: 'text-navy', bg: 'bg-navy/5' },
      ].map((s) => {
        const Icon = s.icon;
        return (
          <div key={s.label} className={`${s.bg} rounded-2xl p-6 border border-transparent`}>
            <Icon size={22} className={`${s.color} mb-3`} />
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">{s.label}</p>
          </div>
        );
      })}
    </div>
  </PageWrapper>
);

export default FacultyDashboard;
