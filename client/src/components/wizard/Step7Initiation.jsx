import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { initiateWizardBatch } from '../../api/wizard';
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

  const handleInitiate = async () => {
    setIsInitiating(true);
    try {
      const res = await initiateWizardBatch(classId);
      setInitiationSuccess(true);
      setInitiationResult(res?.data || res);
      toast.success(`No-Due clearance cycle successfully initiated for ${targetClass?.name}!`);
    } catch (err) {
      toast.error(err?.message || 'Failed to initiate No-Due batch.');
    } finally {
      setIsInitiating(false);
    }
  };

  // SUCCESS STATE: CELEBRATION VIEW
  if (initiationSuccess) {
    return (
      <div className="text-center py-8 px-4 space-y-6">
        <div className="w-16 h-16 rounded-full bg-emerald-100 border-2 border-emerald-300 text-emerald-700 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/10">
          <CheckCircle2 size={36} className="stroke-[2.5]" />
        </div>

        <div className="max-w-md mx-auto space-y-2">
          <div className="flex items-center justify-center gap-1.5">
            <Sparkles size={14} className="text-gold" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              Clearance Cycle Active
            </span>
            <Sparkles size={14} className="text-gold" />
          </div>
          <h2 className="text-2xl font-black text-navy tracking-tight">
            Class Setup Completed Successfully!
          </h2>
          <p className="text-xs text-zinc-600 leading-relaxed">
            All subjects, students, mentors, and clearance records have been officially initiated for{' '}
            <strong className="text-navy">{targetClass?.name} (Semester {semester})</strong>.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
          <Button
            type="button"
            variant="primary"
            onClick={() => navigate(`/admin/class/${classId}`)}
            className="w-full sm:w-auto min-h-[44px]"
          >
            <ExternalLink size={14} className="mr-1.5" /> View Class Details
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/admin')}
            className="w-full sm:w-auto min-h-[44px]"
          >
            Go to Dashboard
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={onResetWizard}
            className="w-full sm:w-auto min-h-[44px] text-zinc-600 font-bold text-xs"
          >
            <RotateCcw size={14} className="mr-1.5" /> Setup Another Class
          </Button>
        </div>
      </div>
    );
  }

  // PRE-CONFIRMATION REVIEW STATE
  return (
    <div className="space-y-6">
      {/* Initiation Notice Banner */}
      <div className="p-5 rounded-2xl border border-indigo-200 bg-indigo-50/60 flex items-start gap-3.5">
        <Rocket size={22} className="text-indigo-600 shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-950 space-y-1">
          <p className="font-extrabold text-sm text-indigo-950">
            Final Confirmation: Launch No-Due Cycle
          </p>
          <p className="text-indigo-800 leading-relaxed">
            You are about to launch the official No-Due clearance cycle for this section.
            All enrolled students will have clearance requests generated for each configured subject,
            department laboratory, and faculty approver.
          </p>
        </div>
      </div>

      {/* Configuration Summary Card */}
      <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-navy">
          Verified Configuration Summary
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-white border border-zinc-200/80">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Class Section</span>
            <p className="font-black text-navy text-sm mt-0.5">{targetClass?.name}</p>
          </div>
          <div className="p-3 rounded-xl bg-white border border-zinc-200/80">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Target Semester</span>
            <p className="font-black text-navy text-sm mt-0.5">Semester {semester}</p>
          </div>
          <div className="p-3 rounded-xl bg-white border border-zinc-200/80">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Department</span>
            <p className="font-black text-navy text-sm mt-0.5 truncate">{deptName}</p>
          </div>
          <div className="p-3 rounded-xl bg-white border border-zinc-200/80">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Academic Batch</span>
            <p className="font-black text-navy text-sm mt-0.5">{targetClass?.academicYear || 'Current'}</p>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-6 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
          disabled={isInitiating}
          className="w-full sm:w-auto min-h-[44px]"
        >
          ← Back
        </Button>

        <Button
          type="button"
          variant="primary"
          onClick={handleInitiate}
          disabled={isInitiating}
          loading={isInitiating}
          className="w-full sm:w-72 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white font-black"
        >
          {isInitiating ? 'Initiating Cycle...' : 'Launch No-Due Batch 🚀'}
        </Button>
      </div>
    </div>
  );
};

export default Step7Initiation;

