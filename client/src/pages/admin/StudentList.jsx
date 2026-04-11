import React, { useState, useEffect } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Upload, UserPlus, RefreshCw, AlertCircle, Search, X } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { getStudents, createStudent } from '../../api/students';
import ImportStepper from '../../components/import/ImportStepper';
import Modal from '../../components/ui/Modal';
import { toast } from 'react-hot-toast';

const StudentList = () => {
  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const { data: students, loading, error, request: fetchStudents } = useApi(getStudents, { immediate: true });

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const columns = [
    { 
      key: 'rollNo', 
      label: 'Roll No', 
      render: (v) => <span className="font-mono text-xs font-black tracking-tight text-navy">{v}</span> 
    },
    { key: 'name', label: 'Full Name', render: (v) => <span className="font-bold text-navy/80">{v}</span> },
    { key: 'departmentName', label: 'Department' },
    { key: 'className', label: 'Academic Group', render: (v, row) => <span>{v || row.class}</span> },
    { key: 'mentorName', label: 'Mentor' },
    { 
      key: 'status', 
      label: 'Onboarding', 
      render: (v) => <Badge status={v || 'pending'} className="scale-90 origin-left" /> 
    },
  ];

  if (loading && !students) {
    return (
      <PageWrapper title="Students" subtitle="Fetching roster...">
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
    <PageWrapper title="Students" subtitle="Global roster of all registered academic candidates">
      <div className="flex flex-wrap gap-3 mb-8">
        <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}><UserPlus size={14} /> Add Student</Button>
        <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}><Upload size={14} /> Import List</Button>
        <Button variant="ghost" size="sm" onClick={() => fetchStudents()} className="text-muted-foreground"><RefreshCw size={14} /> Reload</Button>
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
          searchable 
          searchPlaceholder="Filter by roll no, name, or group..." 
        />
      )}

      {/* Import Overlay */}
      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="Bulk Student Import">
         <ImportStepper 
            type="students" 
            contextLabel="Student Directory Sync" 
            onComplete={() => {
              setShowImport(false);
              fetchStudents();
            }} 
         />
      </Modal>

      {/* Add Student Placeholder Modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Nominate New Candidate">
         <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-6">Manual candidate nomination is currently via Academic Registry. Please use the Import tool for bulk processing.</p>
            <Button variant="primary" className="w-full" onClick={() => setShowAdd(false)}>Understand</Button>
         </div>
      </Modal>
    </PageWrapper>
  );
};

export default StudentList;
