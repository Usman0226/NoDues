import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStudents } from '../../api/students';
import { previewStudents, commitStudents } from '../../api/import';
import { formatSectionDisplayName } from '../../utils/formatters';
import FileDropzone from '../ui/FileDropzone';
import Button from '../ui/Button';
import { StepTableSkeleton } from './WizardSkeleton';
import { Users, Upload, CheckCircle2, AlertTriangle, Download, RefreshCw, AlertCircle, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';

const Step3Students = ({
  classId,
  targetClass,
  onSave,
  onBack,
  onDirtyChange,
}) => {
  const [showUploader, setShowUploader] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch enrolled students for this class
  const {
    data: studentsRes,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['wizard', 'students', classId],
    queryFn: () => getStudents({ classId, limit: 150 }),
    enabled: Boolean(classId),
  });

  const studentsList = studentsRes?.data || studentsRes?.students || [];
  const enrolledCount = studentsList.length;

  // Filter students for preview
  const filteredStudents = studentsList.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.rollNo?.toLowerCase().includes(q) ||
      s.name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    );
  });

  // Handle CSV/Excel File Upload
  const handleFileSelect = async (file) => {
    if (!file) return;
    setIsUploading(true);
    onDirtyChange?.(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const previewRes = await previewStudents(formData);
      const validRows = previewRes?.data?.valid || previewRes?.valid || [];

      if (validRows.length === 0) {
        toast.error('No valid student rows found in the uploaded file.');
        setIsUploading(false);
        return;
      }

      await commitStudents({
        students: validRows,
        classId,
      });

      toast.success(`Imported ${validRows.length} students into ${targetClass?.name}.`);
      onDirtyChange?.(false);
      setShowUploader(false);
      refetch();
    } catch (err) {
      toast.error(err?.message || 'Failed to import students.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleContinue = () => {
    if (enrolledCount === 0) {
      toast.error('Please import at least one student before continuing.');
      return;
    }
    onSave({
      step: 'students',
      summary: `${enrolledCount} students enrolled in ${formatSectionDisplayName(targetClass?.name, targetClass?.semester)}`,
      data: { count: enrolledCount },
    });
  };

  if (isLoading) {
    return <StepTableSkeleton rows={4} />;
  }

  if (isError) {
    return (
      <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-center space-y-2.5" role="alert">
        <AlertCircle size={24} className="mx-auto text-red-600" aria-hidden="true" />
        <h3 className="text-xs font-bold text-red-900">Failed to load enrolled students</h3>
        <p className="text-xs text-red-700">Please check your connection and retry.</p>
        <Button type="button" variant="secondary" size="sm" onClick={() => refetch()}>
          <RefreshCw size={12} className="mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  const classTitle = formatSectionDisplayName(targetClass?.name, targetClass?.semester);

  return (
    <div className="space-y-4">
      {/* Students Status Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-zinc-50 border border-zinc-200/90">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold shrink-0">
            <Users size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-navy">
                {enrolledCount} Students Enrolled
              </span>
              {enrolledCount > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  <CheckCircle2 size={11} /> Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                  <AlertTriangle size={11} /> None Enrolled
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Target Section: <strong className="text-navy">{classTitle}</strong> (Semester {targetClass?.semester || 1})
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShowUploader((prev) => !prev)}
          className="text-xs font-bold min-h-[38px] self-start sm:self-auto"
        >
          <Upload size={12} className="mr-1.5" />
          {showUploader ? 'Close Upload' : 'Upload Students CSV'}
        </Button>
      </div>

      {/* CSV Uploader */}
      {(showUploader || enrolledCount === 0) && (
        <div className="p-4 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/20 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-navy">Upload Student Roster</h3>
              <p className="text-xs text-zinc-500">CSV or Excel file with columns: Roll No, Name, Email.</p>
            </div>
            <a
              href="/api/import/template/students"
              download="student_template.csv"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 px-2.5 py-1 rounded-lg border border-indigo-200 bg-white"
            >
              <Download size={12} /> CSV Template
            </a>
          </div>

          <FileDropzone
            accept=".csv,.xlsx"
            label="Drop Students CSV or Click to Browse"
            loading={isUploading}
            onFileSelect={handleFileSelect}
          />
        </div>
      )}

      {/* Enrolled Students Table Preview */}
      {enrolledCount > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-navy">
              Enrolled Students ({filteredStudents.length} of {enrolledCount})
            </h3>
            <div className="relative max-w-xs w-full">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search roll no or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-navy placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-navy min-h-[34px]"
              />
            </div>
          </div>

          <div 
            tabIndex={0} 
            role="region" 
            aria-label="Enrolled students table scrollable region"
            className="border border-zinc-200 rounded-xl overflow-hidden bg-white max-h-64 overflow-y-auto"
          >
            <table className="w-full text-left text-xs" aria-label="Students List">
              <thead className="bg-zinc-50 border-b border-zinc-200 font-bold text-zinc-500 uppercase tracking-wider text-[11px] sticky top-0">
                <tr>
                  <th className="py-2 px-3">Roll No</th>
                  <th className="py-2 px-3">Name</th>
                  <th className="py-2 px-3">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredStudents.map((s) => (
                  <tr key={s._id} className="hover:bg-zinc-50/60">
                    <td className="py-2 px-3 font-mono font-bold text-navy">{s.rollNo}</td>
                    <td className="py-2 px-3 font-semibold text-zinc-800">{s.name}</td>
                    <td className="py-2 px-3 text-zinc-500">{s.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer Navigation */}
      <div className="pt-4 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <Button type="button" variant="secondary" onClick={onBack} className="w-full sm:w-auto min-h-[40px] px-5 text-xs font-bold">
          ← Back
        </Button>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {enrolledCount === 0 && (
            <span className="text-xs text-amber-700 font-semibold" role="alert">
              At least 1 student is required to continue.
            </span>
          )}
          <Button
            type="button"
            variant="primary"
            disabled={enrolledCount === 0}
            onClick={handleContinue}
            className="w-full sm:w-56 min-h-[42px]"
          >
            Continue to Mentors →
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Step3Students;
