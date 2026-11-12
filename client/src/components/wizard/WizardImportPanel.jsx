import React, { useState } from 'react';
import { getTemplate } from '../../api/import';
import FileDropzone from '../ui/FileDropzone';
import Button from '../ui/Button';
import {
  Download,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

/**
 * Shared Excel/CSV upload + authenticated template + format preview panel for Setup Wizard steps.
 * Validates rows via preview endpoint before committing so misformatted spreadsheets never fail blindly.
 */
const WizardImportPanel = ({
  type,
  title,
  columns = [],
  dropLabel = 'Drop Excel (.xlsx) or CSV file here',
  onPreview,
  onCommit,
  onCommitted,
  onDirtyChange,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  const handleDownloadTemplate = async () => {
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
      toast.success(`Downloaded ${type} template (.xlsx)`);
    } catch (err) {
      toast.error(err?.message || 'Failed to download Excel template.');
    } finally {
      setDownloading(false);
    }
  };

  const handleFileSelect = async (file) => {
    if (!file) {
      setPreviewData(null);
      setAnalysisError(null);
      onDirtyChange?.(false);
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setPreviewData(null);
    onDirtyChange?.(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await onPreview(formData);
      const data = res?.data || res;
      setPreviewData({ fileName: file.name, ...data });
    } catch (err) {
      const msg = err?.message || 'Could not parse spreadsheet. Please check the expected columns or download the template.';
      setAnalysisError(msg);
      toast.error('Spreadsheet check failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConfirmCommit = async () => {
    const validRows = previewData?.valid || [];
    if (!validRows.length) return;

    setIsCommitting(true);
    try {
      await onCommit(validRows);
      setPreviewData(null);
      setAnalysisError(null);
      onDirtyChange?.(false);
      onCommitted?.(validRows.length);
    } catch (err) {
      toast.error(err?.message || 'Failed to save imported rows.');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleReset = () => {
    setPreviewData(null);
    setAnalysisError(null);
    onDirtyChange?.(false);
  };

  const validRows = previewData?.valid || [];
  const errorRows = previewData?.errors || [];

  return (
    <div className="rounded-2xl border border-slate-300 bg-slate-50/90 p-4 space-y-3">
      {/* Header + Authenticated .xlsx Template Download */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={15} className="text-indigo-700 shrink-0" />
            <h3 className="text-xs font-black uppercase tracking-wider text-navy truncate">{title}</h3>
          </div>
          {columns.length > 0 && (
            <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 mr-0.5">Columns:</span>
              {columns.map((col) => (
                <span
                  key={col.name}
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                    col.required
                      ? 'bg-white text-navy border-slate-300 shadow-2xs'
                      : 'bg-slate-200/70 text-slate-700 border-slate-300/80'
                  }`}
                >
                  {col.name}
                  {!col.required && <span className="ml-1 text-[9px] text-slate-600">(opt)</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        <Button
          type="button"
          variant="secondary"
          size="xs"
          onClick={handleDownloadTemplate}
          disabled={downloading}
          className="self-start sm:self-auto !border-slate-300 !bg-white !text-slate-800 hover:!bg-slate-100"
        >
          {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          <span>{downloading ? 'Downloading...' : 'Excel Template'}</span>
        </Button>
      </div>

      {/* State 1: Upload Dropzone */}
      {!previewData && (
        <FileDropzone
          accept=".csv,.xlsx,.xls"
          label={dropLabel}
          subtitle="Supports .xlsx, .xls, or .csv — headers are validated before saving"
          loading={isAnalyzing}
          onFileSelect={handleFileSelect}
        />
      )}

      {/* Analysis Error Callout */}
      {analysisError && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-bold">Spreadsheet Format Issue</p>
            <p className="text-amber-800 leading-relaxed">{analysisError}</p>
            <p className="text-[11px] text-amber-700 font-medium">
              Need more time to prepare the sheet? You can skip this step now and import anytime from the Class page.
            </p>
          </div>
        </div>
      )}

      {/* State 2: Preview & Row-Level Validation Before Saving */}
      {previewData && (
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden space-y-0">
          <div className="px-3.5 py-2.5 bg-zinc-50 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-navy truncate max-w-[180px]" title={previewData.fileName}>
                {previewData.fileName}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                <CheckCircle2 size={11} /> {validRows.length} Valid
              </span>
              {errorRows.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                  <XCircle size={11} /> {errorRows.length} Skipped / Issues
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="text-[11px] font-bold text-zinc-600 hover:text-navy inline-flex items-center gap-1"
            >
              <RotateCcw size={11} /> Try Another File
            </button>
          </div>

          <div className="max-h-44 overflow-y-auto divide-y divide-zinc-100 text-xs">
            {errorRows.slice(0, 20).map((err, idx) => (
              <div key={`err-${idx}`} className="px-3.5 py-2 bg-red-50/40 flex items-center justify-between gap-3">
                <span className="font-mono font-bold text-red-700 shrink-0">Row {err.row}</span>
                <span className="text-red-800 font-medium truncate flex-1">{err.reason}</span>
              </div>
            ))}
            {validRows.slice(0, 15).map((row, idx) => (
              <div key={`val-${idx}`} className="px-3.5 py-2 flex items-center justify-between gap-3">
                <span className="font-mono font-bold text-navy shrink-0">
                  {row.rollNo || row.code || `Row ${idx + 1}`}
                </span>
                <span className="text-zinc-700 font-medium truncate flex-1">
                  {row.name || row.studentName || row.subjectCode || ''}
                  {row.facultyName ? ` · ${row.facultyName}` : ''}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 shrink-0">
                  Ready
                </span>
              </div>
            ))}
            {validRows.length > 15 && (
              <div className="px-3.5 py-2 text-center text-[11px] text-zinc-500 font-medium bg-zinc-50/50">
                +{validRows.length - 15} more valid rows ready to import
              </div>
            )}
          </div>

          <div className="px-3.5 py-2.5 bg-zinc-50 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-zinc-500 font-medium">
              {validRows.length > 0
                ? errorRows.length > 0
                  ? `${errorRows.length} invalid row(s) will be skipped.`
                  : 'All rows match template format.'
                : 'No valid rows detected. Please verify column headers or skip for now.'}
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="xs" onClick={handleReset} disabled={isCommitting}>
                Cancel
              </Button>
              {validRows.length > 0 && (
                <Button
                  type="button"
                  variant="primary"
                  size="xs"
                  loading={isCommitting}
                  onClick={handleConfirmCommit}
                >
                  Import {validRows.length} Row{validRows.length === 1 ? '' : 's'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WizardImportPanel;

