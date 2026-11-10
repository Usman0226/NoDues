import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStudents, assignMentor } from '../../api/students';
import { getFaculty } from '../../api/faculty';
import { previewMentors, commitMentors } from '../../api/import';
import FileDropzone from '../ui/FileDropzone';
import Button from '../ui/Button';
import { StepTableSkeleton } from './WizardSkeleton';
import { Users, UserCheck, Upload, AlertCircle, CheckCircle2, RefreshCw, Download } from 'lucide-react';
import { toast } from 'react-hot-toast';

const Step4Mentors = ({
  classId,
  targetClass,
  onSave,
  onBack,
  onDirtyChange,
}) => {
  const departmentId = targetClass?.departmentId?._id || targetClass?.departmentId;
  const [showUploader, setShowUploader] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Enrolled students
  const {
    data: studentsRes,
    isLoading: loadingStudents,
    isError: studentsError,
    refetch: refetchStudents,
  } = useQuery({
    queryKey: ['wizard', 'students-mentors', classId],
    queryFn: () => getStudents({ classId, limit: 100 }),
    enabled: Boolean(classId),
  });
  const studentsList = studentsRes?.data || studentsRes?.students || [];

  // Faculty options
  const { data: facultyRes } = useQuery({
    queryKey: ['wizard', 'faculty-mentors', departmentId || 'all'],
    queryFn: () => getFaculty(departmentId ? { departmentId, limit: 100 } : { limit: 100 }),
    enabled: true,
  });
  const facultyList = facultyRes?.data || facultyRes?.faculty || [];

  // Stats
  const totalStudents = studentsList.length;
  const assignedCount = studentsList.filter((s) => s.mentorId || s.mentor).length;
  const unassignedCount = totalStudents - assignedCount;

  // Single mentor assign
  const handleAssignSingle = async (studentId, mentorId) => {
    try {
      await assignMentor(studentId, mentorId);
      toast.success('Mentor assigned.');
      refetchStudents();
    } catch (err) {
      toast.error(err?.message || 'Failed to assign mentor.');
    }
  };

  // Bulk CSV upload
  const handleFileSelect = async (file) => {
    if (!file) return;
    setIsUploading(true);
    onDirtyChange?.(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // 1. Preview
      const previewRes = await previewMentors(formData);
      const validRows = previewRes?.data?.valid || previewRes?.valid || [];

      if (validRows.length === 0) {
        toast.error('No valid mentor mapping rows found.');
        setIsUploading(false);
        return;
      }

      // 2. Commit
      await commitMentors({ mentors: validRows });
      toast.success(`Successfully mapped mentors for ${validRows.length} students.`);
      onDirtyChange?.(false);
      setShowUploader(false);
      refetchStudents();
    } catch (err) {
      toast.error(err?.message || 'Failed to import mentor mappings.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleContinue = () => {
    onSave({
      step: 'mentors',
      summary: `${assignedCount}/${totalStudents} students assigned mentors`,
      data: { assignedCount, totalStudents },
    });
  };

  if (loadingStudents) {
    return <StepTableSkeleton rows={4} />;
  }

  if (studentsError) {
    return (
      <div className="p-6 rounded-2xl border border-red-200 bg-red-50 text-center space-y-3" role="alert">
        <AlertCircle size={32} className="mx-auto text-red-600" aria-hidden="true" />
        <h3 className="text-base font-bold text-red-900">Failed to load mentor status</h3>
        <Button type="button" variant="secondary" size="sm" onClick={() => refetchStudents()}>
          <RefreshCw size={14} className="mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Total Students</span>
          <p className="text-xl font-black text-navy">{totalStudents}</p>
        </div>
        <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Mentors Assigned</span>
          <p className="text-xl font-black text-emerald-800">{assignedCount}</p>
        </div>
        <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Unassigned</span>
          <p className="text-xl font-black text-amber-800">{unassignedCount}</p>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-navy">
            Mentor Assignment Options
          </h3>
          <p className="text-xs text-zinc-600">
            Upload a CSV mapping (Roll No | Faculty Employee ID) or assign faculty individually.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShowUploader((prev) => !prev)}
          className="text-xs font-bold min-h-[44px]"
        >
          <Upload size={14} className="mr-1.5" />
          {showUploader ? 'Close Uploader' : 'Bulk Import Mentors'}
        </Button>
      </div>

      {/* Uploader Box */}
      {showUploader && (
        <div className="p-5 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/20 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-navy">Bulk Mentor CSV Upload</span>
            <a
              href="/api/import/template/mentors"
              download="mentor_template.csv"
              className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1"
            >
              <Download size={12} /> Template
            </a>
          </div>
          <FileDropzone
            accept=".csv,.xlsx"
            label="Drop Mentor Mapping CSV (Roll No, Faculty Employee ID)"
            loading={isUploading}
            onFileSelect={handleFileSelect}
          />
        </div>
      )}

      {/* Student Mentor Mapping Preview Table */}
      <div 
        tabIndex={0}
        role="region"
        aria-label="Student mentor mapping table scrollable region"
        className="border border-zinc-200 rounded-xl overflow-hidden bg-white max-h-72 overflow-y-auto focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      >
        <table className="w-full text-left text-xs" aria-label="Student Mentor List">
          <thead className="bg-zinc-50 border-b border-zinc-200 font-black text-zinc-600 uppercase tracking-wider sticky top-0">
            <tr>
              <th className="py-2.5 px-4">Student</th>
              <th className="py-2.5 px-4">Current Mentor</th>
              <th className="py-2.5 px-4 text-right">Assign Mentor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {studentsList.slice(0, 30).map((s) => {
              const currentMentorName = s.mentorId?.name || s.mentor?.name || null;
              return (
                <tr key={s._id} className="hover:bg-zinc-50/60">
                  <td className="py-2.5 px-4">
                    <span className="font-mono font-bold text-navy">{s.rollNo}</span>
                    <span className="text-zinc-600 ml-2 font-medium">({s.name})</span>
                  </td>
                  <td className="py-2.5 px-4">
                    {currentMentorName ? (
                      <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
                        <CheckCircle2 size={12} className="text-emerald-600" /> {currentMentorName}
                      </span>
                    ) : (
                      <span className="text-zinc-400 italic">None assigned</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <select
                      aria-label={`Assign mentor for ${s.name}`}
                      value={s.mentorId?._id || s.mentorId || ''}
                      onChange={(e) => handleAssignSingle(s._id, e.target.value)}
                      className="px-2.5 py-1 text-xs border border-zinc-200 rounded-lg text-zinc-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 min-h-[36px]"
                    >
                      <option value="">-- Choose Mentor --</option>
                      {facultyList.map((f) => (
                        <option key={f._id} value={f._id}>{f.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Navigation */}
      <div className="pt-6 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Button type="button" variant="secondary" onClick={onBack} className="w-full sm:w-auto min-h-[44px]">
          ← Back
        </Button>

        <Button
          type="button"
          variant="primary"
          onClick={handleContinue}
          className="w-full sm:w-60 min-h-[44px]"
        >
          Continue to Electives →
        </Button>
      </div>
    </div>
  );
};

export default Step4Mentors;

