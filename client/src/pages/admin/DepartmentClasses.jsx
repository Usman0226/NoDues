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
import { ArrowLeft, Plus, BookOpen, Users, GraduationCap, Layers, ArrowRight, Copy, RefreshCw, AlertCircle, Edit, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

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
  
  // Fall back to user.departmentId for HoD accessing their own classes directly
  const deptId = urlDeptId || user?.departmentId;
  
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Notice we only pass departmentId to API if we have it logically, but actually 
  // backend handles HoD auto-scoping if departmentId is missing in the query
  const { data: response, loading, error, request: fetchClasses } = useApi(() => getClasses({ departmentId: deptId }), { immediate: true });
  const classes = response?.data || [];

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
    <PageWrapper title="Classes & Groups" subtitle="Academic structure and section oversight">
      {urlDeptId && (
        <Link to="/admin/departments" className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-navy mb-6 -mt-4 transition-colors">
          <ArrowLeft size={12} strokeWidth={3} /> Return to Directory
        </Link>
      )}

      <div className="flex items-center justify-between mb-8">
         <Button variant="primary" size="sm" onClick={() => {
            setFormData({ name: '', semester: 1, academicYear: '2025-26', departmentId: deptId });
            setShowCreate(true);
         }} className="gap-2">
           <Plus size={14} /> New Group
         </Button>
         <Button variant="ghost" size="sm" onClick={() => fetchClasses()} className="text-muted-foreground">
           <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Sync
         </Button>
      </div>

      <AnimatePresence mode="wait">
        {loading && !classes.length ? (
          <motion.div 
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="animate-pulse space-y-8"
          >
             <div className="h-20 bg-muted/5 rounded-xl border border-muted"></div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => <div key={i} className="h-40 bg-muted/5 rounded-xl border border-muted"></div>)}
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
             <p className="text-muted-foreground font-medium">{error}</p>
          </motion.div>
        ) : Object.keys(grouped).length === 0 ? (
          <motion.div 
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm border-dashed"
          >
             <GraduationCap className="mx-auto text-muted-foreground/20 mb-4" size={64} />
             <p className="text-muted-foreground font-medium">No active groups mapped for this department</p>
          </motion.div>
        ) : (
          <motion.div 
            key="content"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {Object.entries(grouped).sort(([a], [b]) => Number(b) - Number(a)).map(([sem, semesterClasses]) => (
              <div key={sem} className="mb-12">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-navy/40 mb-4 px-1">Curriculum Semester {sem}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {semesterClasses.map((cls) => (
                    <motion.div key={cls._id} variants={itemVariants} layout>
                      <Link to={urlDeptId ? `/admin/class/${cls._id}` : `/hod/class/${cls._id}`}
                        className="block bg-white rounded-xl border border-muted shadow-sm p-6 hover:shadow-lg hover:border-gold/30 transition-all duration-300 group relative overflow-hidden"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h4 className="text-base font-black text-navy group-hover:text-gold transition-colors">{cls.name}</h4>
                            <p className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest mt-1">Session {cls.academicYear} · {cls.classTeacher?.name || 'No CT'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                             {cls.hasActiveBatch && (
                               <span className="text-[8px] px-2.5 py-1 rounded-full bg-navy text-white font-black uppercase tracking-widest animate-pulse">Live Batch</span>
                             )}
                             <div className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.preventDefault()}>
                               <ActionMenu 
                                 actions={[
                                   { label: 'Edit Class', icon: Edit, onClick: () => handleEditClick(cls) },
                                   { label: 'Deactivate', icon: Trash2, onClick: () => handleDeleteClick(cls), variant: 'danger' }
                                 ]}
                               />
                             </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-center">
                          <div className="p-2.5 rounded-xl bg-offwhite border border-muted/30">
                            <p className="text-lg font-black text-navy leading-none mb-1">{cls.studentCount || 0}</p>
                            <p className="text-[8px] text-muted-foreground font-black uppercase tracking-widest">Candidates</p>
                          </div>
                          <div className="p-2.5 rounded-xl bg-offwhite border border-muted/30">
                            <p className="text-lg font-black text-navy leading-none mb-1">{cls.subjectCount || 0}</p>
                            <p className="text-[8px] text-muted-foreground font-black uppercase tracking-widest">Modules</p>
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
              <Button variant="primary" onClick={handleCreate} loading={submitting}>Establish Group</Button>
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
