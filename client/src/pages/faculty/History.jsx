import React, { useState } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import { 
  History, 
  Search, 
  Filter, 
  Calendar,
  Layers
} from 'lucide-react';

const MOCK_HISTORY = [
  { id: 1, rollNo: '21CSE001', name: 'Arun Kumar', subject: 'Data Structures', batch: 'CSE-A Sem 5 (2025-26)', action: 'approved', date: '2026-04-10T14:32:00Z', semester: 5, year: '2025-26' },
  { id: 2, rollNo: '21CSE007', name: 'Sneha R.', subject: 'Data Structures', batch: 'CSE-A Sem 5 (2025-26)', action: 'due_marked', date: '2026-04-09T11:15:00Z', semester: 5, year: '2025-26' },
  { id: 3, rollNo: '21CSE042', name: 'Amit Singh', subject: 'DBMS', batch: 'CSE-B Sem 5 (2025-26)', action: 'approved', date: '2026-04-08T10:00:00Z', semester: 5, year: '2025-26' },
  { id: 4, rollNo: '20CSE099', name: 'Rahul Dev', subject: 'Data Structures', batch: 'CSE-A Sem 4 (2024-25)', action: 'approved', date: '2025-11-12T16:45:00Z', semester: 4, year: '2024-25' },
];

const COLUMNS = [
  { key: 'rollNo', label: 'Roll No', render: (v) => <span className="font-mono text-xs font-semibold">{v}</span> },
  { key: 'name', label: 'Student Name' },
  { key: 'subject', label: 'Subject' },
  { key: 'batch', label: 'Batch Period' },
  { 
    key: 'action', 
    label: 'Action Taken', 
    render: (v) => <Badge status={v} /> 
  },
  { 
    key: 'date', 
    label: 'Timestamp', 
    render: (v) => (
      <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
        <Calendar size={12} />
        {new Date(v).toLocaleDateString()}
      </div>
    ) 
  },
];

const FacultyHistory = () => {
  const [semesterFilter, setSemesterFilter] = useState('all');

  return (
    <PageWrapper title="Action History" subtitle="Your archive of all past clearance approvals and dues">
      {/* Filter Bar (PRD §6.5) */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-muted shadow-sm">
           <Filter size={14} className="text-muted-foreground" />
           <span className="text-xs font-medium text-muted-foreground shrink-0">Semester</span>
           <select 
             className="text-xs font-semibold bg-transparent border-none focus:ring-0 cursor-pointer"
             value={semesterFilter}
             onChange={(e) => setSemesterFilter(e.target.value)}
           >
             <option value="all">All Semesters</option>
             <option value="5">Semester 5</option>
             <option value="4">Semester 4</option>
           </select>
        </div>

        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-muted shadow-sm">
           <Layers size={14} className="text-muted-foreground" />
           <span className="text-xs font-medium text-muted-foreground shrink-0">Batch</span>
           <select className="text-xs font-semibold bg-transparent border-none focus:ring-0 cursor-pointer">
             <option value="all">All Batches</option>
             <option value="2025-26">2025-26</option>
             <option value="2024-25">2024-25</option>
           </select>
        </div>
      </div>

      {/* Main Table — Roll No FIRST (PRD §6.9) */}
      <Table 
        columns={COLUMNS} 
        data={semesterFilter === 'all' 
          ? MOCK_HISTORY 
          : MOCK_HISTORY.filter(h => h.semester === Number(semesterFilter))
        } 
        searchable 
        searchPlaceholder="Search by student or roll no..."
      />

      {MOCK_HISTORY.length === 0 && (
        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-muted">
           <History size={40} className="text-muted-foreground mx-auto mb-3 opacity-20" />
           <p className="text-muted-foreground text-sm font-medium">No past actions recorded.</p>
        </div>
      )}
    </PageWrapper>
  );
};

export default FacultyHistory;
