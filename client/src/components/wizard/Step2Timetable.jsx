import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  previewTimetable,
  inspectTimetablePdf,
  commitTimetable,
  cloneClassSubjects,
} from '../../api/wizard';
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
  Filter,
  Sparkles,
  Layers,
  Search,
  ArrowRight,
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

  // PDF file & inspection states
  const [currentFile, setCurrentFile] = useState(null);
  const [inspection, setInspection] = useState(null);
  const [selectedPage, setSelectedPage] = useState(1);
  const [showPagePicker, setShowPagePicker] = useState(false);
  const [pageSearchQuery, setPageSearchQuery] = useState('');

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
        // Single-page PDF: automatically extract page 1
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

  // Extract from currently selected page in picker
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

  // Reset or clear file
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

  // Compute stats
  const flaggedCount = rows.filter((r) => r.status === 'needs review').length;
  const matchedCount = rows.filter((r) => r.status === 'matched').length;
  const excludedCount = rows.filter((r) => r.status === 'excluded').length;
  const canContinue = rows.length > 0 && flaggedCount === 0;

  // Filtered pages for search
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
        summary: `${matchedCount} subjects active · ${excludedCount} excluded (Page ${selectedPage}, Sem ${targetSemester})`,
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
      <div
        className="flex items-center gap-2 p-1.5 bg-zinc-100/80 rounded-xl max-w-md border border-zinc-200/60"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'upload'}
          onClick={() => setMode('upload')}
          className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all min-h-[44px] flex items-center justify-center gap-2
            ${
              mode === 'upload'
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
            ${
              mode === 'clone'
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
          {/* Dropzone (shown when no file or when explicitly changing file) */}
          {!currentFile && (
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-navy mb-2">
                Upload Official Timetable PDF (Text-Layer Extracted)
              </label>
              <p className="text-xs text-zinc-600 mb-3 font-medium">
                Upload a university/college timetable. Both single-page and multi-page documents (containing multiple sections) are supported with automated page detection.
              </p>
              <FileDropzone
                accept=".pdf"
                label="Select or Drop Timetable PDF"
                loading={isParsing}
                onFileSelect={handleFileSelect}
              />
            </div>
          )}

          {/* Parsing Skeleton */}
          {isParsing && <StepTableSkeleton rows={6} />}

          {/* Parse / Inspection Error with Retry */}
          {parseError && (
            <div
              className="p-5 rounded-2xl border border-red-200 bg-red-50 text-red-900 space-y-3"
              role="alert"
            >
              <div className="flex items-center gap-2 text-sm font-bold">
                <AlertCircle size={18} className="text-red-600 shrink-0" />
                Parsing Error Encountered
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
                  Clear and Try Again
                </Button>
                {inspection?.isMultiPage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setParseError(null);
                      setShowPagePicker(true);
                    }}
                    className="text-xs text-navy"
                  >
                    Select Another Page
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* MULTI-PAGE PAGE PICKER VIEW (shown when multi-page detected or when user clicks Change Page) */}
          {currentFile && inspection?.isMultiPage && showPagePicker && !isParsing && (
            <div
              className="p-5 rounded-2xl border border-indigo-200/80 bg-gradient-to-b from-indigo-50/40 to-white space-y-5 shadow-sm"
              role="region"
              aria-label="Multi-Page Timetable Page Selector"
            >
              {/* Header Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-100/80 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-900">
                      <Layers size={16} />
                    </span>
                    <h3 className="text-sm font-black text-navy tracking-tight">
                      Multi-Page Timetable Detected ({inspection.pageCount} Pages)
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-600 font-medium">
                    Select the page corresponding to{' '}
                    <strong className="text-navy font-bold">{targetClass?.name || 'Target Section'}</strong>.
                    Pages are analyzed and pre-ranked based on your section title.
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResetFile}
                    className="text-xs text-zinc-600 hover:text-navy min-h-[38px]"
                  >
                    <RotateCcw size={12} className="mr-1" /> Re-upload File
                  </Button>
                </div>
              </div>

              {/* Quick Jump & Filter Toolbar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {/* Search / Filter Input */}
                <div className="relative flex-1 max-w-sm">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={pageSearchQuery}
                    onChange={(e) => setPageSearchQuery(e.target.value)}
                    placeholder="Filter by section title, page # or subject..."
                    className="w-full pl-9 pr-3 py-2 text-xs font-semibold rounded-xl border border-zinc-300 bg-white text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/40 min-h-[40px]"
                    aria-label="Filter timetable pages"
                  />
                </div>

                {/* Jump to Page Direct Selector */}
                <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-zinc-600 font-medium">
                  <label htmlFor="wizard-page-select-dropdown" className="font-bold text-navy">
                    Jump to:
                  </label>
                  <select
                    id="wizard-page-select-dropdown"
                    value={selectedPage}
                    onChange={(e) => setSelectedPage(Number(e.target.value))}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-300 bg-white text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/40 min-h-[40px]"
                  >
                    {(inspection.pages || []).map((p) => (
                      <option key={p.pageNumber} value={p.pageNumber}>
                        Page {p.pageNumber} {p.isRecommended ? '⭐ (Recommended)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Page Cards Grid */}
              <div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-[420px] overflow-y-auto p-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded-xl"
                role="radiogroup"
                aria-label="Available Timetable Pages"
                tabIndex={0}
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
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          setSelectedPage(page.pageNumber);
                        }
                      }}
                      className={`relative text-left p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 min-h-[140px]
                        ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 shadow-md ring-2 ring-indigo-500/30'
                            : 'border-zinc-200/90 bg-white hover:border-indigo-300 hover:bg-zinc-50/70 shadow-sm'
                        }
                        ${!page.hasTextLayer ? 'opacity-70 bg-zinc-50' : ''}`}
                    >
                      {/* Top Bar: Page Number & Badges */}
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-black tracking-tight
                              ${
                                isSelected
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-zinc-100 text-zinc-800 border border-zinc-200'
                              }`}
                          >
                            Page {page.pageNumber}
                          </span>

                          {page.isRecommended && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-950 border border-emerald-300">
                              <Sparkles size={11} className="text-emerald-800" /> Recommended
                            </span>
                          )}
                        </div>

                        {/* Text Layer Indicator */}
                        {page.hasTextLayer ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800">
                            <CheckCircle size={12} className="text-emerald-700" /> Text Ready
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800">
                            <AlertTriangle size={12} className="text-amber-700" /> Scanned
                          </span>
                        )}
                      </div>

                      {/* Detected Section Title / Header */}
                      <div>
                        <h4 className="text-xs font-black text-navy line-clamp-2 tracking-tight">
                          {page.header || `Section on Page ${page.pageNumber}`}
                        </h4>
                        <p className="text-[11px] text-zinc-600 line-clamp-2 mt-1 font-mono">
                          {page.snippet}
                        </p>
                      </div>

                      {/* Detected Subject Codes Preview Pill Tags */}
                      {page.detectedSubjectCodes?.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1 border-t border-zinc-100">
                          {page.detectedSubjectCodes.slice(0, 4).map((code) => (
                            <span
                              key={code}
                              className="px-1.5 py-0.5 rounded bg-zinc-100 text-[9px] font-mono font-bold text-zinc-700"
                            >
                              {code}
                            </span>
                          ))}
                          {page.detectedSubjectCodes.length > 4 && (
                            <span className="text-[9px] text-zinc-600 font-bold self-center">
                              +{page.detectedSubjectCodes.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {filteredPages.length === 0 && (
                <div className="p-6 text-center text-xs text-zinc-600 font-semibold bg-white rounded-xl border border-zinc-200">
                  No pages match your search "{pageSearchQuery}". Try clearing your query.
                </div>
              )}

              {/* Action Bar for Page Picker */}
              <div className="pt-3 border-t border-indigo-100/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-zinc-700 font-medium">
                  Selected:{' '}
                  <strong className="text-navy font-black">
                    Page {selectedPage}
                  </strong>{' '}
                  {selectedPageObj?.header ? `(${selectedPageObj.header})` : ''}
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  {rows.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPagePicker(false)}
                      className="text-xs text-zinc-600 hover:text-navy min-h-[44px]"
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleExtractFromSelectedPage}
                    disabled={selectedPageObj && !selectedPageObj.hasTextLayer}
                    className="w-full sm:w-auto min-h-[44px] px-6 text-xs font-black flex items-center justify-center gap-2"
                  >
                    Extract Subjects from Page {selectedPage} <ArrowRight size={14} />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ACTIVE FILE & PAGE CONTEXT BANNER (shown when rows are loaded) */}
          {currentFile && rows.length > 0 && !showPagePicker && !isParsing && (
            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="p-2 rounded-lg bg-white border border-zinc-200 text-indigo-700 shrink-0">
                  <FileText size={18} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-black text-navy truncate max-w-[200px] sm:max-w-[320px]">
                      {currentFile.name}
                    </p>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-100 text-indigo-900 border border-indigo-200">
                      Page {selectedPage} of {inspection?.pageCount || 1}
                    </span>
                    {inspection?.isMultiPage && selectedPageObj?.isRecommended && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-950 border border-emerald-300">
                        ⭐ Matched Section
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-600 font-medium truncate mt-0.5">
                    {selectedPageObj?.header || 'Timetable parsed and verified'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {inspection?.isMultiPage && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowPagePicker(true)}
                    className="text-xs font-bold min-h-[38px] flex items-center gap-1.5"
                  >
                    <Layers size={13} /> Change Page
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFile}
                  className="text-xs text-zinc-600 hover:text-navy min-h-[38px]"
                >
                  <RotateCcw size={13} className="mr-1" /> New File
                </Button>
              </div>
            </div>
          )}

          {/* PARSED ROWS REVIEW SECTION */}
          {rows.length > 0 && !showPagePicker && !isParsing && (
            <div className="space-y-4 pt-1">
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
                    Total Rows
                  </span>
                  <p className="text-lg font-black text-navy">{rows.length}</p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/80">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                    Matched
                  </span>
                  <p className="text-lg font-black text-emerald-900">{matchedCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-900">
                    Needs Review
                  </span>
                  <p className="text-lg font-black text-amber-950">{flaggedCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-100/60 border border-zinc-200/80">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
                    Excluded
                  </span>
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
                  <AlertTriangle
                    size={18}
                    className="text-amber-600 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    Cannot continue: <strong>{flaggedCount}</strong> subject row(s) require
                    faculty assignment or exclusion before committing.
                  </span>
                </div>
              )}

              {/* TABLE VIEW (Desktop / >= md) */}
              <div
                className="hidden md:block border border-zinc-200 rounded-xl overflow-hidden bg-white shadow-sm"
                tabIndex={0}
                role="region"
                aria-label="Timetable Subject Rows Table"
              >
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
                          <p className="font-extrabold text-navy tracking-tight">
                            {row.subjectName || 'Unknown Subject'}
                          </p>
                          <p className="text-[10px] font-mono text-zinc-600 uppercase font-bold">
                            {row.subjectCode || 'NO-CODE'}
                          </p>
                        </td>

                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-zinc-800">
                            {row.matchedFacultyName || row.facultyName || 'No Teacher Assigned'}
                          </p>
                          {row.coFacultyIds?.length > 0 && (
                            <p className="text-[10px] text-zinc-600 font-medium">
                              +{row.coFacultyIds.length} Co-Faculty
                            </p>
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
                                  ${
                                    row.status === 'needs review'
                                      ? 'border-amber-400 bg-amber-50 text-amber-900 focus:ring-amber-500/40'
                                      : 'border-zinc-300 bg-white text-zinc-700 focus:ring-indigo-500/30'
                                  }`}
                              >
                                <option value="">-- Choose Faculty --</option>
                                {facultyList.map((f) => (
                                  <option key={f._id} value={f._id}>
                                    {f.name}
                                  </option>
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
              <div
                className="block md:hidden space-y-3"
                role="region"
                aria-label="Timetable Subject Cards"
                tabIndex={0}
              >
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
                        <h3 className="font-extrabold text-sm text-navy">
                          {row.subjectName || 'Unknown Subject'}
                        </h3>
                        <p className="text-[10px] font-mono text-zinc-600 uppercase font-bold">
                          {row.subjectCode || 'NO-CODE'}
                        </p>
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
                            <option key={f._id} value={f._id}>
                              {f.name}
                            </option>
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
            <label
              htmlFor="wizard-clone-source"
              className="block text-xs font-black uppercase tracking-wider text-navy mb-1.5"
            >
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

        {mode === 'upload' && rows.length > 0 && !showPagePicker && (
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
