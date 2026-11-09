import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStudents } from '../../api/students';
import { previewStudents, commitStudents } from '../../api/import';
import FileDropzone from '../ui/FileDropzone';
import Button from '../ui/Button';
import { StepTableSkeleton } from './WizardSkeleton';
import { Users, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, Download, RefreshCw, AlertCircle } from 'lucide-react';
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
    queryFn: () => getStudents({ classId, limit: 100 }),
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

      // 1. Preview
      const previewRes = await previewStudents(formData);
      const validRows = previewRes?.data?.valid || previewRes?.valid || [];

      if (validRows.length === 0) {
        toast.error('No valid student rows found in the uploaded file.');
        setIsUploading(false);
        return;
      }

      // 2. Commit
      await commitStudents({
        students: validRows,
        classId,
      });

      toast.success(`Successfully imported ${validRows.length} students into ${targetClass?.name}.`);
      onDirtyChange?.(false);
      setShowUploader(false);
      refetch();
    } catch (err) {
      toast.error(err?.message || 'Failed to import student roster.');
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
      summary: `${enrolledCount} students enrolled in ${targetClass?.name || 'Class'}`,
      data: { count: enrolledCount },
    });
  };

  if (isLoading) {
    return <StepTableSkeleton rows={5} />;
  }

  if (isError) {
    return (
      <div className="p-6 rounded-2xl border border-red-200 bg-red-50 text-center space-y-3" role="alert">
        <AlertCircle size={32} className="mx-auto text-red-600" aria-hidden="true" />
        <h3 className="text-base font-bold text-red-900">Failed to load student roster</h3>
        <p className="text-xs text-red-700">Check connection and retry.</p>
        <Button type="button" variant="secondary" size="sm" onClick={() => refetch()}>
          <RefreshCw size={14} className="mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Roster Status Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-50 border border-zinc-200">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold shrink-0">
            <Users size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-navy">
                {enrolledCount} Students Enrolled
              </span>
              {enrolledCount > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 size={12} /> Active Roster
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                  <AlertTriangle size={12} /> Empty Roster
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-600 mt-0.5">
              Target Section: <strong className="text-zinc-700">{targetClass?.name}</strong> (Semester {targetClass?.semester || 1})
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShowUploader((prev) => !prev)}
          className="text-xs font-bold min-h-[44px]"
        >
          <Upload size={14} className="mr-1.5" />
          {showUploader ? 'Cancel Upload' : 'Import New Roster'}
        </Button>
      </div>

      {/* CSV Uploader (Expandable or Default when empty) */}
      {(showUploader || enrolledCount === 0) && (
        <div className="p-5 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/20 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-navy">Upload Student Roster</h3>
              <p className="text-xs text-zinc-600">Supported formats: CSV or Excel (.xlsx). Required columns: Roll No, Name, Email.</p>
            </div>
            <a
              href="/api/import/template/students"
              download="student_template.csv"
              className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 min-h-[44px] px-3 py-1.5 rounded-lg border border-indigo-200 bg-white"
            >
              <Download size={13} /> Sample CSV Template
            </a>
          </div>

          <FileDropzone
            accept=".csv,.xlsx"
            label="Drop Student Roster CSV or Click to Browse"
            loading={isUploading}
            onFileSelect={handleFileSelect}
          />
        </div>
      )}

      {/* Enrolled Students Table Preview */}
      {enrolledCount > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-navy">
              Enrolled Students ({filteredStudents.length} displayed)
            </h3>
            <input
              type="text"
              placeholder="Search by Roll No or Name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-navy placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 max-w-xs"
            />
          </div>

          <div 
            tabIndex={0} 
            role="region" 
            aria-label="Enrolled students table scrollable region"
            className="border border-zinc-200 rounded-xl overflow-hidden bg-white max-h-72 overflow-y-auto focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <table className="w-full text-left text-xs" aria-label="Student Roster">
              <thead className="bg-zinc-50 border-b border-zinc-200 font-black text-zinc-600 uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="py-2.5 px-4">Roll No</th>
                  <th className="py-2.5 px-4">Name</th>
                  <th className="py-2.5 px-4">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredStudents.slice(0, 50).map((s) => (
                  <tr key={s._id} className="hover:bg-zinc-50/60">
                    <td className="py-2.5 px-4 font-mono font-bold text-navy">{s.rollNo}</td>
                    <td className="py-2.5 px-4 font-semibold text-zinc-800">{s.name}</td>
                    <td className="py-2.5 px-4 text-zinc-600">{s.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer Navigation */}
      <div className="pt-6 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Button type="button" variant="secondary" onClick={onBack} className="w-full sm:w-auto min-h-[44px]">
          ← Back
        </Button>

        <div className="flex items-center gap-3 w-full sm:w-auto">
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
            className="w-full sm:w-60 min-h-[44px]"
          >
            Continue to Mentors →
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Step3Students;

