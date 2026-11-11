import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { initiateWizardBatch } from '../../api/wizard';
import { formatSectionDisplayName } from '../../utils/formatters';
import Button from '../ui/Button';
import {
  Rocket,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Users,
  BookOpen,
  GraduationCap,
  Sparkles,
  ArrowRight,
  RotateCcw,
  ExternalLink
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const Step7Initiation = ({
  classId,
  targetClass,
  onBack,
  onResetWizard,
}) => {
  const navigate = useNavigate();
  const [isInitiating, setIsInitiating] = useState(false);
  const [initiationSuccess, setInitiationSuccess] = useState(false);
  const [initiationResult, setInitiationResult] = useState(null);

  const semester = targetClass?.semester || 1;
  const deptName = targetClass?.departmentId?.name || targetClass?.departmentName || 'Department';
  const classTitle = formatSectionDisplayName(targetClass?.name, semester);

  const handleInitiate = async () => {
    setIsInitiating(true);
    try {
      const res = await initiateWizardBatch(classId);
      setInitiationSuccess(true);
      setInitiationResult(res?.data || res);
      toast.success(`No-Due clearance cycle initialized for ${classTitle}!`);
    } catch (err) {
      toast.error(err?.message || 'Failed to initiate clearance cycle.');
    } finally {
      setIsInitiating(false);
    }
  };

  // SUCCESS STATE
  if (initiationSuccess) {
    return (
      <div className="text-center py-6 px-4 space-y-5">
        <div className="w-14 h-14 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700 mx-auto flex items-center justify-center shadow-xs">
          <CheckCircle2 size={30} className="stroke-[2.5]" />
        </div>

        <div className="max-w-md mx-auto space-y-1.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            Setup Complete
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-navy tracking-tight">
            Class Setup Completed!
          </h2>
          <p className="text-xs text-zinc-600 leading-relaxed">
            All subjects, enrolled students, faculty mentors, and pre-flight requirements have been verified and initiated for{' '}
            <strong className="text-navy">{classTitle} (Semester {semester})</strong>.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-3">
          <Button
            type="button"
            variant="primary"
            onClick={() => navigate(`/admin/class/${classId}`)}
            className="w-full sm:w-auto min-h-[42px] px-5 text-xs font-bold"
          >
            <ExternalLink size={13} className="mr-1.5" /> View Class Details
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={onResetWizard}
            className="w-full sm:w-auto min-h-[42px] px-5 text-xs font-bold"
          >
            <RotateCcw size={13} className="mr-1.5" /> Setup Another Class
          </Button>
        </div>
      </div>
    );
  }

  // PRE-CONFIRMATION REVIEW STATE
  return (
    <div className="space-y-5">
      {/* Initiation Notice Banner */}
      <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/60 flex items-start gap-3">
        <Rocket size={20} className="text-indigo-600 shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-950 space-y-0.5">
          <p className="font-bold text-sm">
            Launch No-Due Clearance Cycle
          </p>
          <p className="text-indigo-800 leading-relaxed">
            You are about to launch the official clearance cycle for <strong>{classTitle}</strong>.
            This activates clearance status across all configured subject instructors and department laboratory overseers.
          </p>
        </div>
      </div>

      {/* Configuration Summary Card */}
      <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/90 space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-navy">
          Verified Section Summary
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
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
      </div>

      {/* Action Footer */}
      <div className="pt-4 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
          disabled={isInitiating}
          className="w-full sm:w-auto min-h-[40px] px-5 text-xs font-bold"
        >
          ← Back
        </Button>

        <Button
          type="button"
          variant="primary"
          onClick={handleInitiate}
          disabled={isInitiating}
          loading={isInitiating}
          className="w-full sm:w-64 min-h-[42px] text-xs font-black"
        >
          {isInitiating ? 'Launching Cycle...' : 'Launch Clearance Cycle →'}
        </Button>
      </div>
    </div>
  );
};

export default Step7Initiation;
