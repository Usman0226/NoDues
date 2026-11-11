import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  previewTimetable,
  inspectTimetablePdf,
  commitTimetable,
  cloneClassSubjects,
} from '../../api/wizard';
import { getClasses, getClass } from '../../api/classes';
import { getFaculty } from '../../api/faculty';
import { formatSectionDisplayName } from '../../utils/formatters';
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
  Sparkles,
  Layers,
  Search,
  ArrowRight,
  BookOpen,
  RefreshCw,
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

  // Active mode: 'inherit' | 'upload' | 'clone'
  const [mode, setMode] = useState('upload');

  // PDF file & inspection states
  const [currentFile, setCurrentFile] = useState(null);
  const [inspection, setInspection] = useState(null);
  const [selectedPage, setSelectedPage] = useState(1);
  const [showPagePicker, setShowPagePicker] = useState(false);
  const [pageSearchQuery, setPageSearchQuery] = useState('');

  // Preview state from timetable parser or loaded subjects
  const [uploadId, setUploadId] = useState(null);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [isCommitting, setIsCommitting] = useState(false);

  // Clone mode state
  const [cloneSourceClassId, setCloneSourceClassId] = useState('');
  const [isCloning, setIsCloning] = useState(false);

  // Fetch fresh details for target class to check for existing subjects
  const { data: freshClassRes, refetch: refetchClass } = useQuery({
    queryKey: ['wizard', 'class-detail', classId],
    queryFn: () => getClass(classId),
    enabled: Boolean(classId),
  });
  const currentClassData = freshClassRes?.data || freshClassRes || targetClass;

  // Faculty list for inline reassignments
  const { data: facultyRes } = useQuery({
    queryKey: ['wizard', 'faculty', departmentId || 'all'],
    queryFn: () => getFaculty(departmentId ? { departmentId, limit: 100 } : { limit: 100 }),
    enabled: true,
  });
  const facultyList = facultyRes?.data || facultyRes?.faculty || [];

  // Classes list for Master syllabus and cloning
  const { data: classRes } = useQuery({
    queryKey: ['wizard', 'all-classes', departmentId],
    queryFn: () => getClasses({ limit: 150 }),
  });
  const allClasses = classRes?.data || classRes?.classes || [];

  // Find Master Syllabus class for this semester
  const masterClass = useMemo(() => {
    return allClasses.find(
      (c) =>
        c.isMaster &&
        Number(c.semester) === Number(targetSemester) &&
        (c.departmentId?._id || c.departmentId) === departmentId
    );
  }, [allClasses, targetSemester, departmentId]);

  // Operational classes for cloning
  const availableCloneClasses = useMemo(() => {
    return allClasses.filter((c) => c._id !== classId && !c.isMaster);
  }, [allClasses, classId]);

  // Check if existing class already has subjects assigned
  const existingSubjects = useMemo(() => {
    const semKey = String(targetSemester);
    const semEntry = currentClassData?.semesterSubjects instanceof Map
      ? currentClassData.semesterSubjects.get(semKey)
      : currentClassData?.semesterSubjects?.[semKey];
    if (semEntry?.subjects && semEntry.subjects.length > 0) {
      return semEntry.subjects;
    }
    return currentClassData?.subjectAssignments || [];
  }, [currentClassData, targetSemester]);

  // If class already has existing subjects and user has not loaded any rows, initialize with existing
  useEffect(() => {
    if (existingSubjects.length > 0 && rows.length === 0 && !currentFile) {
      const mapped = existingSubjects.map((s, idx) => ({
        id: s._id || s.subjectId || `sub-${idx}`,
        subjectId: s.subjectId?._id || s.subjectId || s._id,
        subjectName: s.subjectName || s.name || '',
        subjectCode: s.subjectCode || s.code || '',
        facultyId: s.facultyId?._id || s.facultyId || null,
        facultyName: s.facultyName || s.facultyId?.name || null,
        matchedFacultyName: s.facultyName || s.facultyId?.name || null,
        status: (s.facultyId?._id || s.facultyId) ? 'matched' : 'needs review',
      }));
      setRows(mapped);
    }
  }, [existingSubjects, currentFile, rows.length]);

  // Automatically default mode to 'inherit' if master syllabus exists and no file uploaded
  useEffect(() => {
    if (masterClass && rows.length === 0 && !currentFile) {
      setMode('inherit');
    }
  }, [masterClass, rows.length, currentFile]);

  // Internal helper to preview a specific page
  const executePreview = async (file, pageNumber) => {
    setIsParsing(true);
    setParseError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('classId', classId);
      formData.append('targetSemester', targetSemester);
      if (pageNumber) {
        formData.append('page', pageNumber);
      }

      const res = await previewTimetable(formData);
      const data = res?.data || res;

      setUploadId(data.uploadId);
      setSummary(data.summary);
      setSelectedPage(data.selectedPage || pageNumber || 1);
      setShowPagePicker(false);

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
      onDirtyChange?.(true);
      toast.success(`Extracted ${mappedRows.length} subject rows from Page ${data.selectedPage || pageNumber || 1}.`);
    } catch (err) {
      const msg = err?.message || `Failed to extract subjects from page ${pageNumber}.`;
      setParseError(msg);
      toast.error(msg);
    } finally {
      setIsParsing(false);
    }
  };

  // Initial file drop handler: Inspect PDF structure first
  const handleFileSelect = async (file) => {
    if (!file) return;
    setCurrentFile(file);
    setIsParsing(true);
    setParseError(null);
    setInspection(null);
    setRows([]);
    setSummary(null);
    onDirtyChange?.(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (classId) formData.append('classId', classId);

      const res = await inspectTimetablePdf(formData);
      const inspectData = res?.data || res;
      setInspection(inspectData);

      if (inspectData.isMultiPage && inspectData.pageCount > 1) {
        const defaultPage = inspectData.recommendedPage || 1;
        setSelectedPage(defaultPage);
        setShowPagePicker(true);
        setIsParsing(false);
        toast.success(`Multi-page PDF detected (${inspectData.pageCount} pages). Please select your section's page.`);
      } else {
        setShowPagePicker(false);
        setSelectedPage(1);
        await executePreview(file, 1);
      }
    } catch (err) {
      const msg = err?.message || 'Failed to inspect timetable PDF structure.';
      setParseError(msg);
      toast.error(msg);
      setIsParsing(false);
    }
  };

  const handleExtractFromSelectedPage = () => {
    if (!currentFile) {
      toast.error('No PDF file currently selected.');
      return;
    }
    executePreview(currentFile, selectedPage);
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
        const newStatus =
          r.status === 'excluded'
            ? r.facultyId
              ? 'matched'
              : 'needs review'
            : 'excluded';
        return { ...r, status: newStatus };
      })
    );
  };

  const handleResetFile = () => {
    setCurrentFile(null);
    setInspection(null);
    setRows([]);
    setSummary(null);
    setParseError(null);
    setShowPagePicker(false);
    setSelectedPage(1);
    onDirtyChange?.(false);
  };

  // Stats
  const flaggedCount = rows.filter((r) => r.status === 'needs review').length;
  const matchedCount = rows.filter((r) => r.status === 'matched').length;
  const excludedCount = rows.filter((r) => r.status === 'excluded').length;
  const canContinue = rows.length > 0 && flaggedCount === 0;

  // Filtered pages for multi-page search
  const filteredPages = (inspection?.pages || []).filter((p) => {
    if (!pageSearchQuery) return true;
    const q = pageSearchQuery.toLowerCase();
    const matchHeader = (p.header || '').toLowerCase().includes(q);
    const matchSnippet = (p.snippet || '').toLowerCase().includes(q);
    const matchCodes = (p.detectedSubjectCodes || []).some((c) => c.toLowerCase().includes(q));
    const matchPageNum = String(p.pageNumber).includes(q);
    return matchHeader || matchSnippet || matchCodes || matchPageNum;
  });

  const selectedPageObj = inspection?.pages?.find((p) => p.pageNumber === selectedPage);

  // Handle Commit & Continue
  const handleCommit = async () => {
    if (!canContinue) {
      toast.error('All subjects must have a designated faculty member or be excluded.');
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
      await refetchClass();
      toast.success('Semester subjects confirmed successfully.');
      onSave({
        step: 'timetable_subjects',
        summary: `${matchedCount} subjects active (${excludedCount} excluded) for Semester ${targetSemester}`,
      });
    } catch (err) {
      toast.error(err?.message || 'Failed to save timetable subjects.');
    } finally {
      setIsCommitting(false);
    }
  };

  // Handle Inherit Master Syllabus
  const handleInheritMasterSyllabus = async () => {
    if (!masterClass) {
      toast.error('No Master Syllabus found for this semester.');
      return;
    }

    setIsCloning(true);
    try {
      await cloneClassSubjects(classId, masterClass._id);
      onDirtyChange?.(false);
      await refetchClass();
      toast.success(`Inherited master syllabus for Semester ${targetSemester}.`);
      onSave({
        step: 'timetable_subjects',
        summary: `Inherited Master Syllabus for Semester ${targetSemester}`,
      });
    } catch (err) {
      toast.error(err?.message || 'Failed to inherit Master Syllabus.');
    } finally {
      setIsCloning(false);
    }
  };

  // Handle Clone from another class
  const handleCloneFromClass = async () => {
    if (!cloneSourceClassId) {
      toast.error('Please select a source section to copy subjects from.');
      return;
    }

    setIsCloning(true);
    try {
      await cloneClassSubjects(classId, cloneSourceClassId);
      onDirtyChange?.(false);
      await refetchClass();
      const src = availableCloneClasses.find((c) => c._id === cloneSourceClassId);
      toast.success(`Copied subjects from ${src?.name || 'source section'}.`);
      onSave({
        step: 'timetable_subjects',
        summary: `Copied subjects from ${src?.name || 'section'} (Semester ${targetSemester})`,
      });
    } catch (err) {
      toast.error(err?.message || 'Failed to copy subjects.');
    } finally {
      setIsCloning(false);
    }
  };

  const classTitle = formatSectionDisplayName(targetClass?.name, targetSemester);

  return (
    <div className="space-y-5">
      {/* Tab Switcher: Inherit Master Syllabus vs Upload PDF vs Clone */}
      <div
        className="flex items-center gap-1.5 p-1 bg-zinc-100 rounded-xl max-w-lg border border-zinc-200/80"
        role="tablist"
      >
        {masterClass && (
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'inherit'}
            onClick={() => setMode('inherit')}
            className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all min-h-[38px] flex items-center justify-center gap-1.5
              ${
                mode === 'inherit'
                  ? 'bg-white text-navy shadow-xs border border-zinc-200/80 font-black'
                  : 'text-zinc-600 hover:text-navy hover:bg-white/50'
              }`}
          >
            <BookOpen size={13} className="text-indigo-600" /> Master Syllabus
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'upload'}
          onClick={() => setMode('upload')}
          className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all min-h-[38px] flex items-center justify-center gap-1.5
            ${
              mode === 'upload'
                ? 'bg-white text-navy shadow-xs border border-zinc-200/80 font-black'
                : 'text-zinc-600 hover:text-navy hover:bg-white/50'
            }`}
        >
          <Upload size={13} /> Upload Timetable PDF
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'clone'}
          onClick={() => setMode('clone')}
          className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all min-h-[38px] flex items-center justify-center gap-1.5
            ${
              mode === 'clone'
                ? 'bg-white text-navy shadow-xs border border-zinc-200/80 font-black'
                : 'text-zinc-600 hover:text-navy hover:bg-white/50'
            }`}
        >
          <Copy size={13} /> Copy from Section
        </button>
      </div>

      {/* MODE 1: MASTER SYLLABUS INHERIT */}
      {mode === 'inherit' && masterClass && (
        <div className="p-5 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
              <BookOpen size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-navy tracking-tight">
                  Semester {targetSemester} Master Syllabus Available
                </h3>
                <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                  Recommended
                </span>
              </div>
              <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">
                The department has already configured the curriculum syllabus for Semester {targetSemester}.
                Inheriting will automatically map all core and elective subjects to <strong>{classTitle}</strong>.
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
            <Button
              type="button"
              variant="primary"
              disabled={isCloning}
              loading={isCloning}
              onClick={handleInheritMasterSyllabus}
              className="w-full sm:w-auto min-h-[42px] px-6 text-xs"
            >
              {isCloning ? 'Inheriting...' : 'Inherit Master Syllabus & Continue →'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setMode('upload')}
              className="w-full sm:w-auto min-h-[42px] text-xs font-bold"
            >
              Upload Section Timetable PDF Instead
            </Button>
          </div>
        </div>
      )}

      {/* MODE 2: UPLOAD TIMETABLE PDF */}
      {mode === 'upload' && (
        <div className="space-y-5">
          {/* Dropzone (shown when no file or when user clicks New File) */}
          {!currentFile && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-black uppercase tracking-wider text-navy">
                  Upload Official Timetable PDF
                </label>
                {rows.length > 0 && (
                  <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                    <CheckCircle size={12} /> {rows.length} subjects currently active
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mb-2.5">
                Upload your institutional timetable (single or multi-page). The system will automatically detect sections and table structures.
              </p>
              <FileDropzone
                accept=".pdf"
                label="Select or Drop Section Timetable PDF"
                loading={isParsing}
                onFileSelect={handleFileSelect}
              />
            </div>
          )}

          {/* Parsing Skeleton */}
          {isParsing && <StepTableSkeleton rows={5} />}

          {/* Parse / Inspection Error */}
          {parseError && (
            <div
              className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-900 space-y-2.5"
              role="alert"
            >
              <div className="flex items-center gap-2 text-xs font-bold">
                <AlertCircle size={16} className="text-red-600 shrink-0" />
                Parsing Notice
              </div>
              <p className="text-xs text-red-700">{parseError}</p>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setParseError(null);
                    if (!rows.length) handleResetFile();
                  }}
                  className="text-xs"
                >
                  Clear & Retry
                </Button>
              </div>
            </div>
          )}

          {/* MULTI-PAGE PAGE SELECTOR */}
          {currentFile && inspection?.isMultiPage && showPagePicker && !isParsing && (
            <div
              className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/30 space-y-4"
              role="region"
              aria-label="Multi-Page Timetable Page Selector"
            >
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-indigo-100 pb-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-indigo-600" />
                    <h3 className="text-xs sm:text-sm font-black text-navy">
                      Multi-Page Timetable Detected ({inspection.pageCount} Pages)
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-600">
                    Select the page corresponding to <strong>{classTitle}</strong>.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFile}
                  className="text-xs text-zinc-600 hover:text-navy min-h-[36px] self-start sm:self-auto"
                >
                  <RotateCcw size={12} className="mr-1" /> Re-upload
                </Button>
              </div>

              {/* Search Toolbar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1 max-w-sm">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={pageSearchQuery}
                    onChange={(e) => setPageSearchQuery(e.target.value)}
                    placeholder="Search section, page # or subject..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-300 bg-white text-navy focus:outline-none focus:ring-2 focus:ring-navy/20 min-h-[38px]"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-600 font-medium">
                  <label htmlFor="wizard-page-select-dropdown" className="font-bold text-navy">
                    Jump to:
                  </label>
                  <select
                    id="wizard-page-select-dropdown"
                    value={selectedPage}
                    onChange={(e) => setSelectedPage(Number(e.target.value))}
                    className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-zinc-300 bg-white text-navy min-h-[38px]"
                  >
                    {(inspection.pages || []).map((p) => (
                      <option key={p.pageNumber} value={p.pageNumber}>
                        Page {p.pageNumber} {p.isRecommended ? '⭐ (Matched Section)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Page Cards Grid */}
              <div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[360px] overflow-y-auto p-0.5"
                role="radiogroup"
                aria-label="Available Timetable Pages"
              >
                {filteredPages.map((page) => {
                  const isSelected = selectedPage === page.pageNumber;
                  return (
                    <div
                      key={page.pageNumber}
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onClick={() => setSelectedPage(page.pageNumber)}
                      className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 min-h-[120px]
                        ${
                          isSelected
                            ? 'border-indigo-600 bg-white shadow-xs ring-2 ring-indigo-500/20'
                            : 'border-zinc-200 bg-white hover:border-indigo-300'
                        }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black
                            ${isSelected ? 'bg-navy text-white' : 'bg-zinc-100 text-zinc-800'}`}
                        >
                          Page {page.pageNumber}
                        </span>

                        {page.isRecommended && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black bg-emerald-100 text-emerald-950 border border-emerald-300">
                            <Sparkles size={10} className="text-emerald-700" /> Matched Section
                          </span>
                        )}
                      </div>

                      <div>
                        <h4 className="text-xs font-black text-navy line-clamp-1">
                          {page.header || `Page ${page.pageNumber}`}
                        </h4>
                        <p className="text-[11px] text-zinc-500 line-clamp-2 mt-0.5 font-mono">
                          {page.snippet}
                        </p>
                      </div>

                      {page.detectedSubjectCodes?.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1 border-t border-zinc-100">
                          {page.detectedSubjectCodes.slice(0, 4).map((code) => (
                            <span
                              key={code}
                              className="px-1.5 py-0.2 rounded bg-zinc-100 text-[9px] font-mono font-bold text-zinc-700"
                            >
                              {code}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Action Bar for Page Picker */}
              <div className="pt-2 border-t border-indigo-100 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                <div className="text-xs text-zinc-700 font-medium">
                  Selected: <strong className="text-navy font-black">Page {selectedPage}</strong>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {rows.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPagePicker(false)}
                      className="text-xs text-zinc-600 min-h-[38px]"
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleExtractFromSelectedPage}
                    className="w-full sm:w-auto min-h-[38px] px-5 text-xs font-bold"
                  >
                    Extract Subjects from Page {selectedPage} <ArrowRight size={13} className="ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ACTIVE FILE / SELECTION BANNER */}
          {currentFile && rows.length > 0 && !showPagePicker && !isParsing && (
            <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText size={16} className="text-indigo-600 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-navy truncate max-w-[200px]">
                      {currentFile.name}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900">
                      Page {selectedPage} of {inspection?.pageCount || 1}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {inspection?.isMultiPage && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowPagePicker(true)}
                    className="text-xs min-h-[34px] px-3"
                  >
                    <Layers size={12} className="mr-1" /> Change Page
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFile}
                  className="text-xs text-zinc-600 min-h-[34px] px-3"
                >
                  <RotateCcw size={12} className="mr-1" /> New PDF
                </Button>
              </div>
            </div>
          )}

          {/* SUBJECTS REVIEW TABLE */}
          {rows.length > 0 && !showPagePicker && !isParsing && (
            <div className="space-y-3.5 pt-1">
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                    Total Subjects
                  </span>
                  <p className="text-base font-black text-navy">{rows.length}</p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/80">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                    Active & Matched
                  </span>
                  <p className="text-base font-black text-emerald-900">{matchedCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-900">
                    Needs Faculty
                  </span>
                  <p className="text-base font-black text-amber-950">{flaggedCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-100/60 border border-zinc-200/80">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                    Excluded
                  </span>
                  <p className="text-base font-black text-zinc-700">{excludedCount}</p>
                </div>
              </div>

              {flaggedCount > 0 && (
                <div
                  className="p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-xs flex items-center gap-2 font-medium"
                  role="alert"
                >
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                  <span>
                    <strong>{flaggedCount}</strong> subject(s) require a faculty member assigned before proceeding.
                  </span>
                </div>
              )}

              {/* Table */}
              <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white shadow-xs">
                <table className="w-full text-left text-xs" aria-label="Subjects Review">
                  <thead className="bg-zinc-50 border-b border-zinc-200 font-bold text-zinc-500 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3.5">Code</th>
                      <th className="py-2.5 px-3.5">Subject Name</th>
                      <th className="py-2.5 px-3.5">Handling Faculty</th>
                      <th className="py-2.5 px-3.5">Status</th>
                      <th className="py-2.5 px-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          row.status === 'needs review'
                            ? 'bg-amber-50/30'
                            : row.status === 'excluded'
                              ? 'bg-zinc-50/80 opacity-60'
                              : 'hover:bg-zinc-50/40'
                        }`}
                      >
                        <td className="py-2.5 px-3.5 font-mono font-bold text-navy">
                          {row.subjectCode || '—'}
                        </td>
                        <td className="py-2.5 px-3.5 font-semibold text-zinc-900">
                          {row.subjectName || 'Untitled Subject'}
                        </td>
                        <td className="py-2.5 px-3.5">
                          {row.status === 'excluded' ? (
                            <span className="text-zinc-400 italic">Excluded</span>
                          ) : (
                            <select
                              aria-label={`Assign faculty for ${row.subjectName}`}
                              value={row.facultyId || ''}
                              onChange={(e) => handleAssignFaculty(row.id, e.target.value)}
                              className="px-2.5 py-1 text-xs font-medium rounded-lg border border-zinc-300 bg-white text-navy focus:outline-none focus:ring-1 focus:ring-navy max-w-[220px]"
                            >
                              <option value="">-- Assign Faculty --</option>
                              {facultyList.map((f) => (
                                <option key={f._id} value={f._id}>
                                  {f.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="py-2.5 px-3.5">
                          {row.status === 'matched' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900">
                              <CheckCircle size={10} /> Active
                            </span>
                          )}
                          {row.status === 'needs review' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-950">
                              <AlertTriangle size={10} /> Missing Faculty
                            </span>
                          )}
                          {row.status === 'excluded' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-200 text-zinc-800">
                              <Ban size={10} /> Excluded
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleToggleExclude(row.id)}
                            className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 underline"
                          >
                            {row.status === 'excluded' ? 'Include' : 'Exclude'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODE 3: COPY FROM ANOTHER SECTION */}
      {mode === 'clone' && (
        <div className="space-y-4 p-4 rounded-xl bg-zinc-50 border border-zinc-200/90">
          <div>
            <label
              htmlFor="wizard-clone-source"
              className="block text-xs font-black uppercase tracking-wider text-navy mb-1"
            >
              Choose Section to Copy From
            </label>
            <p className="text-xs text-zinc-500 mb-2">
              Select an existing section in your department that shares the same semester curriculum.
            </p>
            <select
              id="wizard-clone-source"
              value={cloneSourceClassId}
              onChange={(e) => setCloneSourceClassId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-xl text-xs sm:text-sm font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-navy/20 min-h-[42px]"
            >
              <option value="">-- Select Source Section --</option>
              {availableCloneClasses.map((c) => (
                <option key={c._id} value={c._id}>
                  {formatSectionDisplayName(c.name, c.semester)} (Semester {c.semester || 1}) — {c.subjectCount || 0} Subjects
                </option>
              ))}
            </select>
          </div>

          <Button
            type="button"
            variant="primary"
            disabled={!cloneSourceClassId || isCloning}
            loading={isCloning}
            onClick={handleCloneFromClass}
            className="w-full sm:w-auto min-h-[42px] px-6 text-xs"
          >
            {isCloning ? 'Copying...' : 'Copy Subjects & Continue →'}
          </Button>
        </div>
      )}

      {/* Action Footer */}
      <div className="pt-4 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
          className="w-full sm:w-auto min-h-[40px] px-5 text-xs font-bold"
        >
          ← Back
        </Button>

        {mode === 'upload' && rows.length > 0 && !showPagePicker && (
          <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
            {flaggedCount > 0 && (
              <span className="text-xs text-amber-700 font-semibold">
                {flaggedCount} subject(s) need faculty.
              </span>
            )}
            <Button
              type="button"
              variant="primary"
              disabled={!canContinue || isCommitting}
              loading={isCommitting}
              onClick={handleCommit}
              className="w-full sm:w-56 min-h-[42px]"
            >
              {isCommitting ? 'Saving...' : 'Save & Continue →'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Step2Timetable;
