import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPreflightChecklist } from '../../api/wizard';
import { updateClass } from '../../api/classes';
import { getFaculty } from '../../api/faculty';
import { formatSectionDisplayName } from '../../utils/formatters';
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
  AlertCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const Step6Preflight = ({
  classId,
  targetClass,
  onSave,
  onBack,
  onNavigateToStep,
}) => {
  const departmentId = targetClass?.departmentId?._id || targetClass?.departmentId;
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [isSavingTeacher, setIsSavingTeacher] = useState(false);

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

  // Faculty options for inline teacher assignment if missing
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
      await refetch();
    } catch (err) {
      toast.error(err?.message || 'Failed to assign class teacher.');
    } finally {
      setIsSavingTeacher(false);
    }
  };

  const handleProceed = () => {
    if (!readyForInitiation) {
      toast.error('Cannot proceed: all required checklist items must pass.');
      return;
    }
    onSave({
      step: 'preflight',
      summary: 'All pre-flight verification items passed',
      data: { readyForInitiation: true },
    });
  };

  if (isLoading) {
    return <PreflightCardSkeleton />;
  }

  if (isError) {
    return (
      <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-center space-y-2.5" role="alert">
        <AlertCircle size={24} className="mx-auto text-red-600" aria-hidden="true" />
        <h3 className="text-xs font-bold text-red-900">Failed to verify pre-flight requirements</h3>
        <p className="text-xs text-red-700">{error?.message || 'Check your connection and retry.'}</p>
        <Button type="button" variant="secondary" size="sm" onClick={() => refetch()}>
          <RefreshCw size={12} className="mr-1.5" /> Re-check Pre-flight
        </Button>
      </div>
    );
  }

  const classTitle = formatSectionDisplayName(targetClass?.name, targetClass?.semester);

  return (
    <div className="space-y-4">
      {/* Top Status Banner */}
      <div
        className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          readyForInitiation
            ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
            : 'border-amber-300 bg-amber-50/70 text-amber-950'
        }`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
              readyForInitiation
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                : 'bg-amber-100 text-amber-700 border border-amber-300'
            }`}
          >
            {readyForInitiation ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-black tracking-tight">
              {readyForInitiation
                ? `Verification Passed — ${classTitle} is Ready for Launch`
                : 'Action Required: Resolve Items Before Launch'}
            </h3>
            <p className="text-xs opacity-80 mt-0.5">
              {readyForInitiation
                ? 'All mandatory requirements (students, subjects, and class teacher) are configured.'
                : 'All three mandatory requirements below must pass before clearance can be initiated.'}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => refetch()}
          loading={isFetching}
          className="text-xs font-bold self-start sm:self-auto min-h-[36px]"
        >
          <RefreshCw size={12} className="mr-1.5" /> Refresh Checks
        </Button>
      </div>

      {/* Checklist Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3" aria-label="Pre-flight verification items">
        {/* Check 1: Students */}
        <div
          className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
            studentsCheck.passed
              ? 'border-emerald-200 bg-white shadow-xs'
              : 'border-red-200 bg-red-50/40'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-navy">
                <Users size={14} className="text-indigo-600" /> Enrolled Students
              </span>
              {studentsCheck.passed ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.2 rounded-full">
                  <CheckCircle2 size={11} /> Passed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-800 bg-red-100 px-2 py-0.2 rounded-full">
                  <XCircle size={11} /> Missing
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-zinc-700">{studentsCheck.message}</p>
          </div>

          {!studentsCheck.passed && (
            <div className="pt-2 mt-2 border-t border-red-100">
              <button
                type="button"
                onClick={() => onNavigateToStep(2)}
                className="text-[11px] font-bold text-red-700 hover:text-red-900 underline flex items-center gap-1"
              >
                Go to Step 3 (Import Students) →
              </button>
            </div>
          )}
        </div>

        {/* Check 2: Subjects */}
        <div
          className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
            subjectsCheck.passed
              ? 'border-emerald-200 bg-white shadow-xs'
              : 'border-red-200 bg-red-50/40'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-navy">
                <BookOpen size={14} className="text-indigo-600" /> Active Subjects
              </span>
              {subjectsCheck.passed ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.2 rounded-full">
                  <CheckCircle2 size={11} /> Passed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-800 bg-red-100 px-2 py-0.2 rounded-full">
                  <XCircle size={11} /> Missing
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-zinc-700">{subjectsCheck.message}</p>
          </div>

          {!subjectsCheck.passed && (
            <div className="pt-2 mt-2 border-t border-red-100">
              <button
                type="button"
                onClick={() => onNavigateToStep(1)}
                className="text-[11px] font-bold text-red-700 hover:text-red-900 underline flex items-center gap-1"
              >
                Go to Step 2 (Timetable) →
              </button>
            </div>
          )}
        </div>

        {/* Check 3: Class Teacher */}
        <div
          className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
            teacherCheck.passed
              ? 'border-emerald-200 bg-white shadow-xs'
              : 'border-amber-200 bg-amber-50/40'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-navy">
                <GraduationCap size={14} className="text-indigo-600" /> Class Teacher
              </span>
              {teacherCheck.passed ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.2 rounded-full">
                  <CheckCircle2 size={11} /> Passed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-800 bg-amber-100 px-2 py-0.2 rounded-full">
                  <XCircle size={11} /> Required
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-zinc-700">{teacherCheck.message}</p>
          </div>

          {!teacherCheck.passed && (
            <div className="pt-2.5 mt-2 border-t border-amber-200/80 space-y-2">
              <select
                aria-label="Assign Class Teacher Inline"
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="w-full px-2 py-1 text-xs border border-zinc-300 rounded-lg text-navy bg-white min-h-[32px]"
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
                className="w-full text-xs min-h-[32px] py-1"
              >
                Assign Now
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="pt-4 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <Button type="button" variant="secondary" onClick={onBack} className="w-full sm:w-auto min-h-[40px] px-5 text-xs font-bold">
          ← Back
        </Button>

        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
          {!readyForInitiation && (
            <span className="text-xs text-amber-700 font-semibold" role="alert">
              All checklist items must pass before launching clearance.
            </span>
          )}
          <Button
            type="button"
            variant="primary"
            disabled={!readyForInitiation}
            onClick={handleProceed}
            className="w-full sm:w-56 min-h-[42px]"
          >
            Proceed to Launch Clearance →
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Step6Preflight;
