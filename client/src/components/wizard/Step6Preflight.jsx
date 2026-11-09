import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPreflightChecklist } from '../../api/wizard';
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

  const preflightData = preflightRes?.data || preflightRes || {};
  const checks = preflightData.checks || {};
  const readyForInitiation = Boolean(preflightData.readyForInitiation);

  const studentsCheck = checks.studentsPresent || { passed: false, message: 'Checking student count...' };
  const subjectsCheck = checks.subjectsPresent || { passed: false, message: 'Checking subject assignments...' };
  const teacherCheck = checks.classTeacherAssigned || { passed: false, message: 'Checking class teacher...' };

  const handleProceed = () => {
    if (!readyForInitiation) {
      toast.error('Cannot proceed: all required pre-flight checks must pass.');
      return;
    }
    onSave({
      step: 'preflight',
      summary: 'All mandatory pre-flight checklist verifications passed',
      data: { readyForInitiation: true },
    });
  };

  if (isLoading) {
    return <PreflightCardSkeleton />;
  }

  if (isError) {
    return (
      <div className="p-6 rounded-2xl border border-red-200 bg-red-50 text-center space-y-3" role="alert">
        <AlertCircle size={32} className="mx-auto text-red-600" aria-hidden="true" />
        <h3 className="text-base font-bold text-red-900">Failed to execute pre-flight checks</h3>
        <p className="text-xs text-red-700">{error?.message || 'Check connection and retry.'}</p>
        <Button type="button" variant="secondary" size="sm" onClick={() => refetch()}>
          <RefreshCw size={14} className="mr-1.5" /> Re-check Pre-flight
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Status Banner */}
      <div
        className={`p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          readyForInitiation
            ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950 shadow-sm'
            : 'border-amber-300 bg-amber-50/70 text-amber-950 shadow-sm'
        }`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3.5">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 ${
              readyForInitiation
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                : 'bg-amber-100 text-amber-700 border border-amber-300'
            }`}
          >
            {readyForInitiation ? <ShieldCheck size={22} /> : <AlertTriangle size={22} />}
          </div>
          <div>
            <h3 className="text-sm font-extrabold tracking-tight">
              {readyForInitiation
                ? 'Pre-Flight Verification Complete — Ready for Batch Initiation'
                : 'Pre-Flight Gate: Action Required Before Initiation'}
            </h3>
            <p className="text-xs opacity-80 mt-0.5">
              {readyForInitiation
                ? 'All mandatory requirements (students, subjects, class teacher) have been verified.'
                : 'One or more required checks failed. Batch initiation is strictly blocked until resolved.'}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => refetch()}
          loading={isFetching}
          className="text-xs font-bold self-start sm:self-auto min-h-[44px]"
        >
          <RefreshCw size={13} className="mr-1.5" /> Refresh Checks
        </Button>
      </div>

      {/* Checklist Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" aria-label="Pre-flight verification items">
        {/* Check 1: Students */}
        <div
          className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
            studentsCheck.passed
              ? 'border-emerald-200 bg-white shadow-sm'
              : 'border-red-200 bg-red-50/40'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-navy">
                <Users size={14} className="text-indigo-600" /> Students Enrolled
              </span>
              {studentsCheck.passed ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={12} /> Passed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-800 bg-red-100 px-2 py-0.5 rounded-full">
                  <XCircle size={12} /> Failed
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-zinc-700 mt-1">{studentsCheck.message}</p>
          </div>

          {!studentsCheck.passed && (
            <div className="pt-3 mt-3 border-t border-red-100">
              <button
                type="button"
                onClick={() => onNavigateToStep(2)} // Step 3 index is 2
                className="text-[11px] font-bold text-red-700 hover:text-red-900 underline flex items-center gap-1 min-h-[44px]"
              >
                Go to Step 3 (Import Students) →
              </button>
            </div>
          )}
        </div>

        {/* Check 2: Subjects */}
        <div
          className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
            subjectsCheck.passed
              ? 'border-emerald-200 bg-white shadow-sm'
              : 'border-red-200 bg-red-50/40'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-navy">
                <BookOpen size={14} className="text-indigo-600" /> Active Subjects
              </span>
              {subjectsCheck.passed ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={12} /> Passed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-800 bg-red-100 px-2 py-0.5 rounded-full">
                  <XCircle size={12} /> Failed
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-zinc-700 mt-1">{subjectsCheck.message}</p>
          </div>

          {!subjectsCheck.passed && (
            <div className="pt-3 mt-3 border-t border-red-100">
              <button
                type="button"
                onClick={() => onNavigateToStep(1)} // Step 2 index is 1
                className="text-[11px] font-bold text-red-700 hover:text-red-900 underline flex items-center gap-1 min-h-[44px]"
              >
                Go to Step 2 (Timetable) →
              </button>
            </div>
          )}
        </div>

        {/* Check 3: Class Teacher */}
        <div
          className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
            teacherCheck.passed
              ? 'border-emerald-200 bg-white shadow-sm'
              : 'border-red-200 bg-red-50/40'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-navy">
                <GraduationCap size={14} className="text-indigo-600" /> Class Teacher
              </span>
              {teacherCheck.passed ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={12} /> Passed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-800 bg-red-100 px-2 py-0.5 rounded-full">
                  <XCircle size={12} /> Failed
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-zinc-700 mt-1">{teacherCheck.message}</p>
          </div>

          {!teacherCheck.passed && (
            <div className="pt-3 mt-3 border-t border-red-100">
              <button
                type="button"
                onClick={() => onNavigateToStep(0)} // Step 1 index is 0
                className="text-[11px] font-bold text-red-700 hover:text-red-900 underline flex items-center gap-1 min-h-[44px]"
              >
                Go to Step 1 (Assign Teacher) →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="pt-6 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Button type="button" variant="secondary" onClick={onBack} className="w-full sm:w-auto min-h-[44px]">
          ← Back
        </Button>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          {!readyForInitiation && (
            <span className="text-xs text-amber-700 font-semibold" role="alert">
              Cannot initiate until all required checks pass.
            </span>
          )}
          <Button
            type="button"
            variant="primary"
            disabled={!readyForInitiation}
            onClick={handleProceed}
            className="w-full sm:w-64 min-h-[44px]"
          >
            Proceed to Initiation →
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Step6Preflight;

