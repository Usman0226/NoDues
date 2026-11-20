import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageWrapper from '../../components/layout/PageWrapper';
import { useApi } from '../../hooks/useApi';
import { getMyClasses } from '../../api/faculty';
import { 
  GraduationCap, 
  BookOpen, 
  UserCheck, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Layers, 
  RefreshCw
} from 'lucide-react';
import Button from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';

const MyClasses = () => {
  const navigate = useNavigate();
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'pending' | 'completed'
  const { data, loading, error, request: fetchClasses } = useApi(
    () => getMyClasses(), 
    { immediate: true }
  );

  const classes = useMemo(() => data?.data || [], [data?.data]);

  // Exclude closed/archived classes to keep faculty view focused on active duties
  const activeClasses = useMemo(() => {
    return classes.filter(c => c.batchStatus !== 'closed' && c.isActiveClass !== false);
  }, [classes]);

  const filteredClasses = useMemo(() => {
    if (filterTab === 'pending') {
      return activeClasses.filter(c => (c.pendingCount || 0) > 0);
    }
    if (filterTab === 'completed') {
      return activeClasses.filter(c => c.batchStatus === 'active' && (!c.pendingCount || c.pendingCount === 0));
    }
    return activeClasses;
  }, [activeClasses, filterTab]);

  const pendingCount = useMemo(() => activeClasses.filter(c => (c.pendingCount || 0) > 0).length, [activeClasses]);
  const completedCount = useMemo(() => activeClasses.filter(c => c.batchStatus === 'active' && (!c.pendingCount || c.pendingCount === 0)).length, [activeClasses]);

  if (loading) {
    return <PageSpinner message="Loading your classes..." />;
  }

  if (error) {
    return (
      <PageWrapper title="My Classes" subtitle="Unable to load">
        <div className="h-[60vh] flex flex-col items-center justify-center space-y-4 px-6 text-center">
          <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center">
            <AlertCircle className="text-red-500" size={32} />
          </div>
          <h3 className="text-navy font-brand text-xl">Failed to load classes</h3>
          <p className="text-sm text-zinc-500 max-w-xs">{error}</p>
          <Button onClick={() => fetchClasses()} variant="outline" className="rounded-full px-8">
            <RefreshCw size={14} className="mr-2" /> Try again
          </Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper 
      title="My Classes" 
      subtitle="Your assigned classes, subjects, and clearance status"
      headerActions={
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => fetchClasses()}
          className="text-zinc-600 hover:text-navy"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </Button>
      }
    >
      {/* Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-zinc-200/60 pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterTab('all')}
            className={`h-9 px-4 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              filterTab === 'all'
                ? 'bg-navy text-white shadow-sm'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <Layers size={14} />
            <span>All Classes</span>
            <span className="px-1.5 py-0.2 rounded-full bg-zinc-200 text-zinc-700 text-[9px] font-bold">
              {activeClasses.length}
            </span>
          </button>

          <button
            onClick={() => setFilterTab('pending')}
            className={`h-9 px-4 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              filterTab === 'pending'
                ? 'bg-navy text-white shadow-sm'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <Clock size={14} />
            <span>Needs Review</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[9px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setFilterTab('completed')}
            className={`h-9 px-4 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              filterTab === 'completed'
                ? 'bg-navy text-white shadow-sm'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <CheckCircle2 size={14} />
            <span>All Clear</span>
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold">
              {completedCount}
            </span>
          </button>
        </div>

        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
          Showing {filteredClasses.length} {filteredClasses.length === 1 ? 'class' : 'classes'}
        </span>
      </div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {filteredClasses.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="col-span-full bg-white border border-dashed border-zinc-200 rounded-2xl p-16 text-center shadow-xs"
          >
            <div className="bg-zinc-50 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6 border border-zinc-100">
              <GraduationCap className="text-zinc-300" size={40} />
            </div>
            <h3 className="text-navy font-black text-xl tracking-tight mb-2">No Classes Found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto font-medium leading-relaxed">
              {filterTab === 'pending' 
                ? 'No classes currently have pending clearance approvals.' 
                : filterTab === 'completed'
                ? 'No classes with all approvals completed yet.'
                : 'No classes are currently assigned to you.'}
            </p>
            {filterTab !== 'all' && (
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4 text-[10px] font-bold uppercase tracking-wider"
                onClick={() => setFilterTab('all')}
              >
                Show All Classes
              </Button>
            )}
          </motion.div>
        ) : (
          filteredClasses.map((c, idx) => {
            const isActiveDrive = c.batchStatus === 'active';
            const isNotInitiated = c.batchStatus === 'not_initiated';

            return (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.35, ease: "easeOut" }}
                key={`${c._id}-${c.roleTag}-${c.subjectCode || idx}`}
                className={`rounded-2xl p-6 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden border ${
                  isActiveDrive 
                    ? 'bg-white border-zinc-200/80 hover:border-indigo-200 hover:shadow-xl hover:shadow-navy/5' 
                    : 'bg-white border-dashed border-zinc-300 hover:border-zinc-400'
                }`}
              >
                <div>
                  {/* Header Row */}
                  <div className="flex items-start justify-between gap-3 mb-6">
                    <div className="flex items-center gap-3">
                      <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 border ${
                        c.roleTag === 'classTeacher' 
                          ? 'bg-amber-50 border-amber-200/60 text-amber-600' 
                          : 'bg-indigo-50 border-indigo-200/60 text-indigo-600'
                      }`}>
                        {c.roleTag === 'classTeacher' ? <UserCheck size={20} /> : <BookOpen size={20} />}
                      </div>
                      <div className="min-w-0">
                        <span className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] block mb-0.5">
                          {c.roleTag === 'classTeacher' ? 'Class Incharge' : 'Course Instructor'}
                        </span>
                        <h4 className="text-xs font-black text-navy uppercase tracking-wider">
                          {c.roleTag === 'classTeacher' ? 'Class Teacher' : 'Subject Faculty'}
                        </h4>
                      </div>
                    </div>

                    {/* Clearance Status Pill */}
                    <div>
                      {isActiveDrive && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0">
                          <CheckCircle2 size={10} />
                          {c.pendingCount > 0 ? `${c.pendingCount} Pending` : 'All Clear'}
                        </span>
                      )}
                      {isNotInitiated && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0">
                          <Clock size={10} /> Not Started
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                          {c.academicYear || 'Session'}
                        </span>
                        <span className="h-1 w-1 rounded-full bg-zinc-300"></span>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                          Semester {c.semester}
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-navy tracking-tight group-hover:text-indigo-600 transition-colors">
                        {c.name}
                      </h3>
                    </div>

                    {c.subjectTaught && (
                      <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-between">
                        <div className="min-w-0">
                          <span className="text-[9px] font-black text-zinc-400 uppercase tracking-wider block">Assigned Subject</span>
                          <p className="text-xs font-black text-navy truncate mt-0.5">{c.subjectTaught}</p>
                        </div>
                        {c.subjectCode && (
                          <span className="font-mono text-[10px] font-bold bg-white px-2 py-0.5 rounded border border-zinc-200 text-zinc-600 shrink-0">
                            {c.subjectCode}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Stats bar if batch exists */}
                    {c.batchId && (
                      <div className="grid grid-cols-3 gap-2 py-2 px-3 bg-white/70 rounded-xl border border-zinc-100 text-center text-xs">
                        <div>
                          <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-400 block">Pending</span>
                          <span className={`font-black ${c.pendingCount > 0 ? 'text-amber-600' : 'text-zinc-600'}`}>{c.pendingCount || 0}</span>
                        </div>
                        <div>
                          <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-400 block">Approved</span>
                          <span className="font-black text-emerald-600">{c.approvedCount || 0}</span>
                        </div>
                        <div>
                          <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-400 block">Dues</span>
                          <span className="font-black text-red-500">{c.dueCount || 0}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Action */}
                <div className="mt-6 pt-4 border-t border-zinc-100">
                  {isActiveDrive ? (
                    <button 
                      onClick={() => navigate('/faculty/pending', { 
                        state: { 
                          classId: c.batchId,
                          from: 'faculty-my-classes'
                        } 
                      })}
                      className="w-full py-3 rounded-xl bg-navy text-white text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:bg-navy/90 hover:shadow-lg hover:shadow-navy/15 active:scale-[0.98] flex items-center justify-center gap-1.5 group/btn"
                    >
                      <span>{c.pendingCount > 0 ? 'Review Approvals' : 'View Student List'}</span>
                      <ChevronRight size={13} className="group-hover/btn:translate-x-1 transition-transform" />
                    </button>
                  ) : (
                    <div className="w-full py-3 rounded-xl bg-zinc-100 text-zinc-400 text-[10px] font-bold uppercase tracking-wider text-center border border-zinc-200/50 cursor-not-allowed">
                      Clearance not started yet
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </motion.div>
    </PageWrapper>
  );
};

export default MyClasses;
