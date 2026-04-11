import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ImportStepper from '../../components/import/ImportStepper';
import { Plus, Upload, Users, BookOpen, Layers, CheckCircle, AlertTriangle, Copy, UserPlus, ArrowLeft, Play } from 'lucide-react';

const CLASS_META = { id: 'c1', name: 'CSE-A Sem 5', department: 'CSE', semester: 5, academicYear: '2025-26', classTeacher: 'Dr. Patel', studentCount: 60, subjectCount: 6 };

const MOCK_STUDENTS = [
  { rollNo: '21CSE001', name: 'Arun Kumar', email: 'arun@mits.ac.in', mentor: 'Dr. Meena', electives: 'Machine Learning', status: 'cleared' },
  { rollNo: '21CSE002', name: 'Priya Sharma', email: 'priya@mits.ac.in', mentor: 'Dr. Meena', electives: 'Data Science', status: 'pending' },
  { rollNo: '21CSE003', name: 'Rahul Verma', email: 'rahul@mits.ac.in', mentor: 'Dr. Gupta', electives: 'Cloud Computing', status: 'has_dues' },
  { rollNo: '21CSE004', name: 'Deepa Nair', email: 'deepa@mits.ac.in', mentor: 'Dr. Gupta', electives: '—', status: 'pending' },
  { rollNo: '21CSE005', name: 'Sneha R.', email: 'sneha@mits.ac.in', mentor: 'Dr. Meena', electives: 'Machine Learning', status: 'cleared' },
];

const MOCK_SUBJECTS = [
  { subjectCode: 'CS301', subjectName: 'Data Structures', faculty: 'Dr. Sharma', type: 'Core' },
  { subjectCode: 'CS302', subjectName: 'DBMS', faculty: 'Dr. Verma', type: 'Core' },
  { subjectCode: 'CS303', subjectName: 'Networks', faculty: 'Dr. Patel', type: 'Core' },
  { subjectCode: 'CS304', subjectName: 'Operating Systems', faculty: 'Dr. Gupta', type: 'Core' },
  { subjectCode: 'CS305', subjectName: 'Web Technologies', faculty: 'Dr. Kumar', type: 'Core' },
  { subjectCode: 'CS306', subjectName: 'Software Engineering', faculty: 'Dr. Reddy', type: 'Core' },
];

const MOCK_PAST_BATCHES = [
  { id: 'pb1', semester: 4, year: '2024-25', status: 'closed', initiated: '2025-11-10', cleared: 58, dues: 2, total: 60 },
];

const STUDENT_COLS = [
  { key: 'rollNo', label: 'Roll No' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'mentor', label: 'Mentor' },
  { key: 'electives', label: 'Electives' },
  { key: 'status', label: 'Status', render: (v) => <Badge status={v} /> },
];

const SUBJECT_COLS = [
  { key: 'subjectCode', label: 'Code' },
  { key: 'subjectName', label: 'Subject Name' },
  { key: 'faculty', label: 'Faculty' },
  { key: 'type', label: 'Type', render: (v) => (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${v === 'Core' ? 'bg-navy/5 text-navy' : 'bg-amber-50 text-amber-700'}`}>{v}</span>
  )},
];

const TABS = [
  { key: 'students', label: 'Students', icon: Users },
  { key: 'subjects', label: 'Subjects', icon: BookOpen },
  { key: 'batch', label: 'Batch', icon: Layers },
];

const ClassDetail = () => {
  const { classId } = useParams();
  const [tab, setTab] = useState('students');
  const [showImport, setShowImport] = useState(null);
  const [showInitiate, setShowInitiate] = useState(false);
  const [showAddSubject, setShowAddSubject] = useState(false);

  const hasActiveBatch = false;

  const preflight = [
    { label: 'Students enrolled', ok: MOCK_STUDENTS.length > 0, detail: `${MOCK_STUDENTS.length} students` },
    { label: 'Subjects assigned', ok: MOCK_SUBJECTS.length > 0, detail: `${MOCK_SUBJECTS.length} subjects` },
    { label: 'Class teacher set', ok: !!CLASS_META.classTeacher, detail: CLASS_META.classTeacher || 'Not set' },
    { label: 'All mentors assigned', ok: MOCK_STUDENTS.every((s) => s.mentor !== '—'), detail: `${MOCK_STUDENTS.filter((s) => s.mentor !== '—').length}/${MOCK_STUDENTS.length} assigned` },
  ];
  const canInitiate = preflight.every((p) => p.ok);

  return (
    <PageWrapper title={CLASS_META.name} subtitle={`${CLASS_META.department} · Semester ${CLASS_META.semester} · ${CLASS_META.academicYear}`}>
      <Link to="/admin/departments" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-navy mb-4 -mt-4">
        <ArrowLeft size={14} /> Back to Classes
      </Link>

      {/* Tab Switcher */}
      <div className="flex gap-1 mb-6 bg-offwhite rounded-xl p-1 w-fit">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
                ${tab === t.key ? 'bg-white text-navy shadow-sm' : 'text-muted-foreground hover:text-navy'}`}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: Students (PRD §6.4) */}
      {tab === 'students' && (
        <div>
          <div className="flex flex-wrap gap-2 mb-5">
            <Button variant="primary" size="sm" onClick={() => setShowImport('students')}><Upload size={14} /> Import Students</Button>
            <Button variant="ghost" size="sm"><UserPlus size={14} /> Add Single Student</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowImport('mentors')}><Upload size={14} /> Bulk Assign Mentors</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowImport('electives')}><Upload size={14} /> Bulk Assign Electives</Button>
          </div>
          <Table columns={STUDENT_COLS} data={MOCK_STUDENTS} searchable searchPlaceholder="Search by roll no or name..." />
        </div>
      )}

      {/* TAB 2: Subjects (PRD §6.4) */}
      {tab === 'subjects' && (
        <div>
          <div className="flex flex-wrap gap-2 mb-5">
            <Button variant="primary" size="sm" onClick={() => setShowAddSubject(true)}><Plus size={14} /> Add Subject Assignment</Button>
            <Button variant="ghost" size="sm"><Copy size={14} /> Clone from Another Class</Button>
          </div>
          <Table columns={SUBJECT_COLS} data={MOCK_SUBJECTS} />
        </div>
      )}

      {/* TAB 3: Batch (PRD §6.4) */}
      {tab === 'batch' && (
        <div>
          {hasActiveBatch ? (
            <div className="bg-white rounded-2xl border border-muted p-6 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-navy">Active Batch</h3>
                <Badge status="pending">In Progress</Badge>
              </div>
              <Link to="/admin/batch/b1" className="text-xs text-navy hover:text-gold font-semibold">View Full Grid →</Link>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-muted p-6 mb-6 text-center">
              <Layers size={32} className="text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">No active batch for this class</p>
              <Button variant="primary" onClick={() => setShowInitiate(true)}>
                <Play size={14} /> Initiate No-Due Batch
              </Button>
            </div>
          )}

          {/* Past Batches */}
          {MOCK_PAST_BATCHES.length > 0 && (
            <div>
              <h3 className="text-base font-serif text-navy mb-3">Past Batches</h3>
              <div className="space-y-2">
                {MOCK_PAST_BATCHES.map((b) => (
                  <div key={b.id} className="bg-white rounded-xl border border-muted p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-navy">Semester {b.semester} · {b.year}</p>
                      <p className="text-xs text-muted-foreground">Initiated {b.initiated} · {b.cleared}/{b.total} cleared · {b.dues} dues</p>
                    </div>
                    <Badge status="cleared">Closed</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Initiation Modal with Preflight Checklist (PRD §6.4) */}
      {showInitiate && (
        <Modal title="Initiate No-Due Batch" onClose={() => setShowInitiate(false)}>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-offwhite border border-muted">
              <p className="text-sm font-semibold text-navy mb-1">{CLASS_META.name}</p>
              <p className="text-xs text-muted-foreground">Semester {CLASS_META.semester} · {CLASS_META.academicYear}</p>
            </div>

            <div>
              <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-3">Pre-Flight Checklist</h4>
              <div className="space-y-2">
                {preflight.map((p, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${p.ok ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    {p.ok ? <CheckCircle size={16} className="text-emerald-500" /> : <AlertTriangle size={16} className="text-red-500" />}
                    <div>
                      <p className="text-sm font-medium text-navy">{p.label}</p>
                      <p className="text-[10px] text-muted-foreground">{p.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Deadline (optional)</label>
              <input type="date" className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10" />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowInitiate(false)}>Cancel</Button>
              <Button variant="primary" disabled={!canInitiate}>
                <Play size={14} /> Initiate Batch
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Import Modal */}
      {showImport && (
        <Modal title={`Import ${showImport === 'students' ? 'Students' : showImport === 'mentors' ? 'Mentor Assignments' : 'Elective Assignments'}`} onClose={() => setShowImport(null)}>
          <ImportStepper contextLabel={`Importing for ${CLASS_META.name}`} onComplete={() => setShowImport(null)} />
        </Modal>
      )}

      {/* Add Subject Modal */}
      {showAddSubject && (
        <Modal title="Add Subject Assignment" onClose={() => setShowAddSubject(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Search Subject</label>
              <input type="text" className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10" placeholder="Search by name or code..." />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Assign Faculty</label>
              <select className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10">
                <option value="">Select faculty...</option>
                <option>Dr. Sharma</option>
                <option>Dr. Verma</option>
                <option>Dr. Patel</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Subject Code Override (optional)</label>
              <input type="text" className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10" placeholder="Leave blank to use default code" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowAddSubject(false)}>Cancel</Button>
              <Button variant="primary"><Plus size={14} /> Add Subject</Button>
            </div>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
};

export default ClassDetail;
