import React from 'react';
import { Link } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import { Building2, Users, GraduationCap, BookOpen, Layers, ArrowRight } from 'lucide-react';

const MOCK_DEPTS = [
  { id: 'd1', name: 'CSE', hod: 'Dr. Ramesh Kumar', classes: 4, faculty: 15, students: 240, activeBatches: 2 },
  { id: 'd2', name: 'ECE', hod: 'Dr. S. Krishnan', classes: 3, faculty: 12, students: 180, activeBatches: 1 },
];

const Departments = () => (
  <PageWrapper title="Departments" subtitle="Department overview and class management">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {MOCK_DEPTS.map((dept) => (
        <Link key={dept.id} to={`/admin/departments/${dept.id}/classes`}
          className="bg-white rounded-2xl border border-muted shadow-sm p-6 hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-navy/5 flex items-center justify-center group-hover:bg-navy/10 transition-colors">
                <Building2 size={24} className="text-navy" />
              </div>
              <div>
                <h3 className="text-xl font-serif text-navy">{dept.name}</h3>
                <p className="text-xs text-muted-foreground">HoD: {dept.hod}</p>
              </div>
            </div>
            <ArrowRight size={20} className="text-muted-foreground group-hover:text-gold transition-colors mt-1" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-2.5 rounded-lg bg-offwhite text-center">
              <BookOpen size={14} className="text-navy mx-auto mb-1" />
              <p className="text-lg font-bold text-navy">{dept.classes}</p>
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">Classes</p>
            </div>
            <div className="p-2.5 rounded-lg bg-offwhite text-center">
              <Users size={14} className="text-navy mx-auto mb-1" />
              <p className="text-lg font-bold text-navy">{dept.faculty}</p>
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">Faculty</p>
            </div>
            <div className="p-2.5 rounded-lg bg-offwhite text-center">
              <GraduationCap size={14} className="text-navy mx-auto mb-1" />
              <p className="text-lg font-bold text-navy">{dept.students}</p>
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">Students</p>
            </div>
            <div className="p-2.5 rounded-lg bg-offwhite text-center">
              <Layers size={14} className={`mx-auto mb-1 ${dept.activeBatches > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
              <p className="text-lg font-bold text-navy">{dept.activeBatches}</p>
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">Active Batches</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  </PageWrapper>
);

export default Departments;
