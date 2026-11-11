import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  inspectTimetablePdf,
  previewTimetable,
  commitTimetable,
  cloneClassSubjects,
} from '../../api/wizard';
import { getDepartments } from '../../api/departments';
import { getClasses, getClass, createClass, updateClass } from '../../api/classes';
import { getFaculty } from '../../api/faculty';
import { getBatches } from '../../api/batch';
import { ROLES } from '../../utils/constants';
import { getAcademicYearRoman, formatSectionDisplayName } from '../../utils/formatters';
import FileDropzone from '../ui/FileDropzone';
import Button from '../ui/Button';
import { StepTableSkeleton } from './WizardSkeleton';
import {
  FileText,
  Layers,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  Ban,
  RotateCcw,
  Search,
  ArrowRight,
  BookOpen,
  UserCheck,
  Building2,
  Check,
  ChevronRight,
  Upload,
  Copy,
  AlertCircle,
  RefreshCw,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const Step1ClassSubjects = ({
  user,
  initialClassId,
  initialData,
  onSave,
  onDirtyChange,
}) => {
  const isHod = user?.role === ROLES.HOD || user?.role === 'hod';
  const defaultDeptId = user?.departmentId || user?.department?._id || (typeof user?.department === 'string' ? user?.department : '');

  // Main Mode: 'pdf' (default) | 'manual'
  const [activeTab, setActiveTab] = useState('pdf');

  // ─────────────────────────────────────────────────────────────────────────────
  // PDF FLOW STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const [pdfFile, setPdfFile] = useState(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspection, setInspection] = useState(null);
  const [pageSearchQuery, setPageSearchQuery] = useState('');
  const [selectedPage, setSelectedPage] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState(null);

  // Extracted preview state
  const [uploadId, setUploadId] = useState(null);
  const [resolvedClassId, setResolvedClassId] = useState(initialClassId || null);
  const [resolvedClassData, setResolvedClassData] = useState(initialData || null);
  const [extractedRows, setExtractedRows] = useState([]);
  const [subjectFilter, setSubjectFilter] = useState('all'); // 'all' | 'flagged' | 'matched' | 'excluded'
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Editable header fields from preview
  const [sectionForm, setSectionForm] = useState({
    name: initialData?.name || '',
    semester: initialData?.semester || 1,
    academicYear: initialData?.academicYear || '2025-26',
    departmentId: defaultDeptId,
    classTeacherId: initialData?.classTeacherId?._id || initialData?.classTeacherId || '',
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // MANUAL FLOW STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const [manualMode, setManualMode] = useState('existing'); // 'existing' | 'new'
  const [manualSelectedClassId, setManualSelectedClassId] = useState(initialClassId || '');
  const [manualSource, setManualSource] = useState('master'); // 'master' | 'clone'
  const [cloneSourceClassId, setCloneSourceClassId] = useState('');

  // ─────────────────────────────────────────────────────────────────────────────
  // QUERIES
  // ─────────────────────────────────────────────────────────────────────────────
  const activeDepartmentId = sectionForm.departmentId || defaultDeptId;

  const { data: deptRes } = useQuery({
    queryKey: ['wizard', 'departments'],
    queryFn: getDepartments,
  });
  const departments = deptRes?.data || [];

  const { data: facultyRes } = useQuery({
    queryKey: ['wizard', 'faculty', activeDepartmentId],
    queryFn: () => getFaculty(activeDepartmentId ? { departmentId: activeDepartmentId, limit: 120 } : { limit: 120 }),
    enabled: true,
  });
  const facultyList = facultyRes?.data || facultyRes?.faculty || [];

  const { data: classRes } = useQuery({
    queryKey: ['wizard', 'all-classes', activeDepartmentId],
    queryFn: () => getClasses({ limit: 150 }),
  });
  const allClasses = classRes?.data || classRes?.classes || [];
  const operationalClasses = useMemo(() => allClasses.filter((c) => !c.isMaster), [allClasses]);

  const { data: batchRes } = useQuery({
    queryKey: ['wizard', 'batches'],
    queryFn: () => getBatches({ limit: 50 }),
  });
  const batchesList = batchRes?.data || batchRes?.batches || [];

  // Find Master syllabus for current semester
  const masterClass = useMemo(() => {
    return allClasses.find(
      (c) =>
        c.isMaster &&
        Number(c.semester) === Number(sectionForm.semester) &&
        (c.departmentId?._id || c.departmentId) === activeDepartmentId
    );
  }, [allClasses, sectionForm.semester, activeDepartmentId]);

  // If initialClassId is passed and no PDF uploaded yet, preload class info
  useEffect(() => {
    if (initialClassId && !resolvedClassData) {
      getClass(initialClassId).then((res) => {
        const cls = res?.data || res;
        if (cls) {
          setResolvedClassData(cls);
          setResolvedClassId(cls._id);
          setSectionForm({
            name: cls.name,
            semester: cls.semester || 1,
            academicYear: cls.academicYear || '2025-26',
            departmentId: cls.departmentId?._id || cls.departmentId || defaultDeptId,
            classTeacherId: cls.classTeacherId?._id || cls.classTeacherId || '',
          });
          if (Array.isArray(cls.subjectAssignments) && cls.subjectAssignments.length > 0) {
            setExtractedRows(
              cls.subjectAssignments.map((s) => ({
                subjectCode: s.subjectCode || s.code || '',
                subjectName: s.subjectName || s.name || '',
                subjectId: s.subjectId?._id || s.subjectId,
                facultyName: s.facultyName || s.facultyId?.name || 'Unassigned',
                facultyId: s.facultyId?._id || s.facultyId || null,
                hours: s.hours || 3,
                isElective: Boolean(s.isElective),
                status: s.facultyId ? 'matched' : 'flagged',
                requiresReview: !s.facultyId,
                reviewReasons: !s.facultyId ? ['No faculty assigned'] : [],
              }))
            );
          }
        }
      }).catch((e) => console.warn('Could not load initial class in Step 1:', e?.message));
    }
  }, [initialClassId, resolvedClassData, defaultDeptId]);

  // Trigger preview for selected page
  const runPreviewForPage = useCallback(async (file, pageNum) => {
    if (!file) return;
    setIsParsing(true);
    setParseError(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      if (pageNum) fd.append('page', String(pageNum));
      if (activeDepartmentId) fd.append('departmentId', activeDepartmentId);
      if (resolvedClassId) fd.append('classId', resolvedClassId);

      const res = await previewTimetable(fd);
      const data = res?.data?.rows !== undefined ? res.data : (res?.rows !== undefined ? res : (res?.data || res));

      setUploadId(data.uploadId);
      setResolvedClassId(data.classId);
      setExtractedRows(data.rows || []);

      const detectedName = data.className || data.metadata?.detectedClassName || 'Section A';
      const detectedSem = data.targetSemester || data.metadata?.detectedSemester || 1;
      const detectedTeacherId = data.classTeacher?._id || '';

      setSectionForm((prev) => ({
        ...prev,
        name: detectedName,
        semester: detectedSem,
        academicYear: data.metadata?.academicYear || prev.academicYear,
        classTeacherId: detectedTeacherId || prev.classTeacherId,
      }));

      // Fetch or synthesize resolved class data
      setResolvedClassData({
        _id: data.classId,
        name: detectedName,
        semester: detectedSem,
        academicYear: data.metadata?.academicYear || '2025-26',
        departmentId: activeDepartmentId,
        classTeacher: data.classTeacher,
        classTeacherId: data.classTeacher?._id || null,
      });

      if (data.detectedTeacher && !data.classTeacher) {
        toast(`Detected Class Teacher "${data.detectedTeacher}" could not be matched automatically. Please select from the dropdown below.`, {
          icon: 'ℹ️',
          duration: 4000,
        });
      } else if (data.classTeacher) {
        toast.success(`Matched Class Teacher: ${data.classTeacher.name}`);
      }

      onDirtyChange?.(true);
    } catch (err) {
      console.error('Preview parsing error:', err);
      setParseError(err?.response?.data?.error?.message || err?.message || 'Failed to parse timetable.');
      toast.error('Failed to extract subjects from PDF page.');
    } finally {
      setIsParsing(false);
    }
  }, [activeDepartmentId, resolvedClassId, onDirtyChange]);

  // ─────────────────────────────────────────────────────────────────────────────
  // FILE SELECTION / INSPECT HANDLER
  // ─────────────────────────────────────────────────────────────────────────────
  const handleResetFile = () => {
    setPdfFile(null);
    setInspection(null);
    setSelectedPage(null);
    setExtractedRows([]);
    setResolvedClassId(null);
    setResolvedClassData(null);
    setParseError(null);
    onDirtyChange?.(false);
  };

  const handleFileDrop = async (file) => {
    if (!file) {
      handleResetFile();
      return;
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF documents are supported for timetable parsing.');
      return;
    }

    setPdfFile(file);
    setIsInspecting(true);
    setInspection(null);
    setParseError(null);
    setSelectedPage(null);
    setExtractedRows([]);
    setResolvedClassId(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      if (activeDepartmentId) fd.append('departmentId', activeDepartmentId);
      if (resolvedClassId) fd.append('classId', resolvedClassId);

      const res = await inspectTimetablePdf(fd);
      const inspData = res?.data?.pages !== undefined ? res.data : (res?.pages !== undefined ? res : (res?.data || res));
      setInspection(inspData);

      // Auto-resolve department for Admin if not set
      if (!sectionForm.departmentId && inspData.pages?.[0]?.detectedDepartment && departments?.length > 0) {
        const code = inspData.pages[0].detectedDepartment.toUpperCase();
        const matchedDept = departments.find(d => d.code?.toUpperCase() === code || d.name?.toUpperCase().includes(code));
        if (matchedDept) {
          setSectionForm(prev => ({ ...prev, departmentId: matchedDept._id }));
        }
      }

      // If document has only 1 page, auto-select it directly
      if (!inspData.isMultiPage || inspData.pageCount === 1) {
        setSelectedPage(1);
        await runPreviewForPage(file, 1);
      } else {
        // Multi-page document: auto-preview the recommended page or page 1 so user immediately sees preview!
        const targetPage = inspData.recommendedPage || 1;
        setSelectedPage(targetPage);
        await runPreviewForPage(file, targetPage);
        toast.success(`Detected ${inspData.pageCount} section pages. Previewing ${inspData.pages?.[targetPage - 1]?.displayName || ('Section ' + targetPage)}.`);
      }
    } catch (err) {
      console.error('Inspection error:', err);
      toast.error(err?.response?.data?.error?.message || 'Failed to inspect PDF structure.');
    } finally {
      setIsInspecting(false);
    }
  };

  const handleSelectPage = (pageNum) => {
    if (pageNum === selectedPage && extractedRows.length > 0) return;
    setSelectedPage(pageNum);
    runPreviewForPage(pdfFile, pageNum);
  };

  // Filter multi-page inspection list
  const filteredPages = useMemo(() => {
    if (!inspection?.pages) return [];
    if (!pageSearchQuery.trim()) return inspection.pages;
    const q = pageSearchQuery.toLowerCase();
    return inspection.pages.filter((p) => {
      const cls = (p.displayName || p.detectedClassName || '').toLowerCase();
      const header = (p.header || '').toLowerCase();
      const teacher = (p.detectedTeacher || '').toLowerCase();
      const sem = `semester ${p.detectedSemester || ''} sem ${p.detectedSemester || ''}`;
      return cls.includes(q) || header.includes(q) || teacher.includes(q) || sem.includes(q);
    });
  }, [inspection, pageSearchQuery]);

  // ─────────────────────────────────────────────────────────────────────────────
  // SUBJECT ROW MUTATION HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────
  const handleFacultyChange = (index, facultyId) => {
    const matchedFac = facultyList.find((f) => f._id === facultyId);
    setExtractedRows((prev) => {
      const updated = [...prev];
      const target = { ...updated[index] };
      target.facultyId = facultyId || null;
      target.facultyName = matchedFac ? matchedFac.name : 'Unassigned';

      if (facultyId) {
        target.status = 'matched';
        target.requiresReview = false;
        target.reviewReasons = target.reviewReasons.filter((r) => !r.includes('faculty'));
      }
      updated[index] = target;
      return updated;
    });
    onDirtyChange?.(true);
  };

  const handleToggleExclude = (index) => {
    setExtractedRows((prev) => {
      const updated = [...prev];
      const target = { ...updated[index] };
      if (target.status === 'excluded') {
        target.status = target.facultyId ? 'matched' : 'flagged';
      } else {
        target.status = 'excluded';
      }
      updated[index] = target;
      return updated;
    });
    onDirtyChange?.(true);
  };

  const counts = useMemo(() => {
    const total = extractedRows.length;
    const matched = extractedRows.filter((r) => r.status === 'matched').length;
    const flagged = extractedRows.filter((r) => r.status === 'flagged').length;
    const excluded = extractedRows.filter((r) => r.status === 'excluded').length;
    return { total, matched, flagged, excluded };
  }, [extractedRows]);

  const displayedRows = useMemo(() => {
    if (subjectFilter === 'matched') return extractedRows.filter((r) => r.status === 'matched');
    if (subjectFilter === 'flagged') return extractedRows.filter((r) => r.status === 'flagged');
    if (subjectFilter === 'excluded') return extractedRows.filter((r) => r.status === 'excluded');
    return extractedRows;
  }, [extractedRows, subjectFilter]);

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIRM & COMMIT HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────
  const handleCommitPdfFlow = async () => {
    if (!resolvedClassId) {
      toast.error('No class has been resolved. Please select or upload a section timetable.');
      return;
    }

    if (extractedRows.filter((r) => r.status !== 'excluded').length === 0) {
      toast.error('At least one subject must be active to proceed.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await commitTimetable({
        uploadId,
        classId: resolvedClassId,
        targetSemester: sectionForm.semester,
        classTeacherId: sectionForm.classTeacherId || null,
        confirmedRows: extractedRows,
      });

      const updatedClass = res?.data?.classData || resolvedClassData;
      const classDisplayName = formatSectionDisplayName(sectionForm.name, sectionForm.semester);
      const summary = `${classDisplayName} · Sem ${sectionForm.semester} · ${counts.matched} subjects configured`;

      toast.success(`Configured ${counts.matched} subjects for ${classDisplayName}!`);
      onDirtyChange?.(false);

      onSave({
        classId: resolvedClassId,
        classData: {
          ...updatedClass,
          name: sectionForm.name,
          semester: sectionForm.semester,
          classTeacherId: sectionForm.classTeacherId,
        },
        summary,
        completedTimetable: true,
      });
    } catch (err) {
      console.error('Commit timetable error:', err);
      toast.error(err?.response?.data?.error?.message || err?.message || 'Failed to commit timetable configuration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSave = async () => {
    setIsSubmitting(true);
    try {
      let targetClsId = manualSelectedClassId;
      let targetClassObj = null;

      if (manualMode === 'new') {
        if (!sectionForm.name.trim()) {
          toast.error('Class name is required.');
          setIsSubmitting(false);
          return;
        }
        const createRes = await createClass({
          name: sectionForm.name.trim(),
          semester: sectionForm.semester,
          departmentId: activeDepartmentId,
          academicYear: sectionForm.academicYear,
          classTeacherId: sectionForm.classTeacherId || null,
        });
        targetClassObj = createRes?.data || createRes;
        targetClsId = targetClassObj._id;
      } else {
        if (!manualSelectedClassId) {
          toast.error('Please select an operational section.');
          setIsSubmitting(false);
          return;
        }
        targetClassObj = operationalClasses.find((c) => c._id === manualSelectedClassId);
        if (sectionForm.classTeacherId !== targetClassObj?.classTeacherId?._id) {
          await updateClass(targetClsId, {
            classTeacherId: sectionForm.classTeacherId || null,
          });
        }
      }

      // If manualSource is master curriculum
      if (manualSource === 'master' && masterClass) {
        await cloneClassSubjects(targetClsId, masterClass._id);
        toast.success(`Inherited Master Syllabus subjects for Semester ${sectionForm.semester}!`);
      } else if (manualSource === 'clone' && cloneSourceClassId) {
        await cloneClassSubjects(targetClsId, cloneSourceClassId);
        toast.success('Cloned subjects from source section!');
      }

      const refreshed = await getClass(targetClsId);
      const finalClass = refreshed?.data || refreshed || targetClassObj;
      const classDisplayName = formatSectionDisplayName(finalClass.name, finalClass.semester);
      const summary = `${classDisplayName} · Sem ${finalClass.semester} · Manual setup`;

      toast.success(`Class ${classDisplayName} configured successfully!`);
      onDirtyChange?.(false);

      onSave({
        classId: targetClsId,
        classData: finalClass,
        summary,
        completedTimetable: true,
      });
    } catch (err) {
      console.error('Manual save error:', err);
      toast.error(err?.response?.data?.error?.message || err?.message || 'Failed to save manual class setup.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Tab Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200">
        <div className="inline-flex rounded-xl bg-zinc-100 p-1 border border-zinc-200/80">
          <button
            type="button"
            onClick={() => setActiveTab('pdf')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'pdf'
                ? 'bg-white text-navy shadow-xs border border-zinc-200/60'
                : 'text-zinc-600 hover:text-navy hover:bg-zinc-200/50'
            }`}
          >
            <FileText size={14} className={activeTab === 'pdf' ? 'text-indigo-600' : 'text-zinc-500'} />
            <span>Upload Timetable PDF</span>
            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/60">
              Auto-Detect
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'manual'
                ? 'bg-white text-navy shadow-xs border border-zinc-200/60'
                : 'text-zinc-600 hover:text-navy hover:bg-zinc-200/50'
            }`}
          >
            <Layers size={14} className={activeTab === 'manual' ? 'text-indigo-600' : 'text-zinc-500'} />
            <span>Manual Setup / Master Syllabus</span>
          </button>
        </div>

        <p className="text-xs text-zinc-500 font-medium hidden md:block">
          {activeTab === 'pdf'
            ? 'Drops PDF right here to auto-provision section, semester, class teacher & subjects.'
            : 'Select an existing class or inherit directly from the department master blueprint.'}
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          TAB 1: PDF UPLOAD & DETECTION FLOW
      ───────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'pdf' && (
        <div className="space-y-6">
          {/* File Dropzone (shown if no PDF selected yet) */}
          {!pdfFile && (
            <div className="space-y-4">
              <FileDropzone
                onFileSelect={handleFileDrop}
                onFileSelected={handleFileDrop}
                accept=".pdf,application/pdf"
                title="Drop Institutional Timetable PDF Here"
                subtitle="Upload official timetable PDF. Automatically extracts section name, semester, class teacher, and curriculum subjects."
                loading={isInspecting}
                isProcessing={isInspecting}
                file={pdfFile}
                icon={FileText}
              />
            </div>
          )}

          {/* Active File Summary Banner (shown when PDF is chosen) */}
          {pdfFile && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-white border border-zinc-200/90 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-600 shrink-0">
                  <FileText size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-xs font-black text-navy">{pdfFile.name}</h4>
                    <span className="text-[11px] text-zinc-500 tabular-nums">({(pdfFile.size / 1024).toFixed(1)} KB)</span>
                    {inspection?.pageCount && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                        {inspection.pageCount} Sections Detected
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Official document verified. Pick any section page to configure its curriculum.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetFile}
                className="text-xs font-bold text-zinc-600 hover:text-navy px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 self-start sm:self-auto flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw size={13} className="text-zinc-500" />
                <span>Upload Different PDF</span>
              </button>
            </div>
          )}

          {/* Multi-Section Interactive Strip (when multi-page PDF inspected) */}
          {inspection?.isMultiPage && inspection.pages?.length > 1 && (
            <div className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h4 className="text-xs font-black text-navy uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} className="text-indigo-600" />
                  <span>Choose Section ({inspection.pageCount} Available)</span>
                </h4>

                <div className="relative w-full sm:w-60">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={pageSearchQuery}
                    onChange={(e) => setPageSearchQuery(e.target.value)}
                    placeholder="Filter sections..."
                    className="w-full pl-7 pr-3 py-1 rounded-lg border border-zinc-200 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Horizontal / Grid Section Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-1">
                {filteredPages.map((page) => {
                  const isCurrent = selectedPage === page.pageNumber;
                  const displayName = page.displayName || page.detectedClassName || `Page ${page.pageNumber}`;
                  return (
                    <button
                      key={page.pageNumber}
                      type="button"
                      onClick={() => handleSelectPage(page.pageNumber)}
                      className={`p-2.5 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                        isCurrent
                          ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/20'
                          : 'border-zinc-200 bg-zinc-50/50 hover:bg-white hover:border-zinc-300 text-navy'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-[9px] font-black uppercase tracking-wider ${isCurrent ? 'text-indigo-100' : 'text-zinc-500'}`}>
                          P.{page.pageNumber}
                        </span>
                        {isCurrent && <Check size={12} className="stroke-[3]" />}
                      </div>

                      <div className="mt-1">
                        <p className={`text-xs font-black leading-tight ${isCurrent ? 'text-white' : 'text-navy'}`}>
                          {displayName}
                        </p>
                        <p className={`text-[10px] font-semibold mt-0.5 ${isCurrent ? 'text-indigo-200' : 'text-zinc-500'}`}>
                          Sem {page.detectedSemester || '—'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Parsing Spinner */}
          {isParsing && (
            <div className="p-6 rounded-2xl bg-white border border-zinc-200/80 shadow-xs">
              <StepTableSkeleton />
              <div className="text-center pt-4 text-xs font-semibold text-indigo-700 animate-pulse">
                Extracting timetable table lines, matching registered faculty & verifying subject codes...
              </div>
            </div>
          )}

          {/* Parse Error Display */}
          {parseError && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Extraction Issue</p>
                <p className="mt-0.5 text-amber-800">{parseError}</p>
                <button
                  type="button"
                  onClick={handleResetFile}
                  className="mt-2 text-xs font-bold text-indigo-700 hover:underline"
                >
                  Upload another PDF or choose a different page
                </button>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────────────
              CONFIRMATION & SUBJECTS REVIEW (Shown once preview is ready)
          ───────────────────────────────────────────────────────────────────────── */}
          {!isParsing && extractedRows.length > 0 && (
            <div className="space-y-5">
              {/* Detected Section Metadata Card */}
              <div className="p-5 rounded-2xl bg-white border border-zinc-200/90 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-700 font-black text-xs">
                      {getAcademicYearRoman(sectionForm.semester)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-navy">
                          {formatSectionDisplayName(sectionForm.name, sectionForm.semester)}
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Detected from Timetable
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 font-medium">
                        Confirm or adjust class parameters before importing enrolled students.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Form Controls Grid for Section Attributes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Class Name */}
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">
                      Section Name
                    </label>
                    <input
                      type="text"
                      value={sectionForm.name}
                      onChange={(e) => setSectionForm((p) => ({ ...p, name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-black text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                    />
                  </div>

                  {/* Semester */}
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">
                      Semester
                    </label>
                    <select
                      value={sectionForm.semester}
                      onChange={(e) => setSectionForm((p) => ({ ...p, semester: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                        <option key={s} value={s}>
                          Semester {s} ({getAcademicYearRoman(s)} Year)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Class Teacher */}
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-bold text-zinc-700 mb-1 flex items-center justify-between">
                      <span>Assigned Class Teacher</span>
                      {sectionForm.classTeacherId && (
                        <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                          <Check size={10} /> Ready for Pre-flight
                        </span>
                      )}
                    </label>
                    <select
                      value={sectionForm.classTeacherId}
                      onChange={(e) => setSectionForm((p) => ({ ...p, classTeacherId: e.target.value }))}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-bold focus:outline-none focus:ring-2 ${
                        sectionForm.classTeacherId
                          ? 'border-emerald-300 bg-emerald-50/30 text-emerald-950 focus:ring-emerald-500/20 focus:border-emerald-600'
                          : 'border-amber-300 bg-amber-50/30 text-amber-950 focus:ring-amber-500/20 focus:border-amber-600'
                      }`}
                    >
                      <option value="">-- Choose Class Teacher --</option>
                      {facultyList.map((f) => (
                        <option key={f._id} value={f._id}>
                          {f.name} {f.employeeId ? `(${f.employeeId})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Subjects Table Review */}
              <div className="p-5 rounded-2xl bg-white border border-zinc-200/90 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-black text-navy">
                      Extracted Curriculum Subjects ({extractedRows.length})
                    </h4>
                    <p className="text-xs text-zinc-500">
                      Verify faculty assignments. Subjects without a assigned teacher can be mapped or excluded.
                    </p>
                  </div>

                  {/* Filter Pills */}
                  <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 border border-zinc-200/70 text-xs">
                    <button
                      type="button"
                      onClick={() => setSubjectFilter('all')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                        subjectFilter === 'all' ? 'bg-white text-navy shadow-xs' : 'text-zinc-600'
                      }`}
                    >
                      All ({counts.total})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubjectFilter('matched')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                        subjectFilter === 'matched' ? 'bg-white text-emerald-800 shadow-xs' : 'text-zinc-600'
                      }`}
                    >
                      Matched ({counts.matched})
                    </button>
                    {counts.flagged > 0 && (
                      <button
                        type="button"
                        onClick={() => setSubjectFilter('flagged')}
                        className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                          subjectFilter === 'flagged' ? 'bg-white text-amber-800 shadow-xs' : 'text-zinc-600'
                        }`}
                      >
                        Needs Review ({counts.flagged})
                      </button>
                    )}
                    {counts.excluded > 0 && (
                      <button
                        type="button"
                        onClick={() => setSubjectFilter('excluded')}
                        className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                          subjectFilter === 'excluded' ? 'bg-white text-zinc-800 shadow-xs' : 'text-zinc-600'
                        }`}
                      >
                        Excluded ({counts.excluded})
                      </button>
                    )}
                  </div>
                </div>

                {/* Subjects Table */}
                <div className="overflow-x-auto rounded-xl border border-zinc-200/90">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-zinc-50/80 border-b border-zinc-200 text-zinc-500 uppercase tracking-wider text-[10px] font-black">
                        <th className="py-2.5 px-3">Subject Code</th>
                        <th className="py-2.5 px-3">Subject Name</th>
                        <th className="py-2.5 px-3">Handling Faculty</th>
                        <th className="py-2.5 px-2 text-center">Category</th>
                        <th className="py-2.5 px-2 text-center">Status</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {displayedRows.map((row, idx) => {
                        const originalIdx = extractedRows.indexOf(row);
                        const isExcluded = row.status === 'excluded';
                        return (
                          <tr
                            key={`${row.subjectCode}-${idx}`}
                            className={`transition-colors ${
                              isExcluded
                                ? 'bg-zinc-50/60 opacity-60'
                                : row.status === 'flagged'
                                ? 'bg-amber-50/30'
                                : 'hover:bg-zinc-50/50'
                            }`}
                          >
                            <td className="py-2.5 px-3 font-mono font-black text-navy whitespace-nowrap">
                              {row.subjectCode}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-zinc-800 max-w-xs truncate" title={row.subjectName}>
                              {row.subjectName}
                            </td>
                            <td className="py-2.5 px-3">
                              {isExcluded ? (
                                <span className="text-zinc-400 font-semibold italic">Excluded</span>
                              ) : (
                                <select
                                  value={row.facultyId || ''}
                                  onChange={(e) => handleFacultyChange(originalIdx, e.target.value)}
                                  className={`w-full max-w-xs px-2 py-1 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-1 ${
                                    row.facultyId
                                      ? 'border-zinc-200 bg-white text-zinc-900 focus:border-indigo-600'
                                      : 'border-amber-300 bg-amber-50 text-amber-950 font-bold focus:border-amber-600'
                                  }`}
                                >
                                  <option value="">-- Assign Faculty ({row.facultyName || 'None'}) --</option>
                                  {facultyList.map((f) => (
                                    <option key={f._id} value={f._id}>
                                      {f.name} {f.employeeId ? `(${f.employeeId})` : ''}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                  row.isElective
                                    ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                    : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                                }`}
                              >
                                {row.isElective ? 'Elective' : 'Core'}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              {isExcluded ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-500">
                                  <Ban size={11} /> Excluded
                                </span>
                              ) : row.status === 'matched' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                                  <CheckCircle size={11} /> Matched
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700">
                                  <AlertTriangle size={11} /> Review
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleToggleExclude(originalIdx)}
                                className={`text-[11px] font-bold px-2 py-1 rounded transition-colors ${
                                  isExcluded
                                    ? 'text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50'
                                    : 'text-zinc-500 hover:text-red-700 hover:bg-red-50'
                                }`}
                              >
                                {isExcluded ? 'Include' : 'Exclude'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Bottom Action Bar */}
                <div className="pt-3 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-zinc-500 font-medium">
                    <span>Active curriculum: </span>
                    <strong className="text-navy">{counts.matched} subjects</strong>
                    {counts.flagged > 0 && (
                      <span className="text-amber-700 font-bold ml-2">
                        ({counts.flagged} unassigned faculty)
                      </span>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={handleCommitPdfFlow}
                    loading={isSubmitting}
                    disabled={isSubmitting}
                    className="w-full sm:w-auto"
                  >
                    <span>Confirm & Continue to Enrolled Students</span>
                    <ArrowRight size={15} />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          TAB 2: MANUAL SETUP / MASTER SYLLABUS FLOW
      ───────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'manual' && (
        <div className="space-y-5 p-5 rounded-2xl bg-white border border-zinc-200/90 shadow-xs">
          {/* Mode Selector */}
          <div className="flex items-center gap-4 pb-3 border-b border-zinc-100 text-xs">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-navy">
              <input
                type="radio"
                name="manualMode"
                value="existing"
                checked={manualMode === 'existing'}
                onChange={() => setManualMode('existing')}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span>Select Existing Operational Class</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-bold text-navy">
              <input
                type="radio"
                name="manualMode"
                value="new"
                checked={manualMode === 'new'}
                onChange={() => setManualMode('new')}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span>Create New Section</span>
            </label>
          </div>

          {manualMode === 'existing' ? (
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Select Operational Section
              </label>
              <select
                value={manualSelectedClassId}
                onChange={(e) => {
                  setManualSelectedClassId(e.target.value);
                  const cls = operationalClasses.find((c) => c._id === e.target.value);
                  if (cls) {
                    setSectionForm({
                      name: cls.name,
                      semester: cls.semester || 1,
                      academicYear: cls.academicYear || '2025-26',
                      departmentId: cls.departmentId?._id || cls.departmentId || defaultDeptId,
                      classTeacherId: cls.classTeacherId?._id || cls.classTeacherId || '',
                    });
                  }
                }}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              >
                <option value="">-- Choose an existing section --</option>
                {operationalClasses.map((cls) => (
                  <option key={cls._id} value={cls._id}>
                    {formatSectionDisplayName(cls.name, cls.semester)} (Semester {cls.semester || 1})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Section Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. CSD-A"
                  value={sectionForm.name}
                  onChange={(e) => setSectionForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Semester *
                </label>
                <select
                  value={sectionForm.semester}
                  onChange={(e) => setSectionForm((p) => ({ ...p, semester: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>
                      Semester {s} ({getAcademicYearRoman(s)} Year)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Academic Year
                </label>
                <input
                  type="text"
                  placeholder="2025-26"
                  value={sectionForm.academicYear}
                  onChange={(e) => setSectionForm((p) => ({ ...p, academicYear: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>
            </div>
          )}

          {/* Class Teacher Picker for Manual Mode */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1">
              Class Teacher (Required for batch initiation)
            </label>
            <select
              value={sectionForm.classTeacherId}
              onChange={(e) => setSectionForm((p) => ({ ...p, classTeacherId: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            >
              <option value="">-- Choose Class Teacher --</option>
              {facultyList.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name} {f.employeeId ? `(${f.employeeId})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Curriculum Blueprint Option */}
          <div className="pt-4 border-t border-zinc-100 space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700">
              Curriculum Setup Source
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  manualSource === 'master'
                    ? 'border-indigo-600 bg-indigo-50/50'
                    : 'border-zinc-200 bg-white hover:border-zinc-300'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="manualSource"
                    value="master"
                    checked={manualSource === 'master'}
                    onChange={() => setManualSource('master')}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-xs font-black text-navy block">
                      Inherit Master Syllabus (Recommended)
                    </span>
                    <span className="text-[11px] text-zinc-500 mt-0.5 block">
                      {masterClass
                        ? `Semester ${sectionForm.semester} Master Syllabus has ${masterClass.subjectAssignments?.length || 0} defined subjects.`
                        : `No master syllabus blueprint found for Semester ${sectionForm.semester}.`}
                    </span>
                  </div>
                </div>
              </label>

              <label
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  manualSource === 'clone'
                    ? 'border-indigo-600 bg-indigo-50/50'
                    : 'border-zinc-200 bg-white hover:border-zinc-300'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="manualSource"
                    value="clone"
                    checked={manualSource === 'clone'}
                    onChange={() => setManualSource('clone')}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-xs font-black text-navy block">
                      Copy from Existing Section
                    </span>
                    <span className="text-[11px] text-zinc-500 mt-0.5 block">
                      Replicate the subject structure of another section in this semester.
                    </span>
                  </div>
                </div>
              </label>
            </div>

            {manualSource === 'clone' && (
              <div className="pt-2">
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Source Section to Copy From
                </label>
                <select
                  value={cloneSourceClassId}
                  onChange={(e) => setCloneSourceClassId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                >
                  <option value="">-- Choose source section --</option>
                  {operationalClasses
                    .filter((c) => Number(c.semester) === Number(sectionForm.semester) && c._id !== manualSelectedClassId)
                    .map((c) => (
                      <option key={c._id} value={c._id}>
                        {formatSectionDisplayName(c.name, c.semester)} ({c.subjectAssignments?.length || 0} subjects)
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div className="pt-4 border-t border-zinc-100 flex justify-end">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleManualSave}
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              <span>Save & Continue to Enrolled Students</span>
              <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Step1ClassSubjects;
