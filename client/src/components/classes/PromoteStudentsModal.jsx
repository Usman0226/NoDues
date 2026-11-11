import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Spinner from '../ui/Spinner';
import { getPromotionCandidates, promoteStudents } from '../../api/classes';
import { toast } from 'react-hot-toast';
import {
  GraduationCap,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Search,
  CheckSquare,
  Square,
  Users,
  CheckCircle2,
  Info,
} from 'lucide-react';

export default function PromoteStudentsModal({
  isOpen,
  onClose,
  classId,
  onSuccess,
  preselectedStudentIds = [],
}) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sourceClass, setSourceClass] = useState(null);
  const [targetClasses, setTargetClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedTargetClassId, setSelectedTargetClassId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
  const [resetElectives, setResetElectives] = useState(true);
  const [resetFaculty, setResetFaculty] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);

  // Fetch candidate classes and students on modal open
  useEffect(() => {
    if (!isOpen || !classId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    getPromotionCandidates(classId)
      .then((res) => {
        if (!isMounted) return;
        // Handle axiosInstance response unwrap: res could be { success, data: { sourceClass, ... } } or already unwrapped
        const payload = res?.data || res;
        const data = payload?.sourceClass ? payload : (payload?.data || payload);
        if (data && data.sourceClass) {
          setSourceClass(data.sourceClass || null);
          setTargetClasses(data.targetClasses || []);
          setStudents(data.students || []);

          // Pre-select recommended target class if available
          if (data.recommendedTargetClassId) {
            setSelectedTargetClassId(data.recommendedTargetClassId);
          } else if (data.targetClasses?.length > 0) {
            setSelectedTargetClassId(data.targetClasses[0]._id);
          }

          // Initial selection: if preselectedStudentIds provided, select those; otherwise all active students
          if (preselectedStudentIds && preselectedStudentIds.length > 0) {
            setSelectedStudentIds(new Set(preselectedStudentIds));
          } else {
            const allIds = (data.students || []).map((s) => s._id);
            setSelectedStudentIds(new Set(allIds));
          }
        } else {
          setError('Failed to load promotion candidate data');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        const msg = err?.message || err?.response?.data?.message || 'Failed to load promotion data';
        setError(msg);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, classId, preselectedStudentIds]);

  // Target class details
  const targetClass = useMemo(() => {
    return targetClasses.find((tc) => tc._id === selectedTargetClassId) || null;
  }, [targetClasses, selectedTargetClassId]);

  // Filter students based on search
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase().trim();
    return students.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.rollNo || '').toLowerCase().includes(q)
    );
  }, [students, searchQuery]);

  // Selection helpers
  const isAllSelected = students.length > 0 && selectedStudentIds.size === students.length;
  const isPartiallySelected = selectedStudentIds.size > 0 && selectedStudentIds.size < students.length;

  const handleToggleAll = () => {
    if (isAllSelected) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(students.map((s) => s._id)));
    }
  };

  const handleToggleStudent = (studentId) => {
    const next = new Set(selectedStudentIds);
    if (next.has(studentId)) {
      next.delete(studentId);
    } else {
      next.add(studentId);
    }
    setSelectedStudentIds(next);
  };

  const handleSubmit = async () => {
    if (!selectedTargetClassId) {
      toast.error('Please choose a target class');
      return;
    }

    if (selectedStudentIds.size === 0) {
      toast.error('Please select at least one student to promote');
      return;
    }

    if (sourceClass?.hasActiveBatch) {
      toast.error('Cannot promote students while a clearance batch is active for this class');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        targetClassId: selectedTargetClassId,
        studentIds: Array.from(selectedStudentIds),
        resetElectives,
        resetFaculty,
      };

      const res = await promoteStudents(classId, payload);
      const msg = res?.data?.message || res?.message || `Successfully promoted ${selectedStudentIds.size} students.`;
      toast.success(msg);

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      const msg = err?.message || err?.response?.data?.message || 'Promotion failed';
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
      title="Promote Class / Section Migration"
      size="lg"
      preventClose={submitting}
    >
      <div className="space-y-5 text-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Spinner size="lg" />
            <p className="text-xs text-muted-foreground font-mono">Loading class records & candidate destinations...</p>
          </div>
        ) : error && !sourceClass ? (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-5 h-5" />
              <span>Failed to load promotion data</span>
            </div>
            <p className="text-xs">{error}</p>
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <>
            {/* Active Batch Warning */}
            {sourceClass?.hasActiveBatch && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wider">Active Clearance Batch In Progress</p>
                  <p className="text-xs">
                    This class currently has an active NoDues batch running. To prevent disturbance to live approvals, students cannot be promoted until the current batch is completed or closed.
                  </p>
                </div>
              </div>
            )}

            {/* Source & Destination Transition Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
              {/* Source Card */}
              <div className="p-4 rounded-2xl bg-muted/20 border border-muted/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Source Class</span>
                  <Badge variant="outline" className="text-[10px]">Sem {sourceClass?.semester}</Badge>
                </div>
                <h4 className="text-base font-bold text-foreground">{sourceClass?.name}</h4>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>AY {sourceClass?.academicYear}</span>
                  <span>•</span>
                  <span>{students.length} Enrolled</span>
                </div>
              </div>

              {/* Target Class Selector Card */}
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest font-black text-primary">Destination Class</span>
                  {targetClass && (
                    <Badge variant="primary" className="text-[10px]">Sem {targetClass.semester}</Badge>
                  )}
                </div>

                {targetClasses.length === 0 ? (
                  <p className="text-xs text-destructive font-medium">No active destination classes found in this department.</p>
                ) : (
                  <select
                    className="w-full text-sm font-semibold bg-background border border-border rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={selectedTargetClassId}
                    onChange={(e) => setSelectedTargetClassId(e.target.value)}
                    disabled={submitting}
                  >
                    {targetClasses.map((tc) => (
                      <option key={tc._id} value={tc._id}>
                        {tc.name} (Sem {tc.semester} • AY {tc.academicYear}) — {tc.currentStudentCount} enrolled
                      </option>
                    ))}
                  </select>
                )}

                <div className="text-[11px] text-muted-foreground">
                  {targetClass ? (
                    <span>Promoted students will inherit {targetClass.name}'s semester subjects for future NoDues.</span>
                  ) : (
                    <span>Select destination class</span>
                  )}
                </div>
              </div>
            </div>

            {/* Student Selection Header & Search Bar */}
            <div className="space-y-2 pt-1 border-t border-border/40">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleAll}
                    disabled={submitting || students.length === 0}
                    className="flex items-center gap-2 text-xs font-bold text-foreground hover:text-primary transition-colors cursor-pointer"
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : isPartiallySelected ? (
                      <div className="w-4 h-4 rounded border-2 border-primary bg-primary/20 flex items-center justify-center text-[10px] text-primary font-bold">
                        -
                      </div>
                    ) : (
                      <Square className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span>
                      Select All Students ({selectedStudentIds.size}/{students.length})
                    </span>
                  </button>
                  <span className="text-[11px] text-muted-foreground hidden sm:inline">
                    (Uncheck detained students)
                  </span>
                </div>

                {/* Search Filter */}
                <div className="relative w-full sm:w-56">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search name or roll no..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </div>
              </div>

              {/* Scrollable Student Checklist */}
              <div className="border border-border/60 rounded-xl overflow-hidden max-h-52 overflow-y-auto divide-y divide-border/30 bg-background/50">
                {filteredStudents.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    {searchQuery ? 'No students match your search filter.' : 'No active students found in this class.'}
                  </div>
                ) : (
                  filteredStudents.map((s) => {
                    const checked = selectedStudentIds.has(s._id);
                    return (
                      <label
                        key={s._id}
                        className={`flex items-center justify-between px-3.5 py-2 text-xs cursor-pointer hover:bg-muted/30 transition-colors ${
                          checked ? 'bg-primary/[0.02]' : 'opacity-70 bg-muted/10'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleStudent(s._id)}
                            disabled={submitting}
                            className="rounded border-border text-primary focus:ring-primary/30 w-3.5 h-3.5 cursor-pointer"
                          />
                          <span className="font-mono text-muted-foreground font-semibold">{s.rollNo}</span>
                          <span className="font-medium text-foreground truncate">{s.name}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {checked ? (
                            <span className="text-primary font-semibold">Promoting</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">Retaining</span>
                          )}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Options & Guarantees */}
            <div className="space-y-3 pt-2">
              {/* Reset Faculty Mentors Toggle */}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resetFaculty}
                  onChange={(e) => setResetFaculty(e.target.checked)}
                  disabled={submitting}
                  className="rounded border-border text-primary focus:ring-primary/30 w-4 h-4 mt-0.5"
                />
                <div className="text-xs">
                  <span className="font-semibold text-foreground">Reset assigned faculty mentor</span>
                  <p className="text-[11px] text-muted-foreground">
                    Recommended. Clears previous semester faculty mentor allocation so students can be mapped to new mentors in the new class/academic year.
                  </p>
                </div>
              </label>

              {/* Reset Electives Toggle */}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resetElectives}
                  onChange={(e) => setResetElectives(e.target.checked)}
                  disabled={submitting}
                  className="rounded border-border text-primary focus:ring-primary/30 w-4 h-4 mt-0.5"
                />
                <div className="text-xs">
                  <span className="font-semibold text-foreground">Reset previous semester electives</span>
                  <p className="text-[11px] text-muted-foreground">
                    Recommended. Clears previous year elective allocations so students can be mapped to new year electives (e.g. PE-IV, PE-V, OE-IV).
                  </p>
                </div>
              </label>

              {/* History Preservation Guarantee Banner */}
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center gap-2.5 text-xs">
                <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  <strong>Disturbance-Free Guarantee:</strong> Completed clearance records and approvals from earlier semesters will remain permanently archived in student histories.
                </span>
              </div>
            </div>

            {/* Error banner if any */}
            {error && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                {error}
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-border/40">
              <span className="text-xs text-muted-foreground font-medium">
                {selectedStudentIds.size} of {students.length} students selected
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  loading={submitting}
                  disabled={
                    submitting ||
                    selectedStudentIds.size === 0 ||
                    !selectedTargetClassId ||
                    Boolean(sourceClass?.hasActiveBatch)
                  }
                  icon={GraduationCap}
                >
                  Promote {selectedStudentIds.size} Students
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

