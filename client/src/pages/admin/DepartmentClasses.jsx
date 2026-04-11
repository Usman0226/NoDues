import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { ArrowLeft, Plus, BookOpen, Users, GraduationCap, Layers, ArrowRight, Copy } from 'lucide-react';

const MOCK_CLASSES = [
  { id: 'c1', name: 'CSE-A Sem 5', semester: 5, year: '2025-26', students: 60, subjects: 6, classTeacher: 'Dr. Patel', activeBatch: true },
  { id: 'c2', name: 'CSE-B Sem 5', semester: 5, year: '2025-26', students: 60, subjects: 6, classTeacher: 'Dr. Verma', activeBatch: true },
  { id: 'c3', name: 'CSE-A Sem 3', semester: 3, year: '2025-26', students: 65, subjects: 5, classTeacher: 'Dr. Kumar', activeBatch: false },
  { id: 'c4', name: 'CSE-A Sem 7', semester: 7, year: '2025-26', students: 55, subjects: 7, classTeacher: 'Dr. Gupta', activeBatch: false },
];

const grouped = MOCK_CLASSES.reduce((acc, cls) => {
  (acc[cls.semester] = acc[cls.semester] || []).push(cls);
  return acc;
}, {});

const DepartmentClasses = () => {
  const { deptId } = useParams();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <PageWrapper title="CSE Classes" subtitle="All classes in the CSE department">
      <Link to="/admin/departments" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-navy mb-4 -mt-4">
        <ArrowLeft size={14} /> Back to Departments
      </Link>

      <div className="mb-6">
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> Create Class</Button>
      </div>

      {Object.entries(grouped).sort(([a], [b]) => Number(b) - Number(a)).map(([sem, classes]) => (
        <div key={sem} className="mb-8">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">Semester {sem}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls) => (
              <Link key={cls.id} to={`/admin/class/${cls.id}`}
                className="bg-white rounded-2xl border border-muted shadow-sm p-5 hover:shadow-md transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="text-base font-semibold text-navy group-hover:text-gold transition-colors">{cls.name}</h4>
                    <p className="text-[10px] text-muted-foreground">{cls.year} · CT: {cls.classTeacher}</p>
                  </div>
                  {cls.activeBatch && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold uppercase tracking-wider">Active Batch</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-offwhite">
                    <GraduationCap size={12} className="mx-auto text-navy mb-0.5" />
                    <p className="text-sm font-bold text-navy">{cls.students}</p>
                    <p className="text-[8px] text-muted-foreground uppercase tracking-widest">Students</p>
                  </div>
                  <div className="p-2 rounded-lg bg-offwhite">
                    <BookOpen size={12} className="mx-auto text-navy mb-0.5" />
                    <p className="text-sm font-bold text-navy">{cls.subjects}</p>
                    <p className="text-[8px] text-muted-foreground uppercase tracking-widest">Subjects</p>
                  </div>
                  <div className="p-2 rounded-lg bg-offwhite flex items-center justify-center">
                    <ArrowRight size={16} className="text-muted-foreground group-hover:text-gold transition-colors" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {/* Create Class Modal (PRD §6.4) */}
      {showCreate && (
        <Modal title="Create Class" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Class Name</label>
              <input type="text" className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10" placeholder="e.g. CSE-C Sem 5" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Semester</label>
                <select className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Academic Year</label>
                <input type="text" className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10" placeholder="2025-26" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Copy subject structure from existing class? (optional)</label>
              <select className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10">
                <option value="">— None (start fresh) —</option>
                <option>CSE-A Sem 5</option>
                <option>CSE-B Sem 5</option>
                <option>CSE-A Sem 3</option>
              </select>
              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                <Copy size={10} /> Subjects will be copied with faculty fields cleared for reassignment
              </p>
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

export default DepartmentClasses;
