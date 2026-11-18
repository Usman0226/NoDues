import React, { useState, useCallback, useMemo } from 'react';
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
  Sparkles
} from 'lucide-react';
import Button from '../ui/Button';
import FileDropzone from '../ui/FileDropzone';
import Table from '../ui/Table';
import { previewImport, commitImport, getTemplate } from '../../api/import';
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

const ImportStepper = ({ type = 'students', classId, contextLabel, onComplete }) => {
  const { addBackgroundTask, updateBackgroundTask } = useUI();
  const [currentStep, setCurrentStep] = useState(0);
  const [currentFile, setCurrentFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  // Preview filtering state
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'valid' | 'errors'
  const [searchQuery, setSearchQuery] = useState('');

  const config = TYPE_CONFIG[type] || TYPE_CONFIG.students;

  const handleFileUpload = useCallback(async (uploadedFile) => {
    setLoading(true);
    setError(null);
    setCurrentFile(uploadedFile);

    const formData = new FormData();
    formData.append('file', uploadedFile);

    try {
      const params = type === 'students' ? { classId } : {};
      const response = await previewImport(type, formData, params);
      setPreviewData(response.data);
      setCurrentStep(1);
      setFilterTab('all');
      setSearchQuery('');
    } catch (err) {
      setError(err?.message || 'Failed to parse file. Please verify the template headers.');
      toast.error('File Analysis Failed');
    } finally {
      setLoading(false);
    }
  }, [type, classId]);

  const handleSelectSheet = useCallback(async (selectedSheet) => {
    if (!currentFile) return;
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', currentFile);
    try {
      const params = { ...(type === 'students' ? { classId } : {}), sheet: selectedSheet };
      const response = await previewImport(type, formData, params);
      setPreviewData(response.data);
      setFilterTab('all');
      setSearchQuery('');
    } catch (err) {
      setError(err?.message || 'Failed to switch sheet');
      toast.error('Sheet analysis failed');
    } finally {
      setLoading(false);
    }
  }, [currentFile, type, classId]);

  const handleCommit = useCallback(async () => {
    const validCount = previewData?.valid?.length || 0;
    const taskLabel = `Importing ${validCount} ${type}`;
    
    setLoading(true);

    // Create background task
    const taskId = addBackgroundTask({
      label: taskLabel,
      type: `import_${type}`,
      message: 'Initializing background sync...'
    });

    // Close modal immediately as it's an asynchronous background operation
    onComplete?.();
    toast.success('Sync started in background');

    try {
      const payload = type === 'students' 
        ? { students: previewData.valid, classId }
        : { [type]: previewData.valid };

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
      
      toast.success(`${type} sync finished`);
    } catch (err) {
      const errorMsg = err?.message || 'Connection lost during sync';
      updateBackgroundTask(taskId, { 
        status: 'error', 
        message: errorMsg 
      });
      toast.error(`${type} sync failed`);
    } finally {
      setLoading(false);
    }
  }, [type, previewData, classId, onComplete, addBackgroundTask, updateBackgroundTask]);

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

  const validCount = previewData?.summary?.valid || previewData?.valid?.length || 0;
  const errorCount = previewData?.summary?.errors || previewData?.errors?.length || 0;
  const totalCount = previewData?.summary?.total || (validCount + errorCount);

  // Flattened data rows with standard keys
  const dataRows = useMemo(() => [
    ...(previewData?.valid?.map((item, idx) => ({ 
      ...item, 
      isValid: true, 
      displayIndex: idx + 1,
      errors: [] 
    })) || []),
    ...(previewData?.errors?.map((err, idx) => ({ 
      ...err.data, 
      isValid: false, 
      displayIndex: validCount + idx + 1,
      rowNumber: err.row, 
      errors: [err.reason] 
    })) || [])
  ], [previewData, validCount]);

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
    <div className="w-full flex-1 min-h-0 flex flex-col h-[82vh] max-h-[860px] min-h-[540px]">
      {/* Sleek, Compact Stepper Progress Header */}
      <div className="shrink-0 mb-3 pb-2 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {contextLabel && (
            <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-100/80 text-indigo-700 text-xs font-black tracking-tight flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
              {contextLabel}
            </span>
          )}
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
            
            {/* LEVEL 1: Compact Validation Health Banner */}
            {errorCount > 0 ? (
              <div className="px-3 py-2 rounded-xl bg-amber-50/90 border border-amber-200/90 flex items-center justify-between gap-2.5 shadow-xs shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                  <p className="text-xs font-semibold text-amber-900 truncate">
                    <strong className="font-black text-amber-950">{errorCount} row{errorCount > 1 ? 's' : ''} skipped</strong> due to errors. <strong className="font-black text-emerald-900">{validCount} valid records</strong> ready to import.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setFilterTab('valid')}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                      filterTab === 'valid'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50'
                    }`}
                  >
                    Ready ({validCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('errors')}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                      filterTab === 'errors'
                        ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                        : 'bg-white text-rose-800 border-rose-200 hover:bg-rose-50'
                    }`}
                  >
                    Skipped ({errorCount})
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-3 py-2 rounded-xl bg-emerald-50/80 border border-emerald-200/90 flex items-center justify-between gap-2.5 shadow-xs shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                  <p className="text-xs font-semibold text-emerald-900 truncate">
                    <span className="font-black uppercase tracking-wider text-[9px] bg-emerald-200/70 text-emerald-950 px-1.5 py-0.2 rounded-md mr-1.5">100% Valid</span>
                    All {validCount} records match the official academic schema with zero errors.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-bold text-emerald-800 bg-white/90 border border-emerald-200/90 px-2 py-0.5 rounded-md">
                    {validCount} Ready
                  </span>
                  <span className="text-[10px] font-medium text-zinc-400 bg-white/50 border border-zinc-200/60 px-2 py-0.5 rounded-md">
                    0 Skipped
                  </span>
                </div>
              </div>
            )}

            {/* Multi-Sheet Workbook Switcher */}
            {previewData?.availableSheets?.length > 1 && (
              <div className="shrink-0 flex items-center justify-between px-3 py-1.5 rounded-xl bg-indigo-50/70 border border-indigo-100/90 text-xs shadow-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <FileSpreadsheet size={14} className="text-indigo-600 shrink-0" />
                  <span className="text-[11px] font-bold text-indigo-950 shrink-0">Workbook Sheets:</span>
                  <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-thin">
                    {previewData.availableSheets.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleSelectSheet(s)}
                        disabled={loading}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                          previewData.sheetName === s
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-white text-zinc-600 border border-zinc-200/80 hover:bg-zinc-50'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-indigo-700/80 shrink-0 ml-2 hidden sm:inline">
                  Viewing: <strong>{previewData.sheetName}</strong>
                </span>
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
                className="h-8.5 px-3 text-xs font-bold text-navy gap-1.5 bg-zinc-50 border border-zinc-200 hover:bg-zinc-100"
                onClick={() => setCurrentStep(0)}
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
                  className="h-8.5 px-3 text-xs font-bold text-zinc-500 hover:text-zinc-800"
                >
                  Cancel
                </Button>
                <Button 
                  variant="primary" 
                  size="sm"
                  disabled={validCount === 0 || loading} 
                  onClick={() => setCurrentStep(2)}
                  className="h-8.5 px-4 text-xs font-black uppercase tracking-wider gap-1.5 shadow-sm bg-navy hover:bg-navy/90 text-white"
                  loading={loading}
                >
                  Proceed with {validCount} Record{validCount > 1 ? 's' : ''} <ArrowRight size={13} />
                </Button>
              </div>
            </div>

          </div>
        )}

        {/* STEP 2: Final Confirmation */}
        {currentStep === 2 && (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center animate-in zoom-in-95 duration-200 text-center py-4 max-w-md mx-auto">
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
                  Writing <span className="text-navy font-bold">{validCount}</span> validated entries to the database.
                </p>
              </div>
            ) : (
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-zinc-200/90 shadow-sm flex flex-col items-center">
                <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 border border-emerald-100 shadow-sm shadow-emerald-100/50">
                  <Check size={24} strokeWidth={2.5} />
                </div>
                <h3 className="text-lg font-black text-navy mb-1 tracking-tight">Ready to Commit</h3>
                <p className="text-muted-foreground text-xs max-w-[320px] mx-auto leading-relaxed mb-4">
                  You are about to commit <span className="text-navy font-bold">{validCount} validated record{validCount > 1 ? 's' : ''}</span> into {contextLabel || 'the directory'}.
                </p>

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
                    className="w-full h-10 text-xs font-black uppercase tracking-wider gap-2 shadow-sm" 
                    onClick={handleCommit}
                    loading={loading}
                  >
                    Commit {validCount} Record{validCount > 1 ? 's' : ''}
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full h-8 text-xs font-bold text-zinc-500" 
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
