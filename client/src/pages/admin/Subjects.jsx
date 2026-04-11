import React, { useState, useMemo } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ActionMenu from '../../components/ui/ActionMenu';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { useApi } from '../../hooks/useApi';
import { getSubjects, createSubject, updateSubject, deleteSubject } from '../../api/subjects';
import { Plus, Filter, RefreshCw, AlertCircle, Edit, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

const Subjects = () => {
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [semesterFilter, setSemesterFilter] = useState('all');
  const [submitting, setSubmitting] = useState(false);

  const { data: response, loading, error, request: fetchSubjects } = useApi(getSubjects, { immediate: true });
  const subjects = response?.data || [];

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    semester: 1,
    isElective: false
  });


  const filtered = useMemo(() => {
    if (!subjects) return [];
    if (semesterFilter === 'all') return subjects;
    return subjects.filter((s) => s.semester === Number(semesterFilter));
  }, [subjects, semesterFilter]);

  const handleCreate = async () => {
    if (!formData.code || !formData.name) {
      return toast.error('Required fields missing');
    }
    setSubmitting(true);
    try {
      await createSubject(formData);
      toast.success('Subject registered with catalog');
      setShowCreate(false);
      fetchSubjects();
      setFormData({ code: '', name: '', semester: 1, isElective: false });
    } catch (err) {
      toast.error(err?.message || 'Failed to create subject');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClick = (subject) => {
    setSelectedSubject(subject);
    setFormData({
      code: subject.code,
      name: subject.name,
      semester: subject.semester,
      isElective: subject.isElective
    });
    setShowEdit(true);
  };

  const handleEditSubmit = async () => {
    if (!formData.code || !formData.name) {
      return toast.error('Required fields missing');
    }
    setSubmitting(true);
    try {
      await updateSubject(selectedSubject._id, formData);
      toast.success('Subject updated successfully');
      setShowEdit(false);
      fetchSubjects();
    } catch (err) {
      toast.error(err?.message || 'Failed to update subject');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = (subject) => {
    setSelectedSubject(subject);
    setShowDelete(true);
  };

  const handleDeleteConfirm = async () => {
    setSubmitting(true);
    try {
      await deleteSubject(selectedSubject._id);
      toast.success('Subject deactivated successfully');
      setShowDelete(false);
      fetchSubjects();
    } catch (err) {
      toast.error(err?.message || 'Failed to deactivate subject');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { key: 'code', label: 'Identity', render: (v) => <span className="font-mono text-[10px] font-black uppercase text-navy bg-offwhite px-2 py-0.5 rounded border border-muted/50">{v}</span> },
    { key: 'name', label: 'Component Name', render: (v) => <span className="font-bold text-navy/80">{v}</span> },
    { key: 'semester', label: 'Standard Sem', render: (v) => <span className="font-bold text-muted-foreground/60">{v}</span> },
    {
      key: 'isElective', label: 'Category', render: (v) => (
        <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${v ? 'bg-amber-50 text-amber-700' : 'bg-navy/5 text-navy/70'}`}>
          {v ? 'Elective' : 'Core'}
        </span>
      )
    },
    {
      key: 'actions', label: '', sortable: false, render: (_, row) => (
        <div className="flex justify-end">
          <ActionMenu
            actions={[
              { label: 'Edit Subject', icon: Edit, onClick: () => handleEditClick(row) },
              { label: 'Deactivate', icon: Trash2, onClick: () => handleDeleteClick(row), variant: 'danger' },
            ]}
          />
        </div>
      )
    }
  ];

  return (
    <PageWrapper title="Subjects" subtitle="Centralized academic component catalog for institution-wide mapping">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={() => {
            setFormData({ code: '', name: '', semester: 1, isElective: false });
            setShowCreate(true);
          }} className="gap-2">
            <Plus size={14} /> Register Subject
          </Button>
          <div className="flex items-center gap-3 bg-white border border-muted/40 p-1 rounded-xl shadow-sm">
             <Filter size={12} className="ml-2 text-muted-foreground" />
             <select 
                value={semesterFilter} 
                onChange={(e) => setSemesterFilter(e.target.value)}
                className="pr-8 pl-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-navy bg-transparent border-none focus:ring-0 cursor-pointer"
             >
               <option value="all">All Sessions</option>
               {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>Semester {s}</option>)}
             </select>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => fetchSubjects()} className="text-muted-foreground">
          <RefreshCw size={14} /> Reload
        </Button>
      </div>

      {error ? (
        <div className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm">
           <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
           <p className="text-muted-foreground font-medium">{error}</p>
        </div>
      ) : (
        <Table
          columns={columns}
          data={filtered}
          loading={loading && !response}
          searchable
          searchPlaceholder="Filter by code or identifier..."
        />
      )}

      {showCreate && (
        <Modal isOpen={showCreate} title="Register New Component" onClose={() => setShowCreate(false)}>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Internal Code</label>
                <input 
                  type="text" 
                  value={formData.code}
                  onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})}
                  className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all font-mono" 
                  placeholder="CODE-XYZ" 
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Academic Semester</label>
                <select 
                  value={formData.semester}
                  onChange={e => setFormData({...formData, semester: Number(e.target.value)})}
                  className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Subject Title</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all font-bold" 
                placeholder="Full Component Name" 
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-3">Classification</label>
              <div className="flex gap-6">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="radio" 
                    checked={!formData.isElective} 
                    onChange={() => setFormData({...formData, isElective: false})}
                    className="w-4 h-4 text-navy focus:ring-navy/10 border-muted"
                  />
                  <span className="text-xs font-bold text-navy/70 group-hover:text-navy transition-colors">Core Mandatory</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="radio" 
                    checked={formData.isElective} 
                    onChange={() => setFormData({...formData, isElective: true})}
                    className="w-4 h-4 text-amber-600 focus:ring-amber-100 border-muted"
                  />
                  <span className="text-xs font-bold text-navy/70 group-hover:text-navy transition-colors">Elective Stream</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-muted/30">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Abort</Button>
              <Button variant="primary" onClick={handleCreate} loading={submitting}>Finalize Registration</Button>
            </div>
          </div>
        </Modal>
      )}

      {showEdit && (
        <Modal isOpen={showEdit} title="Edit Component Details" onClose={() => setShowEdit(false)}>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Internal Code</label>
                <input 
                  type="text" 
                  value={formData.code}
                  onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})}
                  className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all font-mono" 
                  placeholder="CODE-XYZ" 
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Academic Semester</label>
                <select 
                  value={formData.semester}
                  onChange={e => setFormData({...formData, semester: Number(e.target.value)})}
                  className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Subject Title</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all font-bold" 
                placeholder="Full Component Name" 
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-3">Classification</label>
              <div className="flex gap-6">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="radio" 
                    checked={!formData.isElective} 
                    onChange={() => setFormData({...formData, isElective: false})}
                    className="w-4 h-4 text-navy focus:ring-navy/10 border-muted"
                  />
                  <span className="text-xs font-bold text-navy/70 group-hover:text-navy transition-colors">Core Mandatory</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="radio" 
                    checked={formData.isElective} 
                    onChange={() => setFormData({...formData, isElective: true})}
                    className="w-4 h-4 text-amber-600 focus:ring-amber-100 border-muted"
                  />
                  <span className="text-xs font-bold text-navy/70 group-hover:text-navy transition-colors">Elective Stream</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-muted/30">
              <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleEditSubmit} loading={submitting}>Update Subject</Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmModal
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDeleteConfirm}
        title="Deactivate Subject"
        description={`Are you sure you want to deactivate ${selectedSubject?.name} (${selectedSubject?.code})? Active class mappings will be preserved but no new classes can map to it.`}
        confirmText="Deactivate Component"
        isDestructive={true}
        loading={submitting}
      />
    </PageWrapper>
  );
};

export default Subjects;
