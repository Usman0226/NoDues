import React, { useState, useCallback } from 'react';
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
  RefreshCw
} from 'lucide-react';
import Button from '../ui/Button';
import FileDropzone from '../ui/FileDropzone';
import Table from '../ui/Table';
import Badge from '../ui/Badge';
import { previewImport, commitImport, getTemplate } from '../../api/import';
import { toast } from 'react-hot-toast';
import { useUI } from '../../hooks/useUI';

const STEPS = [
  { label: 'Upload', icon: Upload },
  { label: 'Preview', icon: Eye },
  { label: 'Confirm', icon: Check },
];

const ImportStepper = ({ type = 'students', classId, contextLabel, onComplete }) => {
  const { addBackgroundTask, updateBackgroundTask } = useUI();
  const [currentStep, setCurrentStep] = useState(0);
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileUpload = useCallback(async (uploadedFile) => {
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', uploadedFile);

    try {
      const params = type === 'students' ? { classId } : {};
      const response = await previewImport(type, formData, params);
      setPreviewData(response.data);
      setCurrentStep(1);
    } catch (err) {
      setError(err?.message || 'Failed to parse file. Please check the template.');
      toast.error('File Analysis Failed');
    } finally {
      setLoading(false);
    }
  }, [type, classId]);

  const handleCommit = useCallback(async () => {
    const validCount = previewData?.valid?.length || 0;
    const taskLabel = `Importing ${validCount} ${type}`;
    
    // Create background task
    const taskId = addBackgroundTask({
      label: taskLabel,
      type: `import_${type}`,
      message: 'Initializing background sync...'
    });

    // Close modal immediately
    onComplete?.();
    toast.success('Sync started in background');

    try {
      const payload = type === 'students' 
        ? { students: previewData.valid, classId }
        : { [type]: previewData.valid };

      const res = await commitImport(type, payload);
      const serverTaskId = res.data?.taskId;

      if (serverTaskId) {
        // Swap temp task for real backend-tracked task
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
      console.warn(err)
    } finally {
      setDownloading(false);
    }
  }, [type]);

  const dataRows = React.useMemo(() => [
    ...(previewData?.valid?.map(item => ({ ...item, isValid: true })) || []),
    ...(previewData?.errors?.map(err => ({ ...err.data, isValid: false, errors: [err.reason] })) || [])
  ], [previewData]);
  const validCount = previewData?.summary?.valid || 0;
  const errorCount = previewData?.summary?.errors || 0;

  const tableColumns = React.useMemo(() => {
    const baseCols = [
      { key: 'identity', label: 'Identity', render: (_, row) => (
        <div className="flex items-center gap-3">
          <div className={`w-1 h-1 rounded-full ${row.isValid ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className={`font-mono text-xs font-bold tracking-tight ${row.isValid ? 'text-navy' : 'text-red-400 line-through'}`}>
            {row.rollNo || row.employeeId || row.identity}
          </span>
        </div>
      )},
    ];

    if (type === 'students' || type === 'faculty') {
      baseCols.push({ key: 'name', label: 'Name' });
    } else if (type === 'electives') {
      baseCols.push({ key: 'studentName', label: 'Student' });
      baseCols.push({ key: 'subjectCode', label: 'Subject' });
      baseCols.push({ key: 'facultyName', label: 'Faculty' });
    } else if (type === 'mentors') {
      baseCols.push({ key: 'studentName', label: 'Student' });
      baseCols.push({ key: 'facultyName', label: 'Mentor' });
    }

    baseCols.push({ key: 'status', label: 'Analysis', render: (_, row) => row.isValid ? (
      <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Compliant</span>
    ) : (
      <span className="text-[9px] font-black text-red-600 uppercase italic opacity-80">{row.errors?.[0] || 'Format Error'}</span>
    )});

    return baseCols;
  }, [type]);

  return (
    <div className="w-full">
      {/* Steps Indicator - Pill Style */}
      <div className="flex items-center justify-center mb-8">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isActive = i === currentStep;
          const isCompleted = i < currentStep;
          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <div className={`h-px w-10 sm:w-16 mx-3 transition-colors duration-500 ${isCompleted ? 'bg-navy' : 'bg-muted'}`} />
              )}
              <div className="flex flex-col items-center gap-2.5">
                <div className={`h-11 w-11 rounded-full flex items-center justify-center transition-all duration-300
                  ${isActive ? 'bg-navy text-white shadow-md scale-110' : isCompleted ? 'bg-navy text-white' : 'bg-muted/50 text-muted-foreground/60'}`}>
                  {isCompleted ? <Check size={18} strokeWidth={3} /> : <Icon size={18} />}
                </div>
                <span className={`text-[9px] uppercase tracking-[0.2em] font-black ${isActive ? 'text-navy' : 'text-muted-foreground/50'}`}>
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div className="min-h-[280px]">
        {currentStep === 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="max-w-md mx-auto text-center mb-6">
              <h3 className="text-xl font-black text-navy mb-2">{contextLabel || 'Upload Data Source'}</h3>
              <p className="text-sm text-muted-foreground">Select a clean .xlsx or .csv file following the academic template.</p>
            </div>
            
            <FileDropzone onFileSelect={handleFileUpload} />
            
            {error && (
              <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-100 flex items-center gap-3 animate-pulse">
                <AlertTriangle className="text-red-600" size={18} />
                <p className="text-xs font-bold text-red-700">{error}</p>
              </div>
            )}

            <div className="mt-8 flex items-center justify-between p-5 rounded-xl border border-muted/60 bg-white shadow-sm">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-offwhite rounded-xl">
                  <FileText className="text-navy/60" size={20} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-navy leading-none">Import Template</p>
                  <p className="text-[10px] text-muted-foreground font-medium mt-1">Includes proper headers for {type}</p>
                </div>
              </div>
              <Button 
                variant="secondary" 
                size="sm" 
                className="gap-2"
                onClick={handleDownloadTemplate}
                disabled={downloading}
              >
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} 
                {downloading ? 'Downloading...' : 'Download'}
              </Button>
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-1">
                  <span className="flex items-center justify-center h-6 px-3 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-100">{validCount} Ready</span>
                  {errorCount > 0 && <span className="flex items-center justify-center h-6 px-3 rounded-full bg-red-50 text-red-700 text-[10px] font-black border border-red-100">{errorCount} Skipped</span>}
                </div>
              </div>
              {errorCount > 0 && (
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 gap-1.5 font-black text-[10px]" onClick={() => setCurrentStep(0)}>
                  <RefreshCw size={14} /> Re-upload File
                </Button>
              )}
            </div>

            {errorCount > 0 && validCount > 0 && (
              <div className="mb-4 flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[11px] font-semibold text-amber-800 leading-relaxed">
                  <span className="font-black">{errorCount} row{errorCount > 1 ? 's' : ''} will be skipped</span> due to validation errors.
                  Only the <span className="font-black">{validCount} valid record{validCount > 1 ? 's' : ''}</span> will be imported.
                </p>
              </div>
            )}

            {errorCount > 0 && validCount === 0 && (
              <div className="mb-4 flex items-start gap-3 p-3.5 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle size={15} className="text-red-600 mt-0.5 shrink-0" />
                <p className="text-[11px] font-semibold text-red-800 leading-relaxed">
                  All rows have errors. Please fix the file and re-upload.
                </p>
              </div>
            )}

            <div className="rounded-xl border border-muted/40 overflow-y-auto max-h-[400px] mb-6 bg-white shadow-sm no-scrollbar">
              <Table 
                columns={tableColumns} 
                data={dataRows}
                searchable={false}
              />
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-muted/30">
              <Button variant="ghost" onClick={() => setCurrentStep(0)} disabled={loading}>Abort</Button>
              <Button 
                variant="primary" 
                disabled={validCount === 0} 
                onClick={() => setCurrentStep(2)}
                className="gap-2"
                loading={loading}
              >
                {errorCount > 0 && validCount > 0
                  ? `Proceed with ${validCount} Record${validCount > 1 ? 's' : ''}`
                  : 'Proceed to Confirm'} <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="animate-in zoom-in-95 duration-300 text-center py-8">
            <div className="h-16 w-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-6 border border-emerald-100 shadow-sm shadow-emerald-100/50">
              <Check size={32} strokeWidth={2.5} />
            </div>
            <h3 className="text-2xl font-black text-navy mb-2 tracking-tight">System Ready</h3>
            <p className="text-muted-foreground text-sm max-w-[280px] mx-auto font-medium leading-relaxed">
              <span className="text-navy font-bold">{validCount}</span> compliant record{validCount > 1 ? 's' : ''} will be committed to the directory.
            </p>

            {errorCount > 0 && (
              <p className="text-[11px] text-amber-700 font-semibold mt-2 mb-6 max-w-[280px] mx-auto">
                <AlertTriangle size={11} className="inline mr-1 mb-0.5" />
                {errorCount} row{errorCount > 1 ? 's' : ''} with errors will be skipped.
              </p>
            )}
            {errorCount === 0 && <div className="mb-6" />}
            
            <div className="flex flex-col gap-3 max-w-[240px] mx-auto">
              <Button 
                variant="primary" 
                className="w-full h-12 text-sm gap-2" 
                onClick={handleCommit}
                loading={loading}
              >
                Commit {validCount} Record{validCount > 1 ? 's' : ''}
              </Button>
              <Button 
                variant="ghost" 
                className="w-full text-[10px] font-black" 
                onClick={() => setCurrentStep(1)}
                disabled={loading}
              >
                Review Data Again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportStepper;
