import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {motion, AnimatePresence } from 'framer-motion';
import PageWrapper from '../../components/layout/PageWrapper';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ActionMenu from '../../components/ui/ActionMenu';
import ConfirmModal from '../../components/ui/ConfirmModal';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';
import { getClasses, createClass, updateClass, deleteClass, activateClass, getMasterCurriculum, syncMasterCurriculum } from '../../api/classes';
import { getFaculty } from '../../api/faculty';
import { getDepartment } from '../../api/departments';
import { useNavigationStack } from '../../hooks/useNavigationStack';
import { ArrowLeft, Plus, BookOpen, Users, GraduationCap, Layers, ArrowRight, Copy, RefreshCw, AlertCircle, Edit, Trash2, ChevronLeft, ChevronRight, Inbox, CheckCircle, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';
import BackHeader from '../../components/ui/BackHeader';
import PromoteStudentsModal from '../../components/classes/PromoteStudentsModal';
import BulkPromoteCohortModal from '../../components/classes/BulkPromoteCohortModal';
import DepartmentRolloverModal from '../../components/classes/DepartmentRolloverModal';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15, scale: 0.98 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 30 }
  }
};

const DepartmentClasses = () => {
  const { deptId: urlDeptId } = useParams();
  const { user } = useAuth();
  const isHod = user?.role === 'hod' || user?.role === 'ao';
  
  // Fall back to user.departmentId for HoD accessing their own classes directly
  const deptId = urlDeptId || user?.departmentId;
  
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showActivate, setShowActivate] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [promoteClassId, setPromoteClassId] = useState(null);
  const [showCohortPromote, setShowCohortPromote] = useState(false);
  const [cohortPromoteSem, setCohortPromoteSem] = useState(1);
  const [showDepartmentRollover, setShowDepartmentRollover] = useState(false);
  const [syncingSem, setSyncingSem] = useState(null);

  const navigate = useNavigate();

  const handleOpenMasterCurriculum = async (sem) => {
    if (!activeDeptId) return toast.error('Department context missing');
    try {
      const res = await getMasterCurriculum({ departmentId: activeDeptId, semester: sem });
      const master = res?.data?.data || res?.data;
      if (master?._id) {
        navigate(isHod ? `/hod/class/${master._id}` : `/admin/class/${master._id}`);
      } else {
        toast.error('Could not locate master curriculum class');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to open master curriculum');
    }
  };

  const handleSyncMaster = async (sem) => {
    if (!activeDeptId) return toast.error('Department context missing');
    setSyncingSem(sem);
    try {
      const res = await syncMasterCurriculum({ departmentId: activeDeptId, semester: sem });
      toast.success(res?.data?.message || `Synchronized Semester ${sem} master curriculum to all sections!`);
      fetchClasses({ departmentId: deptId, page, limit, includeInactive });
    } catch (err) {
      toast.error(err?.message || err?.response?.data?.message || 'Failed to synchronize curriculum');
    } finally {
      setSyncingSem(null);
    }
  };


  // Pagination State
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [includeInactive, setIncludeInactive] = useState(false);
  
  const classesOptions = useMemo(() => ({
    queryKey: ['classes', { departmentId: deptId, page, limit, includeInactive }],
    immediate: false
  }), [deptId, page, limit, includeInactive]);

  const { data: response, loading, error, request: fetchClasses } = useApi(getClasses, classesOptions);
  const classes = useMemo(() => response?.data || [], [response?.data]);
  const total = response?.total || 0;

  // Resolve active department ID (fallback from loaded classes if super admin accesses directly)
  const activeDeptId = useMemo(() => {
    return deptId || classes[0]?.departmentId?._id || (typeof classes[0]?.departmentId === 'string' ? classes[0]?.departmentId : null);
  }, [deptId, classes]);

  const facultyOptions = useMemo(() => ({
    queryKey: ['faculty', { departmentId: deptId }],
    immediate: false
  }), [deptId]);

  const { data: facultyResponse, request: fetchFaculty } = useApi(getFaculty, facultyOptions);
  const facultyList = useMemo(() => facultyResponse?.data || [], [facultyResponse?.data]);

  useEffect(() => {
    const params = { departmentId: deptId, page, limit, includeInactive };
    fetchClasses(params);
    if (deptId) {
      fetchFaculty({ departmentId: deptId, limit: 100, isActive: true });
    }
  }, [fetchClasses, fetchFaculty, deptId, page, limit, includeInactive]);

  const [formData, setFormData] = useState({
    name: '',
    semester: 1,
    academicYear: '2025-26',
    departmentId: deptId,
    classTeacherId: ''
  });

  // Re-sync form deptId if user context loads later
  useEffect(() => {
    if (deptId && formData.departmentId !== deptId) {
      setFormData(prev => ({ ...prev, departmentId: deptId }));
    }
  }, [deptId, formData.departmentId]);

  const grouped = useMemo(() => {
    if (!classes) return {};
    return classes.reduce((acc, cls) => {
      (acc[cls.semester] = acc[cls.semester] || []).push(cls);
      return acc;
    }, {});
  }, [classes]);

  const sortedSemesters = useMemo(() => {
    return Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b);
  }, [grouped]);

  const [activeSemester, setActiveSemester] = useState(null);

  useEffect(() => {
    if (sortedSemesters.length > 0) {
      if (!activeSemester || !sortedSemesters.includes(Number(activeSemester))) {
        setActiveSemester(sortedSemesters[0]);
      }
    }
  }, [sortedSemesters, activeSemester]);

  const activeSemesterClasses = useMemo(() => {
    if (!activeSemester || !grouped[activeSemester]) return [];
    return grouped[activeSemester];
  }, [grouped, activeSemester]);

  const activeMasterClass = useMemo(() => {
    return activeSemesterClasses.find((c) => c.isMaster);
  }, [activeSemesterClasses]);

  const activeOperationalSections = useMemo(() => {
    return activeSemesterClasses.filter((c) => !c.isMaster);
  }, [activeSemesterClasses]);

  const activeCohortSubjectCount = useMemo(() => {
    return activeMasterClass?.subjectCount ?? activeOperationalSections[0]?.subjectCount ?? 0;
  }, [activeMasterClass, activeOperationalSections]);

  const activeTotalStudents = useMemo(() => {
    return activeOperationalSections.reduce((sum, cls) => sum + (cls.studentCount || 0), 0);
  }, [activeOperationalSections]);

  const { setBreadcrumbs } = useNavigationStack();
  const [departmentName, setDepartmentName] = useState('');

  useEffect(() => {
    if (classes[0]?.departmentName) {
      setDepartmentName(classes[0].departmentName);
    } else if (activeDeptId) {
      getDepartment(activeDeptId)
        .then((res) => {
          const name = res.data?.data?.name || res.data?.name;
          if (name) setDepartmentName(name);
        })
        .catch(() => {});
    }
  }, [classes, activeDeptId]);

  useEffect(() => {
    const deptLabel = departmentName || 'Academic Groups';
    const deptPath = isHod
      ? '/hod/classes'
      : deptId
      ? `/admin/departments/${deptId}/classes`
      : '/admin/departments';

    const crumbs = [
      { label: 'NoDues', path: isHod ? '/hod' : '/admin' },
      ...(isHod
        ? [{ label: 'Academic Groups', path: '/hod/classes', isCurrent: !activeSemester }]
        : [
            { label: 'Departments', path: '/admin/departments' },
            { label: deptLabel, path: deptPath, isCurrent: !activeSemester }
          ]),
      ...(activeSemester ? [{ label: `Semester ${activeSemester}`, isCurrent: true }] : [])
    ];
    setBreadcrumbs(crumbs);
  }, [setBreadcrumbs, isHod, deptId, departmentName, activeSemester]);

  const handleCreate = async () => {
    if (!formData.name || !formData.academicYear) return toast.error('Fields missing');
    setSubmitting(true);
    try {
      await createClass(formData);
      toast.success('New academic group established');
      setShowCreate(false);
      fetchClasses({ departmentId: deptId, page, limit, includeInactive });
      setFormData({ name: '', semester: 1, academicYear: '2025-26', departmentId: deptId, classTeacherId: '' });
    } catch (err) {
      toast.error(err?.message || 'Failed to create group');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClick = (cls, e) => {
    if(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    setSelectedClass(cls);
    setFormData({
      name: cls.name,
      semester: cls.semester,
      academicYear: cls.academicYear,
      departmentId: deptId,
      classTeacherId: cls.classTeacher?._id || ''
    });
    setShowEdit(true);
  };

  const handleEditSubmit = async () => {
    if (!formData.name || !formData.academicYear) return toast.error('Fields missing');
    setSubmitting(true);
    try {
      await updateClass(selectedClass._id, formData);
      toast.success('Academic group updated');
      setShowEdit(false);
      fetchClasses({ departmentId: deptId, page, limit, includeInactive });
    } catch (err) {
      toast.error(err?.message || 'Failed to update group');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = (cls, e) => {
    if(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    setSelectedClass(cls);
    setShowDelete(true);
  };

  const handleActivateClick = (cls, e) => {
    if(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    setSelectedClass(cls);
    setShowActivate(true);
  };

  const handleActivateConfirm = async () => {
    setSubmitting(true);
    try {
      await activateClass(selectedClass._id);
      toast.success('Academic group reactivated');
      setShowActivate(false);
      fetchClasses({ departmentId: deptId, page, limit, includeInactive });
    } catch (err) {
      toast.error(err?.message || 'Failed to reactivate group');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {

    setSubmitting(true);
    try {
      await deleteClass(selectedClass._id);
      toast.success('Academic group deactivated');
      setShowDelete(false);
      fetchClasses();
    } catch (err) {
      toast.error(err?.message || 'Failed to deactivate group');
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <PageWrapper 
      title={departmentName || "Academic Groups"} 
      subtitle={`Academic structure, cohort progression and section management · ${activeOperationalSections.length} Sections · ${activeTotalStudents} Students`}
      tag={departmentName ? (departmentName.match(/\b([A-Z])/g)?.join('').slice(0, 4) || 'DEPT') : 'DEPT'}
      meta={activeOperationalSections[0]?.academicYear ? `A.Y. ${activeOperationalSections[0]?.academicYear}` : 'A.Y. 2024-2028'}
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <div 
            className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-colors cursor-pointer select-none"
            onClick={() => setIncludeInactive(!includeInactive)}
          >
            <div className={`w-7 h-4 rounded-full relative transition-colors ${includeInactive ? 'bg-navy' : 'bg-slate-200'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${includeInactive ? 'left-3.5' : 'left-0.5'}`} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Show Inactive
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDepartmentRollover(true)}
            className="border-purple-200 text-purple-700 hover:bg-purple-50 font-semibold gap-1.5"
          >
            <Layers size={14} /> Department Rollover
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setFormData({ name: '', semester: activeSemester || 1, academicYear: activeOperationalSections[0]?.academicYear || '2025-26', departmentId: deptId, classTeacherId: '' });
              setShowCreate(true);
            }}
            className="gap-1.5"
          >
            <Plus size={14} /> New Section
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchClasses({ departmentId: deptId, page, limit, includeInactive })}
            className="text-slate-400 hover:text-navy p-2"
            title="Reload sections"
          >
            <RefreshCw size={14} />
          </Button>
        </div>
      }
    >

      <AnimatePresence mode="wait">
        {loading && !classes.length ? (
          <motion.div 
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-12"
          >
             <div className="space-y-4">
                <div className="h-4 w-32 bg-muted/10 rounded-full animate-pulse"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                   {[1, 2, 3].map(i => (
                     <div key={i} className="bg-white rounded-xl border border-muted p-6 h-[180px] space-y-3 animate-pulse">
                        <div className="flex justify-between">
                           <div className="space-y-2">
                              <div className="h-5 w-32 bg-muted/10 rounded-lg"></div>
                              <div className="h-3 w-24 bg-muted/5 rounded-md"></div>
                           </div>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
          </motion.div>
        ) : error ? (
          <motion.div 
            key="error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm"
          >
             <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
             <p className="text-muted-foreground font-medium">{error || 'Failed to initialize session'}</p>
          </motion.div>
        ) : Object.keys(grouped).length === 0 ? (
          <motion.div 
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm border-dashed"
          >
             <Inbox size={48} className="mx-auto text-muted mb-4 opacity-20" />
             <p className="text-muted-foreground font-semibold italic">No academic groups found matching criteria</p>
             <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mt-1">Try adjusting filters or checking inactive records</p>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-8"
          >
            {/* Semester Tabs Navigation Bar */}
            <div className="bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar mb-6">
              {sortedSemesters.map((sem) => {
                const semClasses = grouped[sem] || [];
                const opSecs = semClasses.filter((c) => !c.isMaster);
                const hasBatchActive = semClasses.some((c) => c.hasActiveBatch);
                const isSelected = Number(activeSemester) === sem;

                return (
                  <button
                    key={sem}
                    onClick={() => setActiveSemester(sem)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 select-none cursor-pointer ${
                      isSelected
                        ? 'bg-white text-navy shadow-xs border border-slate-200/60'
                        : 'text-slate-600 hover:text-navy hover:bg-white/50'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${
                      isSelected ? 'bg-navy text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      S{sem}
                    </span>
                    <span>Semester {sem}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
                      isSelected ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-200/70 text-slate-500'
                    }`}>
                      {opSecs.length}
                    </span>
                    {hasBatchActive && (
                      <span
                        className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white"
                        title="Active Clearance Batch in Progress"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Semester Content */}
            {activeSemester && (
              <div className="space-y-6">
                {/* Active Semester Hub */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-navy text-white flex items-center justify-center text-sm font-black shadow-xs shrink-0">
                        S{activeSemester}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base sm:text-lg font-black text-navy uppercase tracking-tight">
                            Semester {activeSemester} Cohort
                          </h2>
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            AY {activeOperationalSections[0]?.academicYear || '2024-28'}
                          </span>
                          {activeOperationalSections.some((c) => c.hasActiveBatch) && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Clearance In Progress
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {activeOperationalSections.length} {activeOperationalSections.length === 1 ? 'Section' : 'Sections'} &bull; {activeTotalStudents} Total Enrolled Students
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold text-xs gap-1.5 shadow-xs"
                        onClick={() => {
                          setCohortPromoteSem(Number(activeSemester));
                          setShowCohortPromote(true);
                        }}
                        disabled={activeOperationalSections.length === 0}
                      >
                        <GraduationCap size={15} />
                        Promote Semester {activeSemester} ({activeOperationalSections.length} Sections)
                      </Button>
                    </div>
                  </div>

                  {/* Curriculum Blueprint Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                        <BookOpen size={16} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-navy">
                            Curriculum Blueprint:
                          </span>
                          <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                            {activeCohortSubjectCount} Subjects Defined
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Master syllabus automatically inherited by all {activeOperationalSections.length} operational sections.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        className="text-xs font-semibold gap-1.5 border-slate-300 text-slate-700 hover:bg-white bg-white shadow-xs"
                        onClick={() => handleOpenMasterCurriculum(Number(activeSemester))}
                      >
                        <BookOpen size={13} /> Manage Master Syllabus
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-xs font-semibold gap-1.5 text-slate-600 hover:text-indigo-600 hover:bg-white"
                        onClick={() => handleSyncMaster(Number(activeSemester))}
                        disabled={syncingSem === Number(activeSemester)}
                      >
                        <RefreshCw size={13} className={syncingSem === Number(activeSemester) ? 'animate-spin' : ''} /> Sync Sections
                      </Button>
                    </div>
                  </div>
                </div>

                {activeOperationalSections.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300 p-8 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center mx-auto">
                      <Users size={24} />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-navy">No sections in Semester {activeSemester} yet</h3>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        Create operational sections (e.g. CSD-A, CSD-B) to enroll students and map faculty.
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setFormData({ name: '', semester: activeSemester, academicYear: '2025-26', departmentId: deptId, classTeacherId: '' });
                        setShowCreate(true);
                      }}
                    >
                      <Plus size={14} /> Establish Section in S{activeSemester}
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {activeOperationalSections.map((cls) => (
                      <motion.div key={cls._id} variants={itemVariants} layout>
                        <div className="group bg-white rounded-xl border border-slate-200/90 p-5 hover:border-indigo-300 hover:shadow-md transition-all duration-200 relative flex flex-col justify-between h-full">
                          {!cls.isActive && (
                            <div className="absolute top-0 right-0 px-2.5 py-0.5 bg-slate-100 text-[9px] font-bold uppercase tracking-wider text-slate-400 rounded-bl-lg border-b border-l border-slate-200">
                              Inactive
                            </div>
                          )}

                          <div>
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="min-w-0 pr-16">
                                <Link
                                  to={isHod ? `/hod/class/${cls._id}` : `/admin/class/${cls._id}`}
                                  className="text-lg font-black text-navy group-hover:text-indigo-600 transition-colors uppercase tracking-tight block truncate"
                                >
                                  {cls.name}
                                </Link>
                                <p className="text-xs font-medium text-slate-600 flex items-center gap-1.5 mt-1 truncate">
                                  <span className="text-slate-400 font-normal">CT:</span>
                                  <span className="font-semibold text-slate-700">{cls.classTeacher?.name || 'Not Assigned'}</span>
                                </p>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                                  Batch: {cls.academicYear}
                                </p>
                              </div>

                              <div className="flex items-center gap-0.5 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setPromoteClassId(cls._id);
                                  }}
                                  title="Promote Class"
                                  className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors"
                                >
                                  <GraduationCap size={15} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleEditClick(cls, e)}
                                  title="Edit Section"
                                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-navy transition-colors"
                                >
                                  <Edit size={14} />
                                </button>
                                {cls.isActive === false ? (
                                  <button
                                    type="button"
                                    onClick={(e) => handleActivateClick(cls, e)}
                                    title="Reactivate Section"
                                    className="p-1.5 hover:bg-emerald-50 rounded-lg text-slate-400 hover:text-emerald-600 transition-colors"
                                  >
                                    <RefreshCw size={14} />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => handleDeleteClick(cls, e)}
                                    title="Deactivate Section"
                                    className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Subjects</span>
                                <span className="text-sm font-black text-navy">{cls.subjectCount || 0}</span>
                              </div>
                              <div className="h-6 w-px bg-slate-100" />
                              <div>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Students</span>
                                <span className="text-sm font-black text-navy">{cls.studentCount || 0}</span>
                              </div>
                            </div>

                            <Link
                              to={isHod ? `/hod/class/${cls._id}` : `/admin/class/${cls._id}`}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                            >
                              <span>View Details</span>
                              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                            </Link>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Pagination for Cards */}
      {total > limit && (
         <div className="mt-12 p-5 bg-white rounded-2xl border border-muted flex items-center justify-between shadow-sm">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
               Page <span className="text-navy">{page}</span> <span className="mx-1">of</span> {Math.ceil(total / limit)}
            </p>
            <div className="flex items-center gap-2">
               <button onClick={() => setPage(page-1)} disabled={page === 1} className="p-2 hover:bg-zinc-50 rounded-lg border border-muted disabled:opacity-30 transition-all text-navy shadow-sm">
                  <ChevronLeft size={16} />
               </button>
               <button onClick={() => setPage(page+1)} disabled={page * limit >= total} className="p-2 hover:bg-zinc-50 rounded-lg border border-muted disabled:opacity-30 transition-all text-navy shadow-sm">
                  <ChevronRight size={16} />
               </button>
            </div>
         </div>
      )}

      {showCreate && (
        <Modal isOpen={showCreate} title="Instantiate Academic Group" onClose={() => setShowCreate(false)}>
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Group Identifier</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all font-bold" 
                placeholder="e.g. CSE-A Sem 5" 
              />
            </div>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Semester</label>
                 <SearchableSelect 
                    options={[1, 2, 3, 4, 5, 6, 7, 8].map(s => ({
                      value: s,
                      label: `Semester ${s}`,
                      subLabel: 'Academic Term'
                    }))}
                    value={formData.semester}
                    onChange={val => setFormData({...formData, semester: Number(val)})}
                    placeholder="Select Term"
                 />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Academic Session</label>
                <input 
                  type="text" 
                  value={formData.academicYear}
                  onChange={e => setFormData({...formData, academicYear: e.target.value})}
                  className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all" 
                  placeholder="2025-26" 
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Class Teacher (Optional)</label>
              <SearchableSelect 
                options={facultyList.map(f => ({
                  value: f._id,
                  label: f.name,
                  subLabel: f.employeeId
                }))}
                value={formData.classTeacherId || ''}
                onChange={val => setFormData({...formData, classTeacherId: val})}
                placeholder="Select Faculty"
              />
            </div>
            <div className="flex justify-end gap-3 pt-6 border-t border-muted/30">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Abort</Button>
              <Button variant="primary" onClick={handleCreate} loading={submitting}>Establish Class</Button>
            </div>
          </div>
        </Modal>
      )}

      {showEdit && (
        <Modal isOpen={showEdit} title="Modify Academic Group" onClose={() => setShowEdit(false)}>
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Group Identifier</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all font-bold" 
                placeholder="e.g. CSE-A Sem 5" 
              />
            </div>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Semester</label>
                 <SearchableSelect 
                    options={[1, 2, 3, 4, 5, 6, 7, 8].map(s => ({
                      value: s,
                      label: `Semester ${s}`,
                      subLabel: 'Academic Term'
                    }))}
                    value={formData.semester}
                    onChange={val => setFormData({...formData, semester: Number(val)})}
                    placeholder="Select Term"
                 />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Academic Session</label>
                <input 
                  type="text" 
                  value={formData.academicYear}
                  onChange={e => setFormData({...formData, academicYear: e.target.value})}
                  className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all" 
                  placeholder="2025-26" 
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Class Teacher (Optional)</label>
              <SearchableSelect 
                options={facultyList.map(f => ({
                  value: f._id,
                  label: f.name,
                  subLabel: f.employeeId
                }))}
                value={formData.classTeacherId || ''}
                onChange={val => setFormData({...formData, classTeacherId: val})}
                placeholder="Select Faculty"
              />
            </div>
            <div className="flex justify-end gap-3 pt-6 border-t border-muted/30">
              <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleEditSubmit} loading={submitting}>Update Group</Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmModal
        isOpen={showActivate}
        onClose={() => setShowActivate(false)}
        onConfirm={handleActivateConfirm}
        title="Reactivate Academic Group"
        description={`Are you sure you want to reactivate ${selectedClass?.name}? This will restore its visibility and accessibility for students and faculty.`}
        confirmText="Reactivate Group"
        isDestructive={false}
        loading={submitting}
      />

      <ConfirmModal
        isOpen={showDelete}

        onClose={() => setShowDelete(false)}
        onConfirm={handleDeleteConfirm}
        title="Deactivate Academic Group"
        description={`Are you sure you want to deactivate ${selectedClass?.name}? This action might prevent structural integrity if students are actively mapped to this group.`}
        confirmText="Deactivate Group"
        isDestructive={true}
        loading={submitting}
      />

      {promoteClassId && (
        <PromoteStudentsModal
          isOpen={Boolean(promoteClassId)}
          onClose={() => setPromoteClassId(null)}
          classId={promoteClassId}
          onSuccess={() => {
            fetchClasses({ departmentId: deptId, page, limit, includeInactive });
            setPromoteClassId(null);
          }}
        />
      )}

      {showCohortPromote && (
        <BulkPromoteCohortModal
          isOpen={showCohortPromote}
          onClose={() => setShowCohortPromote(false)}
          departmentId={activeDeptId}
          initialSemester={cohortPromoteSem}
          onSuccess={() => {
            fetchClasses({ departmentId: deptId, page, limit, includeInactive });
            setShowCohortPromote(false);
          }}
        />
      )}

      {showDepartmentRollover && (
        <DepartmentRolloverModal
          isOpen={showDepartmentRollover}
          onClose={() => setShowDepartmentRollover(false)}
          departmentId={activeDeptId}
          departmentName={classes[0]?.departmentName || 'Department'}
          onSuccess={() => {
            fetchClasses({ departmentId: deptId, page, limit, includeInactive });
            setShowDepartmentRollover(false);
          }}
        />
      )}
    </PageWrapper>
  );
};

export default DepartmentClasses;
