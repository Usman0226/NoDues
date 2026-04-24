import React, { useState,useEffect,useMemo } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Plus, Upload, Mail, UserPlus, RefreshCw, AlertCircle, Edit, Trash2, Eye } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { getFaculty, createFaculty, updateFaculty, deleteFaculty, getFacultyClasses, resendCredentials, bulkDeactivateFaculty, bulkResendCredentials, bulkUpdateRoles } from '../../api/faculty';
import { getDepartments } from '../../api/departments';
import ImportStepper from '../../components/import/ImportStepper';
import ActionMenu from '../../components/ui/ActionMenu';
import ConfirmModal from '../../components/ui/ConfirmModal';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { useAuth } from '../../hooks/useAuth';
import { toast } from 'react-hot-toast';
import Spinner from '../../components/ui/Spinner';

const ROLE_TAG_COLORS = {
  faculty: 'bg-navy/5 text-navy/70',
  classTeacher: 'bg-amber-50 text-amber-700',
  mentor: 'bg-emerald-50 text-emerald-700',
  hod: 'bg-blue-50 text-blue-700',
};

const FacultyList = () => {
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedFaculty, setSelectedFaculty] = useState(null);
  const [facultyClasses, setFacultyClasses] = useState([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showBulkRoleModal, setShowBulkRoleModal] = useState(false);
  const [bulkRoleData, setBulkRoleData] = useState({ targetRole: 'mentor', action: 'add' });
  
  // Pagination & Search State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const { user } = useAuth();
  const isHod = user?.role === 'hod';

  const facultyQueryKey = useMemo(() => 
    ['faculty', { page, limit, includeInactive, search: debouncedSearch }],
    [page, limit, includeInactive, debouncedSearch]
  );

  const { data: response, loading, error, request: fetchFaculty } = useApi(getFaculty, {
    queryKey: facultyQueryKey,
    immediate: false
  });
  const faculty = useMemo(() => response?.data || [], [response?.data]);
  const total = response?.pagination?.total || 0;
  
  const deptQueryKey = useMemo(() => ['departments'], []);

  const { data: deptResponse } = useApi(getDepartments, { 
    immediate: true,
    queryKey: deptQueryKey
  });
  const allDepts = useMemo(() => deptResponse?.data || [], [deptResponse?.data]);
  const depts = useMemo(() => isHod ? allDepts.filter(d => d._id === user.departmentId) : allDepts, [isHod, allDepts, user?.departmentId]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchValue);
      setPage(1); // Reset to first page on new search
    }, 500);
    return () => clearTimeout(timer);
  }, [searchValue]);

  useEffect(() => {
    const params = { page, limit, includeInactive, search: debouncedSearch };
    fetchFaculty(params);
  }, [fetchFaculty, page, limit, includeInactive, debouncedSearch]);

  const [formData, setFormData] = useState({
    name: '',
    employeeId: '',
    email: '',
    departmentId: '',
    roleTags: ['faculty']
  });

  useEffect(() => {
    if (showCreate && isHod) {
      setFormData(prev => ({ ...prev, departmentId: user.departmentId }));
    }
  }, [showCreate, isHod, user?.departmentId]);


  const handleCreate = async () => {
    if (!formData.name || !formData.employeeId || !formData.email || !formData.departmentId) {
      return toast.error('Please fill all required fields');
    }
    setSubmitting(true);
    try {
      await createFaculty(formData);
      toast.success('Faculty account provisioned successfully');
      setShowCreate(false);
      fetchFaculty();
    } catch (err) {
      toast.error(err?.message || 'Failed to create faculty');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClick = (faculty) => {
    setSelectedFaculty(faculty);
    setFormData({
      name: faculty.name,
      employeeId: faculty.employeeId,
      email: faculty.email,
      departmentId: faculty.departmentId || faculty.department?._id || '',
      roleTags: faculty.roleTags || faculty.roles || ['faculty']
    });
    setShowEdit(true);
  };

  const handleEditSubmit = async () => {
    if (!formData.name || !formData.employeeId || !formData.email || !formData.departmentId) {
      return toast.error('Please fill all required fields');
    }
    setSubmitting(true);
    try {
      await updateFaculty(selectedFaculty._id, formData);
      toast.success('Faculty updated successfully');
      setShowEdit(false);
      fetchFaculty();
    } catch (err) {
      toast.error(err?.message || 'Failed to update faculty');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = (faculty) => {
    setSelectedFaculty(faculty);
    setShowDelete(true);
  };

  const handleDeleteConfirm = async () => {
    setSubmitting(true);
    try {
      await deleteFaculty(selectedFaculty._id);
      toast.success('Faculty deactivated successfully');
      setShowDelete(false);
      fetchFaculty();
    } catch (err) {
      toast.error(err?.message || 'Failed to deactivate faculty');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewClasses = async (faculty) => {
    setSelectedFaculty(faculty);
    setShowDetails(true);
    setClassesLoading(true);
    try {
      const res = await getFacultyClasses(faculty._id);
      setFacultyClasses(res.data || []);
    } catch (err) {
      toast.error(err?.message || 'Failed to load classes');
    } finally {
      setClassesLoading(false);
    }
  };

  const toggleRole = (role) => {
    setFormData(prev => ({
      ...prev,
      roleTags: prev.roleTags.includes(role)
        ? prev.roleTags.filter(r => r !== role || r === 'faculty')
        : [...prev.roleTags, role]
    }));
  };

  const columns = [
    { key: 'employeeId', label: 'Emp ID', width: '90px', render: (v) => <span className="font-mono text-xs font-black tracking-tight text-navy">{v}</span> },
    { key: 'name', label: 'Name', render: (v) => <span className="font-bold text-navy/80">{v}</span> },
    { key: 'email', label: 'Email', width: '220px', render: (v) => <span className="text-muted-foreground/60">{v}</span> },
    { key: 'departmentName', label: 'Dept', width: '100px' },
    {
      key: 'roles', label: 'Roles', width: '180px', sortable: false, render: (tags, row) => (
        <div className="flex flex-wrap gap-1.5">
          {(tags || row.roleTags || ['faculty']).map((tag) => (
            <span key={tag} className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${ROLE_TAG_COLORS[tag] || ROLE_TAG_COLORS.faculty}`}>
              {tag === 'classTeacher' ? 'Co-ordinator' : tag === 'hod' ? 'HoD' : tag}
            </span>
          ))}
        </div>
      )
    },
    {
      key: 'actions', label: '', width: '50px', sortable: false, align: 'right', render: (_, row) => (
        <div className="flex justify-end">
          <ActionMenu
            actions={[
              { label: 'View Classes', icon: Eye, onClick: () => handleViewClasses(row) },
              { label: 'Edit Account', icon: Edit, onClick: () => handleEditClick(row) },
              { label: 'Resend Login', icon: Mail, onClick: () => handleResendCreds(row) },
              { label: 'Deactivate', icon: Trash2, onClick: () => handleDeleteClick(row), variant: 'danger' },
            ]}
          />
        </div>
      )
    }
  ];

  const handleResendCreds = async (faculty) => {
    const toastId = toast.loading('Regenerating credentials...');
    try {
      await resendCredentials(faculty._id);
      toast.success('Credentials regenerated & email dispatched!', { id: toastId });
    } catch (err) {
      toast.error(err?.message || 'Failed to resend credentials', { id: toastId });
    }
  };

  const handleBulkResendCreds = async () => {
    const toastId = toast.loading(`Regenerating credentials for ${selectedIds.length} faculty members...`);
    try {
      await bulkResendCredentials(selectedIds);
      toast.success('Batch regeneration complete! Emails dispatched.', { id: toastId });
      setSelectedIds([]);
    } catch (err) {
      toast.error(err?.message || 'Failed to resend credentials', { id: toastId });
    }
  };

  const handleBulkDeactivateConfirm = async () => {
    setSubmitting(true);
    try {
      await bulkDeactivateFaculty(selectedIds);
      toast.success(`${selectedIds.length} faculty accounts deactivated`);
      setShowBulkDelete(false);
      setSelectedIds([]);
      fetchFaculty();
    } catch (err) {
      toast.error(err?.message || 'Failed to deactivate accounts');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkRoleUpdate = async () => {
    setSubmitting(true);
    const toastId = toast.loading('Updating academic roles...');
    try {
      await bulkUpdateRoles(selectedIds, bulkRoleData.targetRole, bulkRoleData.action);
      toast.success('Batch update complete! HoD accounts were protected.', { id: toastId });
      setShowBulkRoleModal(false);
      setSelectedIds([]);
      fetchFaculty();
    } catch (err) {
      toast.error(err?.message || 'Bulk update failed', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageWrapper title="Faculty" subtitle="Manage faculty members and roles">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" size="sm" onClick={() => {
            setFormData({ name: '', employeeId: '', email: '', departmentId: isHod ? user.departmentId : '', roleTags: ['faculty'] });
            setSelectedFaculty(null);
            setShowCreate(true);
          }}><Plus size={14} /> Add Faculty</Button>
          <Button variant="ghost" size="sm" onClick={() => setShowImport(true)} className="text-navy border border-muted hover:bg-offwhite"><Upload size={14} /> Import List</Button>
        </div>

        <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-full border border-muted shadow-sm group hover:border-indigo-200 transition-all cursor-pointer select-none"
             onClick={() => setIncludeInactive(!includeInactive)}>
           <div className={`w-8 h-4 rounded-full relative transition-colors ${includeInactive ? 'bg-navy' : 'bg-zinc-200'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${includeInactive ? 'left-4.5' : 'left-0.5'}`} />
           </div>
           <span className="text-[10px] font-black uppercase tracking-widest text-navy/60 group-hover:text-navy transition-colors">Show Archived</span>
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
          data={faculty || []}
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
          searchPlaceholder="Search staff by name or ID..."
          selectable
          selection={selectedIds}
          onSelectionChange={setSelectedIds}
          bulkActions={[
            { 
              label: 'Manage Roles', 
              icon: UserPlus, 
              onClick: () => setShowBulkRoleModal(true) 
            },
            { 
              label: 'Resend Credentials', 
              icon: RefreshCw, 
              onClick: handleBulkResendCreds 
            },
            { 
              label: 'Archive Selected', 
              icon: Trash2, 
              onClick: () => setShowBulkDelete(true),
              variant: 'danger'
            }
          ]}
        />
      )}

      {showImport && (
        <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="Batch Faculty Import">
           <ImportStepper type="faculty" contextLabel="Staff Ledger Integration" onComplete={() => { setShowImport(false); fetchFaculty(); }} />
        </Modal>
      )}

      {showCreate && (
        <Modal isOpen={showCreate} title="Add Faculty Account" onClose={() => setShowCreate(false)}>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">Full Name</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all text-navy font-bold" 
                  placeholder="e.g. Dr. Jane Doe" 
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">Employee ID</label>
                <input 
                  type="text" 
                  value={formData.employeeId}
                  onChange={e => setFormData({...formData, employeeId: e.target.value})}
                  className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all font-mono" 
                  placeholder="EMP-000" 
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">Institutional Email</label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all" 
                  placeholder="name@mits.ac.in" 
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">Primary Department</label>
                <SearchableSelect 
                  options={depts?.map(d => ({
                    value: d._id,
                    label: d.name,
                    subLabel: d.school
                  }))}
                  value={formData.departmentId}
                  onChange={val => setFormData({...formData, departmentId: val})}
                  placeholder="Select Dept"
                  disabled={isHod}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-3">Academic Roles</label>
              <div className="flex flex-wrap gap-4 pt-1">
                {['faculty', 'classTeacher', 'mentor', 'hod'].map((role) => (
                  <label key={role} className="group flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={formData.roleTags.includes(role)}
                      onChange={() => toggleRole(role)}
                      className="w-4 h-4 rounded-lg border-muted text-navy focus:ring-navy/20 cursor-pointer" 
                    />
                    <span className="font-bold text-navy/70 group-hover:text-navy transition-colors">{role === 'classTeacher' ? 'Co-ordinator' : role === 'hod' ? 'HoD' : role.toUpperCase()}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 flex items-start gap-3">
              <Mail size={16} className="shrink-0 mt-0.5 text-blue-600" />
              <span className="text-xs text-blue-800 font-bold leading-relaxed">Credential provisioning instructions will be dispatched to the institutional inbox upon account creation.</span>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-muted/30">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreate} loading={submitting}>Generate Account</Button>
            </div>
          </div>
        </Modal>
      )}

      {showEdit && (
        <Modal isOpen={showEdit} title="Edit Faculty Profile" onClose={() => setShowEdit(false)}>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">Full Name</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all text-navy font-bold" 
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">Employee ID</label>
                <input 
                  type="text" 
                  value={formData.employeeId}
                  onChange={e => setFormData({...formData, employeeId: e.target.value})}
                  className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all font-mono" 
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">Institutional Email</label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all" 
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">Primary Department</label>
                <SearchableSelect 
                  options={depts?.map(d => ({
                    value: d._id,
                    label: d.name,
                    subLabel: d.school
                  }))}
                  value={formData.departmentId}
                  onChange={val => setFormData({...formData, departmentId: val})}
                  placeholder="Select Dept"
                  disabled={isHod}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-3">Academic Roles</label>
              <div className="flex flex-wrap gap-4 pt-1">
                {['faculty', 'classTeacher', 'mentor', 'hod'].map((role) => (
                  <label key={role} className="group flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={formData.roleTags.includes(role)}
                      onChange={() => toggleRole(role)}
                      className="w-4 h-4 rounded-lg border-muted text-navy focus:ring-navy/20 cursor-pointer" 
                    />
                    <span className="font-bold text-navy/70 group-hover:text-navy transition-colors">{role === 'classTeacher' ? 'Co-ordinator' : role === 'hod' ? 'HoD' : role.toUpperCase()}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-muted/30">
              <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleEditSubmit} loading={submitting}>Update Profile</Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmModal
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDeleteConfirm}
        title="Deactivate Faculty"
        description={`You are about to deactivate the account for ${selectedFaculty?.name}. This action will revoke their access to the system immediately.`}
        confirmText="Deactivate"
        isDestructive={true}
        loading={submitting}
      />

      <ConfirmModal
        isOpen={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={handleBulkDeactivateConfirm}
        title="Deactivate Multiple Faculty"
        description={`You are about to deactivate ${selectedIds.length} faculty accounts. This action will revoke their access to the system immediately.`}
        confirmText="Deactivate All"
        isDestructive={true}
        loading={submitting}
      />

      {showBulkRoleModal && (
        <Modal 
          isOpen={showBulkRoleModal} 
          onClose={() => !submitting && setShowBulkRoleModal(false)}
          title="Manage Academic Roles"
        >
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-3">
               <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
               <div className="space-y-1">
                 <p className="text-[10px] font-black uppercase tracking-tight text-amber-900">Safety Protection Active</p>
                 <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                   Accounts with the <strong>HoD</strong> role will be automatically excluded from this operation. 
                   Individual leadership assignments must be done via profile editing.
                 </p>
               </div>
            </div>

            <div className="space-y-4">
               <div>
                  <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2 ml-1">Select Target Role</label>
                  <SearchableSelect 
                    options={[
                      { value: 'faculty', label: 'FACULTY', subLabel: 'Base teaching role' },
                      { value: 'classTeacher', label: 'CO-ORDINATOR', subLabel: 'Batch management' },
                      { value: 'mentor', label: 'MENTOR', subLabel: 'Student counseling' }
                    ]}
                    value={bulkRoleData.targetRole}
                    onChange={(val) => setBulkRoleData({ ...bulkRoleData, targetRole: val })}
                  />
               </div>

               <div>
                  <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2 ml-1">Operation Type</label>
                  <div className="grid grid-cols-2 gap-3">
                     <button 
                       onClick={() => setBulkRoleData({ ...bulkRoleData, action: 'add' })}
                       className={`p-3 rounded-xl border text-background text-center transition-all ${bulkRoleData.action === 'add' ? 'bg-navy border-navy text-white shadow-lg shadow-navy/20' : 'bg-offwhite border-muted text-navy/40 hover:border-navy/20'}`}
                     >
                        <p className="text-[10px] font-black text-white uppercase tracking-widest">Assign to Selected</p>
                     </button>
                     <button 
                       onClick={() => setBulkRoleData({ ...bulkRoleData, action: 'remove' })}
                       className={`p-3 rounded-xl border text-center transition-all text-background ${bulkRoleData.action === 'remove' ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/20' : 'bg-offwhite border-muted text-navy/40 hover:border-red-600/20'}`}
                     >
                        <p className="text-[10px] font-black uppercase tracking-widest">Revoke from Selected</p>
                     </button>
                  </div>
               </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-muted/30">
              <Button variant="ghost" onClick={() => setShowBulkRoleModal(false)} disabled={submitting}>Cancel</Button>
              <Button 
                variant="primary" 
                onClick={handleBulkRoleUpdate} 
                loading={submitting}
                className="min-w-[120px]"
              >
                Execute Batch
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showDetails && (
        <Modal isOpen={showDetails} title="Assigned Classes" onClose={() => setShowDetails(false)}>
           <div className="space-y-4">
              <div className="flex items-center gap-3 mb-6 p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-extrabold flex items-center justify-center text-sm">
                  {selectedFaculty?.name?.charAt(0)}
                </div>
                <div>
                   <h4 className="font-bold text-zinc-900">{selectedFaculty?.name}</h4>
                   <p className="text-xs font-mono text-zinc-500">{selectedFaculty?.employeeId}</p>
                </div>
              </div>
              
              {classesLoading ? (
                 <div className="py-12"><Spinner size="lg" /></div>
              ) : facultyClasses.length === 0 ? (
                 <p className="text-sm font-semibold text-zinc-500 text-center py-6 block bg-white rounded-xl border border-zinc-100">No classes assigned to this faculty.</p>
              ) : (
                <div className="divide-y divide-zinc-100 border border-zinc-100 rounded-xl overflow-hidden bg-white max-h-96 overflow-y-auto">
                  {facultyClasses.map((cls, idx) => (
                     <div key={idx} className="p-4 hover:bg-zinc-50 transition-colors">
                        <div className="flex items-center justify-between">
                           <div>
                              <p className="text-sm font-bold text-zinc-900">{cls.name}</p>
                              <p className="text-xs font-semibold text-zinc-500">{cls.academicYear} • Sem {cls.semester}</p>
                           </div>
                           <div className="text-right">
                              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full">
                                {cls.isClassTeacher ? 'Class Teacher' : 'Subject Faculty'}
                              </span>
                           </div>
                        </div>
                        {!cls.isClassTeacher && cls.subjects && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {cls.subjects.map(sub => (
                               <span key={sub.subjectId} className="text-[9px] font-bold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-md border border-zinc-200">
                                 {sub.subjectName} ({sub.subjectCode})
                               </span>
                            ))}
                          </div>
                        )}
                     </div>
                  ))}
                </div>
              )}
              <div className="pt-4 flex justify-end">
                <Button variant="ghost" onClick={() => setShowDetails(false)}>Close</Button>
              </div>
           </div>
        </Modal>
      )}
    </PageWrapper>
  );
};

export default FacultyList;
