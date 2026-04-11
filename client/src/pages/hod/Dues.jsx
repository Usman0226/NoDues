import React, { useState } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Shield, AlertTriangle, User, BookOpen, RefreshCw } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { getHodDues, overrideDue } from '../../api/hod';
import toast from 'react-hot-toast';

const Dues = () => {
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [overrideRemark, setOverrideRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: response, loading, error, request: fetchDues } = useApi(getHodDues, { immediate: true });
  
  const flattenedDues = React.useMemo(() => {
    if (!response?.data) return [];
    return response.data.flatMap(req => {
      // If a student has multiple dues, create a row for each due,
      // but the override action will override the entire request.
      if (req.dues && req.dues.length > 0) {
        return req.dues.map((due, idx) => ({
          id: `${req.requestId}-${idx}`,
          requestId: req.requestId,
          rollNo: req.rollNo,
          name: req.name,
          className: req.className,
          facultyName: due.facultyName,
          subject: due.subjectName,
          dueType: due.dueType,
          remarks: due.remarks,
          status: 'has_dues',
           // Count to show if multiple dues exist
          dueCount: req.dues.length
        }));
      }
      return [];
    });
  }, [response]);

  const COLUMNS = [
    { key: 'rollNo', label: 'Roll No', render: (v) => <span className="font-mono text-xs font-bold text-navy">{v}</span> },
    { key: 'name', label: 'Name', render: (v) => <span className="font-bold">{v}</span> },
    { key: 'className', label: 'Class', render: (v) => <span className="text-xs">{v}</span> },
    { key: 'facultyName', label: 'Faculty', render: (v) => <span className="text-xs">{v}</span> },
    { key: 'subject', label: 'Subject', render: (v, row) => <span className="text-xs">{v || 'General'}</span> },
    { key: 'dueType', label: 'Due Type', render: (v) => (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-bold uppercase tracking-widest border border-red-100">{v}</span>
    )},
    { key: 'remarks', label: 'Remarks', render: (v) => <span className="text-[11px] text-muted-foreground max-w-[200px] truncate block">{v}</span> },
    {
      key: 'id', label: 'Action', sortable: false, render: (_, row) => (
        <Button variant="primary" size="sm" onClick={() => { setOverrideTarget(row); setOverrideRemark(''); }} className="text-[10px] py-1.5 h-auto">
          <Shield size={12} className="mr-1" /> Override
        </Button>
      )
    }
  ];

  const handleOverride = async () => {
    if (!overrideRemark.trim() || !overrideTarget) return;
    setSubmitting(true);
    try {
      await overrideDue({ requestId: overrideTarget.requestId, overrideRemark });
      toast.success('Clearance overridden successfully.');
      setOverrideTarget(null);
      fetchDues();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to override due.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageWrapper title="Dues Management" subtitle="Students with blocked clearances in your department">
      
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50/50 border border-red-100 flex items-center justify-between">
          <p className="text-sm text-red-600 font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={() => fetchDues()}><RefreshCw size={14} className="mr-2"/> Retry</Button>
        </div>
      )}

      <Table 
        columns={COLUMNS} 
        data={flattenedDues} 
        loading={loading}
        searchable 
        searchPlaceholder="Search by roll no or name..." 
      />

      {/* Override Modal (PRD §6.6) */}
      {overrideTarget && (
        <Modal isOpen={!!overrideTarget} title="Override & Clear" onClose={() => setOverrideTarget(null)}>
          <div className="space-y-4">
            {/* Context Display */}
            <div className="p-4 rounded-xl bg-offwhite border border-muted">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-0.5">Student</span><span className="font-semibold text-navy">{overrideTarget.rollNo} · {overrideTarget.name}</span></div>
                <div><span className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-0.5">Class</span><span className="font-semibold text-navy">{overrideTarget.className}</span></div>
                <div><span className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-0.5">Flagged By</span><span className="font-semibold text-navy">{overrideTarget.facultyName}</span></div>
                <div><span className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-0.5">Subject</span><span className="font-semibold text-navy">{overrideTarget.subject || 'N/A'}</span></div>
              </div>
              <div className="mt-3 pt-3 border-t border-muted">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={14} className="text-red-500" />
                  <span className="text-xs font-bold uppercase text-red-600">Due: {overrideTarget.dueType}</span>
                </div>
                <p className="text-sm text-red-700">"{overrideTarget.remarks}"</p>
                {overrideTarget.dueCount > 1 && (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mt-3 pt-3 border-t border-amber-200 border-dashed">
                    Warning: Override will clear {overrideTarget.dueCount} dues for this student.
                  </p>
                )}
              </div>
            </div>

            {/* Override Remark Input (required — PRD §6.6) */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">
                Override Remark <span className="text-red-500">*</span>
              </label>
              <textarea value={overrideRemark} onChange={(e) => setOverrideRemark(e.target.value)} rows={3}
                className="w-full px-4 py-3 rounded-lg border border-muted bg-offwhite text-sm focus:outline-none focus:ring-2 focus:ring-navy/10 resize-none"
                placeholder="Reason for overriding this due (required)..." />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOverrideTarget(null)}>Cancel</Button>
              <Button variant="primary" onClick={handleOverride} disabled={!overrideRemark.trim()} loading={submitting}>
                <Shield size={14} /> Confirm Override
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
};

export default Dues;
