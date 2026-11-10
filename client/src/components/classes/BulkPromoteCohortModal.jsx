import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Spinner from '../ui/Spinner';
import { getCohortPromotionPreview, bulkPromoteClasses } from '../../api/classes';
import { toast } from 'react-hot-toast';
import {
  GraduationCap,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Users,
  CheckCircle2,
  RefreshCw,
  Layers,
} from 'lucide-react';

export default function BulkPromoteCohortModal({
  isOpen,
  onClose,
  departmentId,
  initialSemester = 4,
  onSuccess,
}) {
  const [selectedSemester, setSelectedSemester] = useState(initialSemester);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cohortData, setCohortData] = useState(null);
  const [mappings, setMappings] = useState({});
  const [resetElectives, setResetElectives] = useState(true);
  const [error, setError] = useState(null);

  // Sync initialSemester when changed
  useEffect(() => {
    if (initialSemester) {
      setSelectedSemester(Number(initialSemester));
    }
  }, [initialSemester]);

  // Fetch cohort promotion preview
  const fetchPreview = (sem) => {
    if (!departmentId || !sem) return;
    setLoading(true);
    setError(null);

    getCohortPromotionPreview({ departmentId, semester: sem })
      .then((res) => {
        const payload = res?.data || res;
        const data = payload?.classes ? payload : (payload?.data || payload);

        if (data && Array.isArray(data.classes)) {
          setCohortData(data);
          // Initialize mappings with recommended targets
          const initialMap = {};
          data.classes.forEach((item) => {
            if (item.sourceClass?._id) {
              initialMap[item.sourceClass._id] = item.recommendedTargetClassId || '';
            }
          });
          setMappings(initialMap);
        } else {
          setCohortData(null);
          setMappings({});
        }
      })
      .catch((err) => {
        const msg = err?.message || err?.response?.data?.message || 'Failed to load cohort preview';
        setError(msg);
        setCohortData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen && departmentId) {
      fetchPreview(selectedSemester);
    }
  }, [isOpen, departmentId, selectedSemester]);

  // Compute aggregate totals
  const totalStudents = useMemo(() => {
    if (!cohortData?.classes) return 0;
    return cohortData.classes.reduce((sum, item) => sum + (item.sourceClass?.studentCount || 0), 0);
  }, [cohortData]);

  const hasAnyActiveBatch = useMemo(() => {
    if (!cohortData?.classes) return false;
    return cohortData.classes.some((item) => item.sourceClass?.hasActiveBatch);
  }, [cohortData]);

  const allTargetCandidates = cohortData?.candidateTargetClasses || [];

  const handleTargetChange = (sourceClassId, targetClassId) => {
    setMappings((prev) => ({
      ...prev,
      [sourceClassId]: targetClassId,
    }));
  };

  const handleSubmit = async () => {
    if (!cohortData?.classes || cohortData.classes.length === 0) {
      toast.error('No classes available to promote');
      return;
    }

    if (hasAnyActiveBatch) {
      toast.error('Cannot promote cohort while clearance batches are active');
      return;
    }

    // Verify all source classes have a target mapped
    const promotions = [];
    for (const item of cohortData.classes) {
      const srcId = item.sourceClass?._id;
      const tgtId = mappings[srcId];
      if (!tgtId) {
        toast.error(`Please assign a destination class for ${item.sourceClass?.name}`);
        return;
      }
      promotions.push({
        sourceClassId: srcId,
        targetClassId: tgtId,
        resetElectives,
      });
    }

    try {
      setSubmitting(true);
      setError(null);

      const res = await bulkPromoteClasses({
        departmentId,
        promotions,
        resetElectives,
      });

      const msg = res?.data?.message || res?.message || `Successfully promoted ${totalStudents} students across ${promotions.length} classes.`;
      toast.success(msg);

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      const msg = err?.message || err?.response?.data?.message || 'Cohort promotion failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Promote Semester Cohort"
      size="xl"
    >
      <div className="space-y-6">
        {/* Semester Selection & Description */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-muted/20 border border-muted/30">
          <div>
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Layers size={16} className="text-primary" />
              Promote All Sections Simultaneously
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Advance an entire semester cohort to the next academic level without navigating into individual sections.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Source Semester:</span>
            <select
              className="text-xs font-bold bg-background border border-border rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(Number(e.target.value))}
              disabled={loading || submitting}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((s) => (
                <option key={s} value={s}>
                  Semester {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-xl text-xs flex items-center gap-2 font-medium">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Active Clearance Batch Warning */}
        {hasAnyActiveBatch && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-1.5 text-xs text-amber-700 dark:text-amber-300">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
              <span>In-Flight Clearance Session Detected</span>
            </div>
            <p className="leading-relaxed">
              One or more sections in Semester {selectedSemester} currently have an active NoDues batch. Cohort promotion is locked until the active clearance session is closed to ensure zero academic disruption.
            </p>
          </div>
        )}

        {/* Loading Spinner */}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <Spinner size="lg" />
            <p className="text-xs text-muted-foreground font-medium">Loading semester classes and candidate mappings...</p>
          </div>
        ) : !cohortData?.classes || cohortData.classes.length === 0 ? (
          <div className="py-12 text-center space-y-2 border border-dashed border-border rounded-2xl p-6">
            <Users size={36} className="mx-auto text-muted-foreground/40" />
            <p className="text-sm font-semibold text-foreground">No Active Classes Found in Semester {selectedSemester}</p>
            <p className="text-xs text-muted-foreground">Select another semester above to review available cohorts.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Class Mapping Grid */}
            <div className="border border-border/60 rounded-2xl overflow-hidden divide-y divide-border/40 bg-card">
              <div className="grid grid-cols-12 bg-muted/40 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                <div className="col-span-5">Source Section (Semester {selectedSemester})</div>
                <div className="col-span-1 text-center"></div>
                <div className="col-span-6">Destination Target Section</div>
              </div>

              {cohortData.classes.map((item) => {
                const src = item.sourceClass;
                const selectedTargetId = mappings[src._id] || '';

                return (
                  <div
                    key={src._id}
                    className={`grid grid-cols-12 items-center px-4 py-3.5 gap-2 transition-colors ${
                      src.hasActiveBatch ? 'bg-amber-500/5' : 'hover:bg-muted/10'
                    }`}
                  >
                    {/* Source Section Info */}
                    <div className="col-span-5 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{src.name}</span>
                        {src.hasActiveBatch ? (
                          <Badge variant="warning" className="text-[9px] py-0">Batch Active</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] py-0">Ready</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>AY {src.academicYear}</span>
                        <span>•</span>
                        <span className="font-semibold text-foreground">{src.studentCount} Students</span>
                      </div>
                    </div>

                    {/* Transition Arrow */}
                    <div className="col-span-1 flex justify-center text-muted-foreground">
                      <ArrowRight size={16} />
                    </div>

                    {/* Destination Class Dropdown */}
                    <div className="col-span-6">
                      {allTargetCandidates.length === 0 ? (
                        <p className="text-xs text-destructive font-medium">No target classes found</p>
                      ) : (
                        <select
                          className="w-full text-xs font-semibold bg-background border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                          value={selectedTargetId}
                          onChange={(e) => handleTargetChange(src._id, e.target.value)}
                          disabled={submitting || src.hasActiveBatch}
                        >
                          <option value="">-- Choose Target Class --</option>
                          {allTargetCandidates.map((tc) => (
                            <option key={tc._id} value={tc._id}>
                              {tc.name} (Sem {tc.semester} • AY {tc.academicYear})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reset Electives Toggle */}
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/20 border border-muted/30 cursor-pointer select-none text-xs">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-muted-foreground/30 text-primary focus:ring-primary"
                checked={resetElectives}
                onChange={(e) => setResetElectives(e.target.checked)}
                disabled={submitting}
              />
              <div className="space-y-0.5">
                <span className="font-bold text-foreground">Reset previous semester electives</span>
                <p className="text-[11px] text-muted-foreground">
                  Clears past elective selections so students can be mapped to new semester electives.
                </p>
              </div>
            </label>

            {/* Disturbance-Free Guarantee */}
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
              <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
              <span>
                <strong>Disturbance-Free Guarantee:</strong> All past closed clearance records and faculty approvals remain permanently archived.
              </span>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border/40">
          <div className="text-xs text-muted-foreground">
            {cohortData?.classes?.length ? (
              <span>
                <strong>{cohortData.classes.length}</strong> sections • <strong>{totalStudents}</strong> students ready
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={
                loading ||
                submitting ||
                hasAnyActiveBatch ||
                !cohortData?.classes?.length ||
                allTargetCandidates.length === 0
              }
              className="gap-1.5"
            >
              {submitting ? (
                <>
                  <Spinner size="xs" />
                  <span>Promoting Cohort...</span>
                </>
              ) : (
                <>
                  <GraduationCap size={15} />
                  <span>Promote {cohortData?.classes?.length || 0} Sections ({totalStudents} Students)</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
