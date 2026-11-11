import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';
import { getDepartmentRolloverPreview, executeDepartmentRollover } from '../../api/classes';
import { toast } from 'react-hot-toast';
import {
  GraduationCap,
  Layers,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  XCircle,
} from 'lucide-react';

export default function DepartmentRolloverModal({
  isOpen,
  onClose,
  departmentId,
  departmentName,
  onSuccess,
}) {
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [error, setError] = useState(null);

  // Configuration options
  const [autoCreateMissing, setAutoCreateMissing] = useState(true);
  const [resetElectives, setResetElectives] = useState(true);
  const [resetFaculty, setResetFaculty] = useState(true);
  const [confirmStep, setConfirmStep] = useState(false);

  const fetchPreview = () => {
    if (!departmentId) return;
    setLoading(true);
    setError(null);

    getDepartmentRolloverPreview({ departmentId })
      .then((res) => {
        const payload = res?.data?.data || res?.data || res;
        setPreviewData(payload);
      })
      .catch((err) => {
        const msg = err?.message || err?.response?.data?.message || 'Failed to load department rollover preview';
        setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen) {
      setConfirmStep(false);
      fetchPreview();
    }
  }, [isOpen, departmentId]);

  const hasActiveBatch = useMemo(() => {
    return (previewData?.blockedByActiveBatchCount || 0) > 0;
  }, [previewData]);

  const handleExecute = async () => {
    if (hasActiveBatch) {
      toast.error('Cannot execute rollover while active clearance batches exist');
      return;
    }

    setExecuting(true);
    try {
      const res = await executeDepartmentRollover({
        departmentId,
        autoCreateMissingSections: autoCreateMissing,
        resetElectives,
        resetFaculty,
      });

      const data = res?.data?.data || res?.data || {};
      toast.success(
        res?.data?.message ||
          `Department Rollover completed: ${data.totalAdvancing || 0} students advanced, ${data.totalGraduated || 0} graduated!`
      );
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      const msg = err?.message || err?.response?.data?.message || 'Failed to execute department rollover';
      toast.error(msg);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !executing && onClose()}
      title={
        <div>
          <div className="flex items-center gap-2">
            <Layers className="text-indigo-600" size={20} />
            <span>Department Academic Rollover</span>
          </div>
          <p className="text-xs font-semibold text-slate-500 mt-0.5 tracking-normal">
            {departmentName ? `${departmentName} Department · ` : ''}Department Promotion Review & Simulation
          </p>
        </div>
      }
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={executing}>
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            {!confirmStep ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setConfirmStep(true)}
                disabled={loading || hasActiveBatch || !previewData}
              >
                <Layers size={14} /> Review & Proceed to Rollover
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => setConfirmStep(false)} disabled={executing}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleExecute}
                  disabled={executing || hasActiveBatch}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20"
                >
                  {executing ? (
                    <>
                      <Spinner size="xs" /> Executing Rollover...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} /> Confirm & Execute ({previewData?.advancingStudents || 0} Students)
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-3">
            <Spinner size="lg" />
            <p className="text-xs text-slate-500 font-medium">
              Scanning department semesters, student rosters, and active batches...
            </p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 space-y-2">
            <div className="flex items-center gap-2 font-bold text-xs">
              <AlertTriangle size={16} />
              <span>Failed to load department rollover preview</span>
            </div>
            <p className="text-xs text-red-600">{error}</p>
            <Button size="sm" variant="secondary" onClick={fetchPreview}>
              <RefreshCw size={13} className="mr-1.5" /> Try Again
            </Button>
          </div>
        ) : previewData ? (
          <>
            {/* Top Stat Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Advancing</span>
                <span className="text-2xl font-black text-navy">{previewData.advancingStudents || 0}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Students</span>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Graduating</span>
                <span className={`text-2xl font-black ${previewData.graduatingStudents > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {previewData.graduatingStudents || 0}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Final Year (Sem 8)</span>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Semesters</span>
                <span className="text-2xl font-black text-navy">{previewData.totalSemesters || 0}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Active Cohorts</span>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Sections</span>
                <span className="text-2xl font-black text-navy">{previewData.totalSections || 0}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Total Classes</span>
              </div>
            </div>

            {/* Active Batch Blocker Banner */}
            {hasActiveBatch && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2.5">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <div className="space-y-0.5 text-xs">
                  <p className="font-bold uppercase tracking-wider text-[11px]">Clearance In Progress</p>
                  <p className="text-[11px] text-rose-700 leading-relaxed">
                    One or more classes currently have an active clearance batch. Rollover is locked until existing clearance batches are completed.
                  </p>
                </div>
              </div>
            )}

            {/* Missing Sections Notice */}
            {(previewData.missingSectionsCount || 0) > 0 && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                <p className="font-medium text-[11px] leading-tight">
                  <span className="font-bold">{previewData.missingSectionsCount} destination section(s)</span> do not exist yet. With <span className="font-semibold underline">Auto-Create</span> enabled, the engine will automatically establish them and hydrate curriculum from each semester&apos;s Master Class.
                </p>
              </div>
            )}

            {/* Waterfall Progression List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-navy">
                <span className="uppercase tracking-wider text-[11px] text-slate-500 font-bold">
                  Promotion Order (Higher Semesters First)
                </span>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ShieldCheck size={12} /> Vacate-First Order Guaranteed
                </span>
              </div>

              <div className="space-y-2 max-h-[32vh] overflow-y-auto pr-1">
                {(previewData.transitions || []).map((t, idx) => (
                  <div key={idx} className="p-3 bg-white rounded-xl border border-slate-200/90 shadow-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-navy text-white text-[10px] font-black">
                          S{t.sourceSemester}
                        </span>
                        <ArrowRight size={13} className="text-slate-400" />
                        {t.isGraduating ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-black flex items-center gap-1">
                            <GraduationCap size={12} /> Graduated
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-black">
                            S{t.targetSemester}
                          </span>
                        )}
                        <span className="text-xs font-bold text-navy">
                          {t.isGraduating ? `Semester ${t.sourceSemester} Final Year Alumni` : `Semester ${t.sourceSemester} ➔ Semester ${t.targetSemester}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-500 font-semibold">{t.sourceSections.length} Sections</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-navy font-bold">{t.totalStudents} Students</span>
                      </div>
                    </div>

                    {/* Section pills */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {t.sourceSections.map((sec) => (
                        <span
                          key={sec._id}
                          className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-700 flex items-center gap-1"
                        >
                          {sec.name} <span className="text-slate-400 font-normal">({sec.studentCount})</span>
                          {sec.hasActiveBatch && (
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title="Active Clearance Batch" />
                          )}
                        </span>
                      ))}
                      {t.missingSections && t.missingSections.length > 0 && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                          + Auto-creates: {t.missingSections.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Options Toggles */}
            <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Migration Settings
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoCreateMissing}
                    onChange={(e) => setAutoCreateMissing(e.target.checked)}
                    disabled={executing}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 w-3.5 h-3.5"
                  />
                  <span className="text-[11px] font-semibold text-slate-700">Auto-create missing sections</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={resetElectives}
                    onChange={(e) => setResetElectives(e.target.checked)}
                    disabled={executing}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 w-3.5 h-3.5"
                  />
                  <span className="text-[11px] font-semibold text-slate-700">Reset past electives</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={resetFaculty}
                    onChange={(e) => setResetFaculty(e.target.checked)}
                    disabled={executing}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 w-3.5 h-3.5"
                  />
                  <span className="text-[11px] font-semibold text-slate-700">Reset mentor assignments</span>
                </label>
              </div>
            </div>

            {/* Confirmation Banner if confirm step */}
            {confirmStep && (
              <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-900">
                  <Sparkles size={15} className="text-indigo-600" />
                  <span>Final Confirmation: Execute Department Rollover</span>
                </div>
                <p className="text-[11px] text-indigo-700 leading-relaxed">
                  This operation will advance all {previewData.advancingStudents || 0} active students in this department in semester progression order. Final-year Sem 8 students will be marked as Graduated. All past clearance approvals remain permanently archived.
                </p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
