import React, { useEffect, useMemo } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import { useApi } from '../../hooks/useApi';
import { getHodOverview } from '../../api/hod';
import { 
  Building2, 
  AlertCircle, 
  Layers, 
  ChevronRight,
  TrendingUp,
  Clock,
  RefreshCw
} from 'lucide-react';
import Button from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';

const HodDashboard = () => {
  const navigate = useNavigate();
  const { data: overview, loading, error, request: fetchOverview } = useApi(getHodOverview, { immediate: true });


  const avgCompletion = useMemo(() => {
    if (!overview?.batches?.length) return 0;
    const totalProgress = overview.batches.reduce((acc, b) => {
      const pct = b.totalStudents > 0 ? (b.clearedCount / b.totalStudents) * 100 : 0;
      return acc + pct;
    }, 0);
    return Math.round(totalProgress / overview.batches.length);
  }, [overview]);

  if (loading && !overview) {
    return (
      <PageWrapper title="Department Control" subtitle="Loading metrics...">
        <div className="animate-pulse">
           <div className="h-20 w-full bg-red-50/20 rounded-xl mb-10"></div>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[1, 2, 3].map(i => <div key={i} className="h-64 bg-muted/5 rounded-xl border border-muted"></div>)}
           </div>
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper title="Department Control" subtitle="Sync interrupted">
        <div className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm">
          <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
          <h2 className="text-xl font-black text-navy mb-2">Metrics Sync Failed</h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{error}</p>
          <Button variant="primary" onClick={() => fetchOverview()}>
             <RefreshCw size={14} className="mr-2" /> Retry Connection
          </Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Department Control" subtitle={`Oversight for ${overview?.departmentName || 'Your Department'}`}>
      {/* Alert Banner - Blocks Visibility */}
      {overview?.duesCount > 0 && (
        <div className="mb-8 sm:mb-10 p-5 rounded-xl bg-red-50/40 border border-red-100 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm shadow-red-100/20">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="h-10 w-10 bg-red-100 rounded-lg flex items-center justify-center text-red-600 shrink-0">
               <AlertCircle size={22} />
            </div>
            <div>
              <h2 className="text-red-950 font-black text-xs sm:text-sm uppercase tracking-tight">Blocked Candidates Identified</h2>
              <p className="text-red-700 text-[10px] sm:text-xs font-medium">{overview.duesCount} students have dues flagged.</p>
            </div>
          </div>
          <button onClick={() => navigate('/hod/dues')} className="w-full sm:w-auto px-5 py-2 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors shadow-sm shadow-red-600/20">
            Review Dues
          </button>
        </div>
      )}

      {/* Section: Academic Cycles */}
      <div className="mb-6 px-1 flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-navy/40">Active Cycles</h2>
        <div className="flex flex-wrap justify-center gap-3 sm:gap-4 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
          <span className="flex items-center gap-1.5"><TrendingUp size={12} strokeWidth={3} className="text-emerald-500" /> {avgCompletion}% Completion</span>
          <span className="flex items-center gap-1.5"><Clock size={12} strokeWidth={3} className="text-amber-500" /> Live Data</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {(overview?.batches || []).map((batch) => {
          const progress = batch.totalStudents > 0 ? Math.round((batch.clearedCount / batch.totalStudents) * 100) : 0;
          return (
            <div key={batch._id} onClick={() => navigate(`/hod/batch/${batch._id}`)} className="bg-white rounded-xl border border-muted shadow-sm p-6 hover:shadow-md transition-academic group cursor-pointer">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-navy tracking-tight group-hover:text-gold transition-colors">{batch.className}</h3>
                <ChevronRight size={18} className="text-muted-foreground/20 group-hover:text-gold group-hover:translate-x-1 transition-all" />
              </div>
              
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                    <span>Clearance Stage</span>
                    <span className="text-navy">{progress}%</span>
                  </div>
                  <div className="h-1.5 bg-offwhite rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-navy rounded-full transition-all duration-1000" 
                      style={{ width: `${progress}%` }} 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-offwhite/50 rounded-xl border border-muted/50 text-center">
                    <p className="text-sm font-black text-navy">{batch.totalStudents - batch.clearedCount}</p>
                    <p className="text-[8px] uppercase tracking-widest text-muted-foreground font-bold">Pending</p>
                  </div>
                  <div className={`p-3 rounded-xl border text-center ${batch.duesCount > 0 ? 'bg-red-50 border-red-100' : 'bg-offwhite/50 border-muted/50'}`}>
                    <p className={`text-sm font-black ${batch.duesCount > 0 ? 'text-red-700' : 'text-navy'}`}>{batch.duesCount}</p>
                    <p className="text-[8px] uppercase tracking-widest text-muted-foreground font-bold">Dues</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="bg-offwhite/50 rounded-xl border border-dashed border-muted/80 flex flex-col items-center justify-center p-8 text-center hover:bg-white hover:border-navy/20 transition-all cursor-pointer group" onClick={() => navigate('/hod/dues')}>
           <div className="h-12 w-12 rounded-full bg-white shadow-sm flex items-center justify-center text-navy/40 group-hover:text-gold transition-colors mb-4">
              <AlertCircle size={24} />
           </div>
           <h4 className="text-sm font-bold text-navy/60 group-hover:text-navy transition-colors uppercase tracking-widest">Override Center</h4>
        </div>
      </div>
    </PageWrapper>
  );
};

export default HodDashboard;
