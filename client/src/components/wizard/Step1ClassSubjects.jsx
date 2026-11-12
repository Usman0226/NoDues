import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  inspectTimetablePdf,
  previewTimetable,
  commitTimetable,
  batchImportTimetable,
  cloneClassSubjects,
} from '../../api/wizard';
import { getDepartments } from '../../api/departments';
import { getClasses, getClass, createClass, updateClass } from '../../api/classes';
import { getFaculty } from '../../api/faculty';
import { ROLES } from '../../utils/constants';
import { getAcademicYearRoman, formatSectionDisplayName } from '../../utils/formatters';
import FileDropzone from '../ui/FileDropzone';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
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
  Check,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const EMPTY_CLASSES = [];

const normalizeSectionKeyClient = (name) =>
  String(name || '')
    .replace(/^(?:I{1,3}|IV|VI{0,3}|IX|X)\s+(?=[A-Za-z])/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const Step1ClassSubjects = ({
  user,
  initialClassId,
  initialData,
  initialDepartmentId,
  onSave,
  onDirtyChange,
}) => {
  const isHod = user?.role === ROLES.HOD || user?.role === 'hod';
  const defaultDeptId =
    initialDepartmentId ||
    user?.departmentId ||
    user?.department?._id ||
    (typeof user?.department === 'string' ? user?.department : '');

  const [activeTab, setActiveTab] = useState('pdf'); // 'pdf' | 'manual'

  // PDF Flow State
  const [pdfFile, setPdfFile] = useState(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspection, setInspection] = useState(null);
  const [pageSearchQuery, setPageSearchQuery] = useState('');
  const [selectedPage, setSelectedPage] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [pageCache, setPageCache] = useState({});

  const [uploadId, setUploadId] = useState(null);
  const [resolvedClassId, setResolvedClassId] = useState(initialClassId || null);
  const [resolvedClassData, setResolvedClassData] = useState(initialData || null);
  const [matchedSectionInfo, setMatchedSectionInfo] = useState(null);
  const [extractedRows, setExtractedRows] = useState([]);
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inspectInFlightRef = useRef(false);
  const previewSeqRef = useRef(0);

  // Batch Provisioning Modal
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  const [batchResult, setBatchResult] = useState(null);

  // Section Metadata
  const [sectionForm, setSectionForm] = useState({
    name: initialData?.name || '',
    semester: initialData?.semester || 1,
    academicYear: initialData?.academicYear || '2026-27',
    departmentId: defaultDeptId,
    classTeacherId: initialData?.classTeacherId?._id || initialData?.classTeacherId || '',
  });

  // Manual Flow State
  const [manualMode, setManualMode] = useState('existing'); // 'existing' | 'new'
  const [manualSelectedClassId, setManualSelectedClassId] = useState(initialClassId || '');
  const [manualSource, setManualSource] = useState('master'); // 'master' | 'clone' | 'empty'
  const [cloneSourceClassId, setCloneSourceClassId] = useState('');

  const activeDepartmentId = sectionForm.departmentId || defaultDeptId;
  const queryClient = useQueryClient();

  const { data: deptRes } = useQuery({
    queryKey: ['wizard', 'departments'],
    queryFn: getDepartments,
  });
  const departments = deptRes?.data || [];

  const { data: facultyRes } = useQuery({
    queryKey: ['wizard', 'faculty', activeDepartmentId || 'all'],
    queryFn: () => getFaculty(activeDepartmentId ? { departmentId: activeDepartmentId, limit: 150 } : { limit: 150 }),
    enabled: true,
  });
  const facultyList = facultyRes?.data || facultyRes?.faculty || [];

  const { data: classRes } = useQuery({
    queryKey: ['wizard', 'all-classes', activeDepartmentId || 'all'],
    queryFn: () => getClasses({ limit: 150 }),
  });

  const allClasses = useMemo(
    () => classRes?.data || classRes?.classes || EMPTY_CLASSES,
    [classRes]
  );

  const operationalClasses = useMemo(() => {
    return allClasses.filter((c) => {
      if (c.isMaster) return false;
      if (!activeDepartmentId) return true;
      return (c.departmentId?._id || c.departmentId) === activeDepartmentId;
    });
  }, [allClasses, activeDepartmentId]);

  const masterClass = useMemo(() => {
    return allClasses.find(
      (c) =>
        c.isMaster &&
        Number(c.semester) === Number(sectionForm.semester) &&
        (!activeDepartmentId || (c.departmentId?._id || c.departmentId) === activeDepartmentId)
    );
  }, [allClasses, sectionForm.semester, activeDepartmentId]);

  const groupedPages = useMemo(() => {
    if (!inspection?.pages || inspection.pages.length === 0) return {};
    const groups = {};
    for (const page of inspection.pages) {
      const sem = page.detectedSemester || 1;
      if (!groups[sem]) groups[sem] = [];
      groups[sem].push(page);
    }
    return groups;
  }, [inspection]);

  useEffect(() => {
    if (initialDepartmentId && (!sectionForm.departmentId || sectionForm.departmentId !== initialDepartmentId)) {
      setSectionForm((prev) => ({ ...prev, departmentId: initialDepartmentId }));
    }
  }, [initialDepartmentId, sectionForm.departmentId]);

  // Preload existing class if resuming via ?classId=
  useEffect(() => {
    if (initialClassId && !resolvedClassData) {
      getClass(initialClassId)
        .then((res) => {
          const cls = res?.data || res;
          if (!cls) return;
          setResolvedClassData(cls);
          setResolvedClassId(cls._id);
          setManualSelectedClassId(cls._id);
          setSectionForm({
            name: cls.name,
            semester: cls.semester || 1,
            academicYear: cls.academicYear || '2026-27',
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
        })
        .catch((e) => console.warn('Could not load initial class in Step 1:', e?.message));
    }
  }, [initialClassId, resolvedClassData, defaultDeptId]);

  // Keep pageCache synced so edits persist when switching between sections in a multi-page PDF
  const updateActivePageCache = useCallback(
    (patch) => {
      if (!selectedPage) return;
      setPageCache((prev) => {
        const existing = prev[selectedPage];
        if (!existing) return prev;
        return {
          ...prev,
          [selectedPage]: { ...existing, ...patch },
        };
      });
    },
    [selectedPage]
  );

  const runPreviewForPage = useCallback(
    async (file, pageNum, deptOverride) => {
      if (!file) return;
      const seq = ++previewSeqRef.current;

      if (pageCache[pageNum]) {
        const cached = pageCache[pageNum];
        setParseError(null);
        setUploadId(cached.uploadId);
        setResolvedClassId(cached.classId || null);
        setMatchedSectionInfo(cached.matchedSectionInfo || null);
        setExtractedRows(cached.rows || []);
        setSectionForm({
          name: cached.name,
          semester: cached.semester,
          academicYear: cached.academicYear || '2026-27',
          departmentId: cached.departmentId || deptOverride || activeDepartmentId,
          classTeacherId: cached.classTeacherId || '',
        });
        setResolvedClassData(cached.classData || null);
        return;
      }

      setIsParsing(true);
      setParseError(null);

      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('previewOnly', 'true');
        if (pageNum) fd.append('page', String(pageNum));
        const deptToUse = deptOverride || activeDepartmentId;
        if (deptToUse) fd.append('departmentId', deptToUse);

        const res = await previewTimetable(fd);
        if (seq !== previewSeqRef.current) return;

        const data =
          res?.data?.rows !== undefined
            ? res.data
            : res?.rows !== undefined
            ? res
            : res?.data || res;

        const rows = data.rows || [];
        const detectedName = data.className || data.metadata?.detectedClassName || 'Section A';
        const detectedSem = data.targetSemester || data.metadata?.detectedSemester || 1;
        const detectedAcademicYear = data.academicYear || data.metadata?.academicYear || '2026-27';
        const detectedTeacherId = data.classTeacher?._id || '';
        const resolvedDept = data.departmentId || deptToUse;
        const matchedInfo = {
          existingClassFound: Boolean(data.existingClassFound && data.classId),
          matchedClassId: data.classId || null,
          matchedName: detectedName,
          matchedSemester: detectedSem,
          detectedTeacher: data.detectedTeacher || '',
        };

        setUploadId(data.uploadId);
        setResolvedClassId(data.classId || null);
        setMatchedSectionInfo(matchedInfo);
        setExtractedRows(rows);

        const newForm = {
          name: detectedName,
          semester: detectedSem,
          academicYear: detectedAcademicYear,
          departmentId: resolvedDept,
          classTeacherId: detectedTeacherId || '',
        };
        setSectionForm(newForm);

        const classObj = data.classId
          ? {
              _id: data.classId,
              name: detectedName,
              semester: detectedSem,
              academicYear: detectedAcademicYear,
              departmentId: resolvedDept,
              classTeacher: data.classTeacher,
              classTeacherId: data.classTeacher?._id || null,
            }
          : null;
        setResolvedClassData(classObj);

        setPageCache((prev) => ({
          ...prev,
          [pageNum]: {
            uploadId: data.uploadId,
            classId: data.classId || null,
            matchedSectionInfo: matchedInfo,
            name: detectedName,
            semester: detectedSem,
            academicYear: detectedAcademicYear,
            departmentId: resolvedDept,
            classTeacherId: detectedTeacherId,
            classData: classObj,
            rows,
          },
        }));

        if (rows.length === 0) {
          setParseError(
            'No timetable subject rows were detected on this page. Check if the PDF contains selectable schedule text, try another page, or switch to Manual Setup.'
          );
        } else if (data.detectedTeacher && !data.classTeacher) {
          toast(
            `Detected Class Teacher "${data.detectedTeacher}" could not be auto-matched. Select from the dropdown.`,
            { icon: 'ℹ️', duration: 4000 }
          );
        } else if (data.classTeacher) {
          toast.success(`Matched Class Teacher: ${data.classTeacher.name}`);
        }

        onDirtyChange?.(true);
      } catch (err) {
        if (seq !== previewSeqRef.current) return;
        const msg =
          err?.message ||
          err?.response?.data?.error?.message ||
          'Could not extract subjects from this PDF page. Ensure the document is a text-based institutional timetable or configure manually.';
        setParseError(msg);
        toast.error('Failed to parse timetable PDF');
      } finally {
        if (seq === previewSeqRef.current) {
          setIsParsing(false);
        }
      }
    },
    [activeDepartmentId, pageCache, onDirtyChange]
  );

  const handleResetFile = () => {
    ++previewSeqRef.current;
    inspectInFlightRef.current = false;
    setPdfFile(null);
    setIsInspecting(false);
    setInspection(null);
    setSelectedPage(null);
    setExtractedRows([]);
    setPageCache({});
    setUploadId(null);
    setResolvedClassId(null);
    setResolvedClassData(null);
    setMatchedSectionInfo(null);
    setParseError(null);
    setBatchResult(null);
    setBatchModalOpen(false);
    onDirtyChange?.(false);
  };

  const handleFileDrop = async (file) => {
    if (!file) {
      handleResetFile();
      return;
    }
    if (inspectInFlightRef.current) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF documents are supported for timetable parsing.');
      return;
    }

    inspectInFlightRef.current = true;
    ++previewSeqRef.current;
    setPdfFile(file);
    setIsInspecting(true);
    setInspection(null);
    setParseError(null);
    setSelectedPage(null);
    setExtractedRows([]);
    setPageCache({});
    setUploadId(null);
    setResolvedClassId(null);
    setResolvedClassData(null);
    setMatchedSectionInfo(null);
    setBatchResult(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      if (activeDepartmentId) fd.append('departmentId', activeDepartmentId);

      const res = await inspectTimetablePdf(fd);
      const inspData =
        res?.data?.pages !== undefined
          ? res.data
          : res?.pages !== undefined
          ? res
          : res?.data || res;
      setInspection(inspData);

      let matchedDeptId = activeDepartmentId;
      if (!sectionForm.departmentId && inspData.pages?.[0]?.detectedDepartment && departments?.length > 0) {
        const code = inspData.pages[0].detectedDepartment.toUpperCase();
        const matchedDept = departments.find(
          (d) => d.code?.toUpperCase() === code || d.name?.toUpperCase().includes(code)
        );
        if (matchedDept) {
          matchedDeptId = matchedDept._id;
          setSectionForm((prev) => ({ ...prev, departmentId: matchedDept._id }));
        }
      }

      const targetPage = inspData.recommendedPage || 1;
      setSelectedPage(targetPage);
      await runPreviewForPage(file, targetPage, matchedDeptId);

      if (inspData.pageCount > 1) {
        toast.success(
          `Detected ${inspData.pageCount} section pages. Previewing ${
            inspData.pages?.[targetPage - 1]?.displayName || `Section ${targetPage}`
          }.`
        );
      }
    } catch (err) {
      const msg =
        err?.message ||
        err?.response?.data?.error?.message ||
        'Could not inspect PDF structure. Scanned image PDFs without extractable text cannot be parsed automatically — try another PDF or switch to Manual Setup.';
      setParseError(msg);
      toast.error('Failed to read timetable PDF');
    } finally {
      inspectInFlightRef.current = false;
      setIsInspecting(false);
    }
  };

  const handleSelectPage = (pageNum) => {
    if (pageNum === selectedPage && extractedRows.length > 0) return;
    setSelectedPage(pageNum);
    runPreviewForPage(pdfFile, pageNum);
  };

  const handleBatchImport = async () => {
    if (!pdfFile || isBatchImporting) return;
    setIsBatchImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', pdfFile);
      if (activeDepartmentId) fd.append('departmentId', activeDepartmentId);

      const res = await batchImportTimetable(fd);
      const data = res?.data || res;
      setBatchResult(data);
      onDirtyChange?.(false);
      queryClient.invalidateQueries({ queryKey: ['class'] });
      queryClient.invalidateQueries({ queryKey: ['wizard', 'all-classes'] });
      toast.success(`Provisioned ${data.provisionedCount || data.sections?.length || 0} sections!`);
    } catch (err) {
      toast.error(err?.message || 'Failed to batch provision sections.');
    } finally {
      setIsBatchImporting(false);
    }
  };

  const handleSelectBatchSection = (sec) => {
    setBatchModalOpen(false);
    const classDisplayName = formatSectionDisplayName(sec.name, sec.semester);
    onSave({
      classId: sec.classId,
      classData: {
        _id: sec.classId,
        name: sec.name,
        semester: sec.semester,
        academicYear: sec.academicYear,
        departmentId: activeDepartmentId,
        classTeacherId: sec.classTeacher?._id || null,
      },
      summary: `${classDisplayName} · Sem ${sec.semester} · ${sec.subjectCount} subjects provisioned`,
      completedTimetable: true,
    });
  };

  const handleSectionFieldChange = (field, value) => {
    setSectionForm((prev) => ({ ...prev, [field]: value }));
    updateActivePageCache({ [field]: value });
    onDirtyChange?.(true);
  };

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
        target.reviewReasons = (target.reviewReasons || []).filter((r) => !r.includes('faculty'));
      } else {
        target.status = 'flagged';
        target.requiresReview = true;
      }
      updated[index] = target;
      updateActivePageCache({ rows: updated });
      return updated;
    });
    onDirtyChange?.(true);
  };

  const handleToggleExclude = (index) => {
    setExtractedRows((prev) => {
      const updated = [...prev];
      const target = { ...updated[index] };
      target.status = target.status === 'excluded' ? (target.facultyId ? 'matched' : 'flagged') : 'excluded';
      updated[index] = target;
      updateActivePageCache({ rows: updated });
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

  const handleCommitPdfFlow = async () => {
    if (isSubmitting) return;
    if (!sectionForm.name.trim()) {
      toast.error('Section name is required.');
      return;
    }
    if (extractedRows.filter((r) => r.status !== 'excluded').length === 0) {
      toast.error('At least one subject must remain active to proceed.');
      return;
    }

    const matchesAutoMatchedSection =
      Boolean(resolvedClassId) &&
      (!matchedSectionInfo ||
        (matchedSectionInfo.matchedClassId === resolvedClassId &&
          normalizeSectionKeyClient(sectionForm.name) ===
            normalizeSectionKeyClient(matchedSectionInfo.matchedName) &&
          Number(sectionForm.semester) === Number(matchedSectionInfo.matchedSemester)));
    const effectiveClassId = matchesAutoMatchedSection ? resolvedClassId : undefined;

    if (!effectiveClassId && !activeDepartmentId) {
      toast.error('Please select a target department before confirming.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await commitTimetable({
        uploadId,
        classId: effectiveClassId,
        className: sectionForm.name.trim(),
        academicYear: sectionForm.academicYear?.trim() || '2026-27',
        departmentId: activeDepartmentId || undefined,
        targetSemester: sectionForm.semester,
        classTeacherId: sectionForm.classTeacherId || null,
        confirmedRows: extractedRows,
      });

      const payload = res?.data || res;
      const committedClassId = payload?.classId || effectiveClassId;
      const updatedClass = payload?.classData || resolvedClassData;
      const classDisplayName = formatSectionDisplayName(
        updatedClass?.name || sectionForm.name,
        updatedClass?.semester || sectionForm.semester
      );

      setResolvedClassId(committedClassId);
      setResolvedClassData(updatedClass);
      if (selectedPage) {
        updateActivePageCache({
          classId: committedClassId,
          classData: updatedClass,
          matchedSectionInfo: {
            ...(matchedSectionInfo || {}),
            existingClassFound: true,
            matchedClassId: committedClassId,
            matchedName: updatedClass?.name || sectionForm.name.trim(),
            matchedSemester: updatedClass?.semester || sectionForm.semester,
          },
        });
      }

      toast.success(`Configured ${counts.matched + counts.flagged} active subjects for ${classDisplayName}!`);
      queryClient.invalidateQueries({ queryKey: ['class'] });
      queryClient.invalidateQueries({ queryKey: ['wizard', 'all-classes'] });
      onDirtyChange?.(false);

      onSave({
        classId: committedClassId,
        classData: {
          ...updatedClass,
          name: updatedClass?.name || sectionForm.name.trim(),
          semester: updatedClass?.semester || sectionForm.semester,
          academicYear: updatedClass?.academicYear || sectionForm.academicYear,
          classTeacherId: sectionForm.classTeacherId || updatedClass?.classTeacherId || null,
        },
        summary: `${classDisplayName} · Sem ${sectionForm.semester} · ${counts.matched + counts.flagged} subjects`,
        completedTimetable: true,
      });
    } catch (err) {
      toast.error(err?.message || 'Failed to save timetable configuration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSave = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      let targetClsId = manualSelectedClassId;
      let targetClassObj = null;

      if (manualMode === 'new') {
        if (!sectionForm.name.trim()) {
          toast.error('Section name is required.');
          setIsSubmitting(false);
          return;
        }
        if (!activeDepartmentId) {
          toast.error('Please select a target department.');
          setIsSubmitting(false);
          return;
        }
        const normalizedInputName = normalizeSectionKeyClient(sectionForm.name);
        const duplicateExisting = operationalClasses.find(
          (c) =>
            normalizeSectionKeyClient(c.name) === normalizedInputName &&
            Number(c.semester) === Number(sectionForm.semester)
        );
        if (duplicateExisting) {
          toast.error(
            `Section "${duplicateExisting.name}" already exists in Semester ${sectionForm.semester}. Switch to "Existing" to update it instead.`
          );
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
        const existingCtId = targetClassObj?.classTeacherId?._id || targetClassObj?.classTeacherId || '';
        if (sectionForm.classTeacherId !== existingCtId) {
          await updateClass(targetClsId, {
            classTeacherId: sectionForm.classTeacherId || null,
          });
        }
      }

      if (manualSource === 'master' && masterClass) {
        await cloneClassSubjects(targetClsId, masterClass._id);
        toast.success(`Inherited Master Syllabus for Semester ${sectionForm.semester}!`);
      } else if (manualSource === 'clone' && cloneSourceClassId) {
        await cloneClassSubjects(targetClsId, cloneSourceClassId);
        toast.success('Copied subjects from source section!');
      }

      const refreshed = await getClass(targetClsId);
      const finalClass = refreshed?.data || refreshed || targetClassObj;
      const classDisplayName = formatSectionDisplayName(finalClass.name, finalClass.semester);
      toast.success(`Class ${classDisplayName} configured!`);
      queryClient.invalidateQueries({ queryKey: ['class'] });
      queryClient.invalidateQueries({ queryKey: ['wizard', 'all-classes'] });
      onDirtyChange?.(false);

      onSave({
        classId: targetClsId,
        classData: finalClass,
        summary: `${classDisplayName} · Sem ${finalClass.semester} · Manual setup`,
        completedTimetable: true,
      });
    } catch (err) {
      toast.error(err?.message || 'Failed to save manual class setup.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasMultiPages = Boolean(inspection?.isMultiPage && inspection.pages?.length > 1);
  const canShowFooterPdf = activeTab === 'pdf' && !isParsing && extractedRows.length > 0;

  return (
    <>
      {/* Mode Switcher Bar */}
      <div className="shrink-0 px-4 sm:px-5 py-2.5 border-b border-zinc-100 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="inline-flex h-9 items-center rounded-full bg-zinc-100 p-1 border border-zinc-200/80 self-start">
          <button
            type="button"
            onClick={() => setActiveTab('pdf')}
            className={`h-full inline-flex items-center gap-1.5 px-3.5 rounded-full text-[11px] font-bold transition-all ${
              activeTab === 'pdf'
                ? 'bg-navy text-white shadow-xs'
                : 'text-zinc-600 hover:text-navy'
            }`}
          >
            <FileText size={13} />
            <span>Timetable PDF</span>
            <span
              className={`hidden sm:inline-block px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                activeTab === 'pdf' ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700'
              }`}
            >
              Auto
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`h-full inline-flex items-center gap-1.5 px-3.5 rounded-full text-[11px] font-bold transition-all ${
              activeTab === 'manual'
                ? 'bg-navy text-white shadow-xs'
                : 'text-zinc-600 hover:text-navy'
            }`}
          >
            <Layers size={13} />
            <span>Manual / Master Syllabus</span>
          </button>
        </div>

        {/* File Context Actions when a PDF is loaded */}
        {activeTab === 'pdf' && pdfFile && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-navy truncate max-w-[180px]" title={pdfFile.name}>
              {pdfFile.name}
            </span>
            {inspection?.pageCount && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                {inspection.pageCount} {inspection.pageCount === 1 ? 'Section' : 'Sections'}
              </span>
            )}
            {hasMultiPages && (
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={() => setBatchModalOpen(true)}
                className="border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              >
                <Sparkles size={12} />
                <span>Batch Provision ({inspection.pageCount})</span>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleResetFile}
              className="border border-zinc-200 text-zinc-600 hover:text-navy"
            >
              <RotateCcw size={12} />
              <span>Change PDF</span>
            </Button>
          </div>
        )}
      </div>

      {/* Main Content Area (Roomy 2-Column Workspace) */}
      {activeTab === 'pdf' ? (
        <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-5">
          {/* State A: No PDF selected */}
          {!pdfFile && (
            resolvedClassId && extractedRows.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-5 space-y-3">
                  <FileDropzone
                    onFileSelect={handleFileDrop}
                    accept=".pdf,application/pdf"
                    title="Upload New Timetable PDF"
                    subtitle="Replace or re-extract subjects & class teacher from an institutional PDF."
                    loading={isInspecting}
                    isProcessing={isInspecting}
                    icon={FileText}
                  />
                  <div className="flex items-center justify-between gap-2 px-1 text-xs text-zinc-500">
                    <span>Need to clone Master Syllabus?</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('manual')}
                      className="font-bold text-indigo-600 hover:text-indigo-800 underline"
                    >
                      Manual / Master Setup
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-7 flex flex-col rounded-2xl border border-zinc-200/90 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50/70 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 block">
                        Configured Section Curriculum
                      </span>
                      <h4 className="text-sm font-black text-navy">
                        {formatSectionDisplayName(sectionForm.name, sectionForm.semester)} · Sem {sectionForm.semester}
                      </h4>
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() =>
                        onSave({
                          classId: resolvedClassId,
                          classData: resolvedClassData,
                          summary: `${formatSectionDisplayName(sectionForm.name, sectionForm.semester)} · Sem ${sectionForm.semester} · ${counts.matched + counts.flagged} subjects`,
                          completedTimetable: true,
                        })
                      }
                    >
                      <span>Continue to Students</span>
                      <ArrowRight size={13} />
                    </Button>
                  </div>

                  <div className="max-h-[340px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-zinc-50 border-b border-zinc-200">
                        <tr className="text-zinc-500 uppercase tracking-wider text-[10px] font-black">
                          <th className="py-2 px-3">Code</th>
                          <th className="py-2 px-3">Subject</th>
                          <th className="py-2 px-3">Faculty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {extractedRows.map((row, i) => (
                          <tr key={`${row.subjectCode}-${i}`} className="hover:bg-zinc-50/60">
                            <td className="py-2 px-3 font-mono font-bold text-navy whitespace-nowrap">
                              {row.subjectCode}
                            </td>
                            <td className="py-2 px-3 font-semibold text-zinc-800">{row.subjectName}</td>
                            <td className="py-2 px-3 text-zinc-600">{row.facultyName || 'Unassigned'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-[340px] flex items-center justify-center">
                <div className="max-w-2xl w-full space-y-3">
                  <FileDropzone
                    onFileSelect={handleFileDrop}
                    accept=".pdf,application/pdf"
                    title="Drop Institutional Timetable PDF Here"
                    subtitle="Automatically extracts section name, semester, class teacher, and curriculum subjects."
                    loading={isInspecting}
                    isProcessing={isInspecting}
                    icon={FileText}
                  />
                  <p className="text-center text-xs text-zinc-500">
                    Prefer creating a section manually or inheriting from the department master blueprint?{' '}
                    <button
                      type="button"
                      onClick={() => setActiveTab('manual')}
                      className="font-bold text-indigo-600 hover:text-indigo-800 underline"
                    >
                      Switch to Manual Setup
                    </button>
                  </p>
                </div>
              </div>
            )
          )}

          {/* State B: Inspecting / Parsing Skeleton */}
          {pdfFile && (isInspecting || isParsing) && !parseError && (
            <div className="py-6">
              <StepTableSkeleton rows={6} />
              <p className="text-center pt-3 text-xs font-semibold text-indigo-700 animate-pulse">
                Extracting timetable schedule, matching registered faculty & verifying subjects...
              </p>
            </div>
          )}

          {/* State C: Extraction / Inspection Failure Recovery */}
          {pdfFile && !isInspecting && !isParsing && parseError && (
            <div className="flex-1 min-h-[300px] flex items-center justify-center p-4">
              <div className="max-w-lg w-full p-5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-black text-amber-950">Could Not Extract Timetable Subjects</p>
                    <p className="text-amber-800 leading-relaxed">{parseError}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-8">
                  <Button type="button" variant="secondary" size="xs" onClick={handleResetFile}>
                    <RotateCcw size={12} /> Try Another PDF
                  </Button>
                  <Button type="button" variant="primary" size="xs" onClick={() => setActiveTab('manual')}>
                    <Layers size={12} /> Switch to Manual Setup
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* State D: Spacious 2-Column PDF Review Workspace */}
          {pdfFile && !isInspecting && !isParsing && !parseError && extractedRows.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* LEFT COLUMN: Detected Sections (multi-page) + Class Details for Review */}
              <div className="lg:col-span-4 flex flex-col gap-3">
                {hasMultiPages && (
                  <aside className="flex flex-col rounded-2xl border border-zinc-200/90 bg-zinc-50/50 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 px-0.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                        Detected Sections ({inspection.pageCount})
                      </span>
                      <span className="text-[10px] font-semibold text-zinc-400">
                        Click to preview
                      </span>
                    </div>

                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        value={pageSearchQuery}
                        onChange={(e) => setPageSearchQuery(e.target.value)}
                        placeholder={`Filter ${inspection.pageCount} sections...`}
                        className="w-full h-8 pl-8 pr-3 rounded-xl border border-zinc-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-navy/10"
                      />
                    </div>

                    <div className="max-h-48 lg:max-h-56 overflow-y-auto space-y-2.5 pr-0.5">
                      {Object.entries(groupedPages).map(([sem, pages]) => {
                        const filtered = pages.filter((p) => {
                          if (!pageSearchQuery.trim()) return true;
                          const q = pageSearchQuery.toLowerCase();
                          const cls = (p.displayName || p.detectedClassName || '').toLowerCase();
                          const teacher = (p.detectedTeacher || '').toLowerCase();
                          return cls.includes(q) || teacher.includes(q);
                        });
                        if (filtered.length === 0) return null;

                        return (
                          <div key={sem} className="space-y-1">
                            <div className="flex items-center justify-between px-1">
                              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                                Sem {sem} ({getAcademicYearRoman(Number(sem))} Yr)
                              </span>
                              <span className="text-[10px] font-bold text-zinc-400">{filtered.length}</span>
                            </div>
                            <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5">
                              {filtered.map((page) => {
                                const isCurrent = selectedPage === page.pageNumber;
                                const displayName = page.displayName || page.detectedClassName || `Page ${page.pageNumber}`;
                                const isCached = Boolean(pageCache[page.pageNumber]);
                                return (
                                  <button
                                    key={page.pageNumber}
                                    type="button"
                                    onClick={() => handleSelectPage(page.pageNumber)}
                                    className={`px-3 py-2 rounded-xl border text-left transition-all flex items-center justify-between gap-2 ${
                                      isCurrent
                                        ? 'bg-navy text-white border-navy shadow-xs'
                                        : 'bg-white border-zinc-200/80 hover:border-indigo-300 text-navy'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <p className={`text-xs font-black truncate ${isCurrent ? 'text-white' : 'text-navy'}`}>
                                        {displayName}
                                      </p>
                                      <p
                                        className={`text-[10px] truncate ${
                                          isCurrent ? 'text-indigo-100' : 'text-zinc-500'
                                        }`}
                                      >
                                        {page.detectedTeacher ? `CT: ${page.detectedTeacher}` : `Page ${page.pageNumber}`}
                                      </p>
                                    </div>
                                    {isCurrent ? (
                                      <Check size={13} className="shrink-0 stroke-[3]" />
                                    ) : isCached ? (
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Previewed" />
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </aside>
                )}

                {/* Section Details Card for Review */}
                <div className="rounded-2xl border border-zinc-200/90 bg-zinc-50/50 p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-200/70">
                    <h3 className="text-[11px] font-black uppercase tracking-wider text-navy">
                      Section Review
                    </h3>
                    {(() => {
                      const matchesExisting =
                        Boolean(
                          resolvedClassId &&
                            (!matchedSectionInfo ||
                              (normalizeSectionKeyClient(sectionForm.name) ===
                                normalizeSectionKeyClient(matchedSectionInfo.matchedName) &&
                                Number(sectionForm.semester) === Number(matchedSectionInfo.matchedSemester)))
                        ) ||
                        operationalClasses.some(
                          (c) =>
                            normalizeSectionKeyClient(c.name) === normalizeSectionKeyClient(sectionForm.name) &&
                            Number(c.semester) === Number(sectionForm.semester)
                        );
                      return (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            matchesExisting
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                          }`}
                        >
                          {matchesExisting ? 'Updates Existing' : 'New Section'}
                        </span>
                      );
                    })()}
                  </div>

                  {!isHod && departments.length > 0 && (
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">
                        Department
                      </label>
                      <select
                        value={activeDepartmentId}
                        onChange={(e) => handleSectionFieldChange('departmentId', e.target.value)}
                        className="w-full h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-navy/10"
                      >
                        <option value="">-- Choose Department --</option>
                        {departments.map((d) => (
                          <option key={d._id} value={d._id}>
                            {d.name} ({d.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">
                        Section Name
                      </label>
                      <input
                        type="text"
                        value={sectionForm.name}
                        onChange={(e) => handleSectionFieldChange('name', e.target.value)}
                        className="w-full h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-black text-navy focus:outline-none focus:ring-2 focus:ring-navy/10"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">
                        Academic Batch
                      </label>
                      <input
                        type="text"
                        value={sectionForm.academicYear}
                        onChange={(e) => handleSectionFieldChange('academicYear', e.target.value)}
                        placeholder="2026-27"
                        className="w-full h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-navy/10"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">
                      Semester
                    </label>
                    <select
                      value={sectionForm.semester}
                      onChange={(e) => handleSectionFieldChange('semester', Number(e.target.value))}
                      className="w-full h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-navy/10"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                        <option key={s} value={s}>
                          Sem {s} ({getAcademicYearRoman(s)} Yr)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">
                      <span>Class Teacher</span>
                      {sectionForm.classTeacherId ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-0.5 normal-case">
                          <Check size={10} /> Matched
                        </span>
                      ) : matchedSectionInfo?.detectedTeacher ? (
                        <span className="text-amber-700 font-bold normal-case">Needs Selection</span>
                      ) : null}
                    </label>
                    <select
                      value={sectionForm.classTeacherId}
                      onChange={(e) => handleSectionFieldChange('classTeacherId', e.target.value)}
                      className={`w-full h-9 px-3 rounded-xl border text-xs font-bold focus:outline-none focus:ring-2 ${
                        sectionForm.classTeacherId
                          ? 'border-emerald-300 bg-emerald-50/40 text-emerald-950 focus:ring-emerald-500/20'
                          : 'border-amber-300 bg-amber-50/40 text-amber-950 focus:ring-amber-500/20'
                      }`}
                    >
                      <option value="">-- Choose Class Teacher --</option>
                      {facultyList.map((f) => (
                        <option key={f._id} value={f._id}>
                          {f.name} {f.employeeId ? `(${f.employeeId})` : ''}
                        </option>
                      ))}
                    </select>
                    {!sectionForm.classTeacherId && matchedSectionInfo?.detectedTeacher && (
                      <p className="mt-1 text-[11px] text-amber-800 leading-snug">
                        PDF detected <span className="font-bold">"{matchedSectionInfo.detectedTeacher}"</span> — pick manually or assign in the Review step.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Dedicated Spacious Extracted Curriculum Review Table */}
              <div className="lg:col-span-8 flex flex-col rounded-2xl border border-zinc-200/90 bg-white overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-100 bg-zinc-50/70 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-navy">
                      Extracted Curriculum ({counts.matched + counts.flagged} active)
                    </span>
                    {extractedRows.some((r) => r.status !== 'excluded' && r.isElective) && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                        {extractedRows.filter((r) => r.status !== 'excluded' && r.isElective).length} Electives
                      </span>
                    )}
                  </div>

                  <div className="inline-flex rounded-full bg-zinc-100 p-0.5 border border-zinc-200/70 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSubjectFilter('all')}
                      className={`px-2.5 py-1 rounded-full font-bold transition-all ${
                        subjectFilter === 'all' ? 'bg-navy text-white' : 'text-zinc-600'
                      }`}
                    >
                      All ({counts.total})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubjectFilter('matched')}
                      className={`px-2.5 py-1 rounded-full font-bold transition-all ${
                        subjectFilter === 'matched' ? 'bg-navy text-white' : 'text-zinc-600'
                      }`}
                    >
                      Matched ({counts.matched})
                    </button>
                    {counts.flagged > 0 && (
                      <button
                        type="button"
                        onClick={() => setSubjectFilter('flagged')}
                        className={`px-2.5 py-1 rounded-full font-bold transition-all ${
                          subjectFilter === 'flagged' ? 'bg-amber-600 text-white' : 'text-amber-700'
                        }`}
                      >
                        Review ({counts.flagged})
                      </button>
                    )}
                    {counts.excluded > 0 && (
                      <button
                        type="button"
                        onClick={() => setSubjectFilter('excluded')}
                        className={`px-2.5 py-1 rounded-full font-bold transition-all ${
                          subjectFilter === 'excluded' ? 'bg-zinc-700 text-white' : 'text-zinc-500'
                        }`}
                      >
                        Excluded ({counts.excluded})
                      </button>
                    )}
                  </div>
                </div>

                <div className="min-h-[340px] max-h-[500px] overflow-y-auto overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-zinc-50 border-b border-zinc-200 z-10">
                      <tr className="text-zinc-500 uppercase tracking-wider text-[10px] font-black">
                        <th className="py-2.5 px-3 whitespace-nowrap">Code</th>
                        <th className="py-2.5 px-3">Subject Name</th>
                        <th className="py-2.5 px-3">Handling Faculty</th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap">Status</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {displayedRows.map((row, idx) => {
                        const originalIdx = extractedRows.indexOf(row);
                        const isExcluded = row.status === 'excluded';
                        return (
                          <tr
                            key={`${row.subjectCode}-${idx}`}
                            className={
                              isExcluded
                                ? 'bg-zinc-50/70 opacity-60'
                                : row.status === 'flagged'
                                ? 'bg-amber-50/30'
                                : 'hover:bg-zinc-50/60'
                            }
                          >
                            <td className="py-2.5 px-3 align-top whitespace-nowrap">
                              <span className="font-mono font-black text-navy block">
                                {row.subjectCode}
                              </span>
                              {row.isElective && (
                                <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                                  Elective
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 align-top font-semibold text-zinc-900 min-w-[200px] leading-snug">
                              {row.subjectName}
                            </td>
                            <td className="py-2.5 px-3 align-top min-w-[195px]">
                              {isExcluded ? (
                                <span className="text-zinc-400 font-semibold italic">Excluded</span>
                              ) : (
                                <div className="space-y-1">
                                  <select
                                    value={row.facultyId || ''}
                                    onChange={(e) => handleFacultyChange(originalIdx, e.target.value)}
                                    className={`h-8 w-full px-2 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-1 ${
                                      row.facultyId
                                        ? 'border-zinc-200 bg-white text-zinc-900 focus:border-indigo-600'
                                        : 'border-amber-300 bg-amber-50 text-amber-950 font-bold focus:border-amber-600'
                                    }`}
                                  >
                                    <option value="">-- Choose Registered Faculty --</option>
                                    {facultyList.map((f) => (
                                      <option key={f._id} value={f._id}>
                                        {f.name} {f.employeeId ? `(${f.employeeId})` : ''}
                                      </option>
                                    ))}
                                  </select>
                                  {!row.facultyId && row.facultyName && row.facultyName !== 'Unassigned' && (
                                    <p className="text-[10px] text-amber-800 font-medium leading-tight">
                                      PDF: {row.facultyName}
                                    </p>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-2 align-top text-center whitespace-nowrap">
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
                            <td className="py-2.5 px-3 align-top text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleToggleExclude(originalIdx)}
                                className={`text-[11px] font-bold px-2 py-1 rounded-lg transition-colors ${
                                  isExcluded
                                    ? 'text-indigo-600 hover:bg-indigo-50'
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
              </div>
            </div>
          )}
        </div>
      ) : (
        /* TAB 2: Space-Efficient 2-Column Manual Setup */
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column: Section Selection / Creation */}
            <div className="lg:col-span-6 p-4 rounded-2xl border border-zinc-200/80 bg-zinc-50/40 space-y-3.5">
              <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-zinc-200/70">
                <h3 className="text-xs font-black uppercase tracking-wider text-navy">
                  1. Target Class Details
                </h3>
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-navy">
                    <input
                      type="radio"
                      name="manualMode"
                      value="existing"
                      checked={manualMode === 'existing'}
                      onChange={() => setManualMode('existing')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Existing</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-navy">
                    <input
                      type="radio"
                      name="manualMode"
                      value="new"
                      checked={manualMode === 'new'}
                      onChange={() => setManualMode('new')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Create New</span>
                  </label>
                </div>
              </div>

              {!isHod && departments.length > 0 && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">
                    Department
                  </label>
                  <select
                    value={activeDepartmentId}
                    onChange={(e) => {
                      setSectionForm((p) => ({ ...p, departmentId: e.target.value, classTeacherId: '' }));
                      setManualSelectedClassId('');
                    }}
                    className="w-full h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-navy/10"
                  >
                    <option value="">-- All / Choose Department --</option>
                    {departments.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {manualMode === 'existing' ? (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">
                    Operational Section *
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
                          academicYear: cls.academicYear || '2026-27',
                          departmentId: cls.departmentId?._id || cls.departmentId || defaultDeptId,
                          classTeacherId: cls.classTeacherId?._id || cls.classTeacherId || '',
                        });
                      }
                    }}
                    className="w-full h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-navy/10"
                  >
                    <option value="">-- Choose an existing section --</option>
                    {operationalClasses.map((cls) => (
                      <option key={cls._id} value={cls._id}>
                        {formatSectionDisplayName(cls.name, cls.semester)} (Sem {cls.semester || 1})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">
                      Section Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. CSD-A"
                      value={sectionForm.name}
                      onChange={(e) => setSectionForm((p) => ({ ...p, name: e.target.value }))}
                      className="w-full h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-navy/10"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">
                      Semester *
                    </label>
                    <select
                      value={sectionForm.semester}
                      onChange={(e) => setSectionForm((p) => ({ ...p, semester: Number(e.target.value) }))}
                      className="w-full h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-navy/10"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                        <option key={s} value={s}>
                          Sem {s} ({getAcademicYearRoman(s)} Yr)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">
                      Academic Year
                    </label>
                    <input
                      type="text"
                      placeholder="2026-27"
                      value={sectionForm.academicYear}
                      onChange={(e) => setSectionForm((p) => ({ ...p, academicYear: e.target.value }))}
                      className="w-full h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-navy/10"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">
                  Class Teacher (Can also assign in Review step)
                </label>
                <select
                  value={sectionForm.classTeacherId}
                  onChange={(e) => setSectionForm((p) => ({ ...p, classTeacherId: e.target.value }))}
                  className="w-full h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-navy/10"
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

            {/* Right Column: Curriculum Source */}
            <div className="lg:col-span-6 p-4 rounded-2xl border border-zinc-200/80 bg-zinc-50/40 space-y-3">
              <div className="pb-2.5 border-b border-zinc-200/70">
                <h3 className="text-xs font-black uppercase tracking-wider text-navy">
                  2. Curriculum Setup Source
                </h3>
              </div>

              <div className="space-y-2.5">
                <label
                  className={`block p-3 rounded-xl border cursor-pointer transition-all ${
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
                          ? `Semester ${sectionForm.semester} Master Syllabus has ${masterClass.subjectAssignments?.length || 0} subjects.`
                          : `No master syllabus found for Semester ${sectionForm.semester} — you can add subjects on the Class page later.`}
                      </span>
                    </div>
                  </div>
                </label>

                <label
                  className={`block p-3 rounded-xl border cursor-pointer transition-all ${
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
                      <span className="text-xs font-black text-navy block">Copy from Existing Section</span>
                      <span className="text-[11px] text-zinc-500 mt-0.5 block">
                        Replicate subjects from another section in Semester {sectionForm.semester}.
                      </span>
                    </div>
                  </div>
                </label>

                <label
                  className={`block p-3 rounded-xl border cursor-pointer transition-all ${
                    manualSource === 'empty'
                      ? 'border-indigo-600 bg-indigo-50/50'
                      : 'border-zinc-200 bg-white hover:border-zinc-300'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="manualSource"
                      value="empty"
                      checked={manualSource === 'empty'}
                      onChange={() => setManualSource('empty')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="text-xs font-black text-navy block">Configure Subjects Later</span>
                      <span className="text-[11px] text-zinc-500 mt-0.5 block">
                        Create/select section now and map subjects later from the Class Details page.
                      </span>
                    </div>
                  </div>
                </label>

                {manualSource === 'clone' && (
                  <div className="pt-1">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1">
                      Source Section
                    </label>
                    <select
                      value={cloneSourceClassId}
                      onChange={(e) => setCloneSourceClassId(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-navy/10"
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
            </div>
          </div>
        </div>
      )}

      {/* Pinned Footer for Active Flow */}
      {(canShowFooterPdf || activeTab === 'manual') && (
        <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-zinc-100 bg-zinc-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {activeTab === 'pdf' ? (
            <>
              <div className="text-xs text-zinc-600 font-medium">
                <span>Active subjects: </span>
                <strong className="text-navy">{counts.matched + counts.flagged}</strong>
                {counts.flagged > 0 && (
                  <span className="text-amber-700 font-semibold ml-2">
                    ({counts.flagged} unmatched faculty — can assign now or later)
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleCommitPdfFlow}
                loading={isSubmitting}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                <span>Confirm & Continue to Students</span>
                <ArrowRight size={13} />
              </Button>
            </>
          ) : (
            <>
              <span className="text-xs text-zinc-500 font-medium">
                Subjects and students can always be refined afterward on the Class page.
              </span>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleManualSave}
                loading={isSubmitting}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                <span>Save & Continue to Students</span>
                <ArrowRight size={13} />
              </Button>
            </>
          )}
        </div>
      )}

      {/* Batch Provisioning Modal */}
      <Modal
        isOpen={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        title="Batch Provision All Sections"
        size="lg"
      >
        <div className="space-y-4">
          {!batchResult ? (
            <>
              <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200/60 text-xs text-indigo-900 space-y-2">
                <p className="font-bold flex items-center gap-1.5 text-sm text-indigo-950">
                  <Sparkles size={16} className="text-indigo-600" />
                  <span>Automatic Institutional Timetable Ingestion</span>
                </p>
                <p>
                  This PDF contains <strong>{inspection?.pageCount} section pages</strong> across{' '}
                  <strong>{Object.keys(groupedPages).length} semesters</strong>.
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Create or match all {inspection?.pageCount} section classes.</li>
                  <li>Assign detected class teachers to their sections.</li>
                  <li>Save extracted curriculum subjects and hydrate Master Syllabi.</li>
                </ul>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
                <Button variant="ghost" size="sm" onClick={() => setBatchModalOpen(false)} disabled={isBatchImporting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleBatchImport}
                  loading={isBatchImporting}
                  disabled={isBatchImporting}
                >
                  <Sparkles size={14} />
                  <span>Start Batch Provisioning</span>
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
                <div className="flex items-center gap-2">
                  <CheckCircle size={18} className="text-emerald-600" />
                  <h4 className="text-sm font-bold">
                    Successfully Provisioned {batchResult.provisionedCount} Sections!
                  </h4>
                </div>
                <p>All classes, subjects, and Master Curriculum blueprints are saved.</p>
              </div>

              <div>
                <h5 className="text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2">
                  Pick a section to continue setup:
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1">
                  {batchResult.sections?.map((sec) => (
                    <button
                      key={sec.classId}
                      type="button"
                      onClick={() => handleSelectBatchSection(sec)}
                      className="p-3 rounded-xl border border-zinc-200 hover:border-indigo-600 hover:bg-indigo-50/40 text-left transition-all flex items-center justify-between group"
                    >
                      <div>
                        <p className="text-xs font-black text-navy group-hover:text-indigo-700">
                          {sec.displayName || sec.name}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          Sem {sec.semester} · {sec.subjectCount} subjects ·{' '}
                          {sec.classTeacher?.name
                            ? `CT: ${sec.classTeacher.name}`
                            : sec.detectedTeacher
                            ? `CT: ${sec.detectedTeacher}`
                            : 'No CT'}
                        </p>
                      </div>
                      <ArrowRight
                        size={14}
                        className="text-zinc-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-transform"
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-zinc-100">
                <Button variant="ghost" size="sm" onClick={() => setBatchModalOpen(false)}>
                  Close & Review Active Section
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
};

export default Step1ClassSubjects;
