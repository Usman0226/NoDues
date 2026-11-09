import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { previewTimetable, commitTimetable, cloneClassSubjects } from '../../api/wizard';
import { getClasses } from '../../api/classes';
import { getFaculty } from '../../api/faculty';
import FileDropzone from '../ui/FileDropzone';
import Button from '../ui/Button';
import { StepTableSkeleton } from './WizardSkeleton';
import {
  FileText,
  CheckCircle,
  AlertTriangle,
  Ban,
  RotateCcw,
  Upload,
  Copy,
  AlertCircle,
  Check,
  ChevronRight,
  Filter
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const Step2Timetable = ({
  classId,
  targetClass,
  onSave,
  onBack,
  onDirtyChange,
}) => {
  const departmentId = targetClass?.departmentId?._id || targetClass?.departmentId;
  const targetSemester = targetClass?.semester || 1;

  // Active mode: 'upload' | 'clone'
  const [mode, setMode] = useState('upload');

  // Preview state from timetable parser
  const [uploadId, setUploadId] = useState(null);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [isCommitting, setIsCommitting] = useState(false);

  // Clone mode state
  const [cloneSourceClassId, setCloneSourceClassId] = useState('');
  const [isCloning, setIsCloning] = useState(false);

  // Faculty list for inline reassignments
  const { data: facultyRes } = useQuery({
    queryKey: ['wizard', 'faculty', departmentId || 'all'],
    queryFn: () => getFaculty(departmentId ? { departmentId, limit: 100 } : { limit: 100 }),
    enabled: true,
  });
  const facultyList = facultyRes?.data || facultyRes?.faculty || [];

  // Classes list for cloning
  const { data: classRes } = useQuery({
    queryKey: ['wizard', 'classes', 'clone-sources'],
    queryFn: () => getClasses({ limit: 100 }),
    enabled: mode === 'clone',
  });
  const availableClasses = (classRes?.data || classRes?.classes || []).filter(
    (c) => c._id !== classId
  );

  // File drop handler
  const handleFileSelect = async (file) => {
    if (!file) return;
    setIsParsing(true);
    setParseError(null);
    onDirtyChange?.(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('classId', classId);
      formData.append('targetSemester', targetSemester);

      const res = await previewTimetable(formData);
      const data = res?.data || res;

      setUploadId(data.uploadId);
      setSummary(data.summary);

      // Normalize row statuses: ensure every row has a resolved status
      const mappedRows = (data.rows || []).map((r, idx) => {
        let rowStatus = 'needs review';
        if ((r.status === 'matched' || r.facultyMatch === 'matched') && !r.requiresReview) {
          rowStatus = 'matched';
        } else if (r.status === 'excluded' || r.facultyMatch === 'excluded' || r.isExcluded) {
          rowStatus = 'excluded';
        }
        return {
          ...r,
          id: r._id || `row-${idx}`,
          status: rowStatus,
        };
      });

      setRows(mappedRows);
      toast.success(`Parsed ${mappedRows.length} subject rows from timetable.`);
    } catch (err) {
      const msg = err?.message || 'Failed to parse timetable PDF text layer.';
      setParseError(msg);
      toast.error(msg);
    } finally {
      setIsParsing(false);
    }
  };

  // Inline correction: Reassign faculty
  const handleAssignFaculty = (rowId, facultyId) => {
    onDirtyChange?.(true);
    const selectedFac = facultyList.find((f) => f._id === facultyId);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          facultyId: facultyId || null,
          facultyName: selectedFac ? selectedFac.name : r.facultyName,
          matchedFacultyName: selectedFac ? selectedFac.name : null,
          status: facultyId ? 'matched' : 'needs review',
        };
      })
    );
  };

  // Inline correction: Toggle exclude
  const handleToggleExclude = (rowId) => {
    onDirtyChange?.(true);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const newStatus = r.status === 'excluded'
          ? (r.facultyId ? 'matched' : 'needs review')
          : 'excluded';
        return { ...r, status: newStatus };
      })
    );
  };

  // Compute stats
  const flaggedCount = rows.filter((r) => r.status === 'needs review').length;
  const matchedCount = rows.filter((r) => r.status === 'matched').length;
  const excludedCount = rows.filter((r) => r.status === 'excluded').length;
  const canContinue = rows.length > 0 && flaggedCount === 0;

  // Handle Commit & Continue
  const handleCommit = async () => {
    if (!canContinue) {
      toast.error('All flagged rows must be matched with faculty or excluded.');
      return;
    }

    setIsCommitting(true);
    try {
      const confirmedRows = rows.map((r) => ({
        subjectId: r.subjectId,
        subjectName: r.subjectName,
        subjectCode: r.subjectCode,
        facultyId: r.facultyId,
        facultyName: r.facultyName || r.matchedFacultyName,
        coFacultyIds: r.coFacultyIds || [],
        status: r.status,
      }));

      await commitTimetable({
        uploadId,
        classId,
        targetSemester,
        confirmedRows,
      });

      onDirtyChange?.(false);
      toast.success('Timetable subjects committed successfully.');
      onSave({
        step: 'timetable_subjects',
        summary: `${matchedCount} subjects active · ${excludedCount} excluded (Sem ${targetSemester})`,
      });
    } catch (err) {
      toast.error(err?.message || 'Failed to commit timetable subjects.');
    } finally {
      setIsCommitting(false);
    }
  };

  // Handle Clone Structure
  const handleClone = async () => {
    if (!cloneSourceClassId) {
      toast.error('Please select a source class to clone subjects from.');
      return;
    }

    setIsCloning(true);
    try {
      await cloneClassSubjects(classId, cloneSourceClassId);
      onDirtyChange?.(false);
      const src = availableClasses.find((c) => c._id === cloneSourceClassId);
      toast.success(`Cloned subject structure from ${src?.name || 'source class'}.`);
      onSave({
        step: 'timetable_subjects',
        summary: `Cloned structure from ${src?.name || 'Class'} (Sem ${targetSemester})`,
      });
    } catch (err) {
      toast.error(err?.message || 'Failed to clone class subjects.');
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher: Upload PDF vs Clone */}
      <div className="flex items-center gap-2 p-1.5 bg-zinc-100/80 rounded-xl max-w-md border border-zinc-200/60" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'upload'}
          onClick={() => setMode('upload')}
          className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all min-h-[44px] flex items-center justify-center gap-2
            ${mode === 'upload'
              ? 'bg-white text-navy shadow-sm border border-zinc-200/60 font-black'
              : 'text-zinc-600 hover:text-navy hover:bg-white/50'
            }`}
        >
          <Upload size={14} /> Upload Timetable PDF
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'clone'}
          onClick={() => setMode('clone')}
          className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all min-h-[44px] flex items-center justify-center gap-2
            ${mode === 'clone'
              ? 'bg-white text-navy shadow-sm border border-zinc-200/60 font-black'
              : 'text-zinc-600 hover:text-navy hover:bg-white/50'
            }`}
        >
          <Copy size={14} /> Clone from Class
        </button>
      </div>

      {/* MODE A: UPLOAD PDF */}
      {mode === 'upload' && (
        <div className="space-y-6">
          {/* Dropzone */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-navy mb-2">
              Upload Official Timetable PDF (Text-Layer Extracted)
            </label>
            <p className="text-xs text-zinc-600 mb-3">
              Only text-layer PDF timetables are supported. Scanned images are rejected automatically to prevent hallucinated subject assignments.
            </p>
            <FileDropzone
              accept=".pdf"
              label="Select or Drop Timetable PDF"
              loading={isParsing}
              onFileSelect={handleFileSelect}
            />
          </div>

          {/* Parsing Skeleton */}
          {isParsing && <StepTableSkeleton rows={6} />}

          {/* Parse Error with Retry */}
          {parseError && (
            <div className="p-5 rounded-2xl border border-red-200 bg-red-50 text-red-900 space-y-3" role="alert">
              <div className="flex items-center gap-2 text-sm font-bold">
                <AlertCircle size={18} className="text-red-600 shrink-0" />
                Parsing Error Encountered
              </div>
              <p className="text-xs text-red-700">{parseError}</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setParseError(null)}
                className="text-xs"
              >
                Clear and Try Another File
              </Button>
            </div>
          )}

          {/* Parsed Rows Review Section */}
          {rows.length > 0 && !isParsing && (
            <div className="space-y-4 pt-2">
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Total Rows</span>
                  <p className="text-lg font-black text-navy">{rows.length}</p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/80">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Matched</span>
                  <p className="text-lg font-black text-emerald-900">{matchedCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-900">Needs Review</span>
                  <p className="text-lg font-black text-amber-950">{flaggedCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-100/60 border border-zinc-200/80">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Excluded</span>
                  <p className="text-lg font-black text-zinc-800">{excludedCount}</p>
                </div>
              </div>

              {/* Blocking notice if flagged rows exist */}
              {flaggedCount > 0 && (
                <div 
                  className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs flex items-center gap-2.5 font-bold shadow-sm"
                  role="alert"
                  aria-live="polite"
                >
                  <AlertTriangle size={18} className="text-amber-600 shrink-0" aria-hidden="true" />
                  <span>
                    Cannot continue: <strong>{flaggedCount}</strong> subject row(s) require faculty assignment or exclusion before committing.
                  </span>
                </div>
              )}

              {/* TABLE VIEW (Desktop / >= md) */}
              <div className="hidden md:block border border-zinc-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-left text-xs" aria-label="Timetable Subject Rows">
                  <thead className="bg-zinc-50 border-b border-zinc-200 font-black text-zinc-600 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Subject</th>
                      <th className="py-3 px-4">Extracted Faculty</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions / Assignment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {rows.map((row) => (
                      <tr 
                        key={row.id} 
                        className={`transition-colors ${
                          row.status === 'needs review' 
                            ? 'bg-amber-50/40 hover:bg-amber-50/70' 
                            : row.status === 'excluded'
                              ? 'bg-zinc-50/60 opacity-60'
                              : 'hover:bg-zinc-50/60'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <p className="font-extrabold text-navy tracking-tight">{row.subjectName || 'Unknown Subject'}</p>
                          <p className="text-[10px] font-mono text-zinc-600 uppercase font-bold">{row.subjectCode || 'NO-CODE'}</p>
                        </td>

                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-zinc-800">
                            {row.matchedFacultyName || row.facultyName || 'No Teacher Assigned'}
                          </p>
                          {row.coFacultyIds?.length > 0 && (
                            <p className="text-[10px] text-zinc-600 font-medium">+{row.coFacultyIds.length} Co-Faculty</p>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {row.status === 'matched' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">
                              <CheckCircle size={12} className="text-emerald-800" /> Matched
                            </span>
                          )}
                          {row.status === 'needs review' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-950 border border-amber-300">
                              <AlertTriangle size={12} className="text-amber-800" /> Needs Review
                            </span>
                          )}
                          {row.status === 'excluded' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-zinc-200 text-zinc-900 border border-zinc-300">
                              <Ban size={12} className="text-zinc-700" /> Excluded
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Inline Faculty Dropdown for flagged rows */}
                            {row.status !== 'excluded' && (
                              <select
                                aria-label={`Assign faculty for ${row.subjectName}`}
                                value={row.facultyId || ''}
                                onChange={(e) => handleAssignFaculty(row.id, e.target.value)}
                                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border focus:outline-none focus:ring-2 max-w-[200px] min-h-[38px]
                                  ${row.status === 'needs review' 
                                    ? 'border-amber-400 bg-amber-50 text-amber-900 focus:ring-amber-500/40' 
                                    : 'border-zinc-300 bg-white text-zinc-700 focus:ring-indigo-500/30'}`}
                              >
                                <option value="">-- Choose Faculty --</option>
                                {facultyList.map((f) => (
                                  <option key={f._id} value={f._id}>{f.name}</option>
                                ))}
                              </select>
                            )}

                            {/* Exclude / Include Toggle */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleExclude(row.id)}
                              className="min-h-[38px] text-[10px] font-bold text-zinc-600 hover:text-zinc-900"
                            >
                              {row.status === 'excluded' ? 'Include' : 'Exclude'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* CARD VIEW (Mobile / < md) as required by DESIGN.md §3.B */}
              <div className="block md:hidden space-y-3" aria-label="Timetable Subject Cards">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className={`p-4 rounded-xl border transition-all ${
                      row.status === 'needs review'
                        ? 'border-amber-300 bg-amber-50/50 shadow-sm'
                        : row.status === 'excluded'
                          ? 'border-zinc-200 bg-zinc-50 opacity-60'
                          : 'border-zinc-200 bg-white shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <h3 className="font-extrabold text-sm text-navy">{row.subjectName || 'Unknown Subject'}</h3>
                        <p className="text-[10px] font-mono text-zinc-600 uppercase font-bold">{row.subjectCode || 'NO-CODE'}</p>
                      </div>
                      <div>
                        {row.status === 'matched' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">
                            <CheckCircle size={10} /> Matched
                          </span>
                        )}
                        {row.status === 'needs review' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-100 text-amber-950 border border-amber-300">
                            <AlertTriangle size={10} /> Review
                          </span>
                        )}
                        {row.status === 'excluded' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-zinc-200 text-zinc-900 border border-zinc-300">
                            <Ban size={10} /> Excluded
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-zinc-700 mb-3">
                      <span className="font-bold text-zinc-600">Teacher:</span>{' '}
                      {row.matchedFacultyName || row.facultyName || 'Unassigned'}
                    </div>

                    <div className="flex flex-col gap-2 pt-2 border-t border-zinc-100">
                      {row.status !== 'excluded' && (
                        <select
                          aria-label={`Assign faculty for ${row.subjectName}`}
                          value={row.facultyId || ''}
                          onChange={(e) => handleAssignFaculty(row.id, e.target.value)}
                          className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-zinc-300 bg-white text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/40 min-h-[44px]"
                        >
                          <option value="">-- Assign Faculty Member --</option>
                          {facultyList.map((f) => (
                            <option key={f._id} value={f._id}>{f.name}</option>
                          ))}
                        </select>
                      )}

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleToggleExclude(row.id)}
                        className="w-full min-h-[44px] text-xs font-bold"
                      >
                        {row.status === 'excluded' ? 'Include in Semester' : 'Exclude Subject'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODE B: CLONE FROM ANOTHER CLASS */}
      {mode === 'clone' && (
        <div className="space-y-4 p-5 rounded-2xl bg-zinc-50 border border-zinc-200">
          <div>
            <label htmlFor="wizard-clone-source" className="block text-xs font-black uppercase tracking-wider text-navy mb-1.5">
              Select Source Section to Clone
            </label>
            <p className="text-xs text-zinc-600 mb-2 font-medium">
              Ideal for multi-section branches (e.g. CSD-A through CSD-E) where subject assignments are identical. Faculty fields will be preserved or cleared for quick matching.
            </p>
            <select
              id="wizard-clone-source"
              value={cloneSourceClassId}
              onChange={(e) => setCloneSourceClassId(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-zinc-300 rounded-xl text-sm font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/40 min-h-[44px]"
            >
              <option value="">-- Choose Class with Configured Subjects --</option>
              {availableClasses.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} (Sem {c.semester || 1})
                </option>
              ))}
            </select>
          </div>

          <Button
            type="button"
            variant="primary"
            disabled={!cloneSourceClassId || isCloning}
            loading={isCloning}
            onClick={handleClone}
            className="w-full sm:w-60 min-h-[44px]"
          >
            {isCloning ? 'Cloning...' : 'Clone Structure & Proceed →'}
          </Button>
        </div>
      )}

      {/* Footer Actions */}
      <div className="pt-6 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
          className="w-full sm:w-auto min-h-[44px] min-w-[100px]"
        >
          ← Back
        </Button>

        {mode === 'upload' && rows.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            {flaggedCount > 0 && (
              <span className="text-xs text-amber-700 font-semibold" role="alert">
                {flaggedCount} row(s) require action.
              </span>
            )}
            <Button
              type="button"
              variant="primary"
              disabled={!canContinue || isCommitting}
              loading={isCommitting}
              onClick={handleCommit}
              className="w-full sm:w-64 min-h-[44px]"
            >
              {isCommitting ? 'Committing...' : 'Commit & Continue →'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Step2Timetable;
