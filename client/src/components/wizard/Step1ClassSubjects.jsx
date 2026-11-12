import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  inspectTimetablePdf,
  previewTimetable,
  commitTimetable,
  bulkCommitTimetable,
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
  const [selectedPageNumbers, setSelectedPageNumbers] = useState([]);
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
    setSelectedPageNumbers([]);
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
    setSelectedPageNumbers([]);
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

      // Select all extractable curriculum pages by default so multi-page institutional PDFs provision cleanly together
      const validPageNums = (inspData.pages || [])
        .filter((p) => p.hasTextLayer !== false)
        .map((p) => p.pageNumber);
      setSelectedPageNumbers(validPageNums);

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

      const targetPage = inspData.recommendedPage || validPageNums[0] || 1;
      setSelectedPage(targetPage);
      await runPreviewForPage(file, targetPage, matchedDeptId);

      if (inspData.pageCount > 1) {
        toast.success(
          `Detected ${inspData.pageCount} sections (${validPageNums.length} ready to provision). Previewing ${
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

  const toggleIncludePage = (pageNum) => {
    setSelectedPageNumbers((prev) =>
      prev.includes(pageNum)
        ? prev.filter((n) => n !== pageNum)
        : [...prev, pageNum].sort((a, b) => a - b)
    );
  };

  const buildSectionSpecForPage = (pageNum) => {
    if (Number(pageNum) === Number(selectedPage)) {
      const matchesAutoMatched =
        Boolean(resolvedClassId) &&
        (!matchedSectionInfo ||
          (matchedSectionInfo.matchedClassId === resolvedClassId &&
            normalizeSectionKeyClient(sectionForm.name) ===
              normalizeSectionKeyClient(matchedSectionInfo.matchedName) &&
            Number(sectionForm.semester) === Number(matchedSectionInfo.matchedSemester)));
      return {
        pageNumber: pageNum,
        classId: matchesAutoMatched ? resolvedClassId : undefined,
        className: sectionForm.name.trim(),
        academicYear: sectionForm.academicYear?.trim() || '2026-27',
        departmentId: activeDepartmentId || undefined,
        semester: sectionForm.semester,
        targetSemester: sectionForm.semester,
        classTeacherId: sectionForm.classTeacherId || null,
        detectedTeacher: matchedSectionInfo?.detectedTeacher || null,
        uploadId,
        confirmedRows: extractedRows,
      };
    }

    const cached = pageCache[pageNum];
    if (cached && Array.isArray(cached.rows) && cached.rows.length > 0) {
      const cachedMatch =
        Boolean(cached.classId) &&
        (!cached.matchedSectionInfo ||
          (cached.matchedSectionInfo.matchedClassId === cached.classId &&
            normalizeSectionKeyClient(cached.name) ===
              normalizeSectionKeyClient(cached.matchedSectionInfo.matchedName) &&
            Number(cached.semester) === Number(cached.matchedSectionInfo.matchedSemester)));
      return {
        pageNumber: pageNum,
        classId: cachedMatch ? cached.classId : undefined,
        className: String(cached.name || '').trim(),
        academicYear: String(cached.academicYear || '2026-27').trim(),
        departmentId: cached.departmentId || activeDepartmentId || undefined,
        semester: cached.semester,
        targetSemester: cached.semester,
        classTeacherId: cached.classTeacherId || null,
        detectedTeacher: cached.matchedSectionInfo?.detectedTeacher || null,
        uploadId: cached.uploadId,
        confirmedRows: cached.rows,
      };
    }

    return {
      pageNumber: pageNum,
      departmentId: activeDepartmentId || undefined,
    };
  };

  const handleBatchImport = async () => {
    if (!pdfFile || isBatchImporting) return;
    setIsBatchImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', pdfFile);
      if (activeDepartmentId) fd.append('departmentId', activeDepartmentId);

      // Preserve user edits from reviewed/cached pages
      const visitedPages = Array.from(
        new Set([...Object.keys(pageCache).map(Number), ...(selectedPage ? [selectedPage] : [])])
      ).filter((n) => Number.isFinite(n));
      if (visitedPages.length > 0) {
        fd.append('overrides', JSON.stringify(visitedPages.map(buildSectionSpecForPage)));
      }

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
    const allProvisioned = batchResult?.sections?.length ? batchResult.sections : [sec];
    onSave({
      classId: sec.classId,
      classData: {
        _id: sec.classId,
        name: sec.name,
        semester: sec.semester,
        academicYear: sec.academicYear,
        departmentId: sec.departmentId || activeDepartmentId,
        classTeacherId: sec.classTeacher?._id || null,
      },
      provisionedClasses: allProvisioned,
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

    const pagesToCommit =
      hasMultiPages && selectedPageNumbers.length > 0
        ? Array.from(new Set(selectedPageNumbers)).sort((a, b) => a - b)
        : [selectedPage || 1];

    // Ensure the currently viewed section uses live edited state
    if (selectedPage && pagesToCommit.length === 1 && !selectedPageNumbers.includes(selectedPage)) {
      pagesToCommit[0] = selectedPage;
    }

    setIsSubmitting(true);
    try {
      if (hasMultiPages && pagesToCommit.length > 1) {
        const specs = pagesToCommit.map(buildSectionSpecForPage);
        const hasUnvisitedPages = specs.some(
          (s) => !Array.isArray(s.confirmedRows) || s.confirmedRows.length === 0
        );

        let res;
        if (hasUnvisitedPages && pdfFile) {
          const fd = new FormData();
          fd.append('file', pdfFile);
          fd.append('sections', JSON.stringify(specs));
          if (activeDepartmentId) fd.append('defaultDepartmentId', activeDepartmentId);
          res = await bulkCommitTimetable(fd);
        } else {
          res = await bulkCommitTimetable({
            sections: specs,
            defaultDepartmentId: activeDepartmentId || undefined,
          });
        }

        const data = res?.data || res;
        const provisionedSections = data.sections || [];
        const skippedPages = data.skippedPages || [];
        if (provisionedSections.length === 0) {
          toast.error('No valid sections could be provisioned from the selection.');
          setIsSubmitting(false);
          return;
        }

        // Sync cached page classIds so returning to Step 1 reflects all created sections
        setPageCache((prev) => {
          const next = { ...prev };
          for (const sec of provisionedSections) {
            if (sec.pageNumber && next[sec.pageNumber]) {
              next[sec.pageNumber] = {
                ...next[sec.pageNumber],
                classId: sec.classId,
                matchedSectionInfo: {
                  ...(next[sec.pageNumber].matchedSectionInfo || {}),
                  existingClassFound: true,
                  matchedClassId: sec.classId,
                  matchedName: sec.name,
                  matchedSemester: sec.semester,
                },
              };
            }
          }
          return next;
        });

        const primarySec =
          provisionedSections.find((s) => Number(s.pageNumber) === Number(selectedPage)) ||
          provisionedSections[0];
        const freshRes = await getClass(primarySec.classId).catch(() => null);
        const primaryClassData = freshRes?.data || freshRes || {
          _id: primarySec.classId,
          name: primarySec.name,
          semester: primarySec.semester,
          academicYear: primarySec.academicYear,
          departmentId: primarySec.departmentId || activeDepartmentId,
          classTeacherId: primarySec.classTeacher?._id || null,
        };

        setResolvedClassId(primarySec.classId);
        setResolvedClassData(primaryClassData);
        queryClient.invalidateQueries({ queryKey: ['class'] });
        queryClient.invalidateQueries({ queryKey: ['wizard', 'all-classes'] });
        onDirtyChange?.(false);

        if (skippedPages.length > 0) {
          toast.success(
            `Provisioned ${provisionedSections.length} sections cleanly (${skippedPages.length} non-table page skipped).`
          );
        } else {
          toast.success(
            `Provisioned all ${provisionedSections.length} sections with subjects & master syllabi!`
          );
        }

        onSave({
          classId: primarySec.classId,
          classData: primaryClassData,
          provisionedClasses: provisionedSections,
          summary: `${provisionedSections.length} sections provisioned · Active: ${primarySec.displayName || primarySec.name}`,
          completedTimetable: true,
        });
        return;
      }

      // Single-section commit flow
      const singleSpec = buildSectionSpecForPage(pagesToCommit[0] || selectedPage || 1);
      if (!singleSpec.classId && !activeDepartmentId) {
        toast.error('Please select a target department before confirming.');
        setIsSubmitting(false);
        return;
      }

      const res = await commitTimetable({
        uploadId: singleSpec.uploadId,
        classId: singleSpec.classId,
        className: singleSpec.className || sectionForm.name.trim(),
        academicYear: singleSpec.academicYear || sectionForm.academicYear?.trim() || '2026-27',
        departmentId: singleSpec.departmentId || activeDepartmentId || undefined,
        targetSemester: singleSpec.semester || sectionForm.semester,
        classTeacherId: singleSpec.classTeacherId ?? (sectionForm.classTeacherId || null),
        confirmedRows: singleSpec.confirmedRows || extractedRows,
      });

      const payload = res?.data || res;
      const committedClassId = payload?.classId || singleSpec.classId;
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

      const finalClassData = {
        ...updatedClass,
        _id: committedClassId,
        name: updatedClass?.name || sectionForm.name.trim(),
        semester: updatedClass?.semester || sectionForm.semester,
        academicYear: updatedClass?.academicYear || sectionForm.academicYear,
        classTeacherId: sectionForm.classTeacherId || updatedClass?.classTeacherId || null,
      };

      onSave({
        classId: committedClassId,
        classData: finalClassData,
        provisionedClasses: [
          {
            classId: committedClassId,
            _id: committedClassId,
            name: finalClassData.name,
            displayName: classDisplayName,
            semester: finalClassData.semester,
            academicYear: finalClassData.academicYear,
            departmentId: finalClassData.departmentId?._id || finalClassData.departmentId || activeDepartmentId,
            subjectCount: counts.matched + counts.flagged,
            classTeacher: finalClassData.classTeacherId && typeof finalClassData.classTeacherId === 'object'
              ? finalClassData.classTeacherId
              : null,
          },
        ],
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
      {/* Top Mode Switcher Strip (Flush Studio Chrome) */}
      <div className="shrink-0 px-5 py-2.5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="inline-flex h-9 items-center rounded-xl bg-slate-200/85 p-1 border border-slate-300/80 self-start gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('pdf')}
            className={`h-full inline-flex items-center gap-1.5 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              activeTab === 'pdf'
                ? 'bg-navy text-white shadow-xs'
                : 'text-slate-700 hover:text-navy hover:bg-white/75'
            }`}
          >
            <FileText size={12} />
            <span>Timetable PDF</span>
            <span
              className={`hidden sm:inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                activeTab === 'pdf' ? 'bg-white/20 text-white' : 'bg-slate-300/80 text-slate-700'
              }`}
            >
              Auto
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`h-full inline-flex items-center gap-1.5 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-navy text-white shadow-xs'
                : 'text-slate-700 hover:text-navy hover:bg-white/75'
            }`}
          >
            <Layers size={12} />
            <span>Manual / Master Syllabus</span>
          </button>
        </div>

        {/* File Context Actions when a PDF is loaded */}
        {activeTab === 'pdf' && pdfFile && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-extrabold text-slate-900 truncate max-w-[180px]" title={pdfFile.name}>
              {pdfFile.name}
            </span>
            {inspection?.pageCount && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-200/80 border border-slate-300 text-slate-800">
                {inspection.pageCount} {inspection.pageCount === 1 ? 'Section' : 'Sections'}
              </span>
            )}
            {hasMultiPages && (
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={() => setBatchModalOpen(true)}
                className="!border-indigo-400 !bg-indigo-50 !text-indigo-950 hover:!bg-indigo-100 shadow-2xs"
              >
                <Sparkles size={11} className="text-indigo-700" />
                <span>Batch Provision ({inspection.pageCount})</span>
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={handleResetFile}
              className="!border-slate-300 !bg-white !text-slate-800 hover:!bg-slate-100 hover:!border-slate-400 shadow-2xs"
            >
              <RotateCcw size={11} />
              <span>Change PDF</span>
            </Button>
          </div>
        )}
      </div>

      {/* Main Content Area (Flush OneSchema Studio Canvas) */}
      {activeTab === 'pdf' ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* State A: No PDF selected */}
          {!pdfFile && (
            resolvedClassId && extractedRows.length > 0 ? (
              <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
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

                <div className="lg:col-span-7 flex flex-col rounded-xl border border-slate-300 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
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
                      <thead className="sticky top-0 bg-slate-100 border-b border-slate-300">
                        <tr className="text-slate-700 uppercase tracking-wider text-[10px] font-extrabold">
                          <th className="py-2.5 px-4">Code</th>
                          <th className="py-2.5 px-4">Subject</th>
                          <th className="py-2.5 px-4">Faculty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/80">
                        {extractedRows.map((row, i) => (
                          <tr key={`${row.subjectCode}-${i}`} className="even:bg-slate-50/40 hover:bg-indigo-50/40">
                            <td className="py-2.5 px-4 font-mono font-bold text-navy whitespace-nowrap">
                              {row.subjectCode}
                            </td>
                            <td className="py-2.5 px-4 font-semibold text-slate-900">{row.subjectName}</td>
                            <td className="py-2.5 px-4 text-slate-600 font-medium">{row.facultyName || 'Unassigned'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-[360px] flex items-center justify-center p-6">
                <div className="max-w-xl w-full space-y-3">
                  <FileDropzone
                    onFileSelect={handleFileDrop}
                    accept=".pdf,application/pdf"
                    title="Drop Institutional Timetable PDF Here"
                    subtitle="Automatically extracts all sections, semesters, class teachers, electives, and curriculum."
                    loading={isInspecting}
                    isProcessing={isInspecting}
                    icon={FileText}
                  />
                  <p className="text-center text-xs text-slate-600 font-medium">
                    Prefer configuring manually or inheriting from a master syllabus?{' '}
                    <button
                      type="button"
                      onClick={() => setActiveTab('manual')}
                      className="font-bold text-indigo-700 hover:text-indigo-900 underline"
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
            <div className="p-6">
              <StepTableSkeleton rows={6} />
              <p className="text-center pt-3 text-xs font-semibold text-indigo-700 animate-pulse">
                Extracting timetable schedule, matching registered faculty & verifying subjects...
              </p>
            </div>
          )}

          {/* State C: Extraction / Inspection Failure Recovery */}
          {pdfFile && !isInspecting && !isParsing && parseError && (
            <div className="flex-1 min-h-[300px] flex items-center justify-center p-6">
              <div className="max-w-lg w-full p-5 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950 space-y-3">
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

          {/* State D: Flush OneSchema Studio PDF Review Workspace */}
          {pdfFile && !isInspecting && !isParsing && !parseError && extractedRows.length > 0 && (
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
              {/* LEFT RAIL (Multi-Page Only): Clean Distinct Section Tree */}
              {hasMultiPages && (
                <aside className="lg:w-[232px] xl:w-[248px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/95 p-3 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-700">
                      Sections ({selectedPageNumbers.length}/{inspection.pageCount})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const valid = (inspection.pages || [])
                          .filter((p) => p.hasTextLayer !== false)
                          .map((p) => p.pageNumber);
                        const allSelected = selectedPageNumbers.length === valid.length;
                        setSelectedPageNumbers(
                          allSelected ? (selectedPage ? [selectedPage] : []) : valid
                        );
                      }}
                      className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 underline-offset-2 hover:underline cursor-pointer"
                    >
                      {selectedPageNumbers.length > 1 ? 'Focus 1' : 'Select All'}
                    </button>
                  </div>

                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={pageSearchQuery}
                      onChange={(e) => setPageSearchQuery(e.target.value)}
                      placeholder={`Filter ${inspection.pageCount} sections...`}
                      className="w-full h-8 pl-7 pr-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
                    />
                  </div>

                  <div className="max-h-44 lg:max-h-[430px] overflow-y-auto space-y-3 pr-0.5">
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
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                              Sem {sem} ({getAcademicYearRoman(Number(sem))} Yr)
                            </span>
                            <span className="text-[10px] font-bold text-slate-600 tabular-nums">{filtered.length}</span>
                          </div>
                          <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5">
                            {filtered.map((page) => {
                              const isCurrent = selectedPage === page.pageNumber;
                              const isChecked = selectedPageNumbers.includes(page.pageNumber);
                              const isDisabled = page.hasTextLayer === false;
                              const displayName = page.displayName || page.detectedClassName || `Page ${page.pageNumber}`;
                              const isCached = Boolean(pageCache[page.pageNumber]);
                              return (
                                <div
                                  key={page.pageNumber}
                                  className={`px-2.5 py-2 rounded-lg border transition-all flex items-center gap-2 ${
                                    isCurrent
                                      ? 'bg-indigo-50 border-navy ring-1 ring-navy/20 shadow-xs text-navy'
                                      : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={isDisabled}
                                    onChange={() => toggleIncludePage(page.pageNumber)}
                                    aria-label={`Include ${displayName} in setup`}
                                    className="h-3.5 w-3.5 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSelectPage(page.pageNumber)}
                                    className="min-w-0 flex-1 flex items-center justify-between gap-1 text-left cursor-pointer"
                                  >
                                    <div className="min-w-0">
                                      <p className={`text-xs truncate ${isCurrent ? 'font-black text-navy' : 'font-bold text-slate-900'}`}>
                                        {displayName}
                                      </p>
                                      <p className={`text-[10px] truncate ${isCurrent ? 'text-indigo-900/80 font-medium' : 'text-slate-600'}`}>
                                        {isDisabled
                                          ? 'No extractable text'
                                          : page.detectedTeacher
                                          ? page.detectedTeacher
                                          : `Page ${page.pageNumber}`}
                                      </p>
                                    </div>
                                    {isCurrent ? (
                                      <span className="w-2 h-2 rounded-full bg-navy shrink-0" />
                                    ) : isCached ? (
                                      <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" title="Reviewed" />
                                    ) : null}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </aside>
              )}

              {/* RIGHT WORKSPACE: High-Contrast Metadata Bar + Hairline Curriculum Sheet */}
              <div className="flex-1 min-w-0 flex flex-col bg-white">
                {/* Inline Section Metadata Bar */}
                <div className="px-4 sm:px-5 py-3 border-b border-slate-200 bg-slate-50/90 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-navy">
                        {formatSectionDisplayName(sectionForm.name || 'Section', sectionForm.semester)}
                      </span>
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
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              matchesExisting
                                ? 'bg-indigo-100 text-indigo-900 border-indigo-300/80'
                                : 'bg-emerald-100 text-emerald-900 border-emerald-300/80'
                            }`}
                          >
                            {matchesExisting ? 'Updates Existing' : 'New Section'}
                          </span>
                        );
                      })()}
                    </div>

                    {!isHod && departments.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700">
                          Department
                        </span>
                        <select
                          aria-label="Target Department"
                          value={activeDepartmentId}
                          onChange={(e) => handleSectionFieldChange('departmentId', e.target.value)}
                          className="h-7 px-2.5 rounded-lg border border-slate-300 bg-white text-[11px] font-bold text-slate-900 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
                        >
                          <option value="">-- Choose Dept --</option>
                          {departments.map((d) => (
                            <option key={d._id} value={d._id}>
                              {d.code || d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                        Section Name
                      </label>
                      <input
                        type="text"
                        value={sectionForm.name}
                        onChange={(e) => handleSectionFieldChange('name', e.target.value)}
                        className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900 hover:border-slate-400 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/15 shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                        Batch Year
                      </label>
                      <input
                        type="text"
                        value={sectionForm.academicYear}
                        onChange={(e) => handleSectionFieldChange('academicYear', e.target.value)}
                        placeholder="2026-27"
                        className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 hover:border-slate-400 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/15 shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                        Semester
                      </label>
                      <select
                        value={sectionForm.semester}
                        onChange={(e) => handleSectionFieldChange('semester', Number(e.target.value))}
                        className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 hover:border-slate-400 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/15 shadow-2xs"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                          <option key={s} value={s}>
                            Sem {s} ({getAcademicYearRoman(s)} Yr)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                        <span>Class Teacher</span>
                        <span
                          className={`inline-flex items-center gap-1 normal-case font-bold px-1.5 py-0.5 rounded-full border ${
                            sectionForm.classTeacherId
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-amber-50 text-amber-900 border-amber-300'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              sectionForm.classTeacherId ? 'bg-emerald-600' : 'bg-amber-600'
                            }`}
                          />
                          {sectionForm.classTeacherId ? 'Matched' : 'Pending'}
                        </span>
                      </label>
                      <select
                        value={sectionForm.classTeacherId}
                        onChange={(e) => handleSectionFieldChange('classTeacherId', e.target.value)}
                        className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 hover:border-slate-400 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/15 shadow-2xs"
                      >
                        <option value="">-- Choose Class Teacher --</option>
                        {facultyList.map((f) => (
                          <option key={f._id} value={f._id}>
                            {f.name} {f.employeeId ? `(${f.employeeId})` : ''}
                          </option>
                        ))}
                      </select>
                      {!sectionForm.classTeacherId && matchedSectionInfo?.detectedTeacher && (
                        <p className="mt-1 text-[10px] font-medium text-slate-600 truncate" title={`Detected in PDF: ${matchedSectionInfo.detectedTeacher}`}>
                          PDF: {matchedSectionInfo.detectedTeacher}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* OneSchema Filter Toolbar */}
                <div className="px-4 sm:px-5 py-2.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-extrabold text-navy">
                      Extracted Curriculum ({counts.matched + counts.flagged} active)
                    </span>
                    {extractedRows.some((r) => r.status !== 'excluded' && r.isElective) && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">
                        {extractedRows.filter((r) => r.status !== 'excluded' && r.isElective).length} Electives
                      </span>
                    )}
                    {counts.flagged > 0 && (
                      <span className="text-[11px] font-medium text-slate-600">
                        · {counts.flagged} unmatched faculty (optional now)
                      </span>
                    )}
                  </div>

                  <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-300/90 text-[11px] gap-0.5">
                    <button
                      type="button"
                      onClick={() => setSubjectFilter('all')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                        subjectFilter === 'all'
                          ? 'bg-navy text-white shadow-xs'
                          : 'text-slate-700 hover:text-slate-950 hover:bg-white'
                      }`}
                    >
                      All ({counts.total})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubjectFilter('matched')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                        subjectFilter === 'matched'
                          ? 'bg-navy text-white shadow-xs'
                          : 'text-slate-700 hover:text-slate-950 hover:bg-white'
                      }`}
                    >
                      Matched ({counts.matched})
                    </button>
                    {counts.flagged > 0 && (
                      <button
                        type="button"
                        onClick={() => setSubjectFilter('flagged')}
                        className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                          subjectFilter === 'flagged'
                            ? 'bg-navy text-white shadow-xs'
                            : 'text-slate-700 hover:text-slate-950 hover:bg-white'
                        }`}
                      >
                        Pending ({counts.flagged})
                      </button>
                    )}
                    {counts.excluded > 0 && (
                      <button
                        type="button"
                        onClick={() => setSubjectFilter('excluded')}
                        className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                          subjectFilter === 'excluded'
                            ? 'bg-navy text-white shadow-xs'
                            : 'text-slate-700 hover:text-slate-950 hover:bg-white'
                        }`}
                      >
                        Excluded ({counts.excluded})
                      </button>
                    )}
                  </div>
                </div>

                {/* Hairline Spreadsheet Review Table */}
                <div className="min-h-[340px] max-h-[470px] overflow-y-auto overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-100 border-b border-slate-300 z-10">
                      <tr className="text-slate-700 uppercase tracking-wider text-[10px] font-extrabold">
                        <th className="py-2.5 px-4 whitespace-nowrap">Code</th>
                        <th className="py-2.5 px-3">Subject Name</th>
                        <th className="py-2.5 px-3">Handling Faculty</th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap">Status</th>
                        <th className="py-2.5 px-4 text-right whitespace-nowrap">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80">
                      {displayedRows.map((row, idx) => {
                        const originalIdx = extractedRows.indexOf(row);
                        const isExcluded = row.status === 'excluded';
                        return (
                          <tr
                            key={`${row.subjectCode}-${idx}`}
                            className={
                              isExcluded
                                ? 'bg-slate-100/80 opacity-65'
                                : 'even:bg-slate-50/45 hover:bg-indigo-50/40 transition-colors'
                            }
                          >
                            <td className="py-2.5 px-4 align-top whitespace-nowrap">
                              <span className="font-mono font-extrabold text-navy block">
                                {row.subjectCode}
                              </span>
                              {row.isElective && (
                                <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-900 border border-indigo-200">
                                  Elective
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 align-top font-semibold text-slate-900 min-w-[200px] leading-snug">
                              {row.subjectName}
                            </td>
                            <td className="py-2.5 px-3 align-top min-w-[195px]">
                              {isExcluded ? (
                                <span className="text-slate-600 italic font-medium">Excluded</span>
                              ) : (
                                <div className="space-y-1">
                                  <select
                                    value={row.facultyId || ''}
                                    onChange={(e) => handleFacultyChange(originalIdx, e.target.value)}
                                    className="h-8 w-full px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 hover:border-slate-400 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/15 shadow-2xs"
                                  >
                                    <option value="">-- Assign Faculty (Optional) --</option>
                                    {facultyList.map((f) => (
                                      <option key={f._id} value={f._id}>
                                        {f.name} {f.employeeId ? `(${f.employeeId})` : ''}
                                      </option>
                                    ))}
                                  </select>
                                  {!row.facultyId && row.facultyName && row.facultyName !== 'Unassigned' && (
                                    <p className="text-[10px] font-medium text-slate-600 leading-tight pl-0.5">
                                      PDF: {row.facultyName}
                                    </p>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-2 align-top text-center whitespace-nowrap">
                              {isExcluded ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                                  <Ban size={11} /> Excluded
                                </span>
                              ) : row.status === 'matched' ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300/80">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                  Matched
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300/90">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                                  Pending
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 align-top text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleToggleExclude(originalIdx)}
                                className={`text-[11px] font-bold px-2.5 py-1 rounded-md border transition-colors cursor-pointer ${
                                  isExcluded
                                    ? 'border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
                                    : 'border-slate-300 bg-white text-slate-700 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-700 shadow-2xs'
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
            <div className="lg:col-span-6 p-4 rounded-2xl border border-slate-300/90 bg-slate-50/90 space-y-3.5">
              <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-200">
                <h3 className="text-xs font-black uppercase tracking-wider text-navy">
                  1. Target Class Details
                </h3>
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-900">
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
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-900">
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
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">
                    Department
                  </label>
                  <select
                    value={activeDepartmentId}
                    onChange={(e) => {
                      setSectionForm((p) => ({ ...p, departmentId: e.target.value, classTeacherId: '' }));
                      setManualSelectedClassId('');
                    }}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 hover:border-slate-400 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
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
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">
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
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 hover:border-slate-400 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
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
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">
                      Section Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. CSD-A"
                      value={sectionForm.name}
                      onChange={(e) => setSectionForm((p) => ({ ...p, name: e.target.value }))}
                      className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 placeholder:text-slate-500 hover:border-slate-400 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">
                      Semester *
                    </label>
                    <select
                      value={sectionForm.semester}
                      onChange={(e) => setSectionForm((p) => ({ ...p, semester: Number(e.target.value) }))}
                      className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 hover:border-slate-400 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                        <option key={s} value={s}>
                          Sem {s} ({getAcademicYearRoman(s)} Yr)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">
                      Academic Year
                    </label>
                    <input
                      type="text"
                      placeholder="2026-27"
                      value={sectionForm.academicYear}
                      onChange={(e) => setSectionForm((p) => ({ ...p, academicYear: e.target.value }))}
                      className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 placeholder:text-slate-500 hover:border-slate-400 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">
                  Class Teacher (Can also assign in Review step)
                </label>
                <select
                  value={sectionForm.classTeacherId}
                  onChange={(e) => setSectionForm((p) => ({ ...p, classTeacherId: e.target.value }))}
                  className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 hover:border-slate-400 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
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
            <div className="lg:col-span-6 p-4 rounded-2xl border border-slate-300/90 bg-slate-50/90 space-y-3">
              <div className="pb-2.5 border-b border-slate-200">
                <h3 className="text-xs font-black uppercase tracking-wider text-navy">
                  2. Curriculum Setup Source
                </h3>
              </div>

              <div className="space-y-2.5">
                <label
                  className={`block p-3 rounded-xl border cursor-pointer transition-all ${
                    manualSource === 'master'
                      ? 'border-navy bg-indigo-50/80 ring-1 ring-navy/20 shadow-2xs'
                      : 'border-slate-300 bg-white hover:border-slate-400'
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
                      <span className="text-[11px] text-slate-700 mt-0.5 block">
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
                      ? 'border-navy bg-indigo-50/80 ring-1 ring-navy/20 shadow-2xs'
                      : 'border-slate-300 bg-white hover:border-slate-400'
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
                      <span className="text-[11px] text-slate-700 mt-0.5 block">
                        Replicate subjects from another section in Semester {sectionForm.semester}.
                      </span>
                    </div>
                  </div>
                </label>

                <label
                  className={`block p-3 rounded-xl border cursor-pointer transition-all ${
                    manualSource === 'empty'
                      ? 'border-navy bg-indigo-50/80 ring-1 ring-navy/20 shadow-2xs'
                      : 'border-slate-300 bg-white hover:border-slate-400'
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
                      <span className="text-[11px] text-slate-700 mt-0.5 block">
                        Create/select section now and map subjects later from the Class Details page.
                      </span>
                    </div>
                  </div>
                </label>

                {manualSource === 'clone' && (
                  <div className="pt-1">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">
                      Source Section
                    </label>
                    <select
                      value={cloneSourceClassId}
                      onChange={(e) => setCloneSourceClassId(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 hover:border-slate-400 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
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
        <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-100/85 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {activeTab === 'pdf' ? (
            <>
              <div className="text-xs text-slate-700 font-semibold">
                <span>Active subjects: </span>
                <strong className="text-navy font-black">{counts.matched + counts.flagged}</strong>
                {hasMultiPages && selectedPageNumbers.length > 1 && (
                  <span className="text-indigo-800 font-bold ml-2">
                    · Provisioning {selectedPageNumbers.length} selected sections + Master Syllabi
                  </span>
                )}
                {counts.flagged > 0 && (
                  <span className="text-amber-800 font-semibold ml-2">
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
                <span>
                  {hasMultiPages && selectedPageNumbers.length > 1
                    ? `Confirm All ${selectedPageNumbers.length} Sections & Continue`
                    : 'Confirm & Continue to Students'}
                </span>
                <ArrowRight size={13} />
              </Button>
            </>
          ) : (
            <>
              <span className="text-xs text-slate-700 font-medium">
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
