import React, { useState, useEffect, useMemo } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ActionMenu from '../../components/ui/ActionMenu';
import Modal from '../../components/ui/Modal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { Upload, UserPlus, RefreshCw, AlertCircle, Edit, Trash2,Users } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { getStudents, createStudent, updateStudent, deleteStudent, bulkDeactivateStudents, bulkAssignMentor } from '../../api/students';
import { getFaculty } from '../../api/faculty';
import { getClasses } from '../../api/classes';
import ImportStepper from '../../components/import/ImportStepper';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { useUI } from '../../context/UIContext';

const StudentList = () => {
  const { showGlobalLoader } = useUI();
  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showBulkMentor, setShowBulkMentor] = useState(false);
  const [bulkMentorId, setBulkMentorId] = useState('');
  
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setPage(1); // Reset to first page on search
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { user } = useAuth();
  const isHod = user?.role === 'hod';
  const studentQueryParams = useMemo(() => ({
    page,
    limit,
    includeInactive,
    search: debouncedSearchTerm,
    ...(isHod ? { departmentId: user?.departmentId } : {}),
  }), [page, limit, includeInactive, debouncedSearchTerm, isHod, user?.departmentId]);
  
  const { data: response, loading, error, request: fetchStudents } = useApi(getStudents);
  const students = response?.data || [];
  const total = response?.pagination?.total || 0;

  const { data: classResponse, request: fetchClasses } = useApi(getClasses);
  const classes = classResponse?.data || [];

  const { data: facultyResponse } = useApi(getFaculty, { immediate: true });
  const faculty = facultyResponse?.data || [];

  useEffect(() => {
    fetchStudents(studentQueryParams);
  }, [fetchStudents, studentQueryParams]);

  useEffect(() => {
    const params = {};
    if (isHod) params.departmentId = user.departmentId;
    fetchClasses(params);
  }, [fetchClasses, isHod, user?.departmentId]);

  const [formData, setFormData] = useState({
    rollNo: '',
    name: '',
    email: '',
    classId: '',
    yearOfStudy: ''
  });

  const handleEditClick = (student) => {
    setSelectedStudent(student);
    setFormData({
      rollNo: student.rollNo || '',
      name: student.name || '',
      email: student.email || '',
      classId: student.classId || '',
      yearOfStudy: student.yearOfStudy || ''
    });
    setShowEdit(true);
  };

  const handleDeleteClick = (student) => {
    setSelectedStudent(student);
    setShowDelete(true);
  };

  const handleCreateSubmit = async () => {
    if (!formData.rollNo || !formData.name || !formData.classId) return toast.error('Required fields missing');
    setSubmitting(true);
    try {
      await createStudent(formData);
      toast.success('Student added successfully');
      setShowAdd(false);
      fetchStudents(studentQueryParams);
    } catch (err) {
      toast.error(err?.message || 'Failed to add student');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!formData.rollNo || !formData.name || !formData.classId) return toast.error('Required fields missing');
    setSubmitting(true);
    try {
      await updateStudent(selectedStudent._id, formData);
      toast.success('Student updated successfully');
      setShowEdit(false);
      fetchStudents(studentQueryParams);
    } catch (err) {
      toast.error(err?.message || 'Failed to update student');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setSubmitting(true);
    try {
      await deleteStudent(selectedStudent._id);
      toast.success('Student deactivated');
      setShowDelete(false);
      fetchStudents(studentQueryParams);
    } catch (err) {
      toast.error(err?.message || 'Failed to deactivate student');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkDeactivateConfirm = async () => {
    setSubmitting(true);
    try {
      await bulkDeactivateStudents(selectedIds);
      toast.success(`${selectedIds.length} students deactivated`);
      setShowBulkDelete(false);
      setSelectedIds([]);
      fetchStudents(studentQueryParams);
    } catch (err) {
      toast.error(err?.message || 'Failed to deactivate students');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkAssignMentor = async () => {
    if (!bulkMentorId) return toast.error('Please select a mentor');
    setSubmitting(true);
    try {
      await bulkAssignMentor(selectedIds, bulkMentorId);
      toast.success(`Mentor assigned to ${selectedIds.length} students`);
      setShowBulkMentor(false);
      setSelectedIds([]);
      setBulkMentorId('');
      fetchStudents(studentQueryParams);
    } catch (err) {
      toast.error(err?.message || 'Failed to assign mentor');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { 
      key: 'rollNo', 
      label: 'Roll No', 
      render: (v) => <span className="font-mono text-xs font-black tracking-tight text-navy">{v}</span> 
    },
    { key: 'name', label: 'Full Name', render: (v) => <span className="font-bold text-navy/80">{v}</span> },
    { key: 'departmentName', label: 'Department' },
    { key: 'className', label: 'Class', render: (v, row) => <span>{v || row.class}</span> },
    {
      key: 'mentor',
      label: 'Mentor',
      render: (_, row) => row.mentor?.name || row.mentorName || 'Not Assigned'
    },
    { 
      key: 'status', 
      label: 'Status', 
      render: (v, row) => <Badge status={row.isActive ? (v || 'pending') : 'rejected'} className="scale-90 origin-left" /> 
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <ActionMenu 
          actions={[
            { label: 'Edit', icon: Edit, onClick: () => handleEditClick(row) },
            { label: 'Deactivate', icon: Trash2, onClick: () => handleDeleteClick(row), variant: 'danger' }
          ]} 
        />
      )
    }
  ];

  return (
    <PageWrapper title="Students" subtitle="List of all registered students">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" size="sm" onClick={() => {
             setFormData({ rollNo: '', name: '', email: '', classId: '', yearOfStudy: '' });
             setShowAdd(true);
          }}><UserPlus size={14} /> Add Student</Button>
          <Button variant="ghost" size="sm" onClick={() => setShowImport(true)} className="text-navy border border-muted hover:bg-offwhite">
            <Upload size={14} /> Import list
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={async () => {
              const hide = showGlobalLoader('Reloading Student Directory...');
              await fetchStudents(studentQueryParams);
              hide();
            }} 
            className="text-muted-foreground"
          >
            <RefreshCw size={14} /> Reload
          </Button>
        </div>

        <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-full border border-muted shadow-sm group hover:border-indigo-200 transition-all cursor-pointer select-none"
             onClick={() => setIncludeInactive(!includeInactive)}>
           <div className={`w-8 h-4 rounded-full relative transition-colors ${includeInactive ? 'bg-navy' : 'bg-zinc-200'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${includeInactive ? 'left-4.5' : 'left-0.5'}`} />
           </div>
           <span className="text-[10px] font-black uppercase tracking-widest text-navy/60 group-hover:text-navy transition-colors">Show Inactivated</span>
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
          data={students || []}
          loading={loading && !response}
          pagination={{
            total,
            page,
            limit,
            onPageChange: (p) => setPage(p),
            onLimitChange: (l) => { setLimit(l); setPage(1); }
          }}
          searchable
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Filter by roll no, name, or group..."
          selectable
          selection={selectedIds}
          onSelectionChange={setSelectedIds}
          bulkActions={[
            { 
              label: 'Assign Mentor', 
              icon: Users, 
              onClick: () => setShowBulkMentor(true) 
            },
            { 
              label: 'Archive Students', 
              icon: Trash2, 
              onClick: () => setShowBulkDelete(true),
              variant: 'danger'
            }
          ]}
        />
      )}

      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="Bulk Student Import">
         <ImportStepper 
            type="students" 
            contextLabel="Student Directory Sync" 
            onComplete={() => {
              setShowImport(false);
              fetchStudents(studentQueryParams);
            }} 
         />
      </Modal>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Student">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1">Roll Number</label>
              <input type="text" value={formData.rollNo} onChange={e => setFormData({...formData, rollNo: e.target.value})} className="w-full px-3 py-2 border border-muted rounded-lg text-sm bg-offwhite/50 focus:ring-1 focus:ring-navy transition-all" placeholder="e.g. 24691A32XX"/>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1">Full Name</label>
              <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border border-muted rounded-lg text-sm bg-offwhite/50 focus:ring-1 focus:ring-navy transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1">Email</label>
            <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 border border-muted rounded-lg text-sm bg-offwhite/50 focus:ring-1 focus:ring-navy transition-all" placeholder="student@example.com" />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1">Academic Group</label>
            <SearchableSelect 
              options={classes.map(c => ({
                value: c._id,
                label: c.name,
                subLabel: `Semester ${c.semester}`
              }))}
              value={formData.classId}
              onChange={val => setFormData({...formData, classId: val})}
              placeholder="Select a class..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-muted/30">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreateSubmit} loading={submitting}>Add Student</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Update Student Record">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
               <label className="block text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1">Roll Number</label>
               <input type="text" value={formData.rollNo} onChange={e => setFormData({...formData, rollNo: e.target.value})} className="w-full px-3 py-2 border border-muted rounded-lg text-sm bg-offwhite/50 focus:ring-1 focus:ring-navy transition-all"/>
            </div>
            <div>
               <label className="block text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1">Full Name</label>
               <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border border-muted rounded-lg text-sm bg-offwhite/50 focus:ring-1 focus:ring-navy transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1">Email</label>
            <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 border border-muted rounded-lg text-sm bg-offwhite/50 focus:ring-1 focus:ring-navy transition-all" />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1">Academic Group</label>
            <SearchableSelect 
              options={classes.map(c => ({
                value: c._id,
                label: c.name,
                subLabel: `Semester ${c.semester}`
              }))}
              value={formData.classId}
              onChange={val => setFormData({...formData, classId: val})}
              placeholder="Select a class..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-muted/30">
            <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleEditSubmit} loading={submitting}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDeleteConfirm}
        title="Student Clearance Details"
        description={`You are about to archive the account for ${selectedStudent?.name}. They will be removed from all future clearance operations.`}
        confirmText="Archive"
        isDestructive={true}
        loading={submitting}
      />

      <ConfirmModal
        isOpen={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={handleBulkDeactivateConfirm}
        title="Deactivate Multiple Students"
        description={`You are about to deactivate ${selectedIds.length} students. They will be removed from all future clearance operations.`}
        confirmText="Deactivate All"
        isDestructive={true}
        loading={submitting}
      />

      <Modal isOpen={showBulkMentor} onClose={() => setShowBulkMentor(false)} title="Bulk Mentor Assignment">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Assign a mentor to the {selectedIds.length} selected students.</p>
          <div>
            <label className="block text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1">Select Mentor</label>
            <SearchableSelect 
              options={faculty.filter(f => f.roleTags?.includes('mentor')).map(f => ({
                value: f._id,
                label: f.name,
                subLabel: f.employeeId
              }))}
              value={bulkMentorId}
              onChange={val => setBulkMentorId(val)}
              placeholder="Select a faculty member..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-muted/30">
            <Button variant="ghost" onClick={() => setShowBulkMentor(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleBulkAssignMentor} loading={submitting}>Assign Mentor</Button>
          </div>
        </div>
      </Modal>
    </PageWrapper>
  );
};

export default StudentList;
