import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Spinner from '../ui/Spinner';
import { getDepartmentRolloverPreview, executeDepartmentRollover } from '../../api/classes';
import { toast } from 'react-hot-toast';
import {
  GraduationCap,
  Layers,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Users,
  CheckCircle2,
  Sparkles,
  Info,
  RefreshCw,
  XCircle,
  HelpCircle,
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
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Layers size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Department Academic Rollover</h3>
            <p className="text-xs text-muted-foreground font-normal">
              {departmentName ? `${departmentName} • ` : ''}Waterfall Progression & Graduation Simulation
            </p>
          </div>
        </div>
      }
      size="xl"
    >
      <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-3">
            <Spinner size="lg" />
            <p className="text-xs text-muted-foreground font-medium">
              Scanning department semesters, student rosters, and active batches...
            </p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle size={18} />
              <span>Failed to load department rollover preview</span>
            </div>
            <p className="text-xs">{error}</p>
            <Button size="sm" variant="outline" onClick={fetchPreview}>
              <RefreshCw size={14} className="mr-1.5" /> Try Again
            </Button>
          </div>
        ) : previewData ? (
          <>
            {/* Top Stat Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                  Advancing
                </span>
                <p className="text-xl font-black text-indigo-950 dark:text-indigo-200 mt-0.5">
                  {previewData.advancingStudents || 0}
                </p>
                <span className="text-[10px] text-muted-foreground">Junior & Senior Students</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Graduating
                </span>
                <p className="text-xl font-black text-emerald-950 dark:text-emerald-200 mt-0.5">
                  {previewData.graduatingStudents || 0}
                </p>
                <span className="text-[10px] text-muted-foreground">Final Year Sem 8</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-border">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Semesters
                </span>
                <p className="text-xl font-black text-foreground mt-0.5">
                  {previewData.totalSemesters || 0}
                </p>
                <span className="text-[10px] text-muted-foreground">Active Cohorts</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-border">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Sections
                </span>
                <p className="text-xl font-black text-foreground mt-0.5">
                  {previewData.totalSections || 0}
                </p>
                <span className="text-[10px] text-muted-foreground">Total Class Groups</span>
              </div>
            </div>

            {/* Active Batch Blocker Banner */}
            {hasActiveBatch && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-300 flex items-start gap-3">
                <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold uppercase tracking-wider">Active Clearance Batch In Progress</p>
                  <p className="leading-relaxed">
                    One or more classes currently have an active NoDues batch running. To prevent disturbing in-flight approval signatures, Department Rollover is locked until the current batch is completed or closed.
                  </p>
                </div>
              </div>
            )}

            {/* Missing Sections Pre-provision Banner */}
            {(previewData.missingSectionsCount || 0) > 0 && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold uppercase tracking-wider">
                    {previewData.missingSectionsCount} Target Section(s) Missing in Next Semesters
                  </p>
                  <p className="leading-relaxed">
                    Some sections in lower semesters do not exist yet in their destination semester. With &quot;Auto-Create Missing Sections&quot; enabled, the rollover engine will automatically provision them and hydrate their subjects from each semester&apos;s Curriculum Master.
                  </p>
                </div>
              </div>
            )}

            {/* Waterfall Progression List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Top-Down Waterfall Progression Map
                </h4>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <ShieldCheck size={13} /> Vacate-First Order Guaranteed
                </span>
              </div>

              <div className="border border-border/80 rounded-2xl divide-y divide-border/60 bg-card overflow-hidden">
                {(previewData.transitions || []).map((t, idx) => (
                  <div key={idx} className="p-4 space-y-2.5 hover:bg-muted/10 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-navy text-white text-[10px] font-black flex items-center justify-center">
                          S{t.sourceSemester}
                        </span>
                        <ArrowRight size={14} className="text-muted-foreground" />
                        {t.isGraduating ? (
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <GraduationCap size={14} /> Alumni / Graduation
                          </span>
                        ) : (
                          <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">
                            S{t.targetSemester}
                          </span>
                        )}
                        <span className="text-xs font-bold text-foreground ml-1">
                          {t.isGraduating
                            ? `Semester ${t.sourceSemester} Final Year Graduation`
                            : `Semester ${t.sourceSemester} ➔ Semester ${t.targetSemester}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="text-[10px]">
                          {t.sourceSections.length} Sections
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] font-bold">
                          {t.totalStudents} Students
                        </Badge>
                      </div>
                    </div>

                    {/* Section pills */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {t.sourceSections.map((sec) => (
                        <div
                          key={sec._id}
                          className="px-2.5 py-1 rounded-lg bg-muted/40 border border-muted text-[11px] font-medium flex items-center gap-1.5"
                        >
                          <span className="font-semibold text-foreground">{sec.name}</span>
                          <span className="text-[10px] text-muted-foreground">({sec.studentCount} studs)</span>
                          {sec.hasActiveBatch && (
                            <span className="w-2 h-2 rounded-full bg-rose-500" title="Active Batch" />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Missing Sections Alert for this transition */}
                    {t.missingSections && t.missingSections.length > 0 && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                        ✦ Missing in S{t.targetSemester}: {t.missingSections.join(', ')} (Will be auto-created)
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Options Toggles */}
            <div className="p-4 rounded-2xl bg-muted/20 border border-muted/30 space-y-3 text-xs">
              <span className="font-bold text-foreground uppercase tracking-wider text-[10px]">
                Rollover Safety & Migration Settings
              </span>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoCreateMissing}
                  onChange={(e) => setAutoCreateMissing(e.target.checked)}
                  disabled={executing}
                  className="rounded border-border text-primary focus:ring-primary/30 w-4 h-4 cursor-pointer"
                />
                <div>
                  <p className="font-semibold text-foreground">Auto-Provision Missing Target Sections</p>
                  <p className="text-[11px] text-muted-foreground">
                    Automatically creates missing sections in destination semesters and hydrates curriculum from each semester&apos;s Master Class.
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={resetElectives}
                  onChange={(e) => setResetElectives(e.target.checked)}
                  disabled={executing}
                  className="rounded border-border text-primary focus:ring-primary/30 w-4 h-4 cursor-pointer"
                />
                <div>
                  <p className="font-semibold text-foreground">Reset Previous Semester Elective Allocations</p>
                  <p className="text-[11px] text-muted-foreground">
                    Clears earlier semester elective mappings so advancing students can be mapped to fresh new-year electives.
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={resetFaculty}
                  onChange={(e) => setResetFaculty(e.target.checked)}
                  disabled={executing}
                  className="rounded border-border text-primary focus:ring-primary/30 w-4 h-4 cursor-pointer"
                />
                <div>
                  <p className="font-semibold text-foreground">Reset Faculty Mentor Assignments</p>
                  <p className="text-[11px] text-muted-foreground">
                    Resets previous semester student mentors, preparing students for newly assigned mentors in their new semester.
                  </p>
                </div>
              </label>
            </div>

            {/* Confirmation Banner if confirm step */}
            {confirmStep && (
              <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 space-y-2">
                <div className="flex items-center gap-2 font-bold text-indigo-900 dark:text-indigo-200 text-xs">
                  <Sparkles size={16} className="text-indigo-600" />
                  <span>Final Confirmation: Execute Top-Down Academic Rollover</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This operation will advance all eligible active students in this department to their next academic semester in top-down waterfall order. Final-year Sem 8 students will be marked as Graduated. All past clearance batch approvals will remain permanently preserved.
                </p>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Footer Controls */}
      <div className="pt-4 border-t border-border flex items-center justify-between gap-3 mt-4">
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
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5"
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
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 shadow-md shadow-emerald-500/20"
              >
                {executing ? (
                  <>
                    <Spinner size="xs" /> Executing Waterfall Rollover...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} /> Confirm & Execute Rollover
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
