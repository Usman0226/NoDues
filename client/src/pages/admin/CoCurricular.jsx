import React, { useState, useEffect } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ActionMenu from '../../components/ui/ActionMenu';
import ConfirmModal from '../../components/ui/ConfirmModal';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { useApi } from '../../hooks/useApi';
import { 
  getCoCurricularTypes, 
  createCoCurricularType, 
  updateCoCurricularType, 
  deleteCoCurricularType,
  assignCoCurricularToMentors,
} from '../../api/coCurricular';
import { getFaculty } from '../../api/faculty';
import { getDepartments } from '../../api/departments';
import { Plus, Edit, Trash2, AlertCircle, RefreshCw, X, GripVertical, Users } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { toast } from 'react-hot-toast';
import { useUI } from '../../hooks/useUI';

const CoCurricular = () => {
  const { showGlobalLoader: _showGlobalLoader } = useUI();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isHod = user?.role === 'hod' || user?.role === 'ao';
  const canManage = isAdmin || isHod;

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showAssignMentors, setShowAssignMentors] = useState(false);
  const [assignMentorsResult, setAssignMentorsResult] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [assigningMentors, setAssigningMentors] = useState(false);
  const [assignMode, setAssignMode] = useState('per_mentor'); // 'per_mentor' | 'single_faculty'
  const [assignFacultyId, setAssignFacultyId] = useState('');
  
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const { data: response, loading, error, request: fetchItems } = useApi(getCoCurricularTypes);
  const { data: facultyResponse, request: fetchFaculty } = useApi(getFaculty);
  const { data: deptResponse, request: fetchDepts } = useApi(getDepartments);
  
  const items = React.useMemo(() => response?.data || [], [response?.data]);
  const total = response?.pagination?.total || 0;
  
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    departmentId: '',
    applicableYears: [1, 2, 3, 4],
    isOptional: false,
    requiresMentorApproval: false,
    requiresClassTeacherApproval: false,
    coordinatorId: '',
    fields: []
  });

  const departments = React.useMemo(() => deptResponse?.data || [], [deptResponse?.data]);

  const facultyOptions = React.useMemo(() => {
    const list = facultyResponse?.data || [];
    const deptId = isAdmin ? formData.departmentId : user?.departmentId;
    
    return list
      .filter(f => !deptId || f.departmentId?._id === deptId || f.departmentId === deptId)
      .map(f => ({
        value: f._id,
        label: `${f.name} (${f.employeeId || 'N/A'})`
      }));
  }, [facultyResponse?.data, formData.departmentId, user?.departmentId, isAdmin]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchValue);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchValue]);

  useEffect(() => {
    fetchItems({ page, limit, search: debouncedSearch });
  }, [fetchItems, page, limit, debouncedSearch]);

  useEffect(() => {
    fetchFaculty({ limit: 1000, isActive: true });
    if (isAdmin) fetchDepts();
  }, [fetchFaculty, fetchDepts, isAdmin]);

  const handleAddField = () => {
    setFormData({
      ...formData,
      fields: [...formData.fields, { label: '', type: 'text', required: true }]
    });
  };

  const handleRemoveField = (index) => {
    const newFields = [...formData.fields];
    newFields.splice(index, 1);
    setFormData({ ...formData, fields: newFields });
  };

  const handleFieldChange = (index, field, value) => {
    const newFields = [...formData.fields];
    newFields[index][field] = value;
    setFormData({ ...formData, fields: newFields });
  };

  const validateForm = () => {
    if (!formData.name || !formData.code || (!isAdmin && !user?.departmentId) || (isAdmin && !formData.departmentId)) {
      toast.error('Basic details and department are required');
      return false;
    }
    if (!formData.requiresMentorApproval && !formData.requiresClassTeacherApproval && !formData.coordinatorId) {
      toast.error('Please select a Designated Coordinator');
      return false;
    }
    if (formData.fields.length > 0 && formData.fields.some(f => !f.label)) {
      toast.error('All form fields must have a label');
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      // Map labels to keys for the backend
      const payload = {
        ...formData,
        departmentId: isAdmin ? formData.departmentId : user?.departmentId,
        fields: formData.fields.map(f => ({
          ...f,
          key: f.label.toLowerCase().replace(/[^a-z0-9]/g, '_')
        }))
      };
      await createCoCurricularType(payload);
      toast.success('Co-Curricular item created');
      setShowCreate(false);
      fetchItems();
      resetForm();
    } catch (err) {
      toast.error(err?.message || 'Failed to create item');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClick = (item) => {
    setSelectedItem(item);
    setFormData({
      name: item.name,
      code: item.code,
      departmentId: item.departmentId?._id || item.departmentId,
      applicableYears: item.applicableYears,
      isOptional: item.isOptional,
      requiresMentorApproval: item.requiresMentorApproval || false,
      requiresClassTeacherApproval: item.requiresClassTeacherApproval || false,
      coordinatorId: item.coordinatorId?._id || item.coordinatorId,
      fields: item.fields.map(f => ({
        label: f.label,
        type: f.type,
        required: f.required
      }))
    });
    setShowEdit(true);
  };

  const handleAssignMentorsClick = (item) => {
    setSelectedItem(item);
    setAssignMentorsResult(null);
    // Set default mode based on template settings
    if (item.requiresClassTeacherApproval) {
      setAssignMode('per_class_teacher');
    } else if (item.requiresMentorApproval) {
      setAssignMode('per_mentor');
    } else {
      setAssignMode('single_faculty');
    }
    setAssignFacultyId('');
    setShowAssignMentors(true);
  };

  const handleAssignMentorsConfirm = async () => {
    if (!selectedItem) return;
    if (assignMode === 'single_faculty' && !assignFacultyId) {
      toast.error('Please select a faculty coordinator');
      return;
    }
    
    setAssigningMentors(true);
    try {
      const payload = {
        mode: assignMode,
        ...(assignMode === 'single_faculty' ? { facultyId: assignFacultyId } : {})
      };
      const res = await assignCoCurricularToMentors(selectedItem._id, payload);
      setAssignMentorsResult(res?.data?.data || res?.data || null);
      toast.success('Clearance approvals assigned successfully');
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to assign mentors';
      toast.error(msg);
      setShowAssignMentors(false);
    } finally {
      setAssigningMentors(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        fields: formData.fields.map(f => ({
          ...f,
          key: f.label.toLowerCase().replace(/[^a-z0-9]/g, '_')
        }))
      };
      await updateCoCurricularType(selectedItem._id, payload);
      toast.success('Co-Curricular item updated');
      setShowEdit(false);
      fetchItems();
    } catch (err) {
      toast.error(err?.message || 'Failed to update item');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setSubmitting(true);
    try {
      await deleteCoCurricularType(selectedItem._id);
      toast.success('Item removed successfully');
      setShowDelete(false);
      fetchItems();
    } catch (err) {
      toast.error(err?.message || 'Failed to remove item');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      departmentId: '',
      applicableYears: [1, 2, 3, 4],
      isOptional: false,
      requiresMentorApproval: false,
      requiresClassTeacherApproval: false,
      coordinatorId: '',
      fields: []
    });
  };

  const columns = [
    { key: 'code', label: 'Item Code', render: (v) => <span className="font-mono text-[10px] font-black uppercase text-navy bg-offwhite px-2 py-0.5 rounded border border-muted/50">{v}</span> },
    { key: 'name', label: 'Item Name', render: (v) => <span className="font-bold text-navy/80">{v}</span> },
    { 
      key: 'applicableYears', 
      label: 'Years', 
      render: (v) => (
        <div className="flex gap-1">
          {v.map(y => (
            <span key={y} className="text-[9px] bg-navy/5 text-navy/60 px-1.5 py-0.5 rounded font-black">Y{y}</span>
          ))}
        </div>
      )
    },
    {
      key: 'coordinator',
      label: 'Coordinator',
      render: (_, row) => {
        if (row.requiresMentorApproval) {
          return (
            <span className="text-[10px] font-black uppercase text-navy bg-navy/5 px-2 py-0.5 rounded border border-navy/10 flex items-center gap-1 w-fit">
              <Users size={10} /> Student's Mentor
            </span>
          );
        }
        if (row.requiresClassTeacherApproval) {
          return (
            <span className="text-[10px] font-black uppercase text-navy bg-navy/5 px-2 py-0.5 rounded border border-navy/10 flex items-center gap-1 w-fit">
              <Users size={10} /> Class Teacher
            </span>
          );
        }
        return <span className="text-xs font-medium text-muted-foreground">{row.coordinatorId?.name || row.coordinatorName || 'Unassigned'}</span>;
      }
    },
    {
      key: 'isOptional',
      label: 'Type',
      render: (v) => (
        <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${v ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
          {v ? 'Optional' : 'Mandatory'}
        </span>
      )
    },
    ...(canManage ? [{
      key: 'actions', label: '', sortable: false, render: (_, row) => (
        <div className="flex justify-end">
          <ActionMenu
            actions={[
              { label: 'Modify Template', icon: Edit, onClick: () => handleEditClick(row) },
              {
                label: 'Assign Approvals',
                icon: Users,
                onClick: () => handleAssignMentorsClick(row),
                disabled: !row.requiresMentorApproval && !row.requiresClassTeacherApproval && !row.coordinatorId,
                title: (!row.requiresMentorApproval && !row.requiresClassTeacherApproval && !row.coordinatorId)
                  ? 'Configure approval mode on this item first'
                  : 'Backfill approvals for all students in active batches',
              },
              { label: 'Delete', icon: Trash2, onClick: () => { setSelectedItem(row); setShowDelete(true); }, variant: 'danger' },
            ]}
          />
        </div>
      )
    }] : [])
  ];

  return (
    <PageWrapper title="Co-Curricular" subtitle="Manage dynamic clearance requirements like internships, certifications, and technical projects">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          {canManage && (
            <Button variant="primary" size="sm" onClick={() => { resetForm(); setShowCreate(true); }} className="gap-2">
              <Plus size={14} /> Add 
            </Button>
          )}
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => fetchItems()} 
          className="text-muted-foreground"
        >
          <RefreshCw size={14} /> Refresh
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
          data={items}
          loading={loading}
          pagination={{
            total,
            page,
            pageChange: setPage,
            limit,
            limitChange: setLimit
          }}
          searchable
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          searchPlaceholder="Search by name or code..."
        />
      )}

      {/* Create/Edit Modal */}
      {(showCreate || showEdit) && (
        <Modal 
          isOpen={showCreate || showEdit} 
          title={showCreate ? "Configure co-curricular  " : "Update Template"} 
          onClose={() => { setShowCreate(false); setShowEdit(false); }}
          className="max-w-2xl"
        >
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Internal Code</label>
                <input 
                  type="text" 
                  value={formData.code}
                  onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})}
                  className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all font-mono" 
                  placeholder="EX: INTERN-2024" 
                />
              </div>
              {isAdmin && (
                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Target Department</label>
                  <SearchableSelect 
                    options={departments.map(d => ({ value: d._id, label: d.name }))}
                    value={formData.departmentId}
                    onChange={val => {
                      setFormData(prev => ({ ...prev, departmentId: val, coordinatorId: '' }));
                    }}
                    placeholder="Select Department"
                  />
                </div>
              )}
              {isHod && (
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Department</label>
                    <div className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite text-sm font-bold text-navy opacity-70">
                      {user?.departmentName || 'Your Department'}
                    </div>
                  </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-5">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Visibility Type</label>
                <div className="h-[46px] flex items-center px-4 rounded-lg border border-muted bg-offwhite/50">
                   <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={formData.isOptional} 
                        onChange={e => setFormData({...formData, isOptional: e.target.checked})}
                        className="w-4 h-4 rounded text-navy focus:ring-navy/10 border-muted"
                      />
                      <span className="text-xs font-bold text-navy/70">Mark as Optional</span>
                   </label>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Item Title</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all font-bold" 
                placeholder="Ex: Summer Internship Clearance" 
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-4">Applicable Academic Years</label>
              <div className="flex gap-4">
                {[1, 2, 3, 4].map(year => (
                  <label key={year} className={`flex-1 flex items-center justify-center py-3 rounded-lg border cursor-pointer transition-all ${
                    formData.applicableYears.includes(year) 
                      ? 'bg-navy border-navy text-white shadow-lg shadow-navy/20' 
                      : 'bg-offwhite border-muted text-muted-foreground hover:border-navy/30'
                  }`}>
                    <input 
                      type="checkbox" 
                      className="hidden" 
                      checked={formData.applicableYears.includes(year)}
                      onChange={() => {
                        const newYears = formData.applicableYears.includes(year)
                          ? formData.applicableYears.filter(y => y !== year)
                          : [...formData.applicableYears, year];
                        setFormData({...formData, applicableYears: newYears.sort()});
                      }}
                    />
                    <span className="text-xs font-black">YEAR {year}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-navy/5 border border-navy/10 rounded-xl p-4 space-y-4">
              <label className="block text-[10px] uppercase tracking-widest font-black text-navy">Approval </label>
              
              <div className="grid grid-cols-3 gap-3">
                <label className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-colors ${formData.requiresMentorApproval && !formData.requiresClassTeacherApproval ? 'bg-white border-navy shadow-sm' : 'bg-white/50 border-muted hover:border-navy/30'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <input 
                      type="radio" 
                      checked={formData.requiresMentorApproval === true && formData.requiresClassTeacherApproval === false}
                      onChange={() => setFormData({...formData, requiresMentorApproval: true, requiresClassTeacherApproval: false, coordinatorId: ''})}
                      className="w-3.5 h-3.5 text-navy focus:ring-navy/20"
                    />
                    <span className="text-xs font-bold text-navy">Student's Mentor</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground pl-5 leading-tight">Routed to each student's specific mentor.</p>
                </label>

                <label className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-colors ${formData.requiresClassTeacherApproval ? 'bg-white border-navy shadow-sm' : 'bg-white/50 border-muted hover:border-navy/30'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <input 
                      type="radio" 
                      checked={formData.requiresClassTeacherApproval === true}
                      onChange={() => setFormData({...formData, requiresMentorApproval: false, requiresClassTeacherApproval: true, coordinatorId: ''})}
                      className="w-3.5 h-3.5 text-navy focus:ring-navy/20"
                    />
                    <span className="text-xs font-bold text-navy">Class Teacher</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground pl-5 leading-tight">Routed to student's class teacher.</p>
                </label>

                <label className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-colors ${!formData.requiresMentorApproval && !formData.requiresClassTeacherApproval ? 'bg-white border-navy shadow-sm' : 'bg-white/50 border-muted hover:border-navy/30'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <input 
                      type="radio" 
                      checked={formData.requiresMentorApproval === false && formData.requiresClassTeacherApproval === false}
                      onChange={() => setFormData({...formData, requiresMentorApproval: false, requiresClassTeacherApproval: false})}
                      className="w-3.5 h-3.5 text-navy focus:ring-navy/20"
                    />
                    <span className="text-xs font-bold text-navy">Single Coordinator</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground pl-5 leading-tight">Routed to one designated faculty member.</p>
                </label>
              </div>

              {formData.requiresMentorApproval === false && formData.requiresClassTeacherApproval === false && (
                <div className="pt-2">
                  <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Designated Coordinator</label>
                  <SearchableSelect 
                    options={[
                      { value: '', label: 'Select a Faculty Member' },
                      ...facultyOptions
                    ]}
                    value={formData.coordinatorId}
                    onChange={val => setFormData({...formData, coordinatorId: val})}
                    placeholder="Search faculty by name..."
                  />
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-muted/30">
               <div className="flex items-center justify-between mb-4">
                  <label className="text-[10px] uppercase tracking-widest font-black text-navy">Submission Form Fields</label>
                  <Button variant="ghost" size="xs" onClick={handleAddField} className="text-navy bg-navy/5 gap-1 shadow-none">
                     <Plus size={12} /> Add Field
                  </Button>
               </div>

               <div className="space-y-3">
                  {formData.fields.map((field, idx) => (
                    <div key={idx} className="flex gap-3 items-start p-3 rounded-lg bg-offwhite/50 border border-muted/50 group">
                       <div className="pt-2 text-muted-foreground">
                          <GripVertical size={14} />
                       </div>
                       <div className="flex-1 space-y-3">
                          <input 
                            className="w-full text-xs font-bold bg-transparent border-none focus:ring-0 p-0"
                            placeholder="Field Label (e.g. Internship Certificate)"
                            value={field.label}
                            onChange={(e) => handleFieldChange(idx, 'label', e.target.value)}
                          />
                          <div className="flex items-center gap-4">
                             <select 
                                className="text-[10px] bg-white border border-muted rounded px-2 py-1 outline-none"
                                value={field.type}
                                onChange={(e) => handleFieldChange(idx, 'type', e.target.value)}
                             >
                                <option value="text">Short Text</option>
                                <option value="file">File Upload / URL</option>
                                <option value="date">Calendar Date</option>
                             </select>
                             <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={field.required}
                                  onChange={(e) => handleFieldChange(idx, 'required', e.target.checked)}
                                  className="w-3 h-3 rounded text-navy border-muted"
                                />
                                <span className="text-[10px] font-bold text-muted-foreground uppercase">Required</span>
                             </label>
                          </div>
                       </div>
                       {formData.fields.length > 0 && (
                         <button onClick={() => handleRemoveField(idx)} className="p-2 text-status-due/50 hover:text-status-due">
                            <X size={14} />
                         </button>
                       )}
                    </div>
                  ))}
               </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-muted/30">
              <Button variant="ghost" onClick={() => { setShowCreate(false); setShowEdit(false); }}>Discard</Button>
              <Button 
                variant="primary" 
                onClick={showCreate ? handleCreate : handleEditSubmit} 
                loading={submitting}
              >
                {showCreate ? 'Create' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmModal
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDeleteConfirm}
        title="Purge Co-Curricular Item"
        description={`Eliminating '${selectedItem?.name}' will remove it from future clearance cycles. Existing records will be archived.`}
        confirmText="Confirm Purge"
        isDestructive={true}
        loading={submitting}
      />

      {/* Assign to Mentors Modal */}
      {showAssignMentors && (
        <Modal
          isOpen={showAssignMentors}
          title="Assign Co-Curricular Clearance"
          onClose={() => { setShowAssignMentors(false); setAssignMentorsResult(null); }}
          className="max-w-md"
        >
          <div className="space-y-5">
            {!assignMentorsResult ? (
              <>
                <div className="p-4 rounded-lg bg-navy/5 border border-navy/10">
                  <div className="flex items-start gap-3">
                    <Users size={18} className="text-navy mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-navy mb-1">{selectedItem?.name}</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        This will create pending approval tasks for every student in an <strong>active clearance batch</strong> for this item.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground">Assignment Strategy</label>
                  
                  <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${assignMode === 'per_mentor' ? 'bg-navy/5 border-navy/20' : 'bg-white border-muted hover:border-navy/20'}`}>
                    <div className="pt-0.5">
                      <input 
                        type="radio" 
                        name="assignMode" 
                        value="per_mentor" 
                        checked={assignMode === 'per_mentor'}
                        onChange={(e) => setAssignMode(e.target.value)}
                        className="w-4 h-4 text-navy focus:ring-navy/20"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-navy">Each Student's Own Mentor</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">Routes the approval to the faculty assigned as the mentor for each individual student. Students without a mentor are skipped.</p>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${assignMode === 'per_class_teacher' ? 'bg-navy/5 border-navy/20' : 'bg-white border-muted hover:border-navy/20'}`}>
                    <div className="pt-0.5">
                      <input 
                        type="radio" 
                        name="assignMode" 
                        value="per_class_teacher" 
                        checked={assignMode === 'per_class_teacher'}
                        onChange={(e) => setAssignMode(e.target.value)}
                        className="w-4 h-4 text-navy focus:ring-navy/20"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-navy">Each Student's Class Teacher</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">Routes the approval to the class teacher of each student's current class.</p>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${assignMode === 'single_faculty' ? 'bg-navy/5 border-navy/20' : 'bg-white border-muted hover:border-navy/20'}`}>
                    <div className="pt-0.5">
                      <input 
                        type="radio" 
                        name="assignMode" 
                        value="single_faculty" 
                        checked={assignMode === 'single_faculty'}
                        onChange={(e) => setAssignMode(e.target.value)}
                        className="w-4 h-4 text-navy focus:ring-navy/20"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-navy">Single Faculty Coordinator</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">Routes all approvals to one specific faculty member.</p>
                      
                      {assignMode === 'single_faculty' && (
                        <div className="mt-3">
                          <SearchableSelect
                            options={facultyOptions}
                            value={assignFacultyId}
                            onChange={(val) => setAssignFacultyId(val)}
                            placeholder="Search faculty..."
                            className="w-full"
                          />
                        </div>
                      )}
                    </div>
                  </label>
                </div>

                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-[11px] text-amber-700 font-medium">
                    ⚡ This operation is <strong>idempotent</strong> — calling it multiple times will not create duplicates.
                  </p>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setShowAssignMentors(false)}>Cancel</Button>
                  <Button
                    variant="primary"
                    onClick={handleAssignMentorsConfirm}
                    loading={assigningMentors}
                    className="gap-2"
                  >
                    <Users size={14} /> Assign Approvals
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
                      <p className="text-2xl font-black text-green-700">{assignMentorsResult.created ?? 0}</p>
                      <p className="text-[10px] uppercase tracking-wider text-green-600 font-bold mt-1">Created</p>
                    </div>
                    {['per_mentor', 'per_class_teacher'].includes(assignMentorsResult.mode) && (
                      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-center">
                        <p className="text-2xl font-black text-amber-700">{assignMentorsResult.skipped ?? 0}</p>
                        <p className="text-[10px] uppercase tracking-wider text-amber-600 font-bold mt-1">
                          {assignMentorsResult.mode === 'per_mentor' ? 'No Mentor' : 'No Teacher'}
                        </p>
                      </div>
                    )}
                    <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-center">
                      <p className="text-2xl font-black text-gray-500">{assignMentorsResult.skippedNoRequest ?? 0}</p>
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mt-1">No Request</p>
                    </div>
                  </div>
                  {assignMentorsResult.mode === 'per_mentor' && (assignMentorsResult.skipped ?? 0) > 0 && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      ⚠️ {assignMentorsResult.skipped} student(s) have no mentor assigned yet. Assign mentors in Class Detail, then run this again.
                    </p>
                  )}
                  {assignMentorsResult.mode === 'per_class_teacher' && (assignMentorsResult.skipped ?? 0) > 0 && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      ⚠️ {assignMentorsResult.skipped} student(s) have no class teacher assigned and no fallback coordinator was found.
                    </p>
                  )}
                </div>
                <div className="flex justify-end pt-2">
                  <Button variant="primary" onClick={() => { setShowAssignMentors(false); setAssignMentorsResult(null); }}>Done</Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
};

export default CoCurricular;
