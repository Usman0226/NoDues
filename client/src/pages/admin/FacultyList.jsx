import React, { useState } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Plus, Upload, Mail } from 'lucide-react';

const MOCK_FACULTY = [
  { id: 1, employeeId: 'EMP001', name: 'Dr. Anand Sharma', email: 'sharma@mits.ac.in', department: 'CSE', roleTags: ['faculty'], phone: '9876543210' },
  { id: 2, employeeId: 'EMP002', name: 'Dr. Priya Verma', email: 'verma@mits.ac.in', department: 'CSE', roleTags: ['faculty', 'classTeacher'], phone: '9876543211' },
  { id: 3, employeeId: 'EMP003', name: 'Dr. Rajesh Patel', email: 'patel@mits.ac.in', department: 'CSE', roleTags: ['faculty', 'classTeacher', 'mentor'], phone: '9876543212' },
  { id: 4, employeeId: 'EMP004', name: 'Dr. Sunita Gupta', email: 'gupta@mits.ac.in', department: 'CSE', roleTags: ['faculty', 'mentor'], phone: '9876543213' },
  { id: 5, employeeId: 'EMP005', name: 'Dr. Ramesh Kumar', email: 'kumar@mits.ac.in', department: 'CSE', roleTags: ['faculty', 'hod'], phone: '9876543214' },
  { id: 6, employeeId: 'EMP006', name: 'Dr. Meena R.', email: 'meena@mits.ac.in', department: 'CSE', roleTags: ['faculty', 'mentor'], phone: '9876543215' },
  { id: 7, employeeId: 'EMP010', name: 'Dr. S. Krishnan', email: 'krishnan@mits.ac.in', department: 'ECE', roleTags: ['faculty', 'hod'], phone: '9876543220' },
];

const ROLE_TAG_COLORS = {
  faculty: 'bg-navy/5 text-navy',
  classTeacher: 'bg-amber-50 text-amber-700',
  mentor: 'bg-emerald-50 text-emerald-700',
  hod: 'bg-blue-50 text-blue-700',
};

const COLUMNS = [
  { key: 'employeeId', label: 'Employee ID' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'department', label: 'Dept' },
  {
    key: 'roleTags', label: 'Role Tags', sortable: false, render: (tags) => (
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${ROLE_TAG_COLORS[tag] || ROLE_TAG_COLORS.faculty}`}>
            {tag === 'classTeacher' ? 'Class Teacher' : tag === 'hod' ? 'HoD' : tag}
          </span>
        ))}
      </div>
    )
  },
];

const FacultyList = () => {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <PageWrapper title="Faculty" subtitle="Manage faculty accounts and role tags">
      <div className="flex flex-wrap gap-2 mb-6">
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> Add Faculty</Button>
        <Button variant="ghost" size="sm"><Upload size={14} /> Import Faculty</Button>
      </div>

      <Table columns={COLUMNS} data={MOCK_FACULTY} searchable searchPlaceholder="Search by name, employee ID, or email..." />

      {showCreate && (
        <Modal title="Add Faculty" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Name</label>
                <input type="text" className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10" placeholder="Dr. Full Name" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Employee ID</label>
                <input type="text" className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10" placeholder="EMP042" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Email</label>
                <input type="email" className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10" placeholder="faculty@mits.ac.in" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Phone</label>
                <input type="tel" className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10" placeholder="9876543210" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Department</label>
                <select className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10">
                  <option>CSE</option>
                  <option>ECE</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Role Tags</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {['faculty', 'classTeacher', 'mentor', 'hod'].map((tag) => (
                    <label key={tag} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="checkbox" defaultChecked={tag === 'faculty'} className="rounded" />
                      <span className="capitalize">{tag === 'classTeacher' ? 'Class Teacher' : tag === 'hod' ? 'HoD' : tag}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-start gap-2">
              <Mail size={14} className="shrink-0 mt-0.5" />
              <span>Credentials will be auto-generated and emailed to the faculty member on creation.</span>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button variant="primary"><Plus size={14} /> Create Faculty</Button>
            </div>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
};

export default FacultyList;
