import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ImportStepper from '../../components/import/ImportStepper';
import { useApi } from '../../hooks/useApi';
import { getClass, initiateBatch, addSubjectToClass } from '../../api/classes';
import { getFaculty } from '../../api/faculty';
import { Plus, Upload, Users, BookOpen, Layers, CheckCircle, AlertTriangle, Copy, UserPlus, ArrowLeft, Play, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

const TABS = [
  { key: 'students', label: 'Students', icon: Users },
  { key: 'subjects', label: 'Subjects', icon: BookOpen },
  { key: 'batch', label: 'History', icon: Layers },
];

const ClassDetail = () => {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('students');
  const [showImport, setShowImport] = useState(null);
  const [showInitiate, setShowInitiate] = useState(false);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: classData, loading, error, request: fetchClass } = useApi(() => getClass(classId), { immediate: true });
  const { data: facultyList } = useApi(getFaculty, { immediate: true });

  useEffect(() => {
    fetchClass();
  }, [fetchClass, classId]);

  const students = classData?.students || [];
  const subjects = classData?.subjects || [];
  const pastBatches = classData?.batchHistory || [];
  const activeBatch = classData?.activeBatch;

  const preflight = useMemo(() => [
    { label: 'Roster Loaded', ok: students.length > 0, detail: `${students.length} students enrolled` },
    { label: 'Subject Load', ok: subjects.length > 0, detail: `${subjects.length} assignments` },
    { label: 'Class Teacher', ok: !!classData?.classTeacher, detail: classData?.classTeacherName || 'Not Assigned' },
    { label: 'Mentor Mapping', ok: students.every(s => s.mentorId), detail: `${students.filter(s => s.mentorId).length}/${students.length} mapped` },
  ], [students, subjects, classData]);

  const canInitiate = preflight.every(p => p.ok);

  const onInitiateSubmit = async () => {
    setSubmitting(true);
    try {
      await initiateBatch({ classId });
      toast.success('No-Due Batch initiated for this class');
      setShowInitiate(false);
      fetchClass();
    } catch (err) {
      toast.error(err?.message || 'Initiation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const STUDENT_COLS = [
    { key: 'rollNo', label: 'Roll No', render: (v) => <span className="font-mono text-xs font-black text-navy">{v}</span> },
    { key: 'name', label: 'Candidate Name', render: (v) => <span className="font-bold">{v}</span> },
    { key: 'email', label: 'Email', render: (v) => <span className="text-muted-foreground/60">{v}</span> },
    { key: 'mentorName', label: 'Mentor' },
    { key: 'status', label: 'Last Cycle', render: (v) => <Badge status={v || 'pending'} /> },
  ];

  const SUBJECT_COLS = [
    { key: 'subjectCode', label: 'Code', render: (v) => <span className="font-mono text-[10px] bg-offwhite px-1.5 py-0.5 rounded border border-muted/50">{v}</span> },
    { key: 'subjectName', label: 'Component Name', render: (v) => <span className="font-bold text-navy">{v}</span> },
    { key: 'facultyName', label: 'Handling Faculty' },
    { key: 'type', label: 'Category', render: (v) => (
      <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${v === 'Core' ? 'bg-navy/5 text-navy/70' : 'bg-amber-50 text-amber-700'}`}>{v || 'Core'}</span>
    )},
  ];

  if (loading && !classData) {
    return (
      <PageWrapper title="Loading Class..." subtitle="Syncing academic records">
        <div className="animate-pulse space-y-4">
          <div className="h-10 w-64 bg-muted/10 rounded-xl mb-8"></div>
          <div className="h-96 bg-muted/5 rounded-2xl border border-muted"></div>
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper title="Sync Error" subtitle="Academic record unavailable">
        <div className="text-center py-20 bg-white rounded-2xl border border-muted shadow-sm">
           <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
           <p className="text-muted-foreground font-medium">{error}</p>
           <Button variant="primary" className="mt-6" onClick={() => fetchClass()}>Retry Sync</Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title={classData?.name} subtitle={`${classData?.departmentName} · Semester ${classData?.semester} · ${classData?.academicYear}`}>
      <Link to="/admin/departments" className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-navy mb-4 -mt-4 transition-colors">
        <ArrowLeft size={12} strokeWidth={3} /> Return to Directory
      </Link>

      {/* Tab Switcher */}
      <div className="flex gap-1 mb-10 bg-white border border-muted/40 shadow-sm rounded-xl p-1 w-fit">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all
                ${tab === t.key ? 'bg-navy text-white shadow-md' : 'text-muted-foreground hover:bg-offwhite'}`}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: Students */}
      {tab === 'students' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex flex-wrap gap-2 mb-6">
            <Button variant="primary" size="sm" onClick={() => setShowImport('students')}><Upload size={14} /> Import Roster</Button>
            <Button variant="secondary" size="sm" onClick={() => setShowImport('mentors')}><Users size={14} /> Map Mentors</Button>
          </div>
          <Table columns={STUDENT_COLS} data={students} searchable searchPlaceholder="Search by roll no or name..." />
        </div>
      )}

      {/* TAB 2: Subjects */}
      {tab === 'subjects' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex flex-wrap gap-2 mb-6">
            <Button variant="primary" size="sm" onClick={() => setShowAddSubject(true)}><Plus size={14} /> New Assignment</Button>
            <Button variant="secondary" size="sm"><Copy size={14} /> Inherit Plan</Button>
          </div>
          <Table columns={SUBJECT_COLS} data={subjects} />
        </div>
      )}

      {/* TAB 3: Batch History */}
      {tab === 'batch' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {activeBatch ? (
            <div className="bg-white rounded-2xl border border-navy/10 p-8 mb-10 shadow-sm shadow-navy/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-1 bg-navy text-white text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-bl-xl">LIVE SESSION</div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-black text-navy mb-1">Active No-Due Session</h3>
                  <p className="text-xs text-muted-foreground">Cycle initiated on {new Date(activeBatch.createdAt).toLocaleDateString()}</p>
                </div>
                <Badge status="pending" />
              </div>
              <Button variant="primary" onClick={() => navigate(`/admin/batch/${activeBatch._id}`)}>
                Open Progress Matrix
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-muted border-dashed p-12 mb-10 text-center">
              <Layers size={48} className="text-muted-foreground/30 mx-auto mb-4" />
              <h4 className="text-lg font-black text-navy mb-2">Cycle Inactive</h4>
              <p className="text-sm text-muted-foreground mb-8 max-w-[300px] mx-auto">No live clearance session detected for this academic group.</p>
              <Button variant="primary" onClick={() => setShowInitiate(true)} className="h-12 px-8">
                <Play size={16} fill="currentColor" /> Initiate Clearance Cycle
              </Button>
            </div>
          )}

          {/* Past Cycles */}
          {pastBatches.length > 0 && (
            <div>
              <h3 className="text-[10px] uppercase font-black tracking-[0.2em] text-navy/40 mb-4 px-1">Historical Analytics</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {pastBatches.map((b) => (
                  <div key={b._id} className="bg-white rounded-xl border border-muted p-5 flex items-center justify-between hover:border-navy/20 transition-colors">
                    <div>
                      <p className="text-xs font-black text-navy uppercase tracking-tight">Cycle S{b.semester} · {b.academicYear}</p>
                      <p className="text-[10px] text-muted-foreground font-bold font-mono mt-1 uppercase">
                        {b.clearedCount}/{b.totalStudents} Success · {b.duesCount} Flags
                      </p>
                    </div>
                    <Badge status="cleared">Archived</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Initiation Modal */}
      {showInitiate && (
        <Modal isOpen={showInitiate} title="Initiate Clearance Cycle" onClose={() => setShowInitiate(false)}>
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-offwhite border border-muted shadow-inner">
              <p className="text-xs font-black text-navy uppercase tracking-widest mb-1">{classData?.name}</p>
              <p className="text-[10px] text-muted-foreground font-bold">Academic Session {classData?.academicYear}</p>
            </div>

            <div>
              <h4 className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground mb-4">Integrity Preflight Checklist</h4>
              <div className="grid grid-cols-1 gap-2.5">
                {preflight.map((p, i) => (
                  <div key={i} className={`flex items-center gap-4 p-4 rounded-xl border ${p.ok ? 'bg-emerald-50/50 border-emerald-100' : 'bg-red-50/50 border-red-100'}`}>
                    <div className={p.ok ? 'text-emerald-500' : 'text-red-500'}>
                      {p.ok ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                    </div>
                    <div>
                      <p className="text-xs font-black text-navy uppercase tracking-tight">{p.label}</p>
                      <p className="text-[10px] font-bold text-muted-foreground/60">{p.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {!canInitiate && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-3">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold text-amber-900 leading-relaxed uppercase italic">Incomplete records detected. Ensure all pre-flight stages are cleared before cycle instantiation.</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-6 border-t border-muted/30">
              <Button variant="ghost" onClick={() => setShowInitiate(false)}>Cancel</Button>
              <Button variant="primary" disabled={!canInitiate} onClick={onInitiateSubmit} loading={submitting} className="gap-2">
                <Play size={16} fill="currentColor" /> Start Batch Cycle
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Import Modal */}
      {showImport && (
        <Modal isOpen={!!showImport} title={`Bulk ${showImport} Import`} onClose={() => setShowImport(null)}>
          <ImportStepper type={showImport} contextLabel={`Context: ${classData?.name}`} onComplete={() => { setShowImport(null); fetchClass(); }} />
        </Modal>
      )}

      {/* Add Subject Modal Placeholder */}
      {showAddSubject && (
        <Modal isOpen={showAddSubject} title="Create Component Mapping" onClose={() => setShowAddSubject(false)}>
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-6 uppercase font-black text-[10px] tracking-widest italic opacity-50">Component management coming soon to UI. Use API for mapping.</p>
            <Button variant="primary" className="w-full" onClick={() => setShowAddSubject(false)}>Close</Button>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
};

export default ClassDetail;
