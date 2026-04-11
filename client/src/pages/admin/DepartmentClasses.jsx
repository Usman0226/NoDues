import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { useApi } from '../../hooks/useApi';
import { getClasses, createClass } from '../../api/classes';
import { ArrowLeft, Plus, BookOpen, Users, GraduationCap, Layers, ArrowRight, Copy, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

const DepartmentClasses = () => {
  const { deptId } = useParams();
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data: response, loading, error, request: fetchClasses } = useApi(() => getClasses({ departmentId: deptId }), { immediate: true });
  const classes = response?.data || [];

  const [formData, setFormData] = useState({
    name: '',
    semester: 1,
    academicYear: '2025-26',
    department: deptId
  });

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses, deptId]);

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
    } catch (err) {
      toast.error(err?.message || 'Failed to create group');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !classes) {
    return (
      <PageWrapper title="Loading Groups..." subtitle="Fetching academic sections">
         <div className="animate-pulse space-y-8">
            <div className="h-20 bg-muted/5 rounded-xl border border-muted"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               {[1, 2, 3].map(i => <div key={i} className="h-40 bg-muted/5 rounded-2xl border border-muted"></div>)}
            </div>
         </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Classes & Groups" subtitle="Academic structure and section oversight">
      <Link to="/admin/departments" className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-navy mb-6 -mt-4 transition-colors">
        <ArrowLeft size={12} strokeWidth={3} /> Return to Directory
      </Link>

      <div className="flex items-center justify-between mb-8">
         <Button variant="primary" size="sm" onClick={() => setShowCreate(true)} className="gap-2">
           <Plus size={14} /> New Group
         </Button>
         <Button variant="ghost" size="sm" onClick={() => fetchClasses()} className="text-muted-foreground">
           <RefreshCw size={14} /> Sync
         </Button>
      </div>

      {error ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-muted shadow-sm">
           <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
           <p className="text-muted-foreground font-medium">{error}</p>
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-muted shadow-sm border-dashed">
           <GraduationCap className="mx-auto text-muted-foreground/20 mb-4" size={64} />
           <p className="text-muted-foreground font-medium">No active groups mapped for this department</p>
        </div>
      ) : (
        Object.entries(grouped).sort(([a], [b]) => Number(b) - Number(a)).map(([sem, classes]) => (
          <div key={sem} className="mb-12">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-navy/40 mb-4 px-1">Curriculum Semester {sem}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classes.map((cls) => (
                <Link key={cls._id} to={`/admin/class/${cls._id}`}
                  className="bg-white rounded-2xl border border-muted shadow-sm p-6 hover:shadow-md transition-academic group">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="text-base font-black text-navy group-hover:text-gold transition-colors">{cls.name}</h4>
                      <p className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest mt-1">Session {cls.academicYear} · {cls.classTeacherName || 'No CT'}</p>
                    </div>
                    {cls.activeBatchId && (
                      <span className="text-[8px] px-2.5 py-1 rounded-full bg-navy text-white font-black uppercase tracking-widest animate-pulse">Live Batch</span>
                    )}
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
                     <span className="text-[9px] font-black text-navy/40 uppercase tracking-widest">Open Analytics</span>
                     <ArrowRight size={14} className="text-muted-foreground group-hover:text-gold transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))
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
                className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all font-bold" 
                placeholder="e.g. CSE-A Sem 5" 
              />
            </div>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Semester</label>
                <select 
                   value={formData.semester}
                   onChange={e => setFormData({...formData, semester: Number(e.target.value)})}
                   className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all"
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
                  className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all" 
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
    </PageWrapper>
  );
};

export default DepartmentClasses;
