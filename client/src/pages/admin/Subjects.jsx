import React, { useState, useEffect } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ActionMenu from '../../components/ui/ActionMenu';
import ConfirmModal from '../../components/ui/ConfirmModal';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { useApi } from '../../hooks/useApi';
import { getSubjects, createSubject, updateSubject, deleteSubject, bulkDeleteSubjects, activateSubject, bulkActivateSubjects } from '../../api/subjects';
import { Plus, Upload, Filter, RefreshCw, AlertCircle, Edit, Trash2, CheckCircle } from 'lucide-react';
import ImportStepper from '../../components/import/ImportStepper';
import { useAuth } from '../../hooks/useAuth';
import { toast } from 'react-hot-toast';
import { useUI } from '../../hooks/useUI';

const Subjects = () => {
  const { showGlobalLoader } = useUI();
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showActivate, setShowActivate] = useState(false);
  // const [showBulkActivate, setShowBulkActivate] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [semesterFilter, setSemesterFilter] = useState('all');
  const [includeInactive, setIncludeInactive] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isHod = user?.role === 'hod' || user?.role === 'ao';
  const canManage = isAdmin || isHod;
  const [submitting, setSubmitting] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const { data: response, loading, error, request: fetchSubjects } = useApi(getSubjects);
  const subjects = React.useMemo(() => response?.data || [], [response?.data]);
  const total = response?.pagination?.total || 0;

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    semester: 1,
    isElective: false
  });


  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchValue);
      setPage(1); // Reset to first page
    }, 500);
    return () => clearTimeout(timer);
  }, [searchValue]);

  useEffect(() => {
    const params = { 
      page, 
      limit, 
      search: debouncedSearch,
      semester: semesterFilter === 'all' ? undefined : semesterFilter,
      includeInactive: includeInactive || undefined
    };
    fetchSubjects(params);
  }, [fetchSubjects, page, limit, debouncedSearch, semesterFilter, includeInactive]);

  const handleCreate = async () => {
    if (!formData.code || !formData.name) {
      return toast.error('Required fields missing');
    }
    setSubmitting(true);
    try {
      await createSubject(formData);
      toast.success('Subject registered with catalog');
      setShowCreate(false);
      fetchSubjects({ includeInactive });
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
      fetchSubjects({ includeInactive });
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

  const handleActivateClick = (subject) => {
    setSelectedSubject(subject);
    setShowActivate(true);
  };

  const handleActivateConfirm = async () => {
    setSubmitting(true);
    try {
      await activateSubject(selectedSubject._id);
      toast.success('Subject reactivated successfully');
      setShowActivate(false);
      fetchSubjects({ includeInactive });
    } catch (err) {
      toast.error(err?.message || 'Failed to reactivate subject');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setSubmitting(true);
    try {
      await deleteSubject(selectedSubject._id);
      toast.success('Subject deactivated successfully');
      setShowDelete(false);
      fetchSubjects({ includeInactive });
    } catch (err) {
      toast.error(err?.message || 'Failed to deactivate subject');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    setSubmitting(true);
    try {
      await bulkDeleteSubjects(selectedIds);
      toast.success(`${selectedIds.length} subjects deactivated`);
      setShowBulkDelete(false);
      setSelectedIds([]);
      fetchSubjects({ includeInactive });
    } catch (err) {
      toast.error(err?.message || 'Failed to deactivate subjects');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkActivateConfirm = async () => {
    setSubmitting(true);
    try {
      await bulkActivateSubjects(selectedIds);
      toast.success(`${selectedIds.length} subjects reactivated`);
      setShowBulkActivate(false);
      setSelectedIds([]);
      fetchSubjects({ includeInactive });
    } catch (err) {
      toast.error(err?.message || 'Failed to reactivate subjects');
    } finally {
      setSubmitting(false);
    }
  };


  const columns = React.useMemo(() => [
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
    ...(canManage ? [{
      key: 'actions', label: '', sortable: false, render: (_, row) => (
        <div className="flex justify-end">
          <ActionMenu
            actions={[
              { label: 'Edit Subject', icon: Edit, onClick: () => handleEditClick(row) },
              row.isActive === false 
                ? { label: 'Reactivate', icon: RefreshCw, onClick: () => handleActivateClick(row) }
                : { label: 'Deactivate', icon: Trash2, onClick: () => handleDeleteClick(row), variant: 'danger' },
            ]}
          />
        </div>
      )
    }] : [])
  ], [canManage]);

  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showBulkActivate, setShowBulkActivate] = useState(false);


  return (
    <PageWrapper title="Subjects" subtitle="Centralized academic component subject for institution-wide mapping">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex flex-wrap gap-3 items-center">
          {canManage && (
            <Button variant="primary" size="sm" onClick={() => {
              setFormData({ code: '', name: '', semester: 1, isElective: false });
              setShowCreate(true);
            }} className="gap-2">
              <Plus size={14} /> Add Subject
            </Button>
          )}
          {canManage && (
            <Button variant="ghost" size="sm" onClick={() => setShowImport(true)} className="text-navy border border-muted hover:bg-offwhite gap-2">
              <Upload size={14} /> Import list
            </Button>
          )}
          <div className="w-[180px]">
             <SearchableSelect 
                options={[
                  { value: 'all', label: 'All Sessions' },
                  ...[1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({ value: s, label: `Semester ${s}` }))
                ]}
                value={semesterFilter} 
                onChange={(val) => {
                  setSemesterFilter(val);
                  setPage(1);
                }}
                placeholder="Filter by Session"
             />
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-full border border-muted shadow-sm group hover:border-indigo-200 transition-all cursor-pointer select-none"
             onClick={() => setIncludeInactive(!includeInactive)}>
           <div className={`w-8 h-4 rounded-full relative transition-colors ${includeInactive ? 'bg-navy' : 'bg-zinc-200'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${includeInactive ? 'left-4.5' : 'left-0.5'}`} />
           </div>
           <span className="text-[10px] font-black uppercase tracking-widest text-navy/60 group-hover:text-navy transition-colors">Show Inactivated</span>
           <div className="w-px h-4 bg-muted/50 mx-1" />
           <Button 
              variant="ghost" 
              size="sm" 
              onClick={async (e) => {
                e.stopPropagation();
                const hide = showGlobalLoader('Refreshing Subject Catalog...');
                await fetchSubjects({ includeInactive });
                hide();
              }} 
              className="text-muted-foreground hover:text-navy p-0 h-auto"
            >
              <RefreshCw size={14} className="mr-2" /> Reload
            </Button>
        </div>
      </div>


      {error ? (
        <div className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm">
           <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
           <p className="text-muted-foreground font-medium">{error}</p>
        </div>
      ) : (
        <Table
          columns={columns}
          data={subjects}
          loading={loading}
          pagination={{
            total,
            page,
            limit,
            onPageChange: (p) => setPage(p),
            onLimitChange: (l) => { setLimit(l); setPage(1); }
          }}
          searchable
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          searchPlaceholder="Filter by code or identifier..."
          selectable
          selection={selectedIds}
          onSelectionChange={setSelectedIds}
          bulkActions={[
            ...(includeInactive ? [
              { 
                label: 'Reactivate Selected', 
                icon: RefreshCw, 
                onClick: () => setShowBulkActivate(true),
                variant: 'primary'
              }
            ] : [
              { 
                label: 'Delete Subjects', 
                icon: Trash2, 
                onClick: () => setShowBulkDelete(true),
                variant: 'danger'
              }
            ])
          ]}
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
                <SearchableSelect 
                  options={[1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({
                    value: s,
                    label: `Semester ${s}`
                  }))}
                  value={formData.semester}
                  onChange={val => setFormData({...formData, semester: Number(val)})}
                  placeholder="Select Sem"
                />
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
                <SearchableSelect 
                  options={[1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({
                    value: s,
                    label: `Semester ${s}`
                  }))}
                  value={formData.semester}
                  onChange={val => setFormData({...formData, semester: Number(val)})}
                  placeholder="Select Sem"
                />
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
        isOpen={showActivate}
        onClose={() => setShowActivate(false)}
        onConfirm={handleActivateConfirm}
        title="Reactivate Subject"
        description={`Are you sure you want to reactivate ${selectedSubject?.name}? This will restore its visibility in the academic catalog.`}
        confirmText="Reactivate"
        isDestructive={false}
        loading={submitting}
      />

      <ConfirmModal
        isOpen={showBulkActivate}
        onClose={() => setShowBulkActivate(false)}
        onConfirm={handleBulkActivateConfirm}
        title="Reactivate Multiple Subjects"
        description={`You are about to reactivate ${selectedIds.length} subjects. This will make them available for assignments again.`}
        confirmText="Reactivate All"
        isDestructive={false}
        loading={submitting}
      />

      <ConfirmModal
        isOpen={showDelete}

        onClose={() => setShowDelete(false)}
        onConfirm={handleDeleteConfirm}
        title="Deactivate Subject"
        description={`Are you sure you want to deactivate ${selectedSubject?.name}? This will prevent further assignments and mark it as archived.`}
        confirmText="Deactivate"
        isDestructive={true}
        loading={submitting}
      />

      <ConfirmModal
        isOpen={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={handleBulkDeleteConfirm}
        title="Deactivate Multiple Subjects"
        description={`You are about to deactivate ${selectedIds.length} subjects. This will prevent them from being assigned to new classes.`}
        confirmText="Deactivate All"
        isDestructive={true}
        loading={submitting}
      />

      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="Bulk Subject Import">
         <ImportStepper 
            type="subjects" 
            contextLabel="Academic Component Catalog Sync" 
            onComplete={() => {
              setShowImport(false);
              fetchSubjects();
            }} 
         />
      </Modal>
    </PageWrapper>
  );
};

export default Subjects;