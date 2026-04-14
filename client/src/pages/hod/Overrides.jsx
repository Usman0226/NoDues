import React, { useState } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { 
  Shield, 
  Search, 
  Filter, 
  Clock, 
  CheckCircle,
  FileText,
  RefreshCw
} from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { getHodDues } from '../../api/hod';
import { useUI } from '../../context/UIContext';

const COLUMNS = [
  { key: 'rollNo', label: 'Roll No', render: (v) => <span className="font-mono text-[10px] font-black text-navy">{v}</span> },
  { key: 'name', label: 'Student Name', render: (v) => <span className="font-bold text-xs">{v}</span> },
  { key: 'className', label: 'Class', render: (v) => <span className="text-xs">{v}</span> },
  { 
    key: 'dueCount', 
    label: 'Cleared Dues',
    render: (v) => <span className="text-xs font-bold text-muted-foreground">{v} dues cleared</span> 
  },
  {
    key: 'overrideRemark',
    label: 'Override Log',
    render: (v, row) => (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-blue-600 font-medium italic truncate max-w-[200px]">"{v}"</span>
        <span className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground flex items-center gap-1">
          <Clock size={8} /> {new Date(row.overriddenAt).toLocaleDateString()}
        </span>
      </div>
    )
  },
  {
    key: 'status',
    label: 'Result',
    render: () => <Badge status="hod_override" />
  }
];

const Overrides = () => {
  const [search, setSearch] = useState('');
  const { showGlobalLoader } = useUI();

  const { data: response, loading, error, request: fetchOverrides } = useApi(getHodDues, { immediate: true, params: { status: 'hod_override' } });

  const overrides = React.useMemo(() => {
    if (!response?.data) return [];
    return response.data.map(req => ({
      id: req.requestId,
      rollNo: req.rollNo,
      name: req.name,
      className: req.className,
      dueCount: req.dues?.length || 1, // Number of dues that were cleared
      overrideRemark: req.overrideRemark,
      overriddenAt: req.overriddenAt,
      status: 'hod_override'
    }));
  }, [response]);

  const filteredData = React.useMemo(() => {
    if (!search) return overrides;
    const lower = search.toLowerCase();
    return overrides.filter(o => 
      o.name.toLowerCase().includes(lower) || 
      o.rollNo.toLowerCase().includes(lower)
    );
  }, [overrides, search]);

  return (
    <PageWrapper title="Override History" subtitle="Audit log of all department-level manual clearances">
      {/* Header Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 mb-8 flex items-center gap-5">
        <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
          <Shield size={24} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-blue-900 font-bold mb-0.5">Management Summary</h2>
          <p className="text-blue-700 text-xs">Total of <span className="font-bold underline">{overrides.length}</span> manual overrides applied this semester.</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50/50 border border-red-100 flex items-center justify-between">
          <p className="text-sm text-red-600 font-medium">{error}</p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={async () => {
              const hide = showGlobalLoader('Refreshing Overrides Log...');
              await fetchOverrides();
              hide();
            }}
          >
            <RefreshCw size={14} className="mr-2"/> Retry
          </Button>
        </div>
      )}

      {/* Actions / Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search by student or roll no..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-navy/10 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2">
           <Button variant="ghost" size="sm" className="text-xs">
             <FileText size={14} /> Export Audit CSV
           </Button>
        </div>
      </div>

      {/* Main Table — Roll No FIRST (PRD §6.9) */}
      <Table 
        columns={COLUMNS} 
        data={filteredData}
        loading={loading}
        searchable={false}
        showCount={true}
      />

      {!loading && filteredData.length === 0 && (
        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-muted">
           <CheckCircle size={40} className="text-muted-foreground mx-auto mb-3 opacity-20" />
           <p className="text-muted-foreground text-sm font-medium">No overrides found in the system log.</p>
        </div>
      )}
    </PageWrapper>
  );
};

export default Overrides;