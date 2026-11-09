import React, { useState } from 'react';
import { previewElectives, commitElectives } from '../../api/import';
import FileDropzone from '../ui/FileDropzone';
import Button from '../ui/Button';
import { BookOpen, Upload, Download, CheckCircle2, Info, ArrowRight } from 'lucide-react';
import { toast } from 'react-hot-toast';

const Step5Electives = ({
  classId,
  targetClass,
  onSave,
  onBack,
  onDirtyChange,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [electivesSummary, setElectivesSummary] = useState(null);

  const semester = targetClass?.semester || 1;
  const isHigherSem = semester >= 5;

  const handleFileSelect = async (file) => {
    if (!file) return;
    setIsUploading(true);
    onDirtyChange?.(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // 1. Preview
      const previewRes = await previewElectives(formData);
      const validRows = previewRes?.data?.valid || previewRes?.valid || [];

      if (validRows.length === 0) {
        toast.error('No valid elective rows found.');
        setIsUploading(false);
        return;
      }

      // 2. Commit
      await commitElectives({ electives: validRows });
      setElectivesSummary({ count: validRows.length });
      toast.success(`Successfully mapped ${validRows.length} elective assignments.`);
      onDirtyChange?.(false);
    } catch (err) {
      toast.error(err?.message || 'Failed to import elective assignments.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleContinueWithElectives = () => {
    onSave({
      step: 'electives',
      summary: electivesSummary
        ? `${electivesSummary.count} elective assignments configured`
        : 'Elective assignments verified',
      data: { configured: true, count: electivesSummary?.count || 0 },
    });
  };

  const handleSkip = () => {
    onSave({
      step: 'electives',
      summary: 'Electives skipped (no electives for this semester)',
      data: { configured: false, skipped: true },
    });
  };

  return (
    <div className="space-y-6">
      {/* Information Banner */}
      <div className="p-4 rounded-xl border border-indigo-200/80 bg-indigo-50/50 flex items-start gap-3">
        <Info size={18} className="text-indigo-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-xs text-indigo-900 leading-relaxed">
          <p className="font-bold mb-1">
            Elective Subject Assignment (Optional / Conditional)
          </p>
          <p className="text-indigo-700">
            Professional & Open Electives are typically applicable for Semesters 5 through 8.
            {isHigherSem
              ? ` Target Semester ${semester} typically includes electives.`
              : ` Target Semester ${semester} is a lower semester where core curriculum normally applies.`}
            {' '}If your class does not have electives, simply click <strong>Skip Electives</strong> below.
          </p>
        </div>
      </div>

      {/* CSV Uploader */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-navy">
              Upload Electives Mapping File
            </h3>
            <p className="text-xs text-zinc-600">
              CSV/Excel with columns: Roll No, Subject Code, Faculty Employee ID.
            </p>
          </div>
          <a
            href="/api/import/template/electives"
            download="electives_template.csv"
            className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1 min-h-[44px] px-3 py-1 rounded-lg border border-indigo-200 bg-white"
          >
            <Download size={13} /> Elective Template
          </a>
        </div>

        <FileDropzone
          accept=".csv,.xlsx"
          label="Drop Elective Mapping CSV or Click to Browse"
          loading={isUploading}
          onFileSelect={handleFileSelect}
        />
      </div>

      {/* Success Badge if uploaded */}
      {electivesSummary && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs font-bold text-emerald-800">
          <CheckCircle2 size={16} className="text-emerald-600" />
          {electivesSummary.count} student elective assignments successfully mapped.
        </div>
      )}

      {/* Footer Navigation */}
      <div className="pt-6 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Button type="button" variant="secondary" onClick={onBack} className="w-full sm:w-auto min-h-[44px]">
          ← Back
        </Button>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <Button
            type="button"
            variant="ghost"
            onClick={handleSkip}
            className="w-full sm:w-auto min-h-[44px] text-xs font-bold text-zinc-600"
          >
            Skip / No Electives
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={handleContinueWithElectives}
            className="w-full sm:w-64 min-h-[44px]"
          >
            Continue to Pre-flight →
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Step5Electives;

