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
  UserX,
} from 'lucide-react';

export default function BulkPromoteCohortModal({
  isOpen,
  onClose,
  departmentId,
  initialSemester = 4,
  onSuccess,
}) {
  const [selectedSemester, setSelectedSemester] = useState(initialSemester);
  const [targetSemester, setTargetSemester] = useState(
    initialSemester < 8 ? Number(initialSemester) + 1 : Number(initialSemester)
  );
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cohortData, setCohortData] = useState(null);
  const [mappings, setMappings] = useState({});
  const [selectedClassIds, setSelectedClassIds] = useState(new Set());
  const [resetFaculty, setResetFaculty] = useState(true);
  const [resetElectives, setResetElectives] = useState(true);
  const [error, setError] = useState(null);

  // Sync initialSemester when changed
  useEffect(() => {
    if (initialSemester) {
      const s = Number(initialSemester);
      setSelectedSemester(s);
      setTargetSemester(s < 8 ? s + 1 : s);
    }
  }, [initialSemester]);

  // Fetch cohort promotion preview
  const fetchPreview = (srcSem, tgtSem) => {
    if (!srcSem) return;
    setLoading(true);
    setError(null);

    const params = { semester: srcSem, targetSemester: tgtSem || srcSem + 1 };
    if (departmentId) params.departmentId = departmentId;

    getCohortPromotionPreview(params)
      .then((res) => {
        const payload = res?.data || res;
        const data = payload?.classes ? payload : (payload?.data || payload);

        if (data && Array.isArray(data.classes)) {
          setCohortData(data);
          // Initialize mappings with recommended targets and select eligible classes
          const initialMap = {};
          const eligibleIds = [];

          data.classes.forEach((item) => {
            const sId = item.sourceClass?._id;
            if (sId) {
              initialMap[sId] = item.recommendedTargetClassId || '';
              if (!item.sourceClass?.hasActiveBatch) {
                eligibleIds.push(sId);
              }
            }
          });

          setMappings(initialMap);
          setSelectedClassIds(new Set(eligibleIds));
        } else {
          setCohortData(null);
          setMappings({});
          setSelectedClassIds(new Set());
        }
      })
      .catch((err) => {
        const msg = err?.message || err?.response?.data?.message || 'Failed to load cohort preview';
        setError(msg);
        setCohortData(null);
        setSelectedClassIds(new Set());
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen) {
      fetchPreview(selectedSemester, targetSemester);
    }
  }, [isOpen, departmentId, selectedSemester, targetSemester]);

  // Compute eligible classes (those without active batches)
  const eligibleClasses = useMemo(() => {
    return (cohortData?.classes || []).filter((item) => !item.sourceClass?.hasActiveBatch);
  }, [cohortData]);

  // Selection state helpers
  const isAllEligibleSelected =
    eligibleClasses.length > 0 &&
    eligibleClasses.every((item) => selectedClassIds.has(item.sourceClass?._id));

  const isPartiallySelected =
    selectedClassIds.size > 0 && !isAllEligibleSelected;

  const handleToggleAll = () => {
    if (isAllEligibleSelected) {
      setSelectedClassIds(new Set());
    } else {
      setSelectedClassIds(new Set(eligibleClasses.map((item) => item.sourceClass?._id)));
    }
  };

  const handleToggleClass = (classId) => {
    setSelectedClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) {
        next.delete(classId);
      } else {
        next.add(classId);
      }
      return next;
    });
  };

  // Selected classes calculation
  const selectedClasses = useMemo(() => {
    if (!cohortData?.classes) return [];
    return cohortData.classes.filter((item) => selectedClassIds.has(item.sourceClass?._id));
  }, [cohortData, selectedClassIds]);

  const selectedStudentsCount = useMemo(() => {
    return selectedClasses.reduce((sum, item) => sum + (item.sourceClass?.studentCount || 0), 0);
  }, [selectedClasses]);

  const totalCohortStudents = useMemo(() => {
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

  const hasUnmappedSelected = useMemo(() => {
    if (selectedClasses.length === 0) return false;
    return selectedClasses.some((item) => !mappings[item.sourceClass?._id]);
  }, [selectedClasses, mappings]);

  const handleSubmit = async () => {
    if (!cohortData?.classes || cohortData.classes.length === 0) {
      toast.error('No classes available to promote');
      return;
    }

    if (selectedClasses.length === 0) {
      toast.error('Please select at least one section to promote');
      return;
    }

    // Verify all selected source classes have a target mapped
    const promotions = [];
    for (const item of selectedClasses) {
      const src = item.sourceClass;
      const srcId = src?._id;
      const tgtId = mappings[srcId];

      if (!tgtId) {
        toast.error(`Please assign a destination class for ${src?.name || 'selected section'}`);
        return;
      }

      if (src?.hasActiveBatch) {
        toast.error(`Cannot promote ${src?.name} while clearance batch is active`);
        return;
      }

      promotions.push({
        sourceClassId: srcId,
        targetClassId: tgtId,
        resetElectives,
        resetFaculty,
      });
    }

    try {
      setSubmitting(true);
      setError(null);

      const res = await bulkPromoteClasses({
        departmentId: cohortData.departmentId || departmentId,
        promotions,
        resetElectives,
        resetFaculty,
      });

      const msg =
        res?.data?.message ||
        res?.message ||
        `Successfully promoted ${selectedStudentsCount} students across ${promotions.length} classes.`;
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
      preventClose={submitting}
    >
      <div className="space-y-6">
        {/* Semester Selection & Description */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-muted/20 border border-muted/30">
          <div>
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Layers size={16} className="text-primary" />
              Promote Semester Sections Simultaneously
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Advance selected sections to the next academic level without navigating into individual classes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Source:</span>
              <select
                className="text-xs font-bold bg-background border border-border rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={selectedSemester}
                onChange={(e) => {
                  const s = Number(e.target.value);
                  setSelectedSemester(s);
                  setTargetSemester(s < 8 ? s + 1 : s);
                }}
                disabled={loading || submitting}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((s) => (
                  <option key={s} value={s}>
                    Sem {s}
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight size={14} className="text-muted-foreground hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Destination:</span>
              <select
                className="text-xs font-bold bg-background border border-border rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={targetSemester}
                onChange={(e) => setTargetSemester(Number(e.target.value))}
                disabled={loading || submitting}
              >
                {[2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>
                    Sem {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Missing Target Sections Alert */}
        {cohortData?.missingTargetSections?.length > 0 && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle size={15} className="text-amber-500 shrink-0" />
              <span>Missing Target Sections in Semester {targetSemester}</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              The following section{cohortData.missingTargetSections.length > 1 ? 's do' : ' does'} not exist yet in Semester {targetSemester}:{' '}
              <strong className="font-semibold text-foreground">{cohortData.missingTargetSections.join(', ')}</strong>.
              Ensure destination classes are created before assigning students to them.
            </p>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-xl text-xs flex items-center gap-2 font-medium">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Active Clearance Batch Notice */}
        {hasAnyActiveBatch && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-1.5 text-xs text-amber-700 dark:text-amber-300">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
              <span>In-Flight Clearance Session Detected</span>
            </div>
            <p className="leading-relaxed">
              Sections with an active clearance batch are locked to prevent academic disruption. You can uncheck them and promote the remaining ready sections.
            </p>
          </div>
        )}

        {/* Loading Spinner */}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <Spinner size="lg" />
            <p className="text-xs text-muted-foreground font-medium">Loading semester classes and candidate destinations...</p>
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
              <div className="grid grid-cols-12 bg-muted/40 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground items-center">
                <div className="col-span-1 flex items-center">
                  <input
                    type="checkbox"
                    checked={isAllEligibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isPartiallySelected;
                    }}
                    onChange={handleToggleAll}
                    disabled={submitting || eligibleClasses.length === 0}
                    className="rounded border-border text-primary focus:ring-primary/30 w-3.5 h-3.5 cursor-pointer disabled:opacity-40"
                    title="Toggle all eligible sections"
                  />
                </div>
                <div className="col-span-5">Source Section (Semester {selectedSemester})</div>
                <div className="col-span-1 text-center"></div>
                <div className="col-span-5">Destination Target Section</div>
              </div>

              {cohortData.classes.map((item) => {
                const src = item.sourceClass;
                const selectedTargetId = mappings[src._id] || '';
                const isSelected = selectedClassIds.has(src._id);

                return (
                  <div
                    key={src._id}
                    className={`grid grid-cols-12 items-center px-4 py-3.5 gap-2 transition-colors ${
                      src.hasActiveBatch
                        ? 'bg-amber-500/5 opacity-75'
                        : isSelected
                        ? 'hover:bg-muted/10'
                        : 'opacity-50 bg-muted/5'
                    }`}
                  >
                    {/* Checkbox */}
                    <div className="col-span-1 flex items-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleClass(src._id)}
                        disabled={submitting || src.hasActiveBatch}
                        className="rounded border-border text-primary focus:ring-primary/30 w-3.5 h-3.5 cursor-pointer disabled:opacity-40"
                      />
                    </div>

                    {/* Source Section Info */}
                    <div className="col-span-5 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{src.name}</span>
                        {src.hasActiveBatch ? (
                          <Badge variant="warning" className="text-[9px] py-0">Batch Active</Badge>
                        ) : isSelected ? (
                          <Badge variant="outline" className="text-[9px] py-0 text-emerald-600 border-emerald-500/30">Selected</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[9px] py-0">Excluded</Badge>
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
                    <div className="col-span-5">
                      {allTargetCandidates.length === 0 ? (
                        <p className="text-xs text-destructive font-medium">No target classes found</p>
                      ) : (
                        <select
                          className={`w-full text-xs font-semibold bg-background border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                            isSelected && !selectedTargetId ? 'border-amber-500/60 ring-1 ring-amber-500/20' : 'border-border'
                          }`}
                          value={selectedTargetId}
                          onChange={(e) => handleTargetChange(src._id, e.target.value)}
                          disabled={submitting || src.hasActiveBatch || !isSelected}
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

            {/* Options Toggles */}
            <div className="space-y-2.5">
              {/* Reset Faculty Mentors Toggle */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/20 border border-muted/30 cursor-pointer select-none text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-muted-foreground/30 text-primary focus:ring-primary"
                  checked={resetFaculty}
                  onChange={(e) => setResetFaculty(e.target.checked)}
                  disabled={submitting}
                />
                <div className="space-y-0.5">
                  <span className="font-bold text-foreground">Reset assigned faculty mentors</span>
                  <p className="text-[11px] text-muted-foreground">
                    Recommended. Clears previous semester faculty mentor allocations so students can be mapped to new mentors in the new class/academic year.
                  </p>
                </div>
              </label>

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
                    Recommended. Clears past elective selections and elective faculty assignments so students can be mapped to new semester electives.
                  </p>
                </div>
              </label>
            </div>

            {/* Disturbance-Free Guarantee */}
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
              <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
              <span>
                <strong>Disturbance-Free Guarantee:</strong> All past closed clearance records and faculty approvals remain permanently archived in student histories.
              </span>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border/40">
          <div className="text-xs text-muted-foreground">
            {cohortData?.classes?.length ? (
              <span>
                <strong>{selectedClasses.length}</strong> of {cohortData.classes.length} sections selected • <strong>{selectedStudentsCount}</strong> of {totalCohortStudents} students ready
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
                selectedClasses.length === 0 ||
                allTargetCandidates.length === 0 ||
                hasUnmappedSelected
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
                  <span>
                    Promote {selectedClasses.length} Section{selectedClasses.length !== 1 ? 's' : ''} ({selectedStudentsCount} Students)
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
