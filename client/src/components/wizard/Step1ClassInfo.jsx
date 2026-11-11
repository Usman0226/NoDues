import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDepartments } from '../../api/departments';
import { getClasses, createClass, updateClass } from '../../api/classes';
import { getFaculty } from '../../api/faculty';
import { getBatches } from '../../api/batch';
import { ROLES } from '../../utils/constants';
import { getAcademicYearRoman, formatSectionDisplayName } from '../../utils/formatters';
import Button from '../ui/Button';
import { StepTableSkeleton } from './WizardSkeleton';
import { Building2, Layers, BookOpen, UserCheck, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

const Step1ClassInfo = ({
  user,
  initialClassId,
  initialData,
  onSave,
  onDirtyChange,
}) => {
  const isHod = user?.role === ROLES.HOD || user?.role === 'hod';
  const defaultDeptId = user?.departmentId || user?.department?._id || '';

  // Mode: 'existing' | 'new'
  const [mode, setMode] = useState(initialClassId ? 'existing' : 'existing');
  const [selectedClassId, setSelectedClassId] = useState(initialClassId || '');

  // Form fields for new or editing class
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    departmentId: defaultDeptId,
    batchLabel: initialData?.academicYear || '',
    semester: initialData?.semester || 1,
    classTeacherId: initialData?.classTeacherId?._id || initialData?.classTeacherId || '',
  });

  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queries
  const { data: deptRes, isLoading: loadingDepts, isError: deptsError, refetch: refetchDepts } = useQuery({
    queryKey: ['wizard', 'departments'],
    queryFn: getDepartments,
  });
  const departments = deptRes?.data || [];

  const { data: classRes, isLoading: loadingClasses, isError: classesError, refetch: refetchClasses } = useQuery({
    queryKey: ['wizard', 'classes', isHod ? defaultDeptId : 'all'],
    queryFn: () => getClasses({ limit: 150 }),
  });
  const rawClassesList = classRes?.data || classRes?.classes || [];

  // Filter out Master syllabus classes (only operational sections can be set up for students)
  const operationalClasses = useMemo(() => {
    return rawClassesList.filter((c) => !c.isMaster);
  }, [rawClassesList]);

  const { data: facultyRes, isLoading: loadingFaculty } = useQuery({
    queryKey: ['wizard', 'faculty', formData.departmentId],
    queryFn: () => getFaculty({ departmentId: formData.departmentId, limit: 100 }),
    enabled: Boolean(formData.departmentId),
  });
  const facultyList = facultyRes?.data || facultyRes?.faculty || [];

  const { data: batchRes } = useQuery({
    queryKey: ['wizard', 'batches'],
    queryFn: () => getBatches({ limit: 50 }),
  });
  const batchesList = batchRes?.data || batchRes?.batches || [];

  // When selected class changes in 'existing' mode, load its values
  useEffect(() => {
    if (mode === 'existing' && selectedClassId) {
      const cls = operationalClasses.find((c) => c._id === selectedClassId);
      if (cls) {
        setFormData({
          name: cls.name,
          departmentId: cls.departmentId?._id || cls.departmentId,
          batchLabel: cls.academicYear || '',
          semester: cls.semester || 1,
          classTeacherId: cls.classTeacherId?._id || cls.classTeacherId || '',
        });
      }
    }
  }, [selectedClassId, operationalClasses, mode]);

  // Validation function
  const validateField = (field, value) => {
    let err = '';
    if (field === 'name') {
      if (!value || !value.trim()) err = 'Class name is required (e.g. CSD-E)';
      else if (value.trim().length < 2) err = 'Class name must be at least 2 characters';
    }
    if (field === 'departmentId' && !value) {
      err = 'Department is required';
    }
    if (field === 'semester') {
      const sem = parseInt(value, 10);
      if (!sem || sem < 1 || sem > 8) err = 'Semester must be between 1 and 8';
    }
    return err;
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const err = validateField(field, formData[field]);
    setErrors((prev) => ({ ...prev, [field]: err }));
  };

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      onDirtyChange?.(true);
      return updated;
    });

    if (touched[field]) {
      const err = validateField(field, value);
      setErrors((prev) => ({ ...prev, [field]: err }));
    }
  };

  const isFormValid = () => {
    if (mode === 'existing') {
      return Boolean(selectedClassId && formData.semester >= 1 && formData.semester <= 8);
    }
    return Boolean(
      formData.name.trim().length >= 2 &&
      formData.departmentId &&
      formData.semester >= 1 &&
      formData.semester <= 8
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid()) {
      toast.error('Please complete all required fields correctly.');
      return;
    }

    setIsSubmitting(true);
    try {
      let savedClass;
      if (mode === 'new') {
        const payload = {
          name: formData.name.trim(),
          departmentId: formData.departmentId,
          semester: Number(formData.semester),
          academicYear: formData.batchLabel || `${new Date().getFullYear()}-${new Date().getFullYear() + 4}`,
          classTeacherId: formData.classTeacherId || undefined,
        };
        const res = await createClass(payload);
        savedClass = res?.data || res;
        toast.success(`Class ${formatSectionDisplayName(savedClass.name, savedClass.semester)} created.`);
      } else {
        const existingClassObj = operationalClasses.find((c) => c._id === selectedClassId) || {};
        const payload = {
          semester: Number(formData.semester),
          ...(formData.classTeacherId ? { classTeacherId: formData.classTeacherId } : {}),
        };
        const res = await updateClass(selectedClassId, payload);
        const updatedData = res?.data || res;
        savedClass = {
          ...existingClassObj,
          ...updatedData,
          semester: Number(formData.semester),
          departmentId: existingClassObj.departmentId || updatedData.departmentId,
        };
        toast.success(`Class ${formatSectionDisplayName(savedClass.name, savedClass.semester)} selected.`);
      }

      onDirtyChange?.(false);
      onSave({
        classId: savedClass._id,
        classData: savedClass,
        summary: `${formatSectionDisplayName(savedClass.name, savedClass.semester)} · Semester ${savedClass.semester} · Batch ${savedClass.academicYear || 'Current'}`,
      });
    } catch (err) {
      toast.error(err?.message || 'Failed to save class configuration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingDepts || loadingClasses) {
    return <StepTableSkeleton rows={4} />;
  }

  if (deptsError || classesError) {
    return (
      <div className="p-5 rounded-2xl border border-red-200 bg-red-50/50 text-center space-y-3" role="alert">
        <AlertCircle size={28} className="mx-auto text-red-600" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-bold text-red-900">Failed to load academic records</h3>
          <p className="text-xs text-red-700 mt-0.5">Please check your network connection and retry.</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => { refetchDepts(); refetchClasses(); }}
        >
          <RefreshCw size={13} className="mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  const selectedClassObj = operationalClasses.find((c) => c._id === selectedClassId);
  const romanYear = getAcademicYearRoman(formData.semester);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Mode Selector Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-zinc-100 rounded-xl max-w-sm border border-zinc-200/80" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'existing'}
          onClick={() => setMode('existing')}
          className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all min-h-[38px]
            ${mode === 'existing'
              ? 'bg-white text-navy shadow-xs border border-zinc-200/80 font-black'
              : 'text-zinc-600 hover:text-navy hover:bg-white/50'
            }`}
        >
          Select Existing Section
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'new'}
          onClick={() => setMode('new')}
          className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all min-h-[38px]
            ${mode === 'new'
              ? 'bg-white text-navy shadow-xs border border-zinc-200/80 font-black'
              : 'text-zinc-600 hover:text-navy hover:bg-white/50'
            }`}
        >
          Create New Section
        </button>
      </div>

      {/* Mode A: Select Existing Class */}
      {mode === 'existing' && (
        <div className="space-y-4">
          <div>
            <label htmlFor="wizard-select-class" className="block text-xs font-black uppercase tracking-wider text-navy mb-1">
              Choose Section <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-zinc-500 mb-2">
              Select an operational section to configure for the upcoming semester clearance.
            </p>
            {operationalClasses.length === 0 ? (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs font-medium">
                No active sections found. Please switch to "Create New Section" above.
              </div>
            ) : (
              <select
                id="wizard-select-class"
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  onDirtyChange?.(true);
                }}
                className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-xl text-xs sm:text-sm font-bold text-navy focus:outline-none focus:ring-2 focus:ring-navy/20 min-h-[42px]"
              >
                <option value="">-- Select Section --</option>
                {operationalClasses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {formatSectionDisplayName(c.name, c.semester)} · Semester {c.semester || 1} {c.academicYear ? `(${c.academicYear})` : ''} — {c.studentCount || 0} Students
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedClassId && selectedClassObj && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-4 rounded-xl bg-zinc-50 border border-zinc-200/80">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="wizard-sem-update" className="block text-xs font-bold text-zinc-700">
                    Semester <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                    Year {romanYear}
                  </span>
                </div>
                <select
                  id="wizard-sem-update"
                  value={formData.semester}
                  onChange={(e) => handleChange('semester', Number(e.target.value))}
                  onBlur={() => handleBlur('semester')}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs sm:text-sm font-bold text-navy focus:outline-none focus:ring-2 focus:ring-navy/20 min-h-[40px]"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>
                      Semester {s} (Year {getAcademicYearRoman(s)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="wizard-teacher-select" className="block text-xs font-bold text-zinc-700 mb-1">
                  Class Teacher <span className="text-zinc-500 text-[10px] font-normal">(Required for Clearance)</span>
                </label>
                <select
                  id="wizard-teacher-select"
                  value={formData.classTeacherId}
                  onChange={(e) => handleChange('classTeacherId', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs sm:text-sm text-navy focus:outline-none focus:ring-2 focus:ring-navy/20 min-h-[40px]"
                >
                  <option value="">-- Select Class Teacher --</option>
                  {facultyList.map((f) => (
                    <option key={f._id} value={f._id}>
                      {f.name} {f.employeeId ? `(${f.employeeId})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mode B: Create New Class */}
      {mode === 'new' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Department */}
            <div>
              <label htmlFor="wizard-dept-select" className="block text-xs font-black uppercase tracking-wider text-navy mb-1">
                Department <span className="text-red-500">*</span>
              </label>
              <select
                id="wizard-dept-select"
                disabled={isHod}
                value={formData.departmentId}
                onChange={(e) => handleChange('departmentId', e.target.value)}
                onBlur={() => handleBlur('departmentId')}
                className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-xs sm:text-sm font-semibold text-navy focus:outline-none focus:ring-2 min-h-[42px]
                  ${errors.departmentId ? 'border-red-400 focus:ring-red-400/20' : 'border-zinc-300 focus:ring-navy/20'}`}
              >
                <option value="">-- Choose Department --</option>
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>{d.name} ({d.code})</option>
                ))}
              </select>
              {errors.departmentId && (
                <p className="text-xs text-red-600 mt-1 font-semibold" role="alert">{errors.departmentId}</p>
              )}
            </div>

            {/* Class Name */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="wizard-class-name" className="block text-xs font-black uppercase tracking-wider text-navy">
                  Section Name <span className="text-red-500">*</span>
                </label>
                {formData.name.trim() && (
                  <span className="text-[10px] font-bold text-zinc-500">
                    Preview: <strong className="text-navy">{formatSectionDisplayName(formData.name, formData.semester)}</strong>
                  </span>
                )}
              </div>
              <input
                id="wizard-class-name"
                type="text"
                placeholder="e.g. CSD-E or CSE-A"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                onBlur={() => handleBlur('name')}
                aria-invalid={Boolean(errors.name)}
                className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-xs sm:text-sm font-semibold text-navy focus:outline-none focus:ring-2 min-h-[42px]
                  ${errors.name ? 'border-red-400 focus:ring-red-400/20' : 'border-zinc-300 focus:ring-navy/20'}`}
              />
              {errors.name && (
                <p className="text-xs text-red-600 mt-1 font-semibold" role="alert">{errors.name}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Semester */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="wizard-new-sem" className="block text-xs font-black uppercase tracking-wider text-navy">
                  Semester <span className="text-red-500">*</span>
                </label>
                <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700 px-2 py-0.2 rounded-full">
                  Year {romanYear}
                </span>
              </div>
              <select
                id="wizard-new-sem"
                value={formData.semester}
                onChange={(e) => handleChange('semester', Number(e.target.value))}
                onBlur={() => handleBlur('semester')}
                className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-xl text-xs sm:text-sm font-bold text-navy focus:outline-none focus:ring-2 focus:ring-navy/20 min-h-[42px]"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>
                    Semester {s} (Year {getAcademicYearRoman(s)})
                  </option>
                ))}
              </select>
            </div>

            {/* Batch Label */}
            <div>
              <label htmlFor="wizard-batch-label" className="block text-xs font-black uppercase tracking-wider text-navy mb-1">
                Academic Batch
              </label>
              <input
                id="wizard-batch-label"
                type="text"
                placeholder="e.g. 2024-28"
                value={formData.batchLabel}
                onChange={(e) => handleChange('batchLabel', e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-xl text-xs sm:text-sm font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-navy/20 min-h-[42px]"
              />
            </div>

            {/* Class Teacher */}
            <div>
              <label htmlFor="wizard-new-teacher" className="block text-xs font-black uppercase tracking-wider text-navy mb-1">
                Class Teacher
              </label>
              <select
                id="wizard-new-teacher"
                value={formData.classTeacherId}
                onChange={(e) => handleChange('classTeacherId', e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-xl text-xs sm:text-sm font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-navy/20 min-h-[42px]"
              >
                <option value="">-- Select Class Teacher --</option>
                {facultyList.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name} {f.employeeId ? `(${f.employeeId})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="pt-4 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-zinc-600">
          {!isFormValid() ? (
            <span className="text-amber-700 font-semibold flex items-center gap-1.5">
              <AlertCircle size={14} className="shrink-0" />
              {mode === 'existing'
                ? 'Please select a section to continue.'
                : 'Please complete all required fields.'}
            </span>
          ) : (
            <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
              <CheckCircle2 size={14} className="shrink-0" /> Ready to proceed to Subjects & Timetable.
            </span>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          disabled={!isFormValid() || isSubmitting}
          loading={isSubmitting}
          className="w-full sm:w-56 min-h-[42px]"
        >
          {isSubmitting ? 'Saving...' : 'Save & Continue →'}
        </Button>
      </div>
    </form>
  );
};

export default Step1ClassInfo;
