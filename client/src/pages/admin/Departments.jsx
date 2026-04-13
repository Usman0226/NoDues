import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import { Building2, Users, GraduationCap, BookOpen, Layers, ArrowRight, RefreshCw, AlertCircle, Plus, Edit2 } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { getDepartments, createDepartment, updateDepartment } from '../../api/departments';
import { getFaculty } from '../../api/faculty';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { toast } from 'react-hot-toast';

const Departments = () => {
  const { data: response, loading, error, request: fetchDepts } = useApi(getDepartments, { 
    immediate: true,
    queryKey: ['departments'] 
  });
  const depts = response?.data || [];
  
  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [facultyList, setFacultyList] = useState([]);

  const [formData, setFormData] = useState({
    name: '',
    hodId: ''
  });

  const { request: loadFaculty } = useApi(getFaculty);

  const openCreateModal = async () => {
    setEditingDept(null);
    setFormData({ name: '', hodId: '' });
    setShowModal(true);
    fetchFacultyList();
  };

  const openEditModal = (e, dept) => {
    e.preventDefault(); // Prevent navigating to /classes
    setEditingDept(dept);
    setFormData({ name: dept.name, hodId: dept.hod?._id || '' });
    setShowModal(true);
    fetchFacultyList();
  };

  const fetchFacultyList = async () => {
    try {
      const res = await loadFaculty({ limit: 1000 }); // get all faculty
      setFacultyList(res?.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const deptStats = useMemo(() => {
    const total = depts.length;
    const withHod = depts.filter((d) => d.hod?._id || d.hod?.name).length;
    const classes = depts.reduce((n, d) => n + (d.classCount || 0), 0);
    return { total, withHod, withoutHod: total - withHod, classes };
  }, [depts]);

  const handleSubmit = async () => {
    if (!formData.name) return toast.error('Department name is required');
    setSubmitting(true);
    try {
      if (editingDept) {
        await updateDepartment(editingDept._id, formData);
        toast.success('Department updated successfully');
      } else {
        await createDepartment(formData);
        toast.success('Department created successfully');
      }
      setShowModal(false);
      fetchDepts();
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !depts.length) {
    return (
      <PageWrapper title="Departments" subtitle="Fetching academic structure...">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-pulse">
           {[1, 2].map(i => <div key={i} className="h-64 bg-muted/5 rounded-xl border border-muted"></div>)}
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper title="Departments" subtitle="Sync interrupted">
        <div className="text-center py-16 bg-white rounded-xl border border-muted shadow-sm">
          <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
          <h2 className="text-xl font-black text-navy mb-2">Structure Unavailable</h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{error}</p>
          <Button variant="primary" onClick={() => fetchDepts()}>
             <RefreshCw size={14} className="mr-2" /> Retry
          </Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Departments" subtitle="Academic department structure and oversight management">
      {depts.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-6 text-[10px] font-black uppercase tracking-widest text-navy">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-muted shadow-sm">
            {deptStats.total} departments
          </span>
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-800">
            {deptStats.withHod} with HoD
          </span>
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-100 text-amber-900">
            {deptStats.withoutHod} unassigned
          </span>
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-offwhite border border-muted text-muted-foreground">
            {deptStats.classes} classes total
          </span>
          <span className="text-[11px] font-semibold normal-case tracking-normal text-muted-foreground">
            Assign HoD when creating or editing a department.
          </span>
        </div>
      )}

      <div className="flex justify-end gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => fetchDepts()} className="text-muted-foreground">
          <RefreshCw size={14} className="mr-2"/> Sync
        </Button>
        <Button variant="primary" size="sm" onClick={openCreateModal}>
          <Plus size={14} className="mr-2"/> New Department
        </Button>
      </div>

      {depts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-muted shadow-sm border-dashed">
           <Building2 className="mx-auto text-muted-foreground/20 mb-4" size={64} />
           <p className="text-muted-foreground font-medium">No departments found. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {(depts || []).map((dept) => (
            <Link key={dept._id} to={`/admin/departments/${dept._id}/classes`}
              className="bg-white rounded-xl border border-muted shadow-sm p-8 flex flex-col hover:shadow-md transition-academic group relative">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-xl bg-offwhite flex items-center justify-center group-hover:bg-navy/5 transition-colors">
                    <Building2 size={28} className="text-navy/70" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-navy group-hover:text-gold transition-colors">{dept.name}</h3>
                    <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mt-1">HOD: {dept.hod?.name || 'Not Assigned'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => openEditModal(e, dept)} className="text-muted-foreground hover:text-navy p-2 rounded-full hover:bg-muted/10 transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <ArrowRight size={20} className="text-muted-foreground group-hover:text-gold transition-all translate-x-0 group-hover:translate-x-1" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-auto border-t border-muted/30 pt-6">
                <div className="p-3.5 rounded-xl bg-offwhite/50 text-center border border-muted/30">
                  <BookOpen size={14} className="text-navy mx-auto mb-1.5 opacity-60" />
                  <p className="text-lg font-black text-navy">{dept.classCount || 0}</p>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Classes</p>
                </div>
                <div className="p-3.5 rounded-xl bg-offwhite/50 text-center border border-muted/30">
                  <Layers size={14} className={`mx-auto mb-1.5 ${dept.activeBatchCount > 0 ? 'text-gold' : 'text-muted-foreground opacity-40'}`} />
                  <p className="text-lg font-black text-navy">{dept.activeBatchCount || 0}</p>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Active Batches</p>
                </div>
                <div className="p-3.5 rounded-xl bg-offwhite/50 text-center border border-muted/30">
                  <GraduationCap size={14} className="text-navy mx-auto mb-1.5 opacity-60" />
                  <p className="text-lg font-black text-navy">{dept.studentCount || 0}</p>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Students</p>
                </div>
                <div className="p-3.5 rounded-xl bg-offwhite/50 text-center border border-muted/30">
                  <Users size={14} className="text-navy mx-auto mb-1.5 opacity-60" />
                  <p className="text-lg font-black text-navy">{dept.facultyCount || 0}</p>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Faculty</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} title={editingDept ? "Edit Department" : "New Department"} onClose={() => setShowModal(false)}>
        <div className="space-y-6">
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Department Name</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all font-bold uppercase" 
              placeholder="e.g. CSE" 
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Assign HoD (Optional)</label>
            <select 
              value={formData.hodId}
              onChange={e => setFormData({...formData, hodId: e.target.value})}
              className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all"
            >
              <option value="">-- No HoD Assigned --</option>
              {facultyList.map(f => (
                <option key={f._id} value={f._id}>{f.name} ({f.employeeId})</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-6 border-t border-muted/30">
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmit} loading={submitting}>
              {editingDept ? "Save Changes" : "Create Department"}
            </Button>
          </div>
        </div>
      </Modal>
    </PageWrapper>
  );
};

export default Departments;
