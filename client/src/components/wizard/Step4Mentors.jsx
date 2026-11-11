import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStudents, assignMentor, bulkAssignMentor } from '../../api/students';
import { getFaculty } from '../../api/faculty';
import { previewMentors, commitMentors } from '../../api/import';
import { ROLES } from '../../utils/constants';
import { formatSectionDisplayName } from '../../utils/formatters';
import Button from '../ui/Button';
import { StepTableSkeleton } from './WizardSkeleton';
import WizardImportPanel from './WizardImportPanel';
import {
  UserCheck,
  Upload,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Search,
  ArrowRight,
  Info,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const MENTOR_COLUMNS = [
  { name: 'Roll No', required: true },
  { name: 'Faculty Employee ID or Email', required: true },
];

const Step4Mentors = ({
  classId,
  targetClass,
  user,
  onSave,
  onBack,
  onDirtyChange,
}) => {
  const departmentId = targetClass?.departmentId?._id || targetClass?.departmentId;
  const [showUploader, setShowUploader] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [bulkMentorId, setBulkMentorId] = useState('');

  const isHod = user?.role === ROLES.HOD || user?.role === 'hod';
  const classTitle = formatSectionDisplayName(targetClass?.name, targetClass?.semester);
  const classLocationHint = isHod
    ? `Academic → Classes → ${classTitle} → Students Tab → Bulk Assign Mentors`
    : `Departments → Classes → ${classTitle} → Students Tab → Bulk Assign Mentors`;

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
  const studentsList = useMemo(
    () => studentsRes?.data || studentsRes?.students || [],
    [studentsRes]
  );

  const { data: facultyRes } = useQuery({
    queryKey: ['wizard', 'faculty-mentors', departmentId || 'all'],
    queryFn: () => getFaculty(departmentId ? { departmentId, limit: 100 } : { limit: 100 }),
    enabled: true,
  });
  const facultyList = facultyRes?.data || facultyRes?.faculty || [];

  const totalStudents = studentsList.length;
  const assignedCount = studentsList.filter((s) => s.mentorId || s.mentor).length;
  const unassignedCount = totalStudents - assignedCount;

  const filteredStudents = useMemo(() => {
    if (!searchQuery) return studentsList;
    const q = searchQuery.toLowerCase();
    return studentsList.filter(
      (s) =>
        s.rollNo?.toLowerCase().includes(q) ||
        s.name?.toLowerCase().includes(q)
    );
  }, [studentsList, searchQuery]);

  const handleAssignSingle = async (studentId, mentorId) => {
    try {
      await assignMentor(studentId, mentorId);
      toast.success('Mentor assigned.');
      refetchStudents();
    } catch (err) {
      toast.error(err?.message || 'Failed to assign mentor.');
    }
  };

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
      toast.success(`Evenly distributed ${unassignedStudents.length} students across ${facultyCount} mentors.`);
      refetchStudents();
    } catch (err) {
      toast.error(err?.message || 'Failed to distribute mentors.');
    } finally {
      setIsDistributing(false);
    }
  };

  const handleCommitMentors = async (validRows) => {
    await commitMentors({ mentors: validRows });
    toast.success(`Mapped mentors for ${validRows.length} student(s).`);
    setShowUploader(false);
    refetchStudents();
  };

  const handleToggleSelectAllUnassigned = () => {
    const unassignedIds = filteredStudents
      .filter((s) => !s.mentorId && !s.mentor)
      .map((s) => s._id);

    if (selectedStudentIds.length === unassignedIds.length && unassignedIds.length > 0) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(unassignedIds);
    }
  };

  const handleContinue = ({ skipped = false } = {}) => {
    onSave({
      step: 'mentors',
      summary:
        totalStudents === 0
          ? 'Skipped (no students enrolled yet)'
          : skipped
            ? `Deferred (${assignedCount}/${totalStudents} assigned)`
            : `${assignedCount}/${totalStudents} students assigned mentors`,
      data: { assignedCount, totalStudents, skipped },
    });
  };

  if (loadingStudents) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <StepTableSkeleton rows={5} />
      </div>
    );
  }

  if (studentsError) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-6">
        <div className="max-w-md w-full p-5 rounded-2xl border border-red-200 bg-red-50 text-center space-y-3" role="alert">
          <AlertCircle size={24} className="mx-auto text-red-600" aria-hidden="true" />
          <h3 className="text-sm font-bold text-red-900">Failed to load mentor status</h3>
          <Button type="button" variant="secondary" size="sm" onClick={() => refetchStudents()}>
            <RefreshCw size={12} /> Retry
          </Button>
        </div>
      </div>
    );
  }

  // Empty state when Step 2 (Students) was skipped
  if (totalStudents === 0) {
    return (
      <>
        <div className="flex-1 min-h-0 flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-2xl border border-indigo-200/80 bg-indigo-50/40 p-6 text-center space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-white border border-indigo-200 text-indigo-600 mx-auto flex items-center justify-center shadow-xs">
              <UserCheck size={20} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-navy">
                Mentor Allocation Deferred
              </h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                No students are enrolled in <strong>{classTitle}</strong> yet because student import was skipped in Step 2.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-indigo-100 text-left text-xs text-zinc-600 space-y-1">
              <p className="font-bold text-navy flex items-center gap-1.5">
                <Info size={13} className="text-indigo-600 shrink-0" />
                <span>Where to assign mentors once students are added:</span>
              </p>
              <p className="text-[11px] text-zinc-500 pl-5">{classLocationHint}</p>
            </div>
          </div>
        </div>

        <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-zinc-100 bg-zinc-50/60 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5">
          <Button type="button" variant="secondary" size="sm" onClick={onBack} className="w-full sm:w-auto">
            ← Back
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => handleContinue({ skipped: true })}
            className="w-full sm:w-auto"
          >
            <span>Skip Mentors & Continue</span>
            <ArrowRight size={13} />
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3.5">
        {/* Compact Stats & Action Strip */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="grid grid-cols-3 gap-2.5">
            <div className="px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200/80">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block">Enrolled</span>
              <span className="text-base font-black text-navy">{totalStudents}</span>
            </div>
            <div className="px-3 py-2 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">Assigned</span>
              <span className="text-base font-black text-emerald-900">{assignedCount}</span>
            </div>
            <div className="px-3 py-2 rounded-xl bg-amber-50/70 border border-amber-200/80">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 block">Unassigned</span>
              <span className="text-base font-black text-amber-950">{unassignedCount}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {unassignedCount > 0 && facultyList.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={isDistributing}
                onClick={handleAutoDistribute}
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              >
                <Sparkles size={12} className="text-indigo-600" />
                <span>Auto-Distribute ({unassignedCount})</span>
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowUploader((prev) => !prev)}
              className="text-zinc-600 hover:text-navy border border-zinc-200 bg-white"
            >
              <Upload size={12} />
              <span>{showUploader ? 'Hide CSV/Excel' : 'CSV/Excel Upload'}</span>
            </Button>
          </div>
        </div>

        {/* CSV/Excel Uploader with Preview */}
        {showUploader && (
          <WizardImportPanel
            type="mentors"
            title="Import Mentor Mapping (Excel / CSV)"
            columns={MENTOR_COLUMNS}
            dropLabel="Drop Mentor Mapping File"
            onPreview={previewMentors}
            onCommit={handleCommitMentors}
            onDirtyChange={onDirtyChange}
          />
        )}

        {/* Bulk Assignment Action Bar */}
        {selectedStudentIds.length > 0 && (
          <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <span className="font-bold text-indigo-950 pl-1">
              {selectedStudentIds.length} student(s) selected
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={bulkMentorId}
                onChange={(e) => setBulkMentorId(e.target.value)}
                className="h-9 px-3 rounded-xl border border-indigo-300 bg-white text-xs font-semibold text-navy"
              >
                <option value="">-- Choose Mentor --</option>
                {facultyList.map((f) => (
                  <option key={f._id} value={f._id}>{f.name}</option>
                ))}
              </select>
              <Button type="button" variant="primary" size="sm" onClick={handleBulkAssignSelected}>
                Assign Selected
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedStudentIds([])}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Search & Bulk Toggle Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleToggleSelectAllUnassigned}
            className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 underline self-start sm:self-auto"
          >
            {selectedStudentIds.length > 0 ? 'Deselect All' : 'Select All Unassigned'}
          </button>

          <div className="relative w-full sm:w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Filter students..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-8 pr-3 text-xs bg-white border border-zinc-200 rounded-xl text-navy placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-navy/10"
            />
          </div>
        </div>

        {/* Mapping Table */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Student mentor mapping table"
          className="border border-zinc-200 rounded-xl overflow-hidden bg-white max-h-[240px] overflow-y-auto"
        >
          <table className="w-full text-left text-xs" aria-label="Student Mentor List">
            <thead className="bg-zinc-50 border-b border-zinc-200 font-bold text-zinc-500 uppercase tracking-wider text-[10px] sticky top-0">
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
                        className="h-8 px-2.5 text-xs border border-zinc-300 rounded-lg text-navy bg-white focus:outline-none focus:ring-1 focus:ring-navy max-w-[180px]"
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

      {/* Pinned Step Footer */}
      <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-zinc-100 bg-zinc-50/60 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5">
        <Button type="button" variant="secondary" size="sm" onClick={onBack} className="w-full sm:w-auto">
          ← Back
        </Button>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {unassignedCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleContinue({ skipped: true })}
              className="text-zinc-600 hover:text-navy border border-zinc-200 bg-white"
            >
              Skip Remaining
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => handleContinue({ skipped: false })}
          >
            <span>Continue to Electives</span>
            <ArrowRight size={13} />
          </Button>
        </div>
      </div>
    </>
  );
};

export default Step4Mentors;
