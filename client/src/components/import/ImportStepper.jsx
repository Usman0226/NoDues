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
  Loader2
} from 'lucide-react';
import Button from '../ui/Button';
import FileDropzone from '../ui/FileDropzone';
import Table from '../ui/Table';

const STEPS = [
  { label: 'Upload', icon: Upload },
  { label: 'Preview', icon: Eye },
  { label: 'Confirm', icon: Check },
];

const ImportStepper = ({ contextLabel, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [file, setFile] = useState(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Mock parsing logic
  const handleFileUpload = useCallback((uploadedFile) => {
    setLoading(true);
    setFile(uploadedFile);
    
    // Simulate parsing delay
    setTimeout(() => {
      const mockRows = [
        { id: 1, rollNo: '21CSE001', name: 'Arun Kumar', email: 'arun@mits.ac.in', isValid: true },
        { id: 2, rollNo: '21CSE002', name: 'Priya Sharma', email: 'priya@mits.ac.in', isValid: true },
        { id: 3, rollNo: '21CSE001', name: 'Duplicate Entry', email: 'dup@mits.ac.in', isValid: false, error: 'Duplicate roll number in file' },
        { id: 4, rollNo: 'INVALID', name: 'Missing Email', email: '', isValid: false, error: 'Invalid roll no / Email missing' },
        { id: 5, rollNo: '21CSE005', name: 'Sneha R.', email: 'sneha@mits.ac.in', isValid: true },
      ];
      setData(mockRows);
      setLoading(false);
      setCurrentStep(1);
    }, 800);
  }, []);

  const handleCommit = useCallback(() => {
    setLoading(true);
    // Simulate API commit
    setTimeout(() => {
      setLoading(false);
      onComplete?.();
    }, 1200);
  }, [onComplete]);

  const validCount = data.filter(r => r.isValid).length;
  const errorCount = data.filter(r => !r.isValid).length;

  return (
    <div className="w-full">
      {/* Step Indicators */}
      <div className="flex items-center justify-center mb-10">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isActive = i === currentStep;
          const isCompleted = i < currentStep;
          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <div className={`h-0.5 w-12 sm:w-16 lg:w-20 mx-2 rounded-full transition-colors ${isCompleted ? 'bg-navy' : 'bg-muted'}`} />
              )}
              <div className="flex flex-col items-center gap-2">
                <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-full flex items-center justify-center transition-all duration-300
                  ${isActive ? 'bg-navy text-white shadow-lg shadow-navy/30 scale-110' : isCompleted ? 'bg-navy text-white' : 'bg-muted text-muted-foreground'}`}>
                  {isCompleted ? <Check size={20} /> : <Icon size={20} />}
                </div>
                <span className={`text-[9px] uppercase tracking-[0.15em] font-bold ${isActive ? 'text-navy' : 'text-muted-foreground'}`}>
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div className="min-h-[300px]">
        {/* Step 1: Upload */}
        {currentStep === 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="text-center mb-6">
              <h3 className="text-lg font-serif text-navy mb-1">{contextLabel || 'Import Data'}</h3>
              <p className="text-sm text-muted-foreground">Accepts .xlsx or .csv formats</p>
            </div>
            
            <FileDropzone onFileSelect={handleFileUpload} isLoading={loading} />
            
            <div className="mt-8 flex items-center justify-between p-4 rounded-2xl bg-offwhite border border-muted">
              <div className="flex items-center gap-3">
                <FileText className="text-navy" size={24} />
                <div className="text-left">
                  <p className="text-sm font-semibold text-navy leading-none">Standard Template</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Download to ensure correct data format</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <Download size={14} /> Download
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Preview (PRD §6.8) */}
        {currentStep === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Badge status="cleared" className="bg-emerald-50 text-emerald-600 px-2 py-0.5">
                  {validCount} Valid
                </Badge>
                {errorCount > 0 && (
                  <Badge status="due_marked" className="bg-red-50 text-red-600 px-2 py-0.5">
                    {errorCount} Errors
                  </Badge>
                )}
              </div>
              {errorCount > 0 && (
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5">
                  <AlertCircle size={14} /> Download Error Report
                </Button>
              )}
            </div>

            <div className="max-h-[350px] overflow-y-auto rounded-xl border border-muted mb-6">
              <Table 
                columns={[
                  { key: 'rollNo', label: 'Roll No', render: (v, row) => (
                    <div className="flex items-center gap-3">
                      <div className={`w-1 h-8 rounded-full ${row.isValid ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="font-mono text-xs font-semibold">{v}</span>
                    </div>
                  )},
                  { key: 'name', label: 'Name' },
                  { key: 'email', label: 'Email' },
                  { key: 'error', label: 'Validation', render: (v) => v ? (
                    <span className="text-[10px] font-bold text-red-600 uppercase tracking-tight">{v}</span>
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-tight">Ready</span>
                  )}
                ]} 
                data={data}
                searchable={false}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-muted">
              <Button variant="ghost" onClick={() => setCurrentStep(0)}>Back</Button>
              <Button 
                variant="primary" 
                disabled={errorCount > 0} 
                onClick={() => setCurrentStep(2)}
                className="gap-2"
              >
                Continue <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm (PRD §6.8) */}
        {currentStep === 2 && (
          <div className="animate-in fade-in zoom-in duration-300 text-center py-8">
            <div className="h-20 w-20 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto mb-6">
              <Check size={40} />
            </div>
            <h3 className="text-xl font-serif text-navy mb-2">Ready to Commit</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-8">
              You are about to import <span className="font-bold text-navy">{validCount}</span> records.
              Credentials will be automatically generated and emailed where applicable.
            </p>
            
            <div className="flex flex-col gap-3 max-w-xs mx-auto">
              <Button 
                variant="primary" 
                className="w-full h-12 text-base gap-2" 
                onClick={handleCommit}
                loading={loading}
              >
                Commit {validCount} Records
              </Button>
              <Button 
                variant="ghost" 
                className="w-full" 
                onClick={() => setCurrentStep(1)}
                disabled={loading}
              >
                Return to Preview
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportStepper;
