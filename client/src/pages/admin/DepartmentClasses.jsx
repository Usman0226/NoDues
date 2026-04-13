import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {motion, AnimatePresence } from 'framer-motion';
import PageWrapper from '../../components/layout/PageWrapper';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ActionMenu from '../../components/ui/ActionMenu';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { getClasses, createClass, updateClass, deleteClass } from '../../api/classes';
import { ArrowLeft, Plus, BookOpen, Users, GraduationCap, Layers, ArrowRight, Copy, RefreshCw, AlertCircle, Edit, Trash2, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { toast } from 'react-hot-toast';
import BackHeader from '../../components/ui/BackHeader';

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
  const isHod = user?.role === 'hod';
  
  // Fall back to user.departmentId for HoD accessing their own classes directly
  const deptId = urlDeptId || user?.departmentId;
  
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Pagination State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [includeInactive, setIncludeInactive] = useState(false);
  
  const { data: response, loading, error, request: fetchClasses } = useApi(getClasses);
  const classes = response?.data || [];
  const total = response?.total || 0;

  useEffect(() => {
    const params = { departmentId: deptId, page, limit, includeInactive };
    fetchClasses(params);
  }, [fetchClasses, deptId, page, limit, includeInactive]);

  const [formData, setFormData] = useState({
    name: '',
    semester: 1,
    academicYear: '2025-26',
    departmentId: deptId
  });

  // Re-sync form deptId if user context loads later
  useEffect(() => {
    if (deptId && formData.departmentId !== deptId) {
      setFormData(prev => ({ ...prev, departmentId: deptId }));
    }
  }, [deptId]);

  const grouped = useMemo(() => {
    if (!classes) return {};
    return classes.reduce((acc, cls) => {
      (acc[cls.semester] = acc[cls.semester] || []).push(cls);
      return acc;
    }, {});
  }, [classes]);

  const handleCreate = async () => {
    if (!formData.name || !formData.academicYear) return toast.error('Fields missing');
    setSubmitting(true);
    try {
      await createClass(formData);
      toast.success('New academic group established');
      setShowCreate(false);
      fetchClasses();
      setFormData({ name: '', semester: 1, academicYear: '2025-26', departmentId: deptId });
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
      departmentId: deptId
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
      fetchClasses();
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
      title="Academic Groups" 
      subtitle="Manage classes, semesters and department structure"
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
                setFormData({ name: '', semester: 1, academicYear: '2025-26', departmentId: deptId });
                setShowCreate(true);
            }}><Plus size={14} /> New Group</Button>
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
            className="space-y-12"
          >
            {Object.entries(grouped)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([sem, semClasses]) => (
              <div key={sem} className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-navy flex items-center justify-center text-xs font-black text-white shadow-lg shadow-navy/20">
                    S{sem}
                  </div>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-navy/40">Semester {sem} Groups</h3>
                  <div className="h-px flex-1 bg-gradient-to-r from-muted/50 to-transparent"></div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {semClasses.map((cls) => (
                    <motion.div key={cls._id} variants={itemVariants} layout>
                       <Link 
                        to={isHod ? `/hod/class/${cls._id}` : `/admin/class/${cls._id}`}
                        className="group block bg-white rounded-2xl border border-muted p-6 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.08)] hover:border-indigo-200 transition-all duration-300 relative overflow-hidden"
                      >
                        {!cls.isActive && (
                          <div className="absolute top-0 right-0 px-3 py-1 bg-zinc-100 text-[8px] font-black uppercase tracking-widest text-zinc-400 rounded-bl-lg">
                            Inactive
                          </div>
                        )}
                        
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <h4 className="font-black text-navy text-lg group-hover:text-gold transition-colors uppercase tracking-tight">{cls.name}</h4>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2 mt-1">
                               Batch: {cls.academicYear}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.preventDefault()}>
                             <button onClick={(e) => handleEditClick(cls, e)} className="p-2 hover:bg-zinc-50 rounded-lg text-muted-foreground hover:text-navy transition-all border border-transparent hover:border-muted">
                               <Edit size={14} />
                             </button>
                             <button onClick={(e) => handleDeleteClick(cls, e)} className="p-2 hover:bg-status-due/10 rounded-lg text-muted-foreground hover:text-status-due transition-all border border-transparent hover:border-muted">
                               <Trash2 size={14} />
                             </button>
                          </div>
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
                           <span className="text-[9px] font-black text-navy/40 uppercase tracking-widest group-hover:text-navy transition-colors">Open Analytics</span>
                           <ArrowRight size={14} className="text-muted-foreground group-hover:text-gold group-hover:translate-x-1 transition-all" />
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
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
                <select 
                   value={formData.semester}
                   onChange={e => setFormData({...formData, semester: Number(e.target.value)})}
                   className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
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
                <select 
                   value={formData.semester}
                   onChange={e => setFormData({...formData, semester: Number(e.target.value)})}
                   className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
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
            <div className="flex justify-end gap-3 pt-6 border-t border-muted/30">
              <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleEditSubmit} loading={submitting}>Update Group</Button>
            </div>
          </div>
        </Modal>
      )}

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
    </PageWrapper>
  );
};

export default DepartmentClasses;
