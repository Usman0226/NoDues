import React, { useState } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Shield, AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { getHodDues, overrideDue, bulkOverrideDues } from '../../api/hod';
import { getDepartmentSSEUrl } from '../../api/sse';
import useSSE from '../../hooks/useSSE';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { useUI } from '../../context/UIContext';

const Dues = () => {
  const { user } = useAuth();
  const { showGlobalLoader } = useUI();
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [overrideRemark, setOverrideRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkOverride, setShowBulkOverride] = useState(false);
  const [bulkRemark, setBulkRemark] = useState('');

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const { data: response, loading, error, request: fetchDues } = useApi(getHodDues);
  const total = response?.pagination?.total || 0;
  
  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchValue);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchValue]);

  React.useEffect(() => {
    fetchDues({ page, limit, search: debouncedSearch });
  }, [fetchDues, page, limit, debouncedSearch]);

  useSSE(user?.departmentId ? getDepartmentSSEUrl(user.departmentId) : null, (event) => {
    if (event.type === 'APPROVAL_UPDATED' || event.type === 'HOD_OVERRIDE') {
      fetchDues({ page, limit, search: debouncedSearch });
    }
  });
  
  const flattenedDues = React.useMemo(() => {
    if (!response?.data) return [];
    return response.data.flatMap(req => {
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
    { key: 'subject', label: 'Subject', render: (v) => <span className="text-xs">{v || 'General'}</span> },
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

  const handleBulkOverride = async () => {
    if (!bulkRemark.trim()) return toast.error('Please provide an override reason');
    const requestIds = [...new Set(selectedIds.map(id => id.split('-')[0]))];
    
    setSubmitting(true);
    try {
      await bulkOverrideDues({ requestIds, overrideRemark: bulkRemark });
      toast.success(`Clearance overridden for ${requestIds.length} students`);
      setShowBulkOverride(false);
      setBulkRemark('');
      setSelectedIds([]);
      fetchDues();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to bulk override dues.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageWrapper title="Dues Management" subtitle="Students with blocked clearances in your department">
      
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50/50 border border-red-100 flex items-center justify-between">
          <p className="text-sm text-red-600 font-medium">{error}</p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={async () => {
              const hide = showGlobalLoader('Refreshing Dues Record...');
              await fetchDues();
              hide();
            }}
          >
            <RefreshCw size={14} className="mr-2"/> Retry
          </Button>
        </div>
      )}

      <Table 
        columns={COLUMNS} 
        data={flattenedDues} 
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
        searchPlaceholder="Search by roll no or name..." 
        showCount={true}
        selectable
        selection={selectedIds}
        onSelectionChange={setSelectedIds}
        bulkActions={[
          { 
            label: 'Bulk Override Details', 
            icon: CheckCircle, 
            onClick: () => setShowBulkOverride(true) 
          }
        ]}
      />

      {/* Override Modal */}
      {overrideTarget && (
        <Modal isOpen={!!overrideTarget} title="Manual Clearance Override" onClose={() => setOverrideTarget(null)}>
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
              <div className="flex items-center gap-3 mb-2">
                <AlertTriangle className="text-amber-600" size={18} />
                <span className="text-sm font-bold text-amber-900">High Privilege Action</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                Overriding this due will mark the student as cleared for <strong>{overrideTarget.subject || 'General Dues'}</strong>. This action is irreversible and will be logged under your credentials.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-offwhite rounded-lg border border-muted/50">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1">Student</p>
                  <p className="text-sm font-bold text-navy">{overrideTarget.name}</p>
                </div>
                <div className="p-3 bg-offwhite rounded-lg border border-muted/50">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1">Due Type</p>
                  <p className="text-sm font-bold text-status-due">{overrideTarget.dueType}</p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Override Remark (Required)</label>
                <textarea 
                  value={overrideRemark}
                  onChange={(e) => setOverrideRemark(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 font-medium transition-all"
                  placeholder="State the reason for manual clearance..."
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-muted/30">
              <Button variant="ghost" onClick={() => setOverrideTarget(null)}>Cancel</Button>
              <Button variant="primary" onClick={handleOverride} loading={submitting} disabled={!overrideRemark.trim()}>
                Confirm Override
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk Override Modal */}
      {showBulkOverride && (
        <Modal isOpen={showBulkOverride} title="Bulk Clearance Override" onClose={() => setShowBulkOverride(false)}>
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-navy text-white shadow-xl overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-xl font-black shrink-0 border border-white/10">
                {[...new Set(selectedIds.map(id => id.split('-')[0]))].length}
              </div>
              <div>
                <p className="text-sm font-bold tracking-tight">Candidates Selected</p>
                <p className="text-[10px] uppercase font-black tracking-widest opacity-50">Mass Approval Protocol</p>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-2">Universal Reason for Clearance</label>
              <textarea 
                value={bulkRemark} 
                onChange={(e) => setBulkRemark(e.target.value)} 
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-muted bg-offwhite/50 text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 font-medium transition-all"
                placeholder="Required for audit trail..." 
              />
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-muted/30">
              <Button variant="ghost" onClick={() => setShowBulkOverride(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleBulkOverride} loading={submitting} disabled={!bulkRemark.trim()}>
                Clear All Selected
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
};

export default Dues;
