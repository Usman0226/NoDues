import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStudents, assignMentor, bulkAssignMentor } from '../../api/students';
import { getFaculty } from '../../api/faculty';
import { previewMentors, commitMentors } from '../../api/import';
import FileDropzone from '../ui/FileDropzone';
import Button from '../ui/Button';
import { StepTableSkeleton } from './WizardSkeleton';
import { Users, UserCheck, Upload, AlertCircle, CheckCircle2, RefreshCw, Download, Sparkles, Search } from 'lucide-react';
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
  const [isDistributing, setIsDistributing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [bulkMentorId, setBulkMentorId] = useState('');

  // Enrolled students
  const {
    data: studentsRes,
    isLoading: loadingStudents,
    isError: studentsError,
    refetch: refetchStudents,
  } = useQuery({
    queryKey: ['wizard', 'students-mentors', classId],
    queryFn: () => getStudents({ classId, limit: 150 }),
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

  // Filter students
  const filteredStudents = useMemo(() => {
    if (!searchQuery) return studentsList;
    const q = searchQuery.toLowerCase();
    return studentsList.filter(
      (s) =>
        s.rollNo?.toLowerCase().includes(q) ||
        s.name?.toLowerCase().includes(q)
    );
  }, [studentsList, searchQuery]);

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

  // Bulk assign selected students
  const handleBulkAssignSelected = async () => {
    if (!bulkMentorId) {
      toast.error('Please select a mentor.');
      return;
    }
    if (selectedStudentIds.length === 0) {
      toast.error('Please select at least one student.');
      return;
    }

    try {
      await bulkAssignMentor(selectedStudentIds, bulkMentorId);
      toast.success(`Assigned mentor to ${selectedStudentIds.length} student(s).`);
      setSelectedStudentIds([]);
      setBulkMentorId('');
      refetchStudents();
    } catch (err) {
      toast.error(err?.message || 'Failed to assign mentors in bulk.');
    }
  };

  // Auto-distribute unassigned students evenly across active faculty
  const handleAutoDistribute = async () => {
    const unassignedStudents = studentsList.filter((s) => !s.mentorId && !s.mentor);
    if (unassignedStudents.length === 0) {
      toast.error('All students already have mentors assigned.');
      return;
    }
    if (facultyList.length === 0) {
      toast.error('No faculty members available in this department.');
      return;
    }

    setIsDistributing(true);
    try {
      const facultyCount = facultyList.length;
      const promises = [];

      for (let i = 0; i < facultyCount; i++) {
        const mentor = facultyList[i];
        const studentChunk = unassignedStudents
          .filter((_, idx) => idx % facultyCount === i)
          .map((s) => s._id);

        if (studentChunk.length > 0) {
          promises.push(bulkAssignMentor(studentChunk, mentor._id));
        }
      }

      await Promise.all(promises);
      toast.success(
        `Evenly distributed ${unassignedStudents.length} students across ${facultyCount} mentors.`
      );
      refetchStudents();
    } catch (err) {
      toast.error(err?.message || 'Failed to distribute mentors.');
    } finally {
      setIsDistributing(false);
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

      const previewRes = await previewMentors(formData);
      const validRows = previewRes?.data?.valid || previewRes?.valid || [];

      if (validRows.length === 0) {
        toast.error('No valid mentor mapping rows found.');
        setIsUploading(false);
        return;
      }

      await commitMentors({ mentors: validRows });
      toast.success(`Mapped mentors for ${validRows.length} students.`);
      onDirtyChange?.(false);
      setShowUploader(false);
      refetchStudents();
    } catch (err) {
      toast.error(err?.message || 'Failed to import mentor mappings.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleToggleSelectAllUnassigned = () => {
    const unassignedIds = filteredStudents
      .filter((s) => !s.mentorId && !s.mentor)
      .map((s) => s._id);

    if (selectedStudentIds.length === unassignedIds.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(unassignedIds);
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
      <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-center space-y-2.5" role="alert">
        <AlertCircle size={24} className="mx-auto text-red-600" aria-hidden="true" />
        <h3 className="text-xs font-bold text-red-900">Failed to load mentor status</h3>
        <Button type="button" variant="secondary" size="sm" onClick={() => refetchStudents()}>
          <RefreshCw size={12} className="mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Total Enrolled</span>
          <p className="text-lg font-black text-navy">{totalStudents}</p>
        </div>
        <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/80">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Mentors Assigned</span>
          <p className="text-lg font-black text-emerald-900">{assignedCount}</p>
        </div>
        <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-900">Unassigned</span>
          <p className="text-lg font-black text-amber-950">{unassignedCount}</p>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-navy">
            Mentor Allocation Tools
          </h3>
          <p className="text-xs text-zinc-500">
            Assign mentors individually, use auto-distribution across faculty, or upload a CSV mapping.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {unassignedCount > 0 && facultyList.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={isDistributing}
              onClick={handleAutoDistribute}
              className="text-xs font-bold min-h-[36px] border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            >
              <Sparkles size={12} className="mr-1 text-indigo-600" />
              Auto-Distribute ({unassignedCount})
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowUploader((prev) => !prev)}
            className="text-xs font-bold min-h-[36px] text-zinc-600 hover:text-navy border border-zinc-200"
          >
            <Upload size={12} className="mr-1" />
            {showUploader ? 'Close CSV' : 'CSV Upload'}
          </Button>
        </div>
      </div>

      {/* CSV Uploader */}
      {showUploader && (
        <div className="p-4 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/20 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-navy">Upload Mentor Mapping CSV</span>
              <p className="text-[11px] text-zinc-500">Columns: Roll No, Faculty Employee ID or Email.</p>
            </div>
            <a
              href="/api/import/template/mentors"
              download="mentor_template.csv"
              className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-indigo-200 bg-white"
            >
              <Download size={11} /> Template
            </a>
          </div>
          <FileDropzone
            accept=".csv,.xlsx"
            label="Drop Mentor Mapping CSV"
            loading={isUploading}
            onFileSelect={handleFileSelect}
          />
        </div>
      )}

      {/* Bulk Assignment Bar (when students are selected) */}
      {selectedStudentIds.length > 0 && (
        <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <span className="font-bold text-indigo-950">
            {selectedStudentIds.length} student(s) selected
          </span>
          <div className="flex items-center gap-2">
            <select
              value={bulkMentorId}
              onChange={(e) => setBulkMentorId(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-xs font-semibold text-navy min-h-[34px]"
            >
              <option value="">-- Choose Mentor to Assign --</option>
              {facultyList.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleBulkAssignSelected}
              className="min-h-[34px] px-3 text-xs"
            >
              Assign to Selected
            </Button>
            <button
              type="button"
              onClick={() => setSelectedStudentIds([])}
              className="text-xs text-zinc-500 hover:text-navy underline ml-1"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Student Mentor Mapping Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleSelectAllUnassigned}
              className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 underline"
            >
              {selectedStudentIds.length > 0 ? 'Deselect All' : 'Select All Unassigned'}
            </button>
          </div>

          <div className="relative max-w-xs w-full">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Filter students..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-3 py-1 text-xs bg-white border border-zinc-200 rounded-lg text-navy placeholder:text-zinc-400 min-h-[32px]"
            />
          </div>
        </div>

        <div 
          tabIndex={0}
          role="region"
          aria-label="Student mentor mapping table"
          className="border border-zinc-200 rounded-xl overflow-hidden bg-white max-h-64 overflow-y-auto"
        >
          <table className="w-full text-left text-xs" aria-label="Student Mentor List">
            <thead className="bg-zinc-50 border-b border-zinc-200 font-bold text-zinc-500 uppercase tracking-wider text-[11px] sticky top-0">
              <tr>
                <th className="py-2 px-3 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all displayed students"
                    checked={
                      filteredStudents.length > 0 &&
                      selectedStudentIds.length === filteredStudents.length
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedStudentIds(filteredStudents.map((s) => s._id));
                      } else {
                        setSelectedStudentIds([]);
                      }
                    }}
                    className="rounded border-zinc-300 text-indigo-600 focus:ring-navy"
                  />
                </th>
                <th className="py-2 px-3">Student</th>
                <th className="py-2 px-3">Current Mentor</th>
                <th className="py-2 px-3 text-right">Assign Mentor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredStudents.map((s) => {
                const currentMentorName = s.mentorId?.name || s.mentor?.name || null;
                const isChecked = selectedStudentIds.includes(s._id);
                return (
                  <tr key={s._id} className={isChecked ? 'bg-indigo-50/40' : 'hover:bg-zinc-50/60'}>
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.name}`}
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStudentIds((prev) => [...prev, s._id]);
                          } else {
                            setSelectedStudentIds((prev) => prev.filter((id) => id !== s._id));
                          }
                        }}
                        className="rounded border-zinc-300 text-indigo-600 focus:ring-navy"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <span className="font-mono font-bold text-navy">{s.rollNo}</span>
                      <span className="text-zinc-600 ml-2 font-medium">({s.name})</span>
                    </td>
                    <td className="py-2 px-3">
                      {currentMentorName ? (
                        <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
                          <CheckCircle2 size={11} className="text-emerald-600" /> {currentMentorName}
                        </span>
                      ) : (
                        <span className="text-zinc-400 italic">None assigned</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <select
                        aria-label={`Assign mentor for ${s.name}`}
                        value={s.mentorId?._id || s.mentorId || ''}
                        onChange={(e) => handleAssignSingle(s._id, e.target.value)}
                        className="px-2 py-1 text-xs border border-zinc-300 rounded-lg text-navy bg-white focus:outline-none focus:ring-1 focus:ring-navy min-h-[30px] max-w-[180px]"
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
      </div>

      {/* Footer Navigation */}
      <div className="pt-4 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <Button type="button" variant="secondary" onClick={onBack} className="w-full sm:w-auto min-h-[40px] px-5 text-xs font-bold">
          ← Back
        </Button>

        <Button
          type="button"
          variant="primary"
          onClick={handleContinue}
          className="w-full sm:w-56 min-h-[42px]"
        >
          Continue to Electives →
        </Button>
      </div>
    </div>
  );
};

export default Step4Mentors;
