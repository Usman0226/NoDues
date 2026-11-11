import React, { useState } from 'react';
import { previewElectives, commitElectives } from '../../api/import';
import { formatSectionDisplayName } from '../../utils/formatters';
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
  const [showUploader, setShowUploader] = useState(false);

  const semester = targetClass?.semester || 1;
  const isHigherSem = semester >= 5;
  const classTitle = formatSectionDisplayName(targetClass?.name, semester);

  const handleFileSelect = async (file) => {
    if (!file) return;
    setIsUploading(true);
    onDirtyChange?.(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const previewRes = await previewElectives(formData);
      const validRows = previewRes?.data?.valid || previewRes?.valid || [];

      if (validRows.length === 0) {
        toast.error('No valid elective rows found in the uploaded file.');
        setIsUploading(false);
        return;
      }

      await commitElectives({ electives: validRows });
      setElectivesSummary({ count: validRows.length });
      toast.success(`Mapped ${validRows.length} student elective assignments.`);
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
      summary: isHigherSem ? 'Electives skipped for this section' : 'Core curriculum (no electives needed)',
      data: { configured: false, skipped: true },
    });
  };

  return (
    <div className="space-y-4">
      {/* Information Banner */}
      <div className="p-4 rounded-xl border border-indigo-200/80 bg-indigo-50/50 flex items-start gap-3">
        <Info size={16} className="text-indigo-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-xs text-indigo-950 leading-relaxed">
          <p className="font-bold mb-0.5">
            Elective Subject Mapping
          </p>
          <p className="text-indigo-800">
            {isHigherSem ? (
              <>
                <strong>Semester {semester}</strong> typically includes professional or open electives.
                If this section has elective allocations, you can upload the mapping CSV below. Otherwise, click <strong>Skip / No Electives</strong> to proceed.
              </>
            ) : (
              <>
                <strong>Semester {semester}</strong> follows a standard core curriculum. Elective assignments are usually not required for junior semesters. You can proceed directly to the review step.
              </>
            )}
          </p>
        </div>
      </div>

      {/* CSV Uploader (default open for sem 5+, toggleable for sem 1-4) */}
      {(isHigherSem || showUploader) && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-navy">
                Upload Elective Assignments
              </h3>
              <p className="text-xs text-zinc-500">
                CSV or Excel file with columns: Roll No, Subject Code, Faculty Employee ID.
              </p>
            </div>
            <a
              href="/api/import/template/electives"
              download="electives_template.csv"
              className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-indigo-200 bg-white"
            >
              <Download size={12} /> CSV Template
            </a>
          </div>

          <FileDropzone
            accept=".csv,.xlsx"
            label="Drop Elective Mapping CSV or Click to Browse"
            loading={isUploading}
            onFileSelect={handleFileSelect}
          />
        </div>
      )}

      {/* Toggle button for lower semesters who might have special electives */}
      {!isHigherSem && !showUploader && (
        <div className="text-center py-2">
          <button
            type="button"
            onClick={() => setShowUploader(true)}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline"
          >
            Need to upload electives for this class? Click here
          </button>
        </div>
      )}

      {/* Success Badge */}
      {electivesSummary && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs font-bold text-emerald-900">
          <CheckCircle2 size={16} className="text-emerald-600" />
          {electivesSummary.count} student elective assignments successfully mapped.
        </div>
      )}

      {/* Footer Navigation */}
      <div className="pt-4 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <Button type="button" variant="secondary" onClick={onBack} className="w-full sm:w-auto min-h-[40px] px-5 text-xs font-bold">
          ← Back
        </Button>

        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
          {isHigherSem && !electivesSummary && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleSkip}
              className="w-full sm:w-auto min-h-[40px] text-xs font-bold text-zinc-600 hover:text-navy border border-zinc-200"
            >
              Skip / No Electives
            </Button>
          )}

          <Button
            type="button"
            variant="primary"
            onClick={electivesSummary ? handleContinueWithElectives : handleSkip}
            className="w-full sm:w-56 min-h-[42px]"
          >
            Continue to Review →
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Step5Electives;
