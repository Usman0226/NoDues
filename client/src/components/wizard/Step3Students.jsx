import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStudents } from '../../api/students';
import { previewStudents, commitStudents } from '../../api/import';
import { ROLES } from '../../utils/constants';
import { formatSectionDisplayName } from '../../utils/formatters';
import Button from '../ui/Button';
import { StepTableSkeleton } from './WizardSkeleton';
import WizardImportPanel from './WizardImportPanel';
import {
  Users,
  Upload,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Search,
  Info,
  ArrowRight,
  GraduationCap,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const STUDENT_COLUMNS = [
  { name: 'Roll No', required: true },
  { name: 'Name', required: true },
  { name: 'Email', required: false },
];

const Step3Students = ({
  classId,
  targetClass,
  user,
  onSave,
  onBack,
  onDirtyChange,
}) => {
  const [showUploader, setShowUploader] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isHod = user?.role === ROLES.HOD || user?.role === 'hod';
  const classTitle = formatSectionDisplayName(targetClass?.name, targetClass?.semester);
  const classLocationHint = isHod
    ? `Academic → Classes → ${classTitle} → Students`
    : `Departments → Classes → ${classTitle} → Students`;

  const {
    data: studentsRes,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['wizard', 'students', classId],
    queryFn: () => getStudents({ classId, limit: 150 }),
    enabled: Boolean(classId),
  });

  const studentsList = studentsRes?.data || studentsRes?.students || [];
  const enrolledCount = studentsList.length;

  const filteredStudents = studentsList.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.rollNo?.toLowerCase().includes(q) ||
      s.name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    );
  });

  const handlePreviewStudents = (formData) => previewStudents(formData, { classId });

  const handleCommitStudents = async (validRows) => {
    await commitStudents({
      students: validRows,
      classId,
    });
    toast.success(`Imported ${validRows.length} students into ${classTitle}.`);
    setShowUploader(false);
    refetch();
  };

  const handleContinue = () => {
    onSave({
      step: 'students',
      summary: `${enrolledCount} students enrolled in ${classTitle}`,
      data: { count: enrolledCount, skipped: false },
    });
  };

  const handleSkip = () => {
    onDirtyChange?.(false);
    onSave({
      step: 'students',
      summary: 'Skipped during setup (add students later from Class Details)',
      data: { count: 0, skipped: true },
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <StepTableSkeleton rows={5} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-6">
        <div className="max-w-md w-full p-5 rounded-2xl border border-red-200 bg-red-50 text-center space-y-3" role="alert">
          <AlertCircle size={24} className="mx-auto text-red-600" aria-hidden="true" />
          <h3 className="text-sm font-bold text-red-900">Failed to load enrolled students</h3>
          <p className="text-xs text-red-700">Please check your connection and retry.</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw size={12} /> Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Main Scrollable Content Region */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* Compact Status & Toggle Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-700 shrink-0">
              <Users size={17} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-black text-navy">
                  {enrolledCount} Student{enrolledCount === 1 ? '' : 's'} Enrolled
                </span>
                {enrolledCount > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    <CheckCircle2 size={11} /> Roster Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                    Optional Right Now
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Target Section: <strong className="text-navy">{classTitle}</strong> · Semester {targetClass?.semester || 1}
              </p>
            </div>
          </div>

          {enrolledCount > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowUploader((prev) => !prev)}
            >
              <Upload size={12} />
              <span>{showUploader ? 'Hide Importer' : 'Import More'}</span>
            </Button>
          )}
        </div>

        {/* When 0 Students Enrolled: Balanced 2-Column Layout (Importer + Deferral Guidance) */}
        {enrolledCount === 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-7">
              <WizardImportPanel
                type="students"
                title="Import Student Roster (Excel / CSV)"
                columns={STUDENT_COLUMNS}
                dropLabel="Drop Student Spreadsheet (.xlsx, .xls, .csv)"
                onPreview={handlePreviewStudents}
                onCommit={handleCommitStudents}
                onDirtyChange={onDirtyChange}
              />
            </div>

            <div className="lg:col-span-5 rounded-2xl border border-indigo-200/70 bg-indigo-50/40 p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <Info size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-navy">
                    Excel Sheet Not Ready Yet?
                  </h3>
                  <p className="text-xs text-indigo-900/80 mt-1 leading-relaxed">
                    You can safely <strong>skip this step</strong> now and finish configuring mentors, electives, and class details.
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-indigo-700">
                  Where to enroll students later:
                </p>
                <div className="p-2.5 rounded-xl bg-white border border-indigo-100 text-xs text-zinc-700 space-y-1">
                  <p className="font-bold text-navy flex items-center gap-1.5">
                    <GraduationCap size={13} className="text-indigo-600 shrink-0" />
                    <span>{classLocationHint}</span>
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Supports Excel/CSV import, individual <strong>Add Student</strong>, or <strong>Promote Section</strong> from a previous semester.
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-indigo-100 text-xs text-zinc-700 space-y-0.5">
                  <p className="font-bold text-navy">Sidebar → Management → Students</p>
                  <p className="text-[11px] text-zinc-500">
                    Bulk import students across any class once your sheet matches the template.
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded-xl px-3 py-2 font-medium">
                Note: Launching an active clearance batch requires at least 1 student enrolled in the class.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {showUploader && (
              <WizardImportPanel
                type="students"
                title="Import Additional Students"
                columns={STUDENT_COLUMNS}
                dropLabel="Drop Additional Student Spreadsheet"
                onPreview={handlePreviewStudents}
                onCommit={handleCommitStudents}
                onDirtyChange={onDirtyChange}
              />
            )}

            {/* Enrolled Students Preview Table */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-navy">
                  Enrolled Roster ({filteredStudents.length} of {enrolledCount})
                </h3>
                <div className="relative w-full sm:w-64">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search roll no, name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-9 pl-8 pr-3 text-xs bg-white border border-zinc-200 rounded-xl text-navy placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-navy/10"
                  />
                </div>
              </div>

              <div
                tabIndex={0}
                role="region"
                aria-label="Enrolled students table scrollable region"
                className="border border-zinc-200 rounded-xl overflow-hidden bg-white max-h-[260px] overflow-y-auto"
              >
                <table className="w-full text-left text-xs" aria-label="Students List">
                  <thead className="bg-zinc-50 border-b border-zinc-200 font-bold text-zinc-500 uppercase tracking-wider text-[10px] sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Roll No</th>
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Email</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredStudents.map((s) => (
                      <tr key={s._id} className="hover:bg-zinc-50/60">
                        <td className="py-2 px-3 font-mono font-bold text-navy whitespace-nowrap">{s.rollNo}</td>
                        <td className="py-2 px-3 font-semibold text-zinc-800">{s.name}</td>
                        <td className="py-2 px-3 text-zinc-500">{s.email || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pinned Step Footer */}
      <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-zinc-100 bg-zinc-50/60 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5">
        <Button type="button" variant="secondary" size="sm" onClick={onBack} className="w-full sm:w-auto">
          ← Back
        </Button>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          {enrolledCount === 0 ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSkip}
              className="w-full sm:w-auto"
            >
              <span>Skip for Now & Continue</span>
              <ArrowRight size={13} />
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleContinue}
              className="w-full sm:w-auto"
            >
              <span>Continue to Mentors</span>
              <ArrowRight size={13} />
            </Button>
          )}
        </div>
      </div>
    </>
  );
};

export default Step3Students;
