import React, { useState } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Shield, AlertTriangle, User, BookOpen } from 'lucide-react';

const MOCK_DUES = [
  { id: 1, rollNo: '21CSE003', name: 'Rahul Verma', className: 'CSE-A Sem 5', facultyName: 'Dr. Patel', subject: 'Networks', dueType: 'lab', remarks: 'Lab record not submitted', status: 'has_dues' },
  { id: 2, rollNo: '21CSE014', name: 'Kavya S.', className: 'CSE-A Sem 5', facultyName: 'Dr. Sharma', subject: 'DBMS', dueType: 'fees', remarks: 'Lab fee pending', status: 'has_dues' },
  { id: 3, rollNo: '21CSE022', name: 'Nitin M.', className: 'CSE-B Sem 5', facultyName: 'Dr. Meena', subject: null, dueType: 'attendance', remarks: 'Below 75% in 3 weeks', status: 'has_dues' },
];

const MOCK_OVERRIDDEN = [
  { id: 10, rollNo: '21CSE005', name: 'Sneha R.', className: 'CSE-A Sem 5', facultyName: 'Dr. Rao', subject: 'ML', dueType: 'library', remarks: 'Book not returned', status: 'hod_override', overrideRemark: 'Verified — book was returned day of deadline' },
];

const Dues = () => {
  const [tab, setTab] = useState('active');
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [overrideRemark, setOverrideRemark] = useState('');

  const data = tab === 'active' ? MOCK_DUES : MOCK_OVERRIDDEN;

  const COLUMNS = [
    { key: 'rollNo', label: 'Roll No' },
    { key: 'name', label: 'Name' },
    { key: 'className', label: 'Class' },
    { key: 'facultyName', label: 'Faculty' },
    { key: 'subject', label: 'Subject', render: (v, row) => v || (row.approvalType === 'mentor' ? 'Mentor' : 'Class Teacher') },
    { key: 'dueType', label: 'Due Type', render: (v) => (
      <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-semibold uppercase">{v}</span>
    )},
    { key: 'remarks', label: 'Remarks', render: (v) => <span className="text-xs text-muted-foreground max-w-[200px] truncate block">{v}</span> },
    ...(tab === 'active' ? [{
      key: 'id', label: 'Action', sortable: false, render: (_, row) => (
        <Button variant="primary" size="sm" onClick={() => { setOverrideTarget(row); setOverrideRemark(''); }}>
          <Shield size={14} /> Override
        </Button>
      )
    }] : [{
      key: 'overrideRemark', label: 'Override Remark', render: (v) => (
        <span className="text-xs text-blue-600 italic">"{v}"</span>
      )
    }]),
  ];

  const handleOverride = () => {
    if (!overrideRemark.trim()) return;
    setOverrideTarget(null);
    // API call placeholder
  };

  return (
    <PageWrapper title="Dues Management" subtitle="Students with blocked clearances in your department">
      {/* Tabs: Active Dues | Overridden (PRD §6.6) */}
      <div className="flex gap-1 mb-6 bg-offwhite rounded-xl p-1 w-fit">
        <button onClick={() => setTab('active')}
          className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all
            ${tab === 'active' ? 'bg-white text-navy shadow-sm' : 'text-muted-foreground hover:text-navy'}`}>
          Active Dues <span className="text-muted-foreground">({MOCK_DUES.length})</span>
        </button>
        <button onClick={() => setTab('overridden')}
          className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all
            ${tab === 'overridden' ? 'bg-white text-navy shadow-sm' : 'text-muted-foreground hover:text-navy'}`}>
          Overridden <span className="text-muted-foreground">({MOCK_OVERRIDDEN.length})</span>
        </button>
      </div>

      <Table columns={COLUMNS} data={data} searchable searchPlaceholder="Search by roll no or name..." />

      {/* Override Modal (PRD §6.6) */}
      {overrideTarget && (
        <Modal isOpen={!!overrideTarget} title="Override & Clear" onClose={() => setOverrideTarget(null)}>
          <div className="space-y-4">
            {/* Context Display */}
            <div className="p-4 rounded-xl bg-offwhite border border-muted">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-0.5">Student</span><span className="font-semibold text-navy">{overrideTarget.rollNo} · {overrideTarget.name}</span></div>
                <div><span className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-0.5">Class</span><span className="font-semibold text-navy">{overrideTarget.className}</span></div>
                <div><span className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-0.5">Flagged By</span><span className="font-semibold text-navy">{overrideTarget.facultyName}</span></div>
                <div><span className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-0.5">Subject</span><span className="font-semibold text-navy">{overrideTarget.subject || 'N/A'}</span></div>
              </div>
              <div className="mt-3 pt-3 border-t border-muted">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={14} className="text-red-500" />
                  <span className="text-xs font-bold uppercase text-red-600">Due: {overrideTarget.dueType}</span>
                </div>
                <p className="text-sm text-red-700">"{overrideTarget.remarks}"</p>
              </div>
            </div>

            {/* Override Remark Input (required — PRD §6.6) */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">
                Override Remark <span className="text-red-500">*</span>
              </label>
              <textarea value={overrideRemark} onChange={(e) => setOverrideRemark(e.target.value)} rows={3}
                className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10 resize-none"
                placeholder="Reason for overriding this due (required)..." />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOverrideTarget(null)}>Cancel</Button>
              <Button variant="primary" onClick={handleOverride} disabled={!overrideRemark.trim()}>
                <Shield size={14} /> Confirm Override
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
};

export default Dues;
