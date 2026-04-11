import React from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Upload, Plus } from 'lucide-react';

const MOCK = [
  { rollNo: '21CSE001', name: 'Arun Kumar', department: 'CSE', class: 'CSE-A Sem 5', mentor: 'Dr. Meena', status: 'cleared' },
  { rollNo: '21CSE002', name: 'Priya Sharma', department: 'CSE', class: 'CSE-A Sem 5', mentor: 'Dr. Meena', status: 'pending' },
  { rollNo: '21CSE003', name: 'Rahul Verma', department: 'CSE', class: 'CSE-A Sem 5', mentor: 'Dr. Gupta', status: 'has_dues' },
  { rollNo: '21CSE004', name: 'Deepa Nair', department: 'CSE', class: 'CSE-A Sem 5', mentor: 'Dr. Gupta', status: 'pending' },
  { rollNo: '21CSE005', name: 'Sneha R.', department: 'CSE', class: 'CSE-A Sem 5', mentor: 'Dr. Meena', status: 'hod_override' },
  { rollNo: '21ECE001', name: 'Kiran Raj', department: 'ECE', class: 'ECE-A Sem 7', mentor: 'Dr. Krishnan', status: 'cleared' },
];

const COLUMNS = [
  { key: 'rollNo', label: 'Roll No' },
  { key: 'name', label: 'Name' },
  { key: 'department', label: 'Dept' },
  { key: 'class', label: 'Class' },
  { key: 'mentor', label: 'Mentor' },
  { key: 'status', label: 'Status', render: (v) => <Badge status={v} /> },
];

const StudentList = () => (
  <PageWrapper title="Students" subtitle="All students across departments">
    <div className="flex flex-wrap gap-2 mb-6">
      <Button variant="primary" size="sm"><Plus size={14} /> Add Student</Button>
      <Button variant="ghost" size="sm"><Upload size={14} /> Import Students</Button>
    </div>
    <Table columns={COLUMNS} data={MOCK} searchable searchPlaceholder="Search by roll no, name, or class..." />
  </PageWrapper>
);

export default StudentList;
