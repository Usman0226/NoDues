import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  Check, 
  Upload, 
  Eye, 
  FileText, 
  AlertCircle, 
  ArrowRight,
  Download,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Search,
  CheckCircle2,
  X,
  FileSpreadsheet,
  Sparkles,
  Users,
  ChevronDown
} from 'lucide-react';
import Button from '../ui/Button';
import FileDropzone from '../ui/FileDropzone';
import Table from '../ui/Table';
import SearchableSelect from '../ui/SearchableSelect';
import ClassPickerCombobox from './ClassPickerCombobox';
import { previewImport, commitImport, getTemplate } from '../../api/import';
import { getClasses, createClass } from '../../api/classes';
import { toast } from 'react-hot-toast';
import { useUI } from '../../hooks/useUI';

const STEPS = [
  { label: 'Upload Spreadsheet', icon: Upload },
  { label: 'Validate & Preview', icon: Eye },
  { label: 'Confirm Import', icon: Check },
];

const TYPE_CONFIG = {
  students: {
    title: 'Student Roster Ingestion',
    badge: 'Student Cohort',
    description: 'Bulk register or update candidate profiles with automatic roll number expansion and duplicate checks.',
    columns: [
      { name: 'Roll No', required: true, desc: 'Alphanumeric roll number (e.g. 25MRA07001 or range 25MRA01-25MRA60)' },
      { name: 'Full Name', required: true, desc: 'Official candidate name as per academic records' },
      { name: 'Email Address', required: false, desc: 'Student email (auto-derived if omitted)' },
    ],
    rangeHint: 'Entering roll ranges like 25MRA01-25MRA60 will automatically unpack all individual student rows.'
  },
  faculty: {
    title: 'Faculty Ledger Ingestion',
    badge: 'Faculty Directory',
    description: 'Bulk register staff accounts and associate with department ledgers.',
    columns: [
      { name: 'Employee ID', required: true, desc: 'Unique staff identifier (e.g. EMP-2024-01)' },
      { name: 'Full Name', required: true, desc: 'Faculty member title and full name' },
      { name: 'Email Address', required: true, desc: 'Official institutional login email' },
      { name: 'Department', required: false, desc: 'Department code or designation' },
    ]
  },
  subjects: {
    title: 'Curriculum Subjects Ingestion',
    badge: 'Academic Curriculum',
    description: 'Import curriculum subjects and map them to syllabus courses.',
    columns: [
      { name: 'Subject Code', required: true, desc: 'Course catalog code (e.g. 25BACOMTCO1)' },
      { name: 'Subject Name', required: true, desc: 'Full course title' },
      { name: 'Semester', required: true, desc: 'Semester number (1-8)' },
      { name: 'Elective', required: false, desc: 'TRUE / FALSE or Core / Elective' },
    ]
  },
  electives: {
    title: 'Elective Selection Mapping',
    badge: 'Student Electives',
    description: 'Bulk assign students to specific elective subject offerings.',
    columns: [
      { name: 'Roll No', required: true, desc: 'Enrolled student roll number' },
      { name: 'Subject Code', required: true, desc: 'Offered elective subject code' },
    ]
  },
  mentors: {
    title: 'Mentor Allocation Matrix',
    badge: 'Mentorship Ledger',
    description: 'Bulk allocate students to their designated faculty mentors.',
    columns: [
      { name: 'Roll No', required: true, desc: 'Student identifier' },
      { name: 'Mentor Identifier', required: true, desc: 'Faculty mentor employee ID or name' },
    ]
  }
};

const AuxiliarySheetsDropdown = ({ sheets = [], activeSheetName, onSelect }) => {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const clickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, [open]);

  if (!sheets.length) return null;

  const activeAux = sheets.find((s) => s.sheetName === activeSheetName);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`h-7 px-2.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer select-none ${
          activeAux
            ? 'bg-zinc-800 text-white border-zinc-900 shadow-2xs'
            : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:text-zinc-900 shadow-2xs'
        }`}
      >
        <span>{activeAux ? `Sheet: ${activeAux.sheetName}` : `Other Sheets (${sheets.length})`}</span>
        <ChevronDown size={11} className={`text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-52 rounded-xl bg-white border border-zinc-200/90 shadow-xl z-[1200] overflow-hidden p-1 text-left animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-zinc-400">
            Non-Roster Worksheets
          </div>
          {sheets.map((s) => {
            const count = s.rows?.length || s.valid?.length || s.summary?.total || 0;
            return (
              <button
                key={s.sheetName}
                type="button"
                onClick={() => {
                  onSelect(s.sheetName);
                  setOpen(false);
                }}
                className={`w-full px-2 py-1.5 rounded-md text-xs flex items-center justify-between text-left transition-colors cursor-pointer ${
                  s.sheetName === activeSheetName
                    ? 'bg-indigo-50 text-indigo-950 font-bold'
                    : 'hover:bg-zinc-50 text-zinc-700'
                }`}
              >
                <span className="truncate">{s.sheetName}</span>
                <span className="text-[10px] text-zinc-400 font-mono">{count} rows</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ImportStepper = ({ type = 'students', classId: propClassId, classes: propClasses = [], contextLabel, onComplete }) => {
  const { addBackgroundTask, updateBackgroundTask } = useUI();
  const [currentStep, setCurrentStep] = useState(0);
  const [currentFile, setCurrentFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  // Target class state for student roster ingestion
  const [selectedClassId, setSelectedClassId] = useState(propClassId || null);
  const [availableClasses, setAvailableClasses] = useState(propClasses);
  const [loadingClasses, setLoadingClasses] = useState(false);

  // Multi-sheet and batch state
  const [activeSheetName, setActiveSheetName] = useState(null);
  const [sheetClassOverrides, setSheetClassOverrides] = useState({});
  const [selectedSheetNames, setSelectedSheetNames] = useState(new Set());
  const [isBatchMode, setIsBatchMode] = useState(false);

  // Preview filtering state
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'valid' | 'errors'
  const [searchQuery, setSearchQuery] = useState('');

  const config = TYPE_CONFIG[type] || TYPE_CONFIG.students;

  // Auto-fetch active classes if importing students and availableClasses is empty
  useEffect(() => {
    if (type === 'students' && (!availableClasses || availableClasses.length === 0)) {
      setLoadingClasses(true);
      getClasses({ limit: 150 })
        .then((res) => {
          const cls = (res?.data || []).filter((c) => !c.isMaster);
          setAvailableClasses(cls);
          if (cls.length === 1 && !selectedClassId) {
            setSelectedClassId(cls[0]._id);
          }
        })
        .catch((err) => {
          console.warn('Failed to fetch classes for import stepper', err);
        })
        .finally(() => setLoadingClasses(false));
    }
  }, [type, availableClasses, selectedClassId]);

  useEffect(() => {
    if (propClasses && propClasses.length > 0) {
      const filtered = propClasses.filter((c) => !c.isMaster);
      setAvailableClasses(filtered);
      if (filtered.length === 1 && !selectedClassId) {
        setSelectedClassId(filtered[0]._id);
      }
    }
  }, [propClasses, selectedClassId]);

  useEffect(() => {
    if (propClassId) {
      setSelectedClassId(propClassId);
    }
  }, [propClassId]);

  const effectiveClassId = propClassId || selectedClassId;

  const currentClassObj = useMemo(() => {
    return (
      availableClasses.find((c) => c._id === effectiveClassId) ||
      (previewData?.targetClass?._id === effectiveClassId ? previewData.targetClass : null)
    );
  }, [availableClasses, effectiveClassId, previewData]);

  // Multi-sheet resolution: resolve current active sheet object
  const activeSheetObj = useMemo(() => {
    if (!previewData?.sheets || previewData.sheets.length === 0) {
      return previewData;
    }
    const found = previewData.sheets.find(
      (s) => s.sheetName.toLowerCase() === (activeSheetName || previewData.activeSheet || '').toLowerCase()
    );
    return found || previewData.sheets[0] || previewData;
  }, [previewData, activeSheetName]);

  const rosterSheets = useMemo(() => {
    return (previewData?.sheets || []).filter((s) => s.sheetType === 'roster');
  }, [previewData]);

  const auxiliarySheetsWithRows = useMemo(() => {
    return (previewData?.sheets || []).filter(
      (s) =>
        s.sheetType !== 'roster' &&
        ((s.rows && s.rows.length > 0) || (s.valid && s.valid.length > 0) || (s.summary && s.summary.total > 0))
    );
  }, [previewData]);

  const selectedRosterSheets = useMemo(() => {
    return rosterSheets.filter((s) => selectedSheetNames.has(s.sheetName));
  }, [rosterSheets, selectedSheetNames]);

  const totalBatchValidCount = useMemo(() => {
    return selectedRosterSheets.reduce((sum, s) => sum + (s.valid?.length || s.summary?.valid || 0), 0);
  }, [selectedRosterSheets]);

  const handleFileUpload = useCallback(async (uploadedFile) => {
    if (!uploadedFile) {
      setCurrentFile(null);
      setPreviewData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setCurrentFile(uploadedFile);

    const formData = new FormData();
    formData.append('file', uploadedFile);

    try {
      const params = {
        ...(type === 'students' && effectiveClassId ? { classId: effectiveClassId } : {}),
      };
      const response = await previewImport(type, formData, params);
      setPreviewData(response.data);

      if (response.data?.sheets) {
        const initialActive = response.data.activeSheet || response.data.sheets[0]?.sheetName;
        setActiveSheetName(initialActive);

        // Select all valid roster sheets by default
        const initialSelected = new Set(
          response.data.sheets
            .filter((s) => s.sheetType === 'roster' && (s.summary?.valid > 0 || s.valid?.length > 0))
            .map((s) => s.sheetName)
        );
        setSelectedSheetNames(initialSelected);

        // Pre-populate sheet class overrides from detected classes
        const initialOverrides = {};
        for (const s of response.data.sheets) {
          if (s.targetClass?._id) {
            initialOverrides[s.sheetName] = s.targetClass._id;
          }
        }
        setSheetClassOverrides(initialOverrides);

        // Merge any detected target classes into availableClasses if not yet present
        setAvailableClasses((prev) => {
          const existingIds = new Set(prev.map((c) => c._id));
          const newClasses = [];
          for (const s of response.data.sheets) {
            if (s.targetClass?._id && !existingIds.has(s.targetClass._id)) {
              existingIds.add(s.targetClass._id);
              newClasses.push(s.targetClass);
            }
          }
          return newClasses.length > 0 ? [...prev, ...newClasses] : prev;
        });
      }

      if (response.data?.targetClass?._id) {
        setSelectedClassId(response.data.targetClass._id);
      }
      setCurrentStep(1);
      setFilterTab('all');
      setSearchQuery('');
    } catch (err) {
      setError(err?.message || 'Failed to parse file. Please verify the template headers.');
      toast.error('File Analysis Failed');
    } finally {
      setLoading(false);
    }
  }, [type, effectiveClassId]);

  const handleSelectSheet = useCallback((selectedSheet) => {
    setActiveSheetName(selectedSheet);
    setFilterTab('all');
    setSearchQuery('');
    setError(null);
  }, []);

  const handleQuickCreateClass = useCallback(
    async ({ name, semester, departmentCode }) => {
      try {
        const matchingDeptClass =
          availableClasses.find((c) => {
            const cDeptCode = String(c.departmentId?.code || '').toUpperCase();
            const cDeptName = String(c.departmentId?.name || '').toUpperCase();
            const cName = String(c.name || '').toUpperCase();
            const dCode = String(departmentCode || '').toUpperCase();
            return dCode && (cDeptCode === dCode || cDeptName.includes(dCode) || cName.includes(dCode));
          }) || availableClasses[0];

        const departmentId = matchingDeptClass?.departmentId?._id || matchingDeptClass?.departmentId;
        const academicYear = matchingDeptClass?.academicYear || '2026-27';

        if (!departmentId) {
          toast.error('Unable to auto-detect department for section creation.');
          return null;
        }

        const res = await createClass({
          name,
          semester: Number(semester) || 1,
          departmentId,
          academicYear,
        });

        const newCls = res?.data || res;
        if (newCls?._id) {
          setAvailableClasses((prev) => {
            const exists = prev.some((c) => c._id === newCls._id);
            return exists ? prev : [...prev, newCls];
          });
          toast.success(`Created section "${newCls.name}" (Sem ${newCls.semester})`);
          return newCls._id;
        }
      } catch (err) {
        toast.error(err?.message || 'Failed to create section');
      }
      return null;
    },
    [availableClasses]
  );

  const handleCommit = useCallback(async (isBatch = false) => {
    if (type === 'students' && isBatch && selectedRosterSheets.length > 0) {
      // Validate all selected roster sheets have target classes
      for (const s of selectedRosterSheets) {
        const cId = sheetClassOverrides[s.sheetName] || s.targetClass?._id || (rosterSheets.length === 1 ? effectiveClassId : null);
        if (!cId) {
          setError(`Please select a target class for sheet "${s.sheetName}" before committing.`);
          toast.error(`Target class required for ${s.sheetName}`);
          return;
        }
      }

      const batch = selectedRosterSheets.map((s) => {
        const cId = sheetClassOverrides[s.sheetName] || s.targetClass?._id || effectiveClassId;
        const cObj = availableClasses.find((c) => c._id === cId) || s.targetClass;
        return {
          classId: cId,
          sheetName: s.sheetName,
          students: s.valid,
          targetClassName: cObj?.name || 'Class'
        };
      });

      const taskLabel = `Importing ${totalBatchValidCount} students across ${batch.length} classes`;
      const taskId = addBackgroundTask({
        label: taskLabel,
        type: `import_${type}`,
        message: `Initializing batch sync for ${batch.length} classes...`
      });

      // Dismiss modal immediately and notify user to inspect progress in Activity Center
      onComplete?.();
      toast.success(`Batch sync started in background for ${totalBatchValidCount} students (${batch.length} classes)`);

      // Run network commit asynchronously in the background
      (async () => {
        try {
          const res = await commitImport('students', { batch });
          const serverTaskId = res.data?.taskId;

          if (serverTaskId) {
            updateBackgroundTask(taskId, {
              _id: serverTaskId,
              status: 'success',
              message: res.data?.message || `Imported ${totalBatchValidCount} students across ${batch.length} classes.`
            });
          } else {
            updateBackgroundTask(taskId, {
              status: 'success',
              message: res.data?.message || `Batch import completed successfully (${batch.length} classes).`
            });
          }

          toast.success(`Successfully imported ${totalBatchValidCount} students across ${batch.length} classes!`);
          window.dispatchEvent(new CustomEvent('import-complete', { detail: { type: 'students', batch: true } }));
        } catch (err) {
          const errorMsg = err?.message || 'Batch import failed';
          updateBackgroundTask(taskId, {
            status: 'error',
            message: errorMsg
          });
          toast.error(`Batch import failed: ${errorMsg}`);
        }
      })();
      return;
    }

    // Single class commit
    const singleCId = sheetClassOverrides[activeSheetObj?.sheetName] || activeSheetObj?.targetClass?._id || effectiveClassId;
    if (type === 'students' && !singleCId) {
      setError('Please select a target class/section before committing.');
      toast.error('Class selection required');
      return;
    }

    const singleStudents = activeSheetObj?.valid || previewData?.valid || [];
    const taskLabel = `Importing ${singleStudents.length} ${type}`;

    const taskId = addBackgroundTask({
      label: taskLabel,
      type: `import_${type}`,
      message: 'Initializing background sync...'
    });

    // Dismiss modal immediately and notify user
    onComplete?.();
    toast.success(`Sync started in background for ${singleStudents.length} ${type}`);

    // Run commit asynchronously in background
    (async () => {
      try {
        const payload = type === 'students'
          ? { students: singleStudents, classId: singleCId }
          : { [type]: singleStudents };

        const res = await commitImport(type, payload);
        const serverTaskId = res.data?.taskId;

        if (serverTaskId) {
          updateBackgroundTask(taskId, {
            _id: serverTaskId,
            status: 'success',
            message: res.data?.message || 'Started on server'
          });
        } else {
          updateBackgroundTask(taskId, {
            status: 'success',
            message: res.data?.message || 'Import completed successfully'
          });
        }

        toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} import completed successfully`);
        window.dispatchEvent(new CustomEvent('import-complete', { detail: { type, classId: singleCId } }));
      } catch (err) {
        const errorMsg = err?.message || 'Connection lost during sync';
        updateBackgroundTask(taskId, {
          status: 'error',
          message: errorMsg
        });
        toast.error(`${type} sync failed: ${errorMsg}`);
      }
    })();
  }, [type, selectedRosterSheets, sheetClassOverrides, effectiveClassId, availableClasses, totalBatchValidCount, activeSheetObj, previewData, onComplete, addBackgroundTask, updateBackgroundTask, rosterSheets.length]);

  const handleDownloadTemplate = useCallback(async () => {
    setDownloading(true);
    try {
      const blob = await getTemplate(type);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}_template.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Failed to download template.');
      console.warn(err);
    } finally {
      setDownloading(false);
    }
  }, [type]);

  const validCount = activeSheetObj?.summary?.valid !== undefined 
    ? activeSheetObj.summary.valid 
    : (activeSheetObj?.valid?.length || previewData?.summary?.valid || 0);
  const errorCount = activeSheetObj?.summary?.errors !== undefined 
    ? activeSheetObj.summary.errors 
    : (activeSheetObj?.errors?.length || previewData?.summary?.errors || 0);
  const totalCount = activeSheetObj?.summary?.total || (validCount + errorCount);

  // Flattened data rows with standard keys for table sorting & rendering
  const dataRows = useMemo(() => {
    const validItems = activeSheetObj?.valid || previewData?.valid || [];
    const errorItems = activeSheetObj?.errors || previewData?.errors || [];
    const vCount = validItems.length;

    return [
      ...validItems.map((item, idx) => {
        const id = item.rollNo || item.employeeId || item.code || item.identity || item['Roll No'] || '—';
        const nm = item.name || item.studentName || item.facultyName || item.Name || '—';
        return { 
          ...item, 
          identity: id,
          name: nm,
          status: 'Compliant',
          isValid: true, 
          displayIndex: idx + 1,
          errors: [] 
        };
      }),
      ...errorItems.map((err, idx) => {
        const rowData = err.data || {};
        const id = rowData.rollNo || rowData.employeeId || rowData.code || rowData.identity || rowData['Roll No'] || '—';
        const nm = rowData.name || rowData.studentName || rowData.facultyName || rowData.Name || '—';
        return { 
          ...rowData, 
          identity: id,
          name: nm,
          status: err.reason || 'Error',
          isValid: false, 
          displayIndex: vCount + idx + 1,
          rowNumber: err.row, 
          errors: [err.reason] 
        };
      })
    ];
  }, [activeSheetObj, previewData]);

  // Filtered rows for the interactive data grid
  const filteredRows = useMemo(() => {
    let rows = dataRows;
    if (filterTab === 'valid') {
      rows = rows.filter(r => r.isValid);
    } else if (filterTab === 'errors') {
      rows = rows.filter(r => !r.isValid);
    }

    if (!searchQuery.trim()) return rows;
    const query = searchQuery.toLowerCase().trim();
    return rows.filter(r => {
      const id = (r.rollNo || r.employeeId || r.code || r.identity || r['Roll No'] || '').toString().toLowerCase();
      const name = (r.name || r.studentName || r.facultyName || r.Name || '').toString().toLowerCase();
      const email = (r.email || r.Email || '').toString().toLowerCase();
      const err = (r.errors?.[0] || '').toString().toLowerCase();
      return id.includes(query) || name.includes(query) || email.includes(query) || err.includes(query);
    });
  }, [dataRows, filterTab, searchQuery]);

  const tableColumns = useMemo(() => {
    const baseCols = [
      { 
        key: 'displayIndex', 
        label: '#', 
        width: '40px',
        render: (_, row) => (
          <span className="text-[10px] font-mono font-medium text-slate-400">
            {row.displayIndex}
          </span>
        )
      },
      { 
        key: 'identity', 
        label: 'Identifier', 
        render: (_, row) => {
          const id = row.rollNo || row.employeeId || row.code || row.identity || row['Roll No'] || '—';
          return (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${row.isValid ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className={`font-mono text-xs font-bold tracking-tight ${row.isValid ? 'text-navy' : 'text-rose-600 line-through'}`}>
                  {id}
                </span>
                {row.isExpanded && (
                  <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-600 text-[8px] font-black uppercase tracking-wider border border-indigo-100">Range</span>
                )}
              </div>
              {row.isExpanded && row.originalRange && (
                <span className="text-[8px] text-muted-foreground/60 font-medium ml-3 italic">Range: {row.originalRange}</span>
              )}
            </div>
          );
        }
      },
    ];

    if (type === 'students' || type === 'faculty') {
      baseCols.push({ 
        key: 'name', 
        label: 'Full Name',
        render: (_, row) => (
          <span className="text-xs font-bold text-slate-800">
            {row.name || row.studentName || row.facultyName || row.Name || '—'}
          </span>
        )
      });
    } else if (type === 'electives') {
      baseCols.push({ key: 'studentName', label: 'Student' });
      baseCols.push({ key: 'subjectCode', label: 'Subject' });
      baseCols.push({ key: 'facultyName', label: 'Faculty' });
    } else if (type === 'mentors') {
      baseCols.push({ key: 'studentName', label: 'Student' });
      baseCols.push({ key: 'facultyName', label: 'Mentor' });
    } else if (type === 'subjects') {
      baseCols.push({ key: 'name', label: 'Subject Name' });
      baseCols.push({ key: 'code', label: 'Code' });
      baseCols.push({ key: 'semester', label: 'Semester' });
    }

    baseCols.push({ 
      key: 'status', 
      label: 'Validation Status', 
      render: (_, row) => (
        <div className="flex flex-col gap-0.5">
          {row.isValid ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100/80 text-emerald-700 text-[9px] font-bold w-fit">
              <CheckCircle2 size={10} className="text-emerald-500" /> Compliant
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-100 text-rose-700 text-[9px] font-bold w-fit" title={row.errors?.[0]}>
              <AlertTriangle size={10} className="text-rose-500 shrink-0" />
              <span className="truncate max-w-[170px]">{row.errors?.[0] || 'Validation Error'}</span>
            </span>
          )}
          {row.isExpanded && row.isValid && (
            <span className="text-[8px] font-bold text-indigo-400 uppercase tracking-wider ml-1">Range expansion</span>
          )}
        </div>
      )
    });

    return baseCols;
  }, [type]);

  return (
    <div className="w-full h-full flex-1 min-h-0 flex flex-col">
      {/* Sleek, Compact Stepper Progress Header */}
      <div className="shrink-0 mb-3 pb-2 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {rosterSheets.length > 1 ? (
            <span className="px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-black tracking-tight flex items-center gap-1.5 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Multi-Cohort: {rosterSheets.length} Classes Detected ({totalBatchValidCount} Students)
            </span>
          ) : currentClassObj ? (
            <span className="px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-black tracking-tight flex items-center gap-1.5 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Class: {currentClassObj.name} {currentClassObj.semester ? `(Sem ${currentClassObj.semester})` : ''}
            </span>
          ) : contextLabel ? (
            <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-100/80 text-indigo-700 text-xs font-black tracking-tight flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
              {contextLabel}
            </span>
          ) : null}
        </div>

        {/* Compact Segmented Stepper */}
        <div className="flex items-center gap-1 sm:gap-2">
          {STEPS.map((step, i) => {
            const isActive = i === currentStep;
            const isCompleted = i < currentStep;

            return (
              <React.Fragment key={i}>
                {i > 0 && (
                  <div className={`h-0.5 w-3 sm:w-6 rounded-full transition-colors duration-300 ${isCompleted ? 'bg-indigo-600' : 'bg-zinc-200'}`} />
                )}
                <div 
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-200 ${
                    isActive 
                      ? 'bg-navy text-white shadow-xs ring-2 ring-navy/20' 
                      : isCompleted 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-zinc-100 text-zinc-400'
                  }`}
                >
                  <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full text-[10px] font-black">
                    {isCompleted ? <Check size={11} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="hidden sm:inline tracking-tight text-[11px]">{step.label}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {/* STEP 0: Dual-Column Upload & Guidelines Workspace */}
        {currentStep === 0 && (
          <div className="flex-1 min-h-0 flex flex-col animate-in fade-in duration-200">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch h-full">
              
              {/* LEFT COLUMN: Context, Schema & Download Card (5 cols on lg) */}
              <div className="lg:col-span-5 flex flex-col gap-3 h-full">
                
                {/* Information & Schema Card */}
                <div className="flex-1 min-h-0 p-4 rounded-xl bg-gradient-to-br from-slate-50/80 via-white to-indigo-50/20 border border-zinc-200/80 shadow-xs flex flex-col justify-between gap-3">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-100/70 text-indigo-700 text-[9px] font-black uppercase tracking-wider">
                        {config.badge}
                      </span>
                      <span className="text-[10px] font-semibold text-muted-foreground">Format: .xlsx, .csv</span>
                    </div>

                    <div>
                      <h3 className="text-sm font-black text-navy tracking-tight leading-tight">
                        {config.title}
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        {config.description}
                      </p>
                    </div>

                    {/* Target Academic Section Picker (When launched from global list) */}
                    {type === 'students' && !propClassId && (
                      <div className="p-2.5 rounded-xl bg-white border border-indigo-200/90 shadow-2xs flex flex-col gap-1 ring-2 ring-indigo-500/10">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black uppercase tracking-wider text-navy flex items-center gap-1.5">
                            <Users size={12} className="text-indigo-600" />
                            Target Academic Section
                          </label>
                          <span className="text-[9px] font-bold text-rose-500 bg-rose-50 px-1.5 py-0.2 rounded">Required</span>
                        </div>
                        <SearchableSelect
                          options={availableClasses.map((c) => ({
                            value: c._id,
                            label: `${c.name} (Semester ${c.semester})`,
                            subLabel: `${c.academicYear || ''} • ${c.departmentId?.name || ''}`
                          }))}
                          value={effectiveClassId}
                          onChange={(val) => {
                            setSelectedClassId(val);
                            setError(null);
                          }}
                          placeholder={loadingClasses ? 'Loading academic groups...' : 'Choose Class (e.g. CSD-A, CSE-B)...'}
                          disabled={loadingClasses}
                          className="text-xs"
                        />
                        {currentClassObj && (
                          <p className="text-[10px] text-emerald-700 font-bold flex items-center gap-1 mt-0.5">
                            <Check size={10} className="text-emerald-600" />
                            Destination: {currentClassObj.name} (Sem {currentClassObj.semester})
                          </p>
                        )}
                      </div>
                    )}

                    {/* Schema Requirements Checklist */}
                    <div className="flex flex-col gap-1 pt-1.5 border-t border-zinc-100">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                        Required Columns in Sheet
                      </p>
                      <div className="flex flex-col gap-1">
                        {config.columns.map((col, idx) => (
                          <div key={idx} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white border border-zinc-100/80 text-left shadow-2xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${col.required ? 'bg-indigo-600' : 'bg-zinc-300'}`} />
                              <span className="font-mono text-xs font-bold text-navy truncate">{col.name}</span>
                            </div>
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded shrink-0 ml-2 ${col.required ? 'text-rose-600 bg-rose-50' : 'text-zinc-400 bg-zinc-50'}`}>
                              {col.required ? 'Required' : 'Optional'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Smart Feature Callout (e.g. Range Expansion) */}
                  {config.rangeHint && (
                    <div className="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-100 flex items-center gap-2 mt-auto">
                      <Sparkles size={14} className="text-indigo-600 shrink-0" />
                      <p className="text-[10px] text-indigo-900 leading-tight">
                        <span className="font-bold">Smart Range Parser:</span> Range formats like <code className="bg-white/80 px-1 py-0.2 rounded font-mono font-bold text-indigo-800">25MRA01-60</code> are auto-expanded.
                      </p>
                    </div>
                  )}
                </div>

                {/* Download Template Bar */}
                <div className="shrink-0 p-3 rounded-xl bg-white border border-zinc-200/80 shadow-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-left">
                    <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                      <FileSpreadsheet size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-navy leading-none">Official Excel Template</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Pre-configured with column headers</p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 gap-1.5 shrink-0 bg-zinc-50 hover:bg-zinc-100 text-xs font-bold text-navy border border-zinc-200 px-3 py-1 cursor-pointer"
                    onClick={handleDownloadTemplate}
                    disabled={downloading}
                  >
                    {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    {downloading ? 'Downloading...' : 'Download .xlsx'}
                  </Button>
                </div>

              </div>

              {/* RIGHT COLUMN: Interactive Drag & Drop Zone (7 cols on lg) */}
              <div className="lg:col-span-7 flex flex-col h-full min-h-0">
                <FileDropzone 
                  file={currentFile}
                  onFileSelect={handleFileUpload} 
                  loading={loading}
                  className="flex-1 w-full h-full min-h-[320px] flex flex-col items-center justify-center p-6 bg-gradient-to-b from-white to-zinc-50/40"
                  title="Upload Spreadsheet"
                  subtitle="Drag & drop your .xlsx or .csv roster file here, or click to browse"
                />
                {error && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2 text-rose-800 shrink-0">
                    <AlertTriangle className="text-rose-600 shrink-0" size={14} />
                    <p className="text-xs font-bold">{error}</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* STEP 1: Full-Width High-Density Workspace (Validation & Preview) */}
        {currentStep === 1 && (
          <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 animate-in fade-in duration-200">
            
            {/* Contextual Error Alert if sheet switch or sync failed */}
            {error && (
              <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-2.5 text-rose-800 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="text-rose-600 shrink-0" size={14} />
                  <p className="text-xs font-bold truncate">{error}</p>
                </div>
                <button type="button" onClick={() => setError(null)} className="text-rose-400 hover:text-rose-700 cursor-pointer">
                  <X size={13} />
                </button>
              </div>
            )}

            {/* STREAMLINED COHORT COMMAND BAR */}
            {previewData?.sheets?.length > 1 ? (
              <div className="shrink-0 p-1.5 sm:p-2 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                {/* Section Cohort Tabs with Inline Mappings */}
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <div className="flex items-center gap-1 p-0.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
                    {rosterSheets.map((s) => {
                      const isActive = s.sheetName === activeSheetObj.sheetName;
                      const isChecked = selectedSheetNames.has(s.sheetName);
                      const assignedClassId = sheetClassOverrides[s.sheetName] || s.targetClass?._id;

                      return (
                        <div
                          key={s.sheetName}
                          className={`flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md transition-all ${
                            isActive
                              ? 'bg-indigo-50/90 text-indigo-950 font-bold border border-indigo-200/90 shadow-2xs'
                              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            title="Include in import batch"
                            onChange={(e) => {
                              const next = new Set(selectedSheetNames);
                              if (e.target.checked) next.add(s.sheetName);
                              else next.delete(s.sheetName);
                              setSelectedSheetNames(next);
                            }}
                            className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-zinc-300 cursor-pointer"
                          />
                          <button
                            type="button"
                            onClick={() => handleSelectSheet(s.sheetName)}
                            className="text-xs font-black tracking-tight cursor-pointer"
                          >
                            {s.sheetName}
                          </button>
                          <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.2 rounded">
                            {s.valid?.length || 0}
                          </span>
                          <span className="text-zinc-300 text-xs">→</span>
                          <ClassPickerCombobox
                            value={assignedClassId}
                            onChange={(cId) => {
                              setSheetClassOverrides((prev) => ({
                                ...prev,
                                [s.sheetName]: cId,
                              }));
                            }}
                            classes={availableClasses}
                            sheetName={s.sheetName}
                            sheetMeta={s.meta}
                            onQuickCreate={handleQuickCreateClass}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Auxiliary Non-Roster Sheets Dropdown (Only if sheets have rows) */}
                  {auxiliarySheetsWithRows.length > 0 && (
                    <AuxiliarySheetsDropdown
                      sheets={auxiliarySheetsWithRows}
                      activeSheetName={activeSheetObj.sheetName}
                      onSelect={handleSelectSheet}
                    />
                  )}
                </div>

                {/* Right: Validation Health Badge */}
                <div className="flex items-center gap-2 shrink-0">
                  {errorCount > 0 ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
                      <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                      <span><strong>{validCount}</strong> valid • <strong className="text-rose-700">{errorCount}</strong> skipped</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200/90 text-emerald-900 text-xs font-semibold">
                      <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                      <span><strong>{validCount}</strong> valid (100% compliant)</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Single-Sheet Clean Health Strip */
              <div className="shrink-0 p-2 rounded-xl bg-slate-50 border border-slate-200/90 flex items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-zinc-200 text-xs font-bold text-navy shadow-2xs">
                    <span className="text-zinc-500 font-normal">Target Class:</span>
                    <strong className="text-indigo-600 font-mono">
                      {currentClassObj ? `${currentClassObj.name} (Sem ${currentClassObj.semester})` : (contextLabel || 'Directory Sync')}
                    </strong>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {errorCount > 0 ? (
                    <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
                      <AlertTriangle size={12} className="text-amber-600" />
                      <span><strong>{validCount}</strong> valid • <strong className="text-rose-700">{errorCount}</strong> skipped</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold">
                      <CheckCircle2 size={12} className="text-emerald-600" />
                      <span><strong>{validCount}</strong> valid (100% compliant)</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* LEVEL 2: Data Grid Toolbar & Interactive Table (Expands to fill all remaining height) */}
            <div className="flex-1 min-h-0 flex flex-col gap-1.5">
              
              {/* Toolbar: Filter Tabs + Search */}
              <div className="shrink-0 flex items-center justify-between gap-2">
                
                {/* Segmented Filter Tabs */}
                <div className="flex items-center gap-1 p-0.5 bg-zinc-100 rounded-lg w-fit border border-zinc-200/70">
                  <button
                    type="button"
                    onClick={() => setFilterTab('all')}
                    className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                      filterTab === 'all' 
                        ? 'bg-white text-navy shadow-xs' 
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    All Records ({totalCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('valid')}
                    className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      filterTab === 'valid' 
                        ? 'bg-white text-emerald-800 shadow-xs' 
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Ready ({validCount})
                  </button>
                  {errorCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterTab('errors')}
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        filterTab === 'errors' 
                          ? 'bg-white text-rose-800 shadow-xs' 
                          : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      Skipped ({errorCount})
                    </button>
                  )}
                </div>

                {/* Inline Search Bar */}
                <div className="relative w-48 sm:w-56">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input 
                    type="text" 
                    placeholder="Search preview..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-7 pr-6 py-0.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy transition-all h-7.5"
                  />
                  {searchQuery && (
                    <button 
                      type="button" 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>

              </div>

              {/* High-Density Data Grid Container with Dynamic Flex Expansion & Scoped Internal Scroll */}
              <div className="flex-1 min-h-0 rounded-xl border border-zinc-200/90 overflow-hidden bg-white shadow-xs flex flex-col">
                <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-300">
                  {filteredRows.length > 0 ? (
                    <Table 
                      columns={tableColumns} 
                      data={filteredRows}
                      searchable={false}
                      showCount={false}
                    />
                  ) : (
                    <div className="py-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                      <AlertCircle size={24} className="text-zinc-300 mb-1.5" />
                      <p className="text-xs font-bold text-zinc-600">No records match the current filter</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Try clearing the search query or selecting a different tab</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Sub-Footer */}
              <div className="shrink-0 flex items-center justify-between text-[10px] text-zinc-400 px-0.5 font-medium">
                <span>Showing <strong className="text-zinc-600 font-bold">{filteredRows.length}</strong> of {totalCount} records</span>
                <span><strong className="text-emerald-700 font-bold">{validCount}</strong> compliant records will be staged for commit</span>
              </div>

            </div>

            {/* LEVEL 3: Dedicated Modal Action Footer (Permanently Visible, Non-Scrollable) */}
            <div className="shrink-0 pt-2.5 border-t border-zinc-200 flex items-center justify-between gap-3">
              <Button 
                variant="secondary" 
                size="sm"
                className="h-8.5 px-3 text-xs font-bold text-navy gap-1.5 bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 cursor-pointer"
                onClick={() => {
                  setCurrentFile(null);
                  setPreviewData(null);
                  setError(null);
                  setCurrentStep(0);
                }}
                disabled={loading}
              >
                <RefreshCw size={11} /> Choose Different File
              </Button>

              <div className="flex items-center justify-end gap-2">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={onComplete} 
                  disabled={loading}
                  className="h-8.5 px-3 text-xs font-bold text-zinc-500 hover:text-zinc-800 cursor-pointer"
                >
                  Cancel
                </Button>

                {rosterSheets.length > 1 && selectedRosterSheets.length > 1 ? (
                  <>
                    <button
                      type="button"
                      disabled={validCount === 0 || loading}
                      onClick={() => {
                        setIsBatchMode(false);
                        setCurrentStep(2);
                      }}
                      className="text-xs font-semibold text-zinc-500 hover:text-navy underline decoration-zinc-300 underline-offset-2 cursor-pointer mr-1.5 disabled:opacity-40"
                    >
                      Import only {activeSheetObj.sheetName} ({validCount})
                    </button>
                    <Button 
                      variant="primary" 
                      size="sm"
                      disabled={totalBatchValidCount === 0 || loading} 
                      onClick={() => {
                        setIsBatchMode(true);
                        setCurrentStep(2);
                      }}
                      className="h-8.5 px-4 text-xs font-black uppercase tracking-wider gap-1.5 shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      loading={loading}
                    >
                      Import All {totalBatchValidCount} Students ({selectedRosterSheets.length} Classes) <ArrowRight size={13} />
                    </Button>
                  </>
                ) : (
                  <Button 
                    variant="primary" 
                    size="sm"
                    disabled={validCount === 0 || loading} 
                    onClick={() => {
                      setIsBatchMode(false);
                      setCurrentStep(2);
                    }}
                    className="h-8.5 px-4 text-xs font-black uppercase tracking-wider gap-1.5 shadow-sm bg-navy hover:bg-navy/90 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    loading={loading}
                  >
                    {validCount > 0 ? (
                      <>Import {validCount} Students to {currentClassObj?.name || activeSheetObj.targetClass?.name || 'Class'} <ArrowRight size={13} /></>
                    ) : (
                      <>No Valid Records to Import</>
                    )}
                  </Button>
                )}
              </div>
            </div>

          </div>
        )}

        {/* STEP 2: Final Confirmation */}
        {currentStep === 2 && (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center animate-in zoom-in-95 duration-200 text-center py-4 max-w-lg mx-auto w-full">
            {loading ? (
              <div className="flex flex-col items-center py-6">
                <div className="relative mb-4">
                  <div className="h-12 w-12 rounded-full border-3 border-navy/10 border-t-navy animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <RefreshCw size={16} className="text-navy/40 animate-pulse" />
                  </div>
                </div>
                <h3 className="text-lg font-black text-navy mb-1 uppercase tracking-tight">Syncing Directory Records</h3>
                <p className="text-muted-foreground text-xs leading-relaxed max-w-[260px]">
                  Writing validated entries to the database.
                </p>
              </div>
            ) : isBatchMode ? (
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-indigo-200/90 shadow-sm flex flex-col items-center w-full">
                <div className="h-12 w-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3 border border-indigo-100 shadow-sm shadow-indigo-100/50">
                  <Check size={24} strokeWidth={2.5} />
                </div>
                <h3 className="text-lg font-black text-navy mb-1 tracking-tight">Ready for One-Shot Multi-Class Ingestion</h3>
                <p className="text-muted-foreground text-xs max-w-[360px] mx-auto leading-relaxed mb-4">
                  You are about to commit <span className="text-navy font-bold">{totalBatchValidCount} validated students</span> across <span className="text-navy font-bold">{selectedRosterSheets.length} classes</span> in a single atomic transaction:
                </p>

                {error && (
                  <div className="w-full mb-3.5 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800 text-left">
                    <AlertTriangle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold leading-snug">{error}</p>
                  </div>
                )}

                {/* Cohort Breakdown List */}
                <div className="w-full flex flex-col gap-1.5 mb-5 max-h-[160px] overflow-y-auto scrollbar-thin">
                  {selectedRosterSheets.map((s) => {
                    const cId = sheetClassOverrides[s.sheetName] || s.targetClass?._id;
                    const cObj = availableClasses.find((c) => c._id === cId) || s.targetClass;
                    return (
                      <div key={s.sheetName} className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 border border-zinc-200/80 text-left text-xs">
                        <span className="font-bold text-navy">{s.sheetName}</span>
                        <span className="text-indigo-600 font-semibold font-mono text-[11px]">→ {cObj ? `${cObj.name} (Sem ${cObj.semester})` : 'Unassigned'}</span>
                        <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">{s.valid?.length || 0} students</span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-2 w-full max-w-[280px]">
                  <Button 
                    variant="primary" 
                    className="w-full h-10 text-xs font-black uppercase tracking-wider gap-2 shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer" 
                    onClick={() => handleCommit(true)}
                    loading={loading}
                  >
                    Commit All {totalBatchValidCount} Students ({selectedRosterSheets.length} Classes)
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full h-8 text-xs font-bold text-zinc-500 hover:text-zinc-800 cursor-pointer" 
                    onClick={() => setCurrentStep(1)}
                    disabled={loading}
                  >
                    Back to Review
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-zinc-200/90 shadow-sm flex flex-col items-center w-full">
                <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 border border-emerald-100 shadow-sm shadow-emerald-100/50">
                  <Check size={24} strokeWidth={2.5} />
                </div>
                <h3 className="text-lg font-black text-navy mb-1 tracking-tight">Ready to Commit</h3>
                <p className="text-muted-foreground text-xs max-w-[320px] mx-auto leading-relaxed mb-4">
                  You are about to commit <span className="text-navy font-bold">{validCount} validated record{validCount > 1 ? 's' : ''}</span> into <span className="text-navy font-bold">{currentClassObj ? `${currentClassObj.name} (Sem ${currentClassObj.semester || '?'})` : (contextLabel || 'the directory')}</span>.
                </p>

                {error && (
                  <div className="w-full mb-3.5 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800 text-left">
                    <AlertTriangle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold leading-snug">{error}</p>
                  </div>
                )}

                <div className="w-full grid grid-cols-2 gap-2.5 mb-5 p-2.5 rounded-xl bg-zinc-50 border border-zinc-100 text-left">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">Valid Records</span>
                    <span className="text-lg font-black text-emerald-800">{validCount}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Skipped Records</span>
                    <span className="text-lg font-black text-zinc-600">{errorCount}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 w-full max-w-[240px]">
                  <Button 
                    variant="primary" 
                    className="w-full h-10 text-xs font-black uppercase tracking-wider gap-2 shadow-sm cursor-pointer" 
                    onClick={() => handleCommit(false)}
                    loading={loading}
                  >
                    Commit {validCount} Record{validCount > 1 ? 's' : ''}
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full h-8 text-xs font-bold text-zinc-500 hover:text-zinc-800 cursor-pointer" 
                    onClick={() => setCurrentStep(1)}
                    disabled={loading}
                  >
                    Back to Review
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportStepper;
