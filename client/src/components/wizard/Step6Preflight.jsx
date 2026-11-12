import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPreflightChecklist, bulkUpdateWizardProgress } from '../../api/wizard';
import { getClass, updateClass } from '../../api/classes';
import { getFaculty } from '../../api/faculty';
import { ROLES } from '../../utils/constants';
import { formatSectionDisplayName, getAcademicYearRoman } from '../../utils/formatters';
import Button from '../ui/Button';
import { PreflightCardSkeleton } from './WizardSkeleton';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Users,
  BookOpen,
  GraduationCap,
  AlertCircle,
  ExternalLink,
  Clock,
  Layers,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const Step6Preflight = ({
  classId,
  targetClass,
  provisionedClasses = [],
  departmentId: propDepartmentId,
  user,
  onSwitchClass,
  onSave,
  onBack,
  onNavigateToStep,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [isSavingTeacher, setIsSavingTeacher] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);

  const isHod = user?.role === ROLES.HOD || user?.role === 'hod';
  const classDetailPath = isHod ? '/hod/class/' + classId : '/admin/class/' + classId;

  const { data: classDetailRes } = useQuery({
    queryKey: ['wizard', 'class-summary', classId],
    queryFn: () => getClass(classId),
    enabled: Boolean(classId),
    refetchOnWindowFocus: true,
  });

  const liveClass = classDetailRes?.data || classDetailRes || targetClass;
  const departmentId = liveClass?.departmentId?._id || liveClass?.departmentId || propDepartmentId;
  const subjectAssignments = Array.isArray(liveClass?.subjectAssignments)
    ? liveClass.subjectAssignments
    : [];
  const deptClassesPath = isHod
    ? '/hod/classes'
    : departmentId
    ? `/admin/departments/${departmentId}/classes`
    : '/admin/departments';

  const {
    data: preflightRes,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['wizard', 'preflight', classId],
    queryFn: () => getPreflightChecklist(classId),
    enabled: Boolean(classId),
    refetchOnWindowFocus: true,
  });

  const { data: facultyRes } = useQuery({
    queryKey: ['wizard', 'faculty-preflight', departmentId || 'all'],
    queryFn: () => getFaculty(departmentId ? { departmentId, limit: 100 } : { limit: 100 }),
    enabled: true,
  });
  const facultyList = facultyRes?.data || facultyRes?.faculty || [];

  const preflightData = preflightRes?.data || preflightRes || {};
  const checks = preflightData.checks || {};
  const readyForInitiation = Boolean(preflightData.readyForInitiation);

  const studentsCheck = checks.studentsPresent || { passed: false, message: 'Checking student count...' };
  const subjectsCheck = checks.subjectsPresent || { passed: false, message: 'Checking subject assignments...' };
  const teacherCheck = checks.classTeacherAssigned || { passed: false, message: 'Checking class teacher...' };

  const handleQuickAssignTeacher = async () => {
    if (!selectedTeacherId) {
      toast.error('Please choose a faculty member.');
      return;
    }
    setIsSavingTeacher(true);
    try {
      await updateClass(classId, { classTeacherId: selectedTeacherId });
      toast.success('Class teacher assigned.');
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['wizard', 'class-summary', classId] }),
        queryClient.invalidateQueries({ queryKey: ['class', classId] }),
        queryClient.invalidateQueries({ queryKey: ['class'] }),
      ]);
    } catch (err) {
      toast.error(err?.message || 'Failed to assign class teacher.');
    } finally {
      setIsSavingTeacher(false);
    }
  };

  const handleProceed = () => {
    if (!readyForInitiation) {
      toast.error('Cannot launch yet: students, subjects, and class teacher must all be configured.');
      return;
    }
    onSave({
      step: 'preflight',
      summary: 'All pre-flight verification items passed',
      data: { readyForInitiation: true },
    });
  };

  const handleSaveAndOpenClass = () => {
    toast.success('Class setup saved! Add students on the Class page when ready to launch clearance.');
    navigate(classDetailPath);
  };

  const handleSaveAllAndOpenDept = async () => {
    if (isSavingBatch) return;
    setIsSavingBatch(true);
    try {
      const ids = provisionedClasses.map((c) => c.classId || c._id).filter(Boolean);
      if (ids.length > 0) {
        await bulkUpdateWizardProgress({
          classIds: ids,
          step: 'preflight',
          markCompleted: true,
          data: { savedForDeferredSetup: true },
        }).catch(() => null);
      }
      queryClient.invalidateQueries({ queryKey: ['class'] });
      toast.success(
        `Saved all ${provisionedClasses.length} sections and their Master Syllabi! Add students on each class page when ready.`
      );
      navigate(deptClassesPath);
    } finally {
      setIsSavingBatch(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <PreflightCardSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-6">
        <div className="max-w-md w-full p-5 rounded-2xl border border-red-200 bg-red-50 text-center space-y-3" role="alert">
          <AlertCircle size={24} className="mx-auto text-red-600" aria-hidden="true" />
          <h3 className="text-sm font-bold text-red-900">Failed to verify pre-flight requirements</h3>
          <p className="text-xs text-red-700">{error?.message || 'Check your connection and retry.'}</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw size={12} /> Re-check Pre-flight
          </Button>
        </div>
      </div>
    );
  }

  const classTitle = formatSectionDisplayName(
    liveClass?.name || preflightData.className,
    liveClass?.semester || preflightData.semester
  );
  const classSemester = liveClass?.semester || preflightData.semester || 1;
  const classTeacherName =
    liveClass?.classTeacherId?.name ||
    liveClass?.classTeacher?.name ||
    'Not assigned';
  const deptTitle =
    liveClass?.departmentId?.name || liveClass?.departmentName || '—';

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* Provisioned Multi-Section Switcher (compact pill bar when >1 section was extracted from PDF) */}
        {provisionedClasses.length > 1 && (
          <div className="px-3.5 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50/60 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-black text-navy shrink-0">
              <Layers size={14} className="text-indigo-700" />
              Saved Sections ({provisionedClasses.length}):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {provisionedClasses.map((sec) => {
                const secId = sec.classId || sec._id;
                const isSelected = secId === classId;
                const label = sec.displayName || formatSectionDisplayName(sec.name, sec.semester);
                return (
                  <button
                    key={secId}
                    type="button"
                    onClick={() => onSwitchClass?.(secId)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-navy text-white border-navy shadow-2xs'
                        : 'bg-white border-slate-300 text-slate-800 hover:border-indigo-400 hover:text-navy'
                    }`}
                  >
                    <span>{label}</span>
                    <span className={`text-[10px] font-semibold ${isSelected ? 'text-indigo-100' : 'text-slate-600'}`}>
                      · {sec.subjectCount ?? '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Top Readiness Banner */}
        <div
          className="p-4 rounded-xl border border-slate-300 bg-slate-50/90 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                readyForInitiation
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}
            >
              {readyForInitiation ? <ShieldCheck size={19} /> : <AlertTriangle size={19} />}
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black tracking-tight text-navy">
                {readyForInitiation
                  ? `Verification Passed — ${classTitle} is Ready for Launch`
                  : 'Setup Saved — Items Pending Before Launch'}
              </h3>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                {readyForInitiation
                  ? 'All mandatory requirements (students, subjects, and class teacher) are configured.'
                  : 'Resolve pending items below now, or save and finish from the Class Page later.'}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            loading={isFetching}
            className="self-start sm:self-auto !border-slate-300 !bg-white !text-slate-800 hover:!bg-slate-100"
          >
            <RefreshCw size={12} />
            <span>Refresh</span>
          </Button>
        </div>

        {/* 3-Column Bluejack-Style Clean Readiness Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" aria-label="Pre-flight verification items">
          {/* Check 1: Students */}
          <div className="p-4 rounded-xl border border-slate-300/90 bg-white shadow-2xs flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-700">
                  <Users size={13} className="text-indigo-700" /> Students
                </span>
                {studentsCheck.passed ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300/80 px-2 py-0.5 rounded-full">
                    <CheckCircle2 size={10} /> Passed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-900 bg-amber-50 border border-amber-300/80 px-2 py-0.5 rounded-full">
                    <Clock size={10} /> Deferred
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-navy">{studentsCheck.message}</p>
              {!studentsCheck.passed && (
                <p className="text-[11px] text-slate-600 font-medium mt-1 leading-relaxed">
                  Import Excel/CSV here, or add/promote students later on the Class page.
                </p>
              )}
            </div>

            {!studentsCheck.passed && (
              <div className="pt-2.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => onNavigateToStep(1)}
                  className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1 cursor-pointer"
                >
                  Import Students (Step 2) →
                </button>
              </div>
            )}
          </div>

          {/* Check 2: Subjects */}
          <div className="p-4 rounded-xl border border-slate-300/90 bg-white shadow-2xs flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-700">
                  <BookOpen size={13} className="text-indigo-700" /> Subjects
                </span>
                {subjectsCheck.passed ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300/80 px-2 py-0.5 rounded-full">
                    <CheckCircle2 size={10} /> Passed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-800 bg-red-50 border border-red-300/80 px-2 py-0.5 rounded-full">
                    <XCircle size={10} /> Missing
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-navy">{subjectsCheck.message}</p>
            </div>

            {!subjectsCheck.passed && (
              <div className="pt-2.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => onNavigateToStep(0)}
                  className="text-[11px] font-bold text-red-700 hover:text-red-900 inline-flex items-center gap-1 cursor-pointer"
                >
                  Go to Step 1 (Class & Subjects) →
                </button>
              </div>
            )}
          </div>

          {/* Check 3: Class Teacher */}
          <div className="p-4 rounded-xl border border-slate-300/90 bg-white shadow-2xs flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-700">
                  <GraduationCap size={13} className="text-indigo-700" /> Class Teacher
                </span>
                {teacherCheck.passed ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300/80 px-2 py-0.5 rounded-full">
                    <CheckCircle2 size={10} /> Passed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-900 bg-amber-50 border border-amber-300/80 px-2 py-0.5 rounded-full">
                    <XCircle size={10} /> Required
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-navy">{teacherCheck.message}</p>
            </div>

            {!teacherCheck.passed && (
              <div className="pt-2.5 border-t border-slate-200 space-y-2">
                <select
                  aria-label="Assign Class Teacher Inline"
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="w-full h-9 px-3 text-xs border border-slate-300 rounded-xl text-slate-900 font-semibold bg-white hover:border-slate-400 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
                >
                  <option value="">-- Choose Class Teacher --</option>
                  {facultyList.map((f) => (
                    <option key={f._id} value={f._id}>{f.name}</option>
                  ))}
                </select>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  loading={isSavingTeacher}
                  onClick={handleQuickAssignTeacher}
                  className="w-full"
                >
                  Assign Now
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* 2-Column Verified Section & Curriculum Summary */}
        {liveClass && (
          <div className="rounded-2xl border border-slate-300/90 bg-white overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-navy">
                  Verified Section & Curriculum Summary
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-900 border border-indigo-300/80">
                  {subjectAssignments.length} Subjects
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateToStep(0)}
                className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 underline cursor-pointer"
              >
                Edit Class & Subjects →
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
              <div className="lg:col-span-4 p-4 bg-slate-50/80 grid grid-cols-2 lg:grid-cols-1 gap-2.5 text-xs">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 block">
                    Section
                  </span>
                  <span className="font-black text-navy">{classTitle}</span>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 block">
                    Semester & Batch
                  </span>
                  <span className="font-bold text-slate-900">
                    Sem {classSemester} ({getAcademicYearRoman(Number(classSemester))} Yr) · {liveClass.academicYear || '2026-27'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 block">
                    Department
                  </span>
                  <span className="font-bold text-slate-900">{deptTitle}</span>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 block">
                    Class Teacher
                  </span>
                  <span className={`font-bold ${teacherCheck.passed ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {classTeacherName}
                  </span>
                </div>
              </div>

              <div className="lg:col-span-8 max-h-[250px] overflow-y-auto overflow-x-auto">
                {subjectAssignments.length > 0 ? (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-100 border-b border-slate-300 z-10">
                      <tr className="text-slate-700 uppercase tracking-wider text-[10px] font-extrabold">
                        <th className="py-2 px-3 whitespace-nowrap">Code</th>
                        <th className="py-2 px-3">Subject Name</th>
                        <th className="py-2 px-3">Handling Faculty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80">
                      {subjectAssignments.map((subj, idx) => {
                        const code = subj.subjectCode || subj.code || subj.subjectId?.code || '—';
                        const name = subj.subjectName || subj.name || subj.subjectId?.name || 'Subject';
                        const facName = subj.facultyId?.name || subj.facultyName || 'Unassigned';
                        const hasFac = Boolean(subj.facultyId);
                        return (
                          <tr key={`${code}-${idx}`} className="even:bg-slate-50/40 hover:bg-indigo-50/40">
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className="font-mono font-bold text-navy">{code}</span>
                              {subj.isElective && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-indigo-100 text-indigo-900">
                                  Elective
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-900">{name}</td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className={hasFac ? 'font-medium text-slate-700' : 'font-semibold text-amber-800'}>
                                {facName}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-6 text-center text-xs font-medium text-slate-600">
                    No subjects configured yet for this section.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pinned Step Footer */}
      <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-100/85 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5">
        <Button type="button" variant="secondary" size="sm" onClick={onBack} className="w-full sm:w-auto !border-slate-300 !bg-white !text-slate-800 hover:!bg-slate-50">
          ← Back
        </Button>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {provisionedClasses.length > 1 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={isSavingBatch}
              onClick={handleSaveAllAndOpenDept}
              className="w-full sm:w-auto !border-indigo-400 !bg-indigo-50 !text-indigo-950 hover:!bg-indigo-100"
            >
              <ExternalLink size={13} />
              <span>Save All ({provisionedClasses.length}) & View Classes</span>
            </Button>
          )}
          {!readyForInitiation && classId && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSaveAndOpenClass}
              className="w-full sm:w-auto !border-slate-300 !bg-white !text-slate-800 hover:!bg-slate-50"
            >
              <ExternalLink size={13} />
              <span>Save Setup & Open Class Page</span>
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!readyForInitiation}
            onClick={handleProceed}
            className="w-full sm:w-auto"
          >
            <span>Proceed to Launch Clearance</span>
            <ArrowRight size={13} />
          </Button>
        </div>
      </div>
    </>
  );
};

export default Step6Preflight;
