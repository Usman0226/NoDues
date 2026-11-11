import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { initiateWizardBatch } from '../../api/wizard';
import { initiateBatch } from '../../api/batch';
import { ROLES } from '../../utils/constants';
import { formatSectionDisplayName } from '../../utils/formatters';
import Button from '../ui/Button';
import {
  Rocket,
  CheckCircle2,
  RotateCcw,
  ExternalLink,
  Calendar,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const Step7Initiation = ({
  classId,
  targetClass,
  user,
  onBack,
  onResetWizard,
}) => {
  const navigate = useNavigate();
  const [deadline, setDeadline] = useState('');
  const [isInitiating, setIsInitiating] = useState(false);
  const [initiationSuccess, setInitiationSuccess] = useState(false);
  const [batchResult, setBatchResult] = useState(null);

  const isHod = user?.role === ROLES.HOD || user?.role === 'hod';
  const classDetailPath = isHod ? `/hod/class/${classId}` : `/admin/class/${classId}`;
  const semester = targetClass?.semester || 1;
  const deptName = targetClass?.departmentId?.name || targetClass?.departmentName || 'Department';
  const classTitle = formatSectionDisplayName(targetClass?.name, semester);

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

        {/* Verified Summary Grid + Deadline Option */}
        <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/90 space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-navy">
            Verified Section Summary
          </h3>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-white border border-zinc-200/80">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Class Section</span>
              <p className="font-black text-navy text-sm mt-0.5">{classTitle}</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-zinc-200/80">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Semester</span>
              <p className="font-black text-navy text-sm mt-0.5">Semester {semester}</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-zinc-200/80">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Department</span>
              <p className="font-black text-navy text-sm mt-0.5 truncate">{deptName}</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-zinc-200/80">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Academic Batch</span>
              <p className="font-black text-navy text-sm mt-0.5">{targetClass?.academicYear || 'Current'}</p>
            </div>
          </div>

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
