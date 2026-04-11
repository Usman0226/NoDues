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
import { previewImport, commitImport } from '../../api/import';
import { toast } from 'react-hot-toast';

const STEPS = [
  { label: 'Upload', icon: Upload },
  { label: 'Preview', icon: Eye },
  { label: 'Confirm', icon: Check },
];

const ImportStepper = ({ type = 'students', contextLabel, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileUpload = useCallback(async (uploadedFile) => {
    setLoading(true);
    setError(null);
    setFile(uploadedFile);

    const formData = new FormData();
    formData.append('file', uploadedFile);

    try {
      const response = await previewImport(type, formData);
      setPreviewData(response);
      setCurrentStep(1);
    } catch (err) {
      setError(err?.message || 'Failed to parse file. Please check the template.');
      toast.error('File Analysis Failed');
    } finally {
      setLoading(false);
    }
  }, [type]);

  const handleCommit = useCallback(async () => {
    if (!previewData?.importId) return;
    
    setLoading(true);
    try {
      await commitImport(type, previewData.importId);
      toast.success('Records committed successfully');
      onComplete?.();
    } catch (err) {
      toast.error(err?.message || 'Commit failed. Try again.');
    } finally {
      setLoading(false);
    }
  }, [type, previewData, onComplete]);

  const dataRows = previewData?.previewRows || [];
  const validCount = previewData?.summary?.valid || 0;
  const errorCount = previewData?.summary?.errors || 0;

  return (
    <div className="w-full">
      {/* Steps Indicator - Pill Style */}
      <div className="flex items-center justify-center mb-12">
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

      <div className="min-h-[340px]">
        {currentStep === 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="max-w-md mx-auto text-center mb-10">
              <h3 className="text-xl font-black text-navy mb-2">{contextLabel || 'Upload Data Source'}</h3>
              <p className="text-sm text-muted-foreground">Select a clean .xlsx or .csv file following the academic template.</p>
            </div>
            
            <FileDropzone onFileSelect={handleFileUpload} isLoading={loading} />
            
            {error && (
              <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-100 flex items-center gap-3 animate-pulse">
                <AlertTriangle className="text-red-600" size={18} />
                <p className="text-xs font-bold text-red-700">{error}</p>
              </div>
            )}

            <div className="mt-10 flex items-center justify-between p-5 rounded-xl border border-muted/60 bg-white shadow-sm">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-offwhite rounded-lg">
                  <FileText className="text-navy/60" size={20} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-navy leading-none">Import Template</p>
                  <p className="text-[10px] text-muted-foreground font-medium mt-1">Includes proper headers for {type}</p>
                </div>
              </div>
              <Button variant="secondary" size="sm" className="gap-2">
                <Download size={14} /> Download
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
                  {errorCount > 0 && <span className="flex items-center justify-center h-6 px-3 rounded-full bg-red-50 text-red-700 text-[10px] font-black border border-red-100">{errorCount} Issues</span>}
                </div>
              </div>
              {errorCount > 0 && (
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 gap-1.5 font-black text-[10px]" onClick={() => setCurrentStep(0)}>
                  <RefreshCw size={14} /> Re-upload File
                </Button>
              )}
            </div>

            <div className="rounded-xl border border-muted/40 overflow-hidden mb-6 bg-white shadow-sm">
              <Table 
                columns={[
                  { key: 'identity', label: 'Identity', render: (v, row) => (
                    <div className="flex items-center gap-3">
                      <div className={`w-1 h-1 rounded-full ${row.isValid ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="font-mono text-xs font-bold tracking-tight text-navy">{v || row.rollNo || row.facultyId}</span>
                    </div>
                  )},
                  { key: 'name', label: 'Full Name' },
                  { key: 'status', label: 'Analysis', render: (_, row) => row.isValid ? (
                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Compliant</span>
                  ) : (
                    <span className="text-[9px] font-black text-red-600 uppercase italic opacity-80">{row.errors?.[0] || 'Format Error'}</span>
                  )}
                ]} 
                data={dataRows}
                searchable={false}
              />
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-muted/30">
              <Button variant="ghost" onClick={() => setCurrentStep(0)} disabled={loading}>Abort</Button>
              <Button 
                variant="primary" 
                disabled={errorCount > 0 || validCount === 0} 
                onClick={() => setCurrentStep(2)}
                className="gap-2"
                loading={loading}
              >
                Proceed to Confirm <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="animate-in zoom-in-95 duration-300 text-center py-10">
            <div className="h-16 w-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-6 border border-emerald-100 shadow-sm shadow-emerald-100/50">
              <Check size={32} strokeWidth={2.5} />
            </div>
            <h3 className="text-2xl font-black text-navy mb-2 tracking-tight">System Ready</h3>
            <p className="text-muted-foreground text-sm max-w-[280px] mx-auto mb-10 font-medium leading-relaxed">
              We parsed <span className="text-navy font-bold">{validCount}</span> compliant records. Committing will update the live academic directory.
            </p>
            
            <div className="flex flex-col gap-3 max-w-[240px] mx-auto">
              <Button 
                variant="primary" 
                className="w-full h-12 text-sm gap-2" 
                onClick={handleCommit}
                loading={loading}
              >
                Commit Records
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
