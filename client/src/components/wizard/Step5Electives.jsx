import React, { useState } from 'react';
import { previewElectives, commitElectives } from '../../api/import';
import { ROLES } from '../../utils/constants';
import { formatSectionDisplayName } from '../../utils/formatters';
import Button from '../ui/Button';
import WizardImportPanel from './WizardImportPanel';
import { CheckCircle2, Info, ArrowRight, BookOpen } from 'lucide-react';
import { toast } from 'react-hot-toast';

const ELECTIVE_COLUMNS = [
  { name: 'Roll No', required: true },
  { name: 'Subject Code', required: true },
  { name: 'Faculty Employee ID or Email', required: true },
];

const Step5Electives = ({
  targetClass,
  user,
  onSave,
  onBack,
  onDirtyChange,
}) => {
  const [electivesSummary, setElectivesSummary] = useState(null);
  const [showUploader, setShowUploader] = useState(false);

  const semester = targetClass?.semester || 1;
  const isHigherSem = semester >= 5;
  const isHod = user?.role === ROLES.HOD || user?.role === 'hod';
  const classTitle = formatSectionDisplayName(targetClass?.name, semester);
  const classLocationHint = isHod
    ? `Academic → Classes → ${classTitle} → Subjects Tab → Assign Electives`
    : `Departments → Classes → ${classTitle} → Subjects Tab → Assign Electives`;

  const handleCommitElectives = async (validRows) => {
    await commitElectives({ electives: validRows });
    setElectivesSummary({ count: validRows.length });
    toast.success(`Mapped ${validRows.length} student elective assignments.`);
  };

  const handleContinueWithElectives = () => {
    onSave({
      step: 'electives',
      summary: electivesSummary
        ? `${electivesSummary.count} elective assignments configured`
        : 'Elective assignments verified',
      data: { configured: true, count: electivesSummary?.count || 0, skipped: false },
    });
  };

  const handleSkip = () => {
    onDirtyChange?.(false);
    onSave({
      step: 'electives',
      summary: isHigherSem ? 'Skipped (can configure later from Class Details)' : 'Core curriculum (no electives needed)',
      data: { configured: false, skipped: isHigherSem },
    });
  };

  const shouldRenderUploader = isHigherSem || showUploader;

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column: Context & Where to Configure Later */}
          <div className={`${shouldRenderUploader ? 'lg:col-span-5' : 'lg:col-span-12'} space-y-3`}>
            <div className="p-4 rounded-2xl border border-indigo-200/80 bg-indigo-50/40 space-y-3">
              <div className="flex items-start gap-2.5">
                <Info size={16} className="text-indigo-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-xs text-indigo-950 leading-relaxed space-y-1">
                  <p className="font-bold">Elective Subject Mapping</p>
                  <p className="text-indigo-900/80">
                    {isHigherSem
                      ? `Semester ${semester} often includes open or professional electives. Upload an elective allocation sheet if ready, or skip and map them later.`
                      : `Semester ${semester} typically follows a core curriculum without student-specific electives. You can proceed straight to Review.`}
                  </p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-indigo-100 text-xs space-y-0.5">
                <p className="font-bold text-navy flex items-center gap-1.5">
                  <BookOpen size={13} className="text-indigo-600 shrink-0" />
                  <span>Where to manage electives anytime later:</span>
                </p>
                <p className="text-[11px] text-zinc-500 pl-5">{classLocationHint}</p>
              </div>
            </div>

            {!isHigherSem && !showUploader && (
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setShowUploader(true)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline"
                >
                  Have electives for this lower-semester section? Upload spreadsheet
                </button>
              </div>
            )}

            {electivesSummary && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs font-bold text-emerald-900">
                <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                <span>{electivesSummary.count} student elective assignments mapped.</span>
              </div>
            )}
          </div>

          {/* Right Column: Authenticated Importer + Validation Preview */}
          {shouldRenderUploader && (
            <div className="lg:col-span-7">
              <WizardImportPanel
                type="electives"
                title="Upload Elective Allocations"
                columns={ELECTIVE_COLUMNS}
                dropLabel="Drop Elective Mapping Spreadsheet (.xlsx, .xls, .csv)"
                onPreview={previewElectives}
                onCommit={handleCommitElectives}
                onDirtyChange={onDirtyChange}
              />
            </div>
          )}
        </div>
      </div>

      {/* Pinned Step Footer */}
      <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-100/85 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5">
        <Button type="button" variant="secondary" size="sm" onClick={onBack} className="w-full sm:w-auto !border-slate-300 !bg-white !text-slate-800 hover:!bg-slate-50">
          ← Back
        </Button>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {isHigherSem && !electivesSummary && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSkip}
              className="!text-slate-800 !border-slate-300 !bg-white hover:!bg-slate-50"
            >
              Skip / No Electives
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={electivesSummary ? handleContinueWithElectives : handleSkip}
            className="w-full sm:w-auto"
          >
            <span>Continue to Review</span>
            <ArrowRight size={13} />
          </Button>
        </div>
      </div>
    </>
  );
};

export default Step5Electives;
