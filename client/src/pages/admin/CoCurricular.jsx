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
  deleteCoCurricularType 
} from '../../api/coCurricular';
import { getFaculty } from '../../api/faculty';
import { getDepartments } from '../../api/departments';
import { Plus, Edit, Trash2, AlertCircle, RefreshCw, X, GripVertical } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { toast } from 'react-hot-toast';
import { useUI } from '../../hooks/useUI';

const CoCurricular = () => {
  const { showGlobalLoader: _showGlobalLoader } = useUI();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isHod = user?.role === 'hod';
  const canManage = isAdmin || isHod;

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
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
    coordinatorId: '',
    fields: [{ label: '', type: 'text', required: true }]
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
    if (!formData.name || !formData.code || (!isAdmin && !user?.departmentId) || (isAdmin && !formData.departmentId) || !formData.coordinatorId) {
      toast.error('Basic details, department, and coordinator are required');
      return false;
    }
    if (formData.fields.some(f => !f.label)) {
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
      coordinatorId: item.coordinatorId?._id || item.coordinatorId,
      fields: item.fields.map(f => ({
        label: f.label,
        type: f.type,
        required: f.required
      }))
    });
    setShowEdit(true);
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
      coordinatorId: '',
      fields: [{ label: '', type: 'text', required: true }]
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
      render: (_, row) => <span className="text-xs font-medium text-muted-foreground">{row.coordinatorId?.name || row.coordinatorName || 'Unassigned'}</span>
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

            <div className="grid grid-cols-2 gap-5">
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

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Assigned Coordinator</label>
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
                       {formData.fields.length > 1 && (
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
                {showCreate ? 'Register Clearance Item' : 'Save Changes'}
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
    </PageWrapper>
  );
};

export default CoCurricular;
