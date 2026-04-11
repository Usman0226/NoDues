import React, { useState } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Plus, BookOpen, Filter } from 'lucide-react';

const MOCK_SUBJECTS = [
  { id: 1, code: 'CS301', name: 'Data Structures', semester: 5, isElective: false },
  { id: 2, code: 'CS302', name: 'DBMS', semester: 5, isElective: false },
  { id: 3, code: 'CS303', name: 'Computer Networks', semester: 5, isElective: false },
  { id: 4, code: 'CS304', name: 'Operating Systems', semester: 5, isElective: false },
  { id: 5, code: 'CS305', name: 'Web Technologies', semester: 5, isElective: false },
  { id: 6, code: 'CS601', name: 'Machine Learning', semester: 6, isElective: true },
  { id: 7, code: 'CS602', name: 'Data Science', semester: 6, isElective: true },
  { id: 8, code: 'CS603', name: 'Cloud Computing', semester: 6, isElective: true },
  { id: 9, code: 'MA301', name: 'Engineering Mathematics', semester: 3, isElective: false },
  { id: 10, code: 'EC401', name: 'Digital Electronics', semester: 4, isElective: false },
];

const COLUMNS = [
  { key: 'code', label: 'Code' },
  { key: 'name', label: 'Subject Name' },
  { key: 'semester', label: 'Semester' },
  {
    key: 'isElective', label: 'Type', render: (v) => (
      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${v ? 'bg-amber-50 text-amber-700' : 'bg-navy/5 text-navy'}`}>
        {v ? 'Elective' : 'Core'}
      </span>
    )
  },
];

const Subjects = () => {
  const [showCreate, setShowCreate] = useState(false);
  const [semester, setSemester] = useState('all');

  const filtered = semester === 'all' ? MOCK_SUBJECTS : MOCK_SUBJECTS.filter((s) => s.semester === Number(semester));

  return (
    <PageWrapper title="Subjects" subtitle="Global subject catalog — shared across all departments">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> Create Subject</Button>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground" />
          <select value={semester} onChange={(e) => setSemester(e.target.value)}
            className="px-3 py-2 rounded-xl border border-muted bg-white text-sm focus:outline-none focus:ring-2 focus:ring-navy/10">
            <option value="all">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>Semester {s}</option>)}
          </select>
        </div>
      </div>

      <Table columns={COLUMNS} data={filtered} searchable searchPlaceholder="Search by code or name..." />

      {showCreate && (
        <Modal title="Create Subject" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Subject Code</label>
              <input type="text" className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10" placeholder="e.g. CS501" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Subject Name</label>
              <input type="text" className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10" placeholder="e.g. Database Management Systems" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Semester</label>
                <select className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Type</label>
                <select className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10">
                  <option value="false">Core</option>
                  <option value="true">Elective</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button variant="primary"><Plus size={14} /> Create</Button>
            </div>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
};

export default Subjects;
