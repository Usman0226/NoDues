import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import { useApi } from '../../hooks/useApi';
import useSSE from '../../hooks/useSSE';
import { getStudentStatus } from '../../api/student';
import { getBatchSSEUrl } from '../../api/sse';
import { 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Shield, 
  Calendar, 
  BookOpen,
  UserCheck,
  RefreshCw
} from 'lucide-react';
import { motion } from 'framer-motion';

const STATUS_CONFIG = {
  cleared: { banner: 'bg-emerald-500', icon: CheckCircle, label: 'No Outstanding Dues', sub: 'Your clearance is verified for the current cycle.' },
  hod_override: { banner: 'bg-blue-600', icon: Shield, label: 'Clearance Overridden', sub: 'Administrative exception applied by HoD.' },
  pending: { banner: 'bg-amber-500', icon: Clock, label: 'Clearance in Progress', sub: 'Some faculty approvals are still pending action.' },
  has_dues: { banner: 'bg-red-500', icon: AlertTriangle, label: 'Action Required: Dues Flagged', sub: 'Please resolve the highlighted dues to proceed.' },
  no_batch: { banner: 'bg-zinc-500', icon: Calendar, label: 'Cycle Not Initiated', sub: 'The clearance cycle for your current academic group has not started yet.' },
};

const CircularProgress = ({ cleared, total }) => {
  const percentage = total > 0 ? (cleared / total) * 100 : 0;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex items-center gap-6">
      {/* Circular SVG Container */}
      <div className="relative h-24 w-24 flex items-center justify-center shrink-0">
        <svg className="h-full w-full -rotate-90 transform overflow-visible">
          {/* Background Track */}
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke="currentColor"
            strokeWidth="6"
            fill="transparent"
            className="text-zinc-100"
          />
          {/* Progress Stroke */}
          <motion.circle
            cx="48"
            cy="48"
            r={radius}
            stroke="currentColor"
            strokeWidth="6"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashoffset }}
            transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1] }}
            strokeLinecap="round"
            fill="transparent"
            className="text-navy"
          />
        </svg>
        
        {/* Center Metric Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-0.5">
          <div className="flex items-baseline">
            <span className="text-2xl font-black text-navy leading-none">{cleared}</span>
            <span className="text-xs font-bold text-navy/20 ml-0.5">/{total}</span>
          </div>
          <p className="text-[7px] font-black text-navy/40 uppercase tracking-[0.2em] mt-1">Status</p>
        </div>

        {/* Outer Glow Effect (Subtle) */}
        <div className="absolute inset-0 rounded-full shadow-[inset_0_0_15px_rgba(244,244,245,0.8)] pointer-events-none"></div>
      </div>

      {/* Trajectory Details */}
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-black text-navy truncate tracking-tight">
            {cleared === total ? 'Cleared' : 'In Progress'}
          </h2>
          <div className={`h-2 w-2 rounded-full ${cleared === total ? 'bg-emerald-500 animate-pulse' : 'bg-primary animate-pulse'}`}></div>
        </div>
        
        <div className="flex flex-col gap-0.5">
          <p className="text-[9px] font-bold text-navy/40 uppercase tracking-widest truncate">
            Trajectory Profile
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-navy/70 italic">
              {total - cleared > 0 ? `${total - cleared} nodes pending` : 'All nodes verified'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const StudentStatus = () => {
  const { data, loading, error, request: fetchStatus } = useApi(getStudentStatus, { immediate: true });

  useSSE(data?.batchId ? getBatchSSEUrl(data.batchId) : null, (event) => {
    if (event.type === 'approval_updated' || event.type === 'batch_updated') {
      fetchStatus();
    }
  });

  if (loading && !data) {
    return (
      <PageWrapper title="Dashboard" subtitle="Syncing clearance data...">
        <div className="animate-pulse flex flex-col gap-8">
           <div className="h-32 bg-muted/5 rounded-2xl border border-muted/50"></div>
           <div className="grid grid-cols-1 gap-4">
              {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted/5 rounded-2xl border border-muted/50"></div>)}
           </div>
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper title="Dashboard" subtitle="System Interruption">
        <div className="text-center py-20 px-6 bg-white rounded-2xl border border-red-100 shadow-sm border-b-4 border-b-red-500">
          <div className="h-16 w-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
             <AlertTriangle className="text-red-500" size={32} />
          </div>
          <h2 className="text-xl font-bold text-navy mb-2">Sync Error</h2>
          <p className="text-muted-foreground mb-8 text-xs font-medium max-w-[240px] mx-auto">{error}</p>
          <button 
            onClick={() => fetchStatus()}
            className="px-6 py-2.5 bg-navy text-white rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-navy/90 transition-all flex items-center gap-2 mx-auto"
          >
            <RefreshCw size={12} strokeWidth={3} /> Re-establish Link
          </button>
        </div>
      </PageWrapper>
    );
  }

  if (!data) return null;
  const clearanceData = data.data || {};
  const status = clearanceData.status || 'pending';
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  const approvals = clearanceData.approvals || [];
  const totalCount = approvals.length;
  const clearedCount = approvals.filter(a => ['approved', 'hod_override'].includes(a.action)).length;

  const sortedApprovals = [...approvals].sort((a, b) => {
    const order = { due_marked: 0, pending: 1, approved: 2, hod_override: 3 };
    return (order[a.action] ?? 99) - (order[b.action] ?? 99);
  });

  return (
    <PageWrapper 
      title="Clearance Status" 
      subtitle={`Session ${clearanceData.academicYear} · Semester ${clearanceData.semester}`}
    >
      <div className="flex flex-col gap-8">
        {/* Simplified Header Metric */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-zinc-200/60 shadow-xl shadow-zinc-200/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-navy/[0.02] rounded-full translate-x-16 -translate-y-16 group-hover:scale-110 transition-transform duration-1000"></div>
          <CircularProgress cleared={clearedCount} total={totalCount} />
        </div>

        {/* Action List Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
             <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-navy/30">Detailed Trajectory</h3>
             <div className="h-1 w-12 bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400 w-1/3 animate-pulse"></div>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {sortedApprovals.map((item, i) => (
              <div 
                key={i} 
                className="bg-white rounded-2xl border border-zinc-200/50 p-4 sm:p-5 flex items-start gap-4 hover:border-navy/20 transition-all group relative active:scale-[0.982] touch-manipulation"
              >
                <div className={`h-12 w-12 rounded-xl bg-zinc-50 flex items-center justify-center shrink-0 border border-zinc-100 group-hover:bg-navy/5 transition-colors`}>
                  {item.approvalType === 'subject' ? 
                    <BookOpen size={20} className="text-navy/40 group-hover:text-navy/80" /> : 
                    <UserCheck size={20} className="text-navy/40 group-hover:text-navy/80" />
                  }
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="min-w-0">
                      <h4 className="text-sm font-black text-navy truncate tracking-tight uppercase leading-tight">
                        {item.subjectName}
                      </h4>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mt-0.5 truncate">
                        {item.facultyName || 'Office of Administration'}
                      </p>
                    </div>
                    <Badge status={item.action} className="scale-90 origin-top-right shrink-0" />
                  </div>

                  {item.action === 'due_marked' && (
                    <div className="mt-3 p-3 rounded-xl bg-red-50/50 border border-red-100/50 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle size={10} className="text-red-500" />
                        <span className="text-[9px] font-black text-red-600 uppercase tracking-widest">Deficiency: {item.dueType}</span>
                      </div>
                      <p className="text-xs text-red-900/80 font-bold italic leading-tight">"{item.remarks || 'No specific remarks.'}"</p>
                    </div>
                  )}

                  {item.action === 'hod_override' && (
                    <div className="mt-3 p-3 rounded-xl bg-blue-50/50 border border-blue-100/50 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <Shield size={10} className="text-blue-500" />
                        <span className="text-[9px] font-black text-blue-800 uppercase tracking-widest">Administrative Override</span>
                      </div>
                      <p className="text-xs text-blue-900/80 font-bold italic leading-tight">"{item.remarks || 'Manual verification completed.'}"</p>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {totalCount === 0 && (
              <div className="col-span-full py-12 flex flex-col items-center justify-center text-center opacity-40">
                <div className="h-12 w-12 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
                  <Clock size={24} className="text-zinc-400" />
                </div>
                <p className="text-xs font-bold text-navy uppercase tracking-widest">No clearance data found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};

export default StudentStatus;
