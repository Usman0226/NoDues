import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { initiateWizardBatch } from '../../api/wizard';
import { initiateBatch } from '../../api/batch';
import { getClass } from '../../api/classes';
import { ROLES } from '../../utils/constants';
import { formatSectionDisplayName } from '../../utils/formatters';
import Button from '../ui/Button';
import {
  Rocket,
  CheckCircle2,
  RotateCcw,
  ExternalLink,
  Calendar,
  Layers,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const Step7Initiation = ({
  classId,
  targetClass,
  provisionedClasses = [],
  departmentId: propDepartmentId,
  user,
  onSwitchClass,
  onBack,
  onResetWizard,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deadline, setDeadline] = useState('');
  const [isInitiating, setIsInitiating] = useState(false);
  const [initiationSuccess, setInitiationSuccess] = useState(false);
  const [batchResult, setBatchResult] = useState(null);

  const { data: classDetailRes } = useQuery({
    queryKey: ['wizard', 'class-summary', classId],
    queryFn: () => getClass(classId),
    enabled: Boolean(classId),
  });
  const liveClass = classDetailRes?.data || classDetailRes || targetClass;
  const subjectAssignments = Array.isArray(liveClass?.subjectAssignments)
    ? liveClass.subjectAssignments
    : [];

  const isHod = user?.role === ROLES.HOD || user?.role === 'hod';
  const classDetailPath = isHod ? `/hod/class/${classId}` : `/admin/class/${classId}`;
  const resolvedDeptId = liveClass?.departmentId?._id || liveClass?.departmentId || propDepartmentId;
  const deptClassesPath = isHod
    ? '/hod/classes'
    : resolvedDeptId
    ? `/admin/departments/${resolvedDeptId}/classes`
    : '/admin/departments';
  const semester = liveClass?.semester || 1;
  const deptName = liveClass?.departmentId?.name || liveClass?.departmentName || 'Department';
  const classTeacherName =
    liveClass?.classTeacherId?.name || liveClass?.classTeacher?.name || 'Assigned';
  const classTitle = formatSectionDisplayName(liveClass?.name, semester);

  const handleInitiate = async () => {
    setIsInitiating(true);
    try {
      await initiateWizardBatch(classId);

      let launchedBatch = null;
      try {
        const deadlineIso = deadline ? new Date(`${deadline}T23:59:59`).toISOString() : null;
        const batchRes = await initiateBatch({ classId, deadline: deadlineIso });
        launchedBatch = batchRes?.data || batchRes;
      } catch (batchErr) {
        if (batchErr?.statusCode === 409) {
          toast('An active clearance cycle is already running for this section.', { icon: 'ℹ️' });
        } else {
          throw batchErr;
        }
      }

      setBatchResult(launchedBatch);
      setInitiationSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['class'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success(`No-Due clearance cycle launched for ${classTitle}!`);
    } catch (err) {
      toast.error(err?.message || 'Failed to launch clearance cycle.');
    } finally {
      setIsInitiating(false);
    }
  };

  if (initiationSuccess) {
    const batchDetailPath = batchResult?.batchId
      ? isHod
        ? `/hod/batch/${batchResult.batchId}`
        : `/admin/batch/${batchResult.batchId}`
      : null;

    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-6">
        <div className="text-center max-w-lg w-full space-y-5">
          <div className="w-14 h-14 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700 mx-auto flex items-center justify-center shadow-xs">
            <CheckCircle2 size={30} className="stroke-[2.5]" />
          </div>

          <div className="space-y-1.5">
            <span className="inline-flex items-center text-[10px] font-black uppercase tracking-widest text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              Clearance Cycle Active
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-navy tracking-tight">
              Class Setup Completed!
            </h2>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Subjects, students, faculty mentors, and pre-flight checks are verified and the No-Due clearance cycle is live for{' '}
              <strong className="text-navy">{classTitle} (Semester {semester})</strong>.
              {batchResult?.totalStudents ? ` ${batchResult.totalStudents} student clearance requests were created.` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            {batchDetailPath && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => navigate(batchDetailPath)}
              >
                <ExternalLink size={13} />
                <span>View Active Batch</span>
              </Button>
            )}
            <Button
              type="button"
              variant={batchDetailPath ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => navigate(classDetailPath)}
            >
              <ExternalLink size={13} />
              <span>View Class Details</span>
            </Button>
            {provisionedClasses.length > 1 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => navigate(deptClassesPath)}
              >
                <Layers size={13} />
                <span>View All {provisionedClasses.length} Sections</span>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onResetWizard}
              className="border border-zinc-200 bg-white"
            >
              <RotateCcw size={13} />
              <span>Setup Another Class</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
        {provisionedClasses.length > 1 && (
          <div className="p-3.5 rounded-2xl border border-emerald-200/80 bg-emerald-50/40 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers size={15} className="text-emerald-700" />
                <span className="text-xs font-black text-navy">
                  All {provisionedClasses.length} PDF Sections Saved — Review & Launch
                </span>
              </div>
              <button
                type="button"
                onClick={() => navigate(deptClassesPath)}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline"
              >
                View All Classes in Department →
              </button>
            </div>
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
                    className={`px-2.5 py-1 rounded-xl border text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-navy text-white border-navy'
                        : 'bg-white border-emerald-200 text-navy hover:border-emerald-400'
                    }`}
                  >
                    {label} · Sem {sec.semester}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Initiation Notice Banner */}
        <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-white border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
            <Rocket size={18} />
          </div>
          <div className="text-xs text-indigo-950 space-y-0.5">
            <p className="font-bold text-sm">Launch No-Due Clearance Cycle</p>
            <p className="text-indigo-900/80 leading-relaxed">
              Launching activates live No-Due clearance requests for all enrolled students in <strong>{classTitle}</strong> across configured subject faculty, mentors, class teacher, and co-curricular coordinators.
            </p>
          </div>
        </div>

        {/* Verified Summary Grid + Curriculum + Deadline Option */}
        <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/90 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-navy">
              Verified Section Summary
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200/60">
              {subjectAssignments.length} Active Subjects
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-white border border-zinc-200/80">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Class Section</span>
              <p className="font-black text-navy text-sm mt-0.5">{classTitle}</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-zinc-200/80">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Semester & Batch</span>
              <p className="font-black text-navy text-sm mt-0.5">
                Sem {semester} · {liveClass?.academicYear || '2026-27'}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-zinc-200/80">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Department</span>
              <p className="font-black text-navy text-sm mt-0.5 truncate">{deptName}</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-zinc-200/80">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Class Teacher</span>
              <p className="font-black text-navy text-sm mt-0.5 truncate">{classTeacherName}</p>
            </div>
          </div>

          {subjectAssignments.length > 0 && (
            <div className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden">
              <div className="max-h-44 overflow-y-auto overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-zinc-50 border-b border-zinc-200">
                    <tr className="text-zinc-500 uppercase tracking-wider text-[10px] font-black">
                      <th className="py-2 px-3">Code</th>
                      <th className="py-2 px-3">Subject</th>
                      <th className="py-2 px-3">Faculty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {subjectAssignments.map((subj, idx) => (
                      <tr key={`${subj.subjectCode || idx}-${idx}`}>
                        <td className="py-1.5 px-3 font-mono font-bold text-navy whitespace-nowrap">
                          {subj.subjectCode || subj.code || subj.subjectId?.code || '—'}
                        </td>
                        <td className="py-1.5 px-3 font-semibold text-zinc-800">
                          {subj.subjectName || subj.name || subj.subjectId?.name || 'Subject'}
                        </td>
                        <td className="py-1.5 px-3 text-zinc-600 whitespace-nowrap">
                          {subj.facultyId?.name || subj.facultyName || 'Unassigned'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-zinc-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label htmlFor="wizard-deadline" className="text-xs font-bold text-navy flex items-center gap-1.5">
              <Calendar size={14} className="text-indigo-600" />
              <span>Target Completion Deadline (Optional)</span>
            </label>
            <input
              id="wizard-deadline"
              type="date"
              min={new Date().toISOString().split('T')[0]}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-navy/10 w-full sm:w-52"
            />
          </div>
        </div>
      </div>

      {/* Pinned Step Footer */}
      <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-zinc-100 bg-zinc-50/60 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onBack}
          disabled={isInitiating}
          className="w-full sm:w-auto"
        >
          ← Back
        </Button>

        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleInitiate}
          disabled={isInitiating}
          loading={isInitiating}
          className="w-full sm:w-auto"
        >
          {isInitiating ? 'Launching Cycle...' : 'Launch Clearance Cycle →'}
        </Button>
      </div>
    </>
  );
};

export default Step7Initiation;
