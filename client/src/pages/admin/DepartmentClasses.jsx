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
    >
       {!isHod && (
          <BackHeader 
            title="Return to Departments" 
            fallback="/admin/departments" 
          />
       )}
       <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex flex-wrap gap-3">
            <Button variant="primary" size="sm" onClick={() => {
                setFormData({ name: '', semester: 1, academicYear: '2025-26', departmentId: deptId, classTeacherId: '' });
                setShowCreate(true);
            }}><Plus size={14} /> New Class</Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCohortPromoteSem(1);
                setShowCohortPromote(true);
              }}
              className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold gap-1.5"
            >
              <GraduationCap size={14} /> Bulk Promote Cohort
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDepartmentRollover(true)}
              className="border-purple-200 text-purple-700 hover:bg-purple-50 font-semibold gap-1.5"
            >
              <Layers size={14} /> Academic Rollover
            </Button>
            <Button variant="ghost" size="sm" onClick={() => fetchClasses({ departmentId: deptId, page, limit, includeInactive })} className="text-muted-foreground"><RefreshCw size={14} /> Reload</Button>
        </div>

        <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-full border border-muted shadow-sm group hover:border-indigo-200 transition-all cursor-pointer select-none"
             onClick={() => setIncludeInactive(!includeInactive)}>
           <div className={`w-8 h-4 rounded-full relative transition-colors ${includeInactive ? 'bg-navy' : 'bg-zinc-200'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${includeInactive ? 'left-4.5' : 'left-0.5'}`} />
           </div>
           <span className="text-[10px] font-black uppercase tracking-widest text-navy/60 group-hover:text-navy transition-colors">Show Inactivated</span>
        </div>
      </div>

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
            <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-muted/50 no-scrollbar">
              {sortedSemesters.map((sem) => {
                const semClasses = grouped[sem] || [];
                const opSecs = semClasses.filter((c) => !c.isMaster);
                const hasBatchActive = semClasses.some((c) => c.hasActiveBatch);
                const isSelected = Number(activeSemester) === sem;

                return (
                  <button
                    key={sem}
                    onClick={() => setActiveSemester(sem)}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2.5 shrink-0 select-none cursor-pointer ${
                      isSelected
                        ? 'bg-navy text-white shadow-md shadow-navy/20 scale-[1.02]'
                        : 'bg-white hover:bg-zinc-50 text-muted-foreground hover:text-navy border border-muted/60 shadow-xs'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      S{sem}
                    </div>
                    <span>Semester {sem}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500'
                      }`}
                    >
                      {opSecs.length} {opSecs.length === 1 ? 'Section' : 'Sections'}
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
              <div className="space-y-5">
                {/* Semester Header & Action Ribbon */}
                <div className="flex flex-wrap items-center justify-between gap-4 p-1">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-navy text-white flex items-center justify-center text-sm font-black shadow-lg shadow-navy/20">
                      S{activeSemester}
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-base font-black text-navy uppercase tracking-tight">
                          Semester {activeSemester} Academic Groups
                        </h3>
                        <span className="text-[10px] font-bold text-muted-foreground bg-zinc-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          AY {activeOperationalSections[0]?.academicYear || '2024-28'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {activeOperationalSections.length} Sections • {activeTotalStudents} Enrolled Students
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold text-[10px] tracking-wider uppercase gap-1.5 shadow-xs"
                      onClick={() => {
                        setCohortPromoteSem(Number(activeSemester));
                        setShowCohortPromote(true);
                      }}
                    >
                      <GraduationCap size={13} />
                      Promote Semester {activeSemester} ({activeOperationalSections.length} Sections)
                    </Button>
                  </div>
                </div>

                {/* Semester Master Curriculum Blueprint Banner */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-gradient-to-r from-indigo-50/90 via-white to-purple-50/40 rounded-2xl border border-indigo-100/90 shadow-xs">
                  <div className="flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center font-bold">
                      <BookOpen size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-navy uppercase tracking-wider">
                          Semester {activeSemester} Curriculum Master
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-widest bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                          Single Source of Truth
                        </span>
                        <span className="text-[10px] font-bold text-muted-foreground">
                          • {activeCohortSubjectCount} Subjects
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        All {activeOperationalSections.length} operational sections inherit this syllabus. Faculty are mapped per section.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      className="text-xs font-semibold gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                      onClick={() => handleOpenMasterCurriculum(Number(activeSemester))}
                    >
                      <BookOpen size={13} /> Manage Master Syllabus
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-xs font-semibold gap-1.5 text-muted-foreground hover:text-indigo-600"
                      onClick={() => handleSyncMaster(Number(activeSemester))}
                      disabled={syncingSem === Number(activeSemester)}
                    >
                      <RefreshCw size={13} className={syncingSem === Number(activeSemester) ? 'animate-spin' : ''} /> Sync All Sections
                    </Button>
                  </div>
                </div>

                {activeOperationalSections.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-border p-6 space-y-2">
                    <Users size={36} className="mx-auto text-muted-foreground/30" />
                    <p className="text-sm font-semibold text-foreground">No sections created in Semester {activeSemester} yet</p>
                    <p className="text-xs text-muted-foreground">Click &quot;+ New Class&quot; above to establish a section.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {activeOperationalSections.map((cls) => (
                        <motion.div key={cls._id} variants={itemVariants} layout>
                       <Link 
                        to={isHod ? `/hod/class/${cls._id}` : `/admin/class/${cls._id}`}
                        className="group block bg-white rounded-2xl border border-muted p-4 sm:p-6 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.08)] hover:border-indigo-200 transition-all duration-300 relative overflow-hidden"
                      >
                        {!cls.isActive && (
                          <div className="absolute top-0 right-0 px-3 py-1 bg-zinc-100 text-[8px] font-black uppercase tracking-widest text-zinc-400 rounded-bl-lg">
                            Inactive
                          </div>
                        )}
                        
                        <div className="flex justify-between items-start mb-6">
                          <div className="min-w-0">
                            <h4 className="font-black text-navy text-lg group-hover:text-gold transition-colors uppercase tracking-tight truncate">{cls.name}</h4>
                            <p className="text-[10px] font-bold text-navy uppercase tracking-widest flex items-center gap-2 mt-1 truncate">
                               CT: {cls.classTeacher?.name || 'Not Assigned'}
                            </p>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2 mt-1 truncate">
                               Batch: {cls.academicYear}
                            </p>
                            
                          </div>
                        </div>
                        
                        <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.preventDefault()}>
                             <button
                               onClick={(e) => {
                                 e.preventDefault();
                                 e.stopPropagation();
                                 setPromoteClassId(cls._id);
                               }}
                               title="Promote Class"
                               className="p-2 hover:bg-indigo-50 rounded-lg text-muted-foreground hover:text-indigo-600 transition-all border border-transparent hover:border-muted"
                             >
                               <GraduationCap size={14} />
                             </button>
                             <button onClick={(e) => handleEditClick(cls, e)} className="p-2 hover:bg-zinc-50 rounded-lg text-muted-foreground hover:text-navy transition-all border border-transparent hover:border-muted">
                               <Edit size={14} />
                             </button>
                             {cls.isActive === false ? (
                               <button onClick={(e) => handleActivateClick(cls, e)} className="p-2 hover:bg-emerald-50 rounded-lg text-muted-foreground hover:text-emerald-600 transition-all border border-transparent hover:border-muted">
                                 <RefreshCw size={14} />
                               </button>
                             ) : (
                               <button onClick={(e) => handleDeleteClick(cls, e)} className="p-2 hover:bg-status-due/10 rounded-lg text-muted-foreground hover:text-status-due transition-all border border-transparent hover:border-muted">
                                 <Trash2 size={14} />
                               </button>
                             )}
                          </div>
                        <div className="grid grid-cols-2 gap-3 mt-auto">
                          <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-100/50">
                            <p className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-tighter mb-1">Subjects</p>
                            <p className="text-sm font-black text-navy">{cls.subjectCount || 0}</p>
                          </div>
                          <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-100/50">
                            <p className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-tighter mb-1">Students</p>
                            <p className="text-sm font-black text-navy">{cls.studentCount || 0}</p>
                          </div>
                        </div>
                        
                        <div className="mt-4 pt-4 border-t border-muted/30 flex items-center justify-between">
                           <span className="text-[9px] font-black text-navy/40 uppercase tracking-widest group-hover:text-navy transition-colors">Academic Oversight</span>
                           <div className="flex items-center gap-1.5 text-navy font-black text-[10px] uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                             View Details <ArrowRight size={14} />
                           </div>
                        </div>
                      </Link>
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
