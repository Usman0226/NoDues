import React, { useState } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import { 
  Shield, 
  Search, 
  Filter, 
  Clock, 
  CheckCircle,
  FileText
} from 'lucide-react';

const MOCK_OVERRIDES = [
  { 
    id: 1, 
    rollNo: '21CSE005', 
    name: 'Sneha R.', 
    class: 'CSE-A Sem 5', 
    facultyWhoFlagged: 'Dr. Rao', 
    subject: 'Machine Learning', 
    dueType: 'library', 
    remarks: 'Book not returned', 
    overriddenAt: '2026-05-12T10:00:00Z',
    overrideRemark: 'Verified — book was actually returned day of deadline'
  },
  { 
    id: 2, 
    rollNo: '21CSE018', 
    name: 'Arjun Das', 
    class: 'CSE-B Sem 5', 
    facultyWhoFlagged: 'Dr. Verma', 
    subject: 'DBMS', 
    dueType: 'fees', 
    remarks: 'Lab fee pending', 
    overriddenAt: '2026-05-11T14:30:00Z',
    overrideRemark: 'Special permission from Principal'
  },
];

const COLUMNS = [
  { key: 'rollNo', label: 'Roll No', render: (v) => <span className="font-mono text-xs font-semibold">{v}</span> },
  { key: 'name', label: 'Student Name' },
  { key: 'class', label: 'Class' },
  { key: 'subject', label: 'Subject' },
  { 
    key: 'dueType', 
    label: 'Original Due', 
    render: (v) => <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-bold uppercase">{v}</span> 
  },
  {
    key: 'overrideRemark',
    label: 'Override Log',
    render: (v, row) => (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-blue-600 italic truncate max-w-[200px]">"{v}"</span>
        <span className="text-[9px] text-muted-foreground flex items-center gap-1">
          <Clock size={8} /> {new Date(row.overriddenAt).toLocaleDateString()}
        </span>
      </div>
    )
  },
  {
    key: 'status',
    label: 'Result',
    render: () => <Badge status="hod_override" />
  }
];

const Overrides = () => {
  const [search, setSearch] = useState('');

  return (
    <PageWrapper title="Override History" subtitle="Audit log of all department-level manual clearances">
      {/* Header Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mb-8 flex items-center gap-5">
        <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
          <Shield size={24} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-blue-900 font-bold mb-0.5">Management Summary</h2>
          <p className="text-blue-700 text-xs">Total of <span className="font-bold underline">{MOCK_OVERRIDES.length}</span> manual overrides applied this semester.</p>
        </div>
      </div>

      {/* Actions / Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search by student or roll no..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-muted rounded-xl focus:outline-none focus:ring-2 focus:ring-navy/10 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2">
           <Button variant="ghost" size="sm" className="text-xs">
             <FileText size={14} /> Export Audit CSV
           </Button>
        </div>
      </div>

      {/* Main Table — Roll No FIRST (PRD §6.9) */}
      <Table 
        columns={COLUMNS} 
        data={MOCK_OVERRIDES}
        searchable={false} // Managed externally for custom styling
      />

      {MOCK_OVERRIDES.length === 0 && (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-muted">
           <CheckCircle size={40} className="text-muted-foreground mx-auto mb-3 opacity-20" />
           <p className="text-muted-foreground text-sm font-medium">No overrides found in the system log.</p>
        </div>
      )}
    </PageWrapper>
  );
};

export default Overrides;
