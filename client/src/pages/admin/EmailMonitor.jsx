import React, { useState, useEffect } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import api from '../../api/axiosInstance';
import { 
  Mail, 
  Activity, 
  CheckCircle, 
  XCircle, 
  Server, 
  ShieldAlert, 
  History, 
  RefreshCw,
  Search,
  Filter,
  Eye
} from 'lucide-react';
import Button from '../../components/ui/Button';
import toast from 'react-hot-toast';
import { useUI } from '../../hooks/useUI';

const EmailMonitor = () => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [diagLoading, setDiagLoading] = useState(false);
  const [errorModal, setErrorModal] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const { showGlobalLoader } = useUI();

  const fetchStats = async () => {
    try {
      const res = await api.get('/auth/diag/status');
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch email stats', err);
    }
  };

  const fetchLogs = async (p = 1) => {
    try {
      setLoading(true);
      const res = await api.get(`/auth/diag/logs?page=${p}&limit=15`);
      setLogs(res.data);
      setTotal(res.pagination.total);
      setPage(res.pagination.page);
    } catch (err) {
      console.warn(err)
      toast.error('Failed to load email logs');
    } finally {
      setLoading(false);
    }
  };

  const runDiag = async () => {
    try {
      setDiagLoading(true);
      const res = await api.post('/auth/diag/test');
      const results = res.data;
      
      const failed = results.filter(r => r.status === 'error');
      if (failed.length > 0) {
        toast.error(`${failed.length} account(s) failed diagnostics`);
      } else {
        toast.success('All accounts verified successfully');
      }
      fetchStats();
    } catch (err) {
      console.warn(err)
      toast.error('Diagnostic test failed');
    } finally {
      setDiagLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchLogs();
  }, []);

  const columns = React.useMemo(() => [
    { 
      key: 'recipient', 
      label: 'Recipient', 
      render: (v) => <span className="font-bold text-navy truncate block max-w-[200px]">{v}</span> 
    },
    { 
      key: 'subject', 
      label: 'Subject', 
      render: (v) => <span className="text-muted-foreground/80 text-[11px] font-medium">{v}</span> 
    },
    { 
      key: 'status', 
      label: 'Status', 
      render: (v, row) => (
        <div className="flex items-center gap-2">
          <Badge status={v === 'success' ? 'cleared' : 'due'}>
            {v.toUpperCase()}
          </Badge>
          {v === 'failure' && (
            <button 
              onClick={() => setErrorModal(row.error)}
              className="p-1 hover:bg-red-50 text-red-500 rounded-full transition-colors"
              title="View Error"
            >
              <ShieldAlert size={14} />
            </button>
          )}
        </div>
      )
    },
    {
      key: 'accountIndex',
      label: 'Sender Account',
      render: (v) => (
        <span className="text-[10px] font-black uppercase text-navy/40 tracking-widest">
          Account {v + 1}
        </span>
      )
    },
    { 
      key: 'timestamp', 
      label: 'Sent At', 
      render: (v) => (
        <span className="text-[10px] font-bold text-zinc-400 tabular-nums">
          {new Date(v).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      )
    }
  ], []);

  return (
    <PageWrapper 
      title="Email System" 
      subtitle="Monitor email delivery, account status, and history"
    >
      <div className="flex justify-end mb-8 relative z-50">
        <Button 
          variant="primary" 
          onClick={runDiag} 
          loading={diagLoading}
          className="shadow-gold/20"
        >
          <Activity size={14} className="mr-2" /> Run Connectivity Test
        </Button>
      </div>

      {/* SMTP Accounts Grid */}
      <h2 className="text-sm font-black text-navy uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
        <Server size={14} className="text-gold" /> Configured Email Accounts
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {stats?.accounts.map((acc, i) => (
          <div key={i} className="bg-white rounded-2xl p-6 border border-muted shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4">
               {acc.sent >= acc.limit ? (
                 <Badge status="due">EXHAUSTED</Badge>
               ) : (
                 <Badge status="pending">ACTIVE</Badge>
               )}
            </div>
            
            <Mail className="text-navy/10 mb-4 group-hover:text-gold/20 transition-colors" size={32} />
            
            <p className="text-[10px] font-black text-navy/40 uppercase tracking-widest mb-1">Account {acc.index + 1}</p>
            <p className="text-sm font-bold text-navy mb-4 truncate pr-16">{acc.user}</p>
            
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Daily Quota</span>
                <span className="text-xs font-black text-navy">{acc.sent} / {acc.limit}</span>
              </div>
              <div className="h-1.5 w-full bg-offwhite rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${acc.sent >= acc.limit ? 'bg-status-due' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min((acc.sent / acc.limit) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
        
        {(!stats || stats.accounts.length === 0) && (
          <div className="lg:col-span-3 py-12 bg-white rounded-2xl border border-dashed border-muted flex flex-col items-center justify-center text-center">
            <ShieldAlert size={48} className="text-navy/10 mb-4" />
            <p className="text-navy font-bold leading-tight">No Accounts Detected</p>
            <p className="text-xs text-muted-foreground mt-2 max-w-[240px]">
              Add SMTP_USER_N to your environment variables to enable failover.
            </p>
          </div>
        )}
      </div>

      {/* Log History */}
      <div className="bg-white rounded-2xl border border-muted shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-muted flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-navy/5 flex items-center justify-center">
               <History size={16} className="text-navy" />
            </div>
            <h2 className="text-base font-black text-navy tracking-tight">Email History</h2>
          </div>
          <button 
            onClick={async () => {
              const hide = showGlobalLoader('Refreshing Email Logs...');
              await fetchLogs(1);
              hide();
            }}
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-navy/40 hover:text-navy transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh Logs
          </button>
        </div>
        
        <Table 
          columns={columns} 
          data={logs} 
          loading={loading}
          skeletonRows={8}
        />
        
        {total > logs.length && (
          <div className="px-6 py-4 bg-offwhite/50 border-t border-muted flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground">
              Showing {logs.length} of {total} events
            </p>
            <div className="flex gap-2">
               <Button 
                variant="outline" 
                size="sm" 
                disabled={page === 1}
                onClick={() => fetchLogs(page - 1)}
               >
                 Previous
               </Button>
               <Button 
                variant="outline" 
                size="sm" 
                onClick={() => fetchLogs(page + 1)}
                disabled={logs.length < 15}
               >
                 Next
               </Button>
            </div>
          </div>
        )}
      </div>

      {/* Error Modal */}
      {errorModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" onClick={() => setErrorModal(null)} />
          <div className="relative bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden border border-white/20">
            <div className="px-8 py-6 border-b border-muted">
              <h3 className="text-lg font-black text-navy flex items-center gap-3">
                <XCircle className="text-status-due" size={20} />
                Email Connection Failed
              </h3>
            </div>
            <div className="px-8 py-8">
              <div className="bg-red-50 p-6 rounded-2xl border border-red-100 mb-6">
                <p className="text-xs font-black text-red-800 uppercase tracking-widest mb-2">Error Message</p>
                <p className="text-sm font-bold text-red-900 leading-relaxed font-mono">
                  {errorModal.message || 'Unknown error'}
                  {errorModal.code && ` (${errorModal.code})`}
                </p>
              </div>
              
              {errorModal.stack && (
                <div className="bg-zinc-900 p-6 rounded-2xl overflow-x-auto">
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3">Trace Log</p>
                  <pre className="text-[10px] text-indigo-200/70 font-mono leading-relaxed">
                    {errorModal.stack}
                  </pre>
                </div>
              )}
            </div>
            <div className="px-8 py-6 bg-offwhite/50 border-t border-muted flex justify-end">
              <Button variant="outline" onClick={() => setErrorModal(null)} className="px-8">
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
};

export default EmailMonitor;
