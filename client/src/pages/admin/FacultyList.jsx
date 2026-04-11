import React, { useState, useEffect } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Plus, Upload, Mail, UserPlus, RefreshCw, AlertCircle } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { getFaculty, createFaculty } from '../../api/faculty';
import { getDepartments } from '../../api/departments';
import ImportStepper from '../../components/import/ImportStepper';
import { toast } from 'react-hot-toast';

const ROLE_TAG_COLORS = {
  faculty: 'bg-navy/5 text-navy/70',
  classTeacher: 'bg-amber-50 text-amber-700',
  mentor: 'bg-emerald-50 text-emerald-700',
  hod: 'bg-blue-50 text-blue-700',
};

const FacultyList = () => {
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data: response, loading, error, request: fetchFaculty } = useApi(getFaculty, { immediate: true });
  const faculty = response?.data || [];
  const { data: deptResponse } = useApi(getDepartments, { immediate: true });
  const depts = deptResponse?.data || [];

  const [formData, setFormData] = useState({
    name: '',
    employeeId: '',
    email: '',
    department: '',
    roles: ['faculty']
  });

  useEffect(() => {
    fetchFaculty();
  }, [fetchFaculty]);

  const handleCreate = async () => {
    if (!formData.name || !formData.employeeId || !formData.email || !formData.department) {
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

  const toggleRole = (role) => {
    setFormData(prev => ({
      ...prev,
      roles: prev.roles.includes(role) 
        ? prev.roles.filter(r => r !== role || r === 'faculty') 
        : [...prev.roles, role]
    }));
  };

  const columns = [
    { key: 'employeeId', label: 'Emp ID', render: (v) => <span className="font-mono text-xs font-black tracking-tight text-navy">{v}</span> },
    { key: 'name', label: 'Name', render: (v) => <span className="font-bold text-navy/80">{v}</span> },
    { key: 'email', label: 'Email', render: (v) => <span className="text-muted-foreground/60">{v}</span> },
    { key: 'departmentName', label: 'Dept' },
    {
      key: 'roles', label: 'Stakeholder Roles', sortable: false, render: (tags) => (
        <div className="flex flex-wrap gap-1.5">
          {(tags || ['faculty']).map((tag) => (
            <span key={tag} className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${ROLE_TAG_COLORS[tag] || ROLE_TAG_COLORS.faculty}`}>
              {tag === 'classTeacher' ? 'Co-ordinator' : tag === 'hod' ? 'HoD' : tag}
            </span>
          ))}
        </div>
      )
    },
  ];

  if (loading && !faculty) {
    return (
      <PageWrapper title="Faculty" subtitle="Syncing directory...">
        <div className="animate-pulse space-y-4">
          <div className="flex gap-3 mb-8">
            <div className="h-10 w-32 bg-muted/10 rounded-full"></div>
            <div className="h-10 w-32 bg-muted/10 rounded-full"></div>
          </div>
          <div className="h-96 bg-muted/5 rounded-xl border border-muted"></div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Faculty" subtitle="Manage academic staff and coordination roles">
      <div className="flex flex-wrap gap-3 mb-8">
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}><UserPlus size={14} /> Add Faculty</Button>
        <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}><Upload size={14} /> Import Directory</Button>
        <Button variant="ghost" size="sm" onClick={() => fetchFaculty()} className="text-muted-foreground"><RefreshCw size={14} /> Refresh</Button>
      </div>

      {error ? (
        <div className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm">
           <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
           <p className="text-muted-foreground font-medium">{error}</p>
        </div>
      ) : (
        <Table columns={columns} data={faculty || []} searchable searchPlaceholder="Search staff by name or ID..." />
      )}

      {showImport && (
        <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="Batch Faculty Import">
           <ImportStepper type="faculty" contextLabel="Staff Ledger Integration" onComplete={() => { setShowImport(false); fetchFaculty(); }} />
        </Modal>
      )}

      {showCreate && (
        <Modal isOpen={showCreate} title="Provision Faculty Account" onClose={() => setShowCreate(false)}>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">Full Name</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all text-navy font-bold" 
                  placeholder="e.g. Dr. Jane Doe" 
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">Employee ID</label>
                <input 
                  type="text" 
                  value={formData.employeeId}
                  onChange={e => setFormData({...formData, employeeId: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all font-mono" 
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
                  className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all" 
                  placeholder="name@mits.ac.in" 
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-2">Primary Department</label>
                <select 
                  value={formData.department}
                  onChange={e => setFormData({...formData, department: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 transition-all"
                >
                  <option value="">Select Dept</option>
                  {depts?.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-3">Academic Roles</label>
              <div className="flex flex-wrap gap-4 pt-1">
                {['faculty', 'classTeacher', 'mentor', 'hod'].map((role) => (
                  <label key={role} className="group flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={formData.roles.includes(role)}
                      onChange={() => toggleRole(role)}
                      className="w-4 h-4 rounded-md border-muted text-navy focus:ring-navy/20 cursor-pointer" 
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
    </PageWrapper>
  );
};

export default FacultyList;
