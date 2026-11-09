import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDepartments } from '../../api/departments';
import { getClasses, createClass, updateClass } from '../../api/classes';
import { getFaculty } from '../../api/faculty';
import { getBatches } from '../../api/batch';
import { ROLES } from '../../utils/constants';
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
    queryFn: () => getClasses({ limit: 100 }),
  });
  const classesList = classRes?.data || classRes?.classes || [];

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
      const cls = classesList.find((c) => c._id === selectedClassId);
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
  }, [selectedClassId, classesList, mode]);

  // Validation function
  const validateField = (field, value) => {
    let err = '';
    if (field === 'name') {
      if (!value || !value.trim()) err = 'Class name is required (e.g. CSD-A)';
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

  // Determine if continue is valid
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
        toast.success(`Class ${savedClass.name} created successfully.`);
      } else {
        // Existing class selected: update semester or teacher if modified
        const existingClassObj = classesList.find((c) => c._id === selectedClassId) || {};
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
        toast.success(`Class ${savedClass.name} configuration confirmed.`);
      }

      onDirtyChange?.(false);
      onSave({
        classId: savedClass._id,
        classData: savedClass,
        summary: `${savedClass.name} · Semester ${savedClass.semester} · Dept: ${
          departments.find((d) => d._id === (savedClass.departmentId?._id || savedClass.departmentId))?.name || 'Department'
        }`,
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
      <div className="p-6 rounded-2xl border border-red-200 bg-red-50/50 text-center space-y-4" role="alert">
        <AlertCircle size={32} className="mx-auto text-red-600" aria-hidden="true" />
        <div>
          <h3 className="text-base font-bold text-red-900">Failed to load academic entities</h3>
          <p className="text-xs text-red-700 mt-1">Check your network connection and retry.</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => { refetchDepts(); refetchClasses(); }}
        >
          <RefreshCw size={14} className="mr-1.5" /> Retry Loading
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Mode Selector Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-zinc-100/80 rounded-xl max-w-md border border-zinc-200/60" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'existing'}
          onClick={() => setMode('existing')}
          className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all min-h-[44px]
            ${mode === 'existing'
              ? 'bg-white text-navy shadow-sm border border-zinc-200/60 font-black'
              : 'text-zinc-700 hover:text-navy hover:bg-white/50'
            }`}
        >
          Select Existing Class
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'new'}
          onClick={() => setMode('new')}
          className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all min-h-[44px]
            ${mode === 'new'
              ? 'bg-white text-navy shadow-sm border border-zinc-200/60 font-black'
              : 'text-zinc-700 hover:text-navy hover:bg-white/50'
            }`}
        >
          Create New Class
        </button>
      </div>

      {/* Mode A: Select Existing Class */}
      {mode === 'existing' && (
        <div className="space-y-4">
          <div>
            <label htmlFor="wizard-select-class" className="block text-xs font-black uppercase tracking-wider text-navy mb-1.5">
              Choose Section / Class <span className="text-red-600">*</span>
            </label>
            <p className="text-xs text-zinc-600 mb-2 font-medium">
              Select an existing persistent section to stand up for the new semester cycle.
            </p>
            {classesList.length === 0 ? (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs">
                No active classes found for this department. Please switch to "Create New Class" above.
              </div>
            ) : (
              <select
                id="wizard-select-class"
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  onDirtyChange?.(true);
                }}
                className="w-full px-4 py-2.5 bg-white border border-zinc-300 rounded-xl text-sm font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 min-h-[44px]"
              >
                <option value="">-- Choose a Class --</option>
                {classesList.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} · Current Sem: {c.semester || 1} {c.academicYear ? `(${c.academicYear})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedClassId && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-zinc-50 border border-zinc-200/80">
              <div>
                <label htmlFor="wizard-sem-update" className="block text-xs font-bold text-zinc-700 mb-1">
                  Target Semester (1 to 8) <span className="text-red-500">*</span>
                </label>
                <input
                  id="wizard-sem-update"
                  type="number"
                  min="1"
                  max="8"
                  value={formData.semester}
                  onChange={(e) => handleChange('semester', e.target.value)}
                  onBlur={() => handleBlur('semester')}
                  aria-invalid={Boolean(errors.semester)}
                  aria-describedby={errors.semester ? 'sem-error' : undefined}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm font-bold text-navy focus:outline-none focus:ring-2 min-h-[44px]
                    ${errors.semester ? 'border-red-400 focus:ring-red-400/30' : 'border-zinc-300 focus:ring-indigo-500/40'}`}
                />
                {errors.semester && (
                  <p id="sem-error" className="text-xs text-red-600 mt-1 font-semibold" role="alert">
                    {errors.semester}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="wizard-teacher-select" className="block text-xs font-bold text-zinc-700 mb-1">
                  Class Teacher (Optional update)
                </label>
                <select
                  id="wizard-teacher-select"
                  value={formData.classTeacherId}
                  onChange={(e) => handleChange('classTeacherId', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-sm text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/40 min-h-[44px]"
                >
                  <option value="">-- Leave Unchanged or Select Teacher --</option>
                  {facultyList.map((f) => (
                    <option key={f._id} value={f._id}>
                      {f.name} ({f.employeeId || 'Faculty'})
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
              <label htmlFor="wizard-dept-select" className="block text-xs font-black uppercase tracking-wider text-navy mb-1.5">
                Department <span className="text-red-500">*</span>
              </label>
              <select
                id="wizard-dept-select"
                disabled={isHod}
                value={formData.departmentId}
                onChange={(e) => handleChange('departmentId', e.target.value)}
                onBlur={() => handleBlur('departmentId')}
                className={`w-full px-4 py-2.5 bg-white border rounded-xl text-sm font-semibold text-navy focus:outline-none focus:ring-2 min-h-[44px]
                  ${errors.departmentId ? 'border-red-400 focus:ring-red-400/30' : 'border-zinc-300 focus:ring-indigo-500/40'}`}
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
              <label htmlFor="wizard-class-name" className="block text-xs font-black uppercase tracking-wider text-navy mb-1.5">
                Class / Section Name <span className="text-red-500">*</span>
              </label>
              <input
                id="wizard-class-name"
                type="text"
                placeholder="e.g. CSD-A or CSE-B"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                onBlur={() => handleBlur('name')}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'name-error' : undefined}
                className={`w-full px-4 py-2.5 bg-white border rounded-xl text-sm font-semibold text-navy focus:outline-none focus:ring-2 min-h-[44px]
                  ${errors.name ? 'border-red-400 focus:ring-red-400/30' : 'border-zinc-300 focus:ring-indigo-500/40'}`}
              />
              {errors.name && (
                <p id="name-error" className="text-xs text-red-600 mt-1 font-semibold" role="alert">{errors.name}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Semester */}
            <div>
              <label htmlFor="wizard-new-sem" className="block text-xs font-black uppercase tracking-wider text-navy mb-1.5">
                Semester (1-8) <span className="text-red-500">*</span>
              </label>
              <input
                id="wizard-new-sem"
                type="number"
                min="1"
                max="8"
                value={formData.semester}
                onChange={(e) => handleChange('semester', e.target.value)}
                onBlur={() => handleBlur('semester')}
                className="w-full px-4 py-2.5 bg-white border border-zinc-300 rounded-xl text-sm font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/40 min-h-[44px]"
              />
            </div>

            {/* Batch Label */}
            <div>
              <label htmlFor="wizard-batch-label" className="block text-xs font-black uppercase tracking-wider text-navy mb-1.5">
                Academic Batch
              </label>
              <input
                id="wizard-batch-label"
                type="text"
                placeholder="e.g. 2024-2028"
                value={formData.batchLabel}
                onChange={(e) => handleChange('batchLabel', e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-zinc-300 rounded-xl text-sm font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/40 min-h-[44px]"
              />
            </div>

            {/* Class Teacher */}
            <div>
              <label htmlFor="wizard-new-teacher" className="block text-xs font-black uppercase tracking-wider text-navy mb-1.5">
                Class Teacher
              </label>
              <select
                id="wizard-new-teacher"
                value={formData.classTeacherId}
                onChange={(e) => handleChange('classTeacherId', e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-zinc-300 rounded-xl text-sm font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-indigo-500/40 min-h-[44px]"
              >
                <option value="">-- Select Teacher --</option>
                {facultyList.map((f) => (
                  <option key={f._id} value={f._id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="pt-6 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-xs text-zinc-700">
          {!isFormValid() ? (
            <span className="text-amber-700 font-semibold flex items-center gap-1.5">
              <AlertCircle size={14} className="shrink-0" />
              {mode === 'existing'
                ? 'Please select a class to continue.'
                : 'Please fill all required fields before continuing.'}
            </span>
          ) : (
            <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
              <CheckCircle2 size={14} className="shrink-0" /> Ready to proceed to Timetable step.
            </span>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          disabled={!isFormValid() || isSubmitting}
          loading={isSubmitting}
          className="w-full sm:w-60 min-h-[44px]"
        >
          {isSubmitting ? 'Saving...' : 'Save & Continue →'}
        </Button>
      </div>
    </form>
  );
};

export default Step1ClassInfo;
