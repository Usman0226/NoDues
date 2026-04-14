import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import PageWrapper from '../../components/layout/PageWrapper';
import { useApi } from '../../hooks/useApi';
import { getMyClasses } from '../../api/faculty';
import { GraduationCap, BookOpen, UserCheck, ChevronRight, AlertCircle } from 'lucide-react';
import Button from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';

const MyClasses = () => {
  const navigate = useNavigate();
  const { data, loading, error } = useApi(getMyClasses, { immediate: true });

  const classes = data?.data || [];

  if (loading) {
    return <PageSpinner message="Hydrating Academic Protocol..." />;
  }

  if (error) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-4 px-6 text-center">
        <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center">
          <AlertCircle className="text-red-500" size={32} />
        </div>
        <h3 className="text-navy font-brand text-xl">Failed to load classes</h3>
        <p className="text-sm text-zinc-500 max-w-xs">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline" className="rounded-full px-8">Retry Sync</Button>
      </div>
    );
  }

  return (
    <PageWrapper 
      title="My Academic Load" 
      subtitle="Overview of your assigned classes and subject responsibilities"
    >
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
      >
        {classes.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="col-span-full bg-white/40 backdrop-blur-xl border border-dashed border-zinc-200 rounded-[2.5rem] p-16 text-center shadow-inner"
          >
            <div className="bg-zinc-50/50 h-24 w-24 rounded-full flex items-center justify-center mx-auto mb-8 border border-white">
              <GraduationCap className="text-zinc-300" size={48} />
            </div>
            <h3 className="text-navy font-black text-2xl tracking-tight mb-3">No Active Assignments</h3>
            <p className="text-sm text-zinc-500 max-w-sm mx-auto font-medium leading-relaxed opacity-60">
              Your profile is currently clear of Class Teacher or Subject Faculty directives.
            </p>
          </motion.div>
        ) : (
          classes.map((c, idx) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1, duration: 0.4, ease: "easeOut" }}
              key={`${c._id}-${idx}`}
              className="rounded-3xl premium-card p-8 hover:-translate-y-2 hover:shadow-2xl hover:shadow-navy/5 transition-all duration-500 flex flex-col justify-between group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-8">
                  <div className="relative shrink-0">
                    <div className={`absolute inset-0 blur-xl opacity-20 rounded-full transition-all duration-500 group-hover:opacity-30 ${
                      c.roleTag === 'classTeacher' ? 'bg-amber-400' : 'bg-indigo-400'
                    }`} />
                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center relative border transition-all duration-500 group-hover:scale-110 ${
                      c.roleTag === 'classTeacher' 
                        ? 'bg-amber-50 border-amber-100/50 text-amber-600 shadow-sm shadow-amber-500/10' 
                        : 'bg-indigo-50 border-indigo-100/50 text-indigo-600 shadow-sm shadow-indigo-500/10'
                    }`}>
                      {c.roleTag === 'classTeacher' ? <UserCheck size={24} /> : <BookOpen size={24} />}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black text-navy/20 uppercase tracking-[0.2em] mb-0.5">
                      {c.roleTag === 'classTeacher' ? 'Administrative Focus' : 'Instructional Duty'}
                    </p>
                    <h3 className="text-[11px] font-black text-navy uppercase tracking-widest leading-none">
                      {c.roleTag === 'classTeacher' ? 'Class Teacher' : 'Subject Faculty'}
                    </h3>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <div className="flex flex-col gap-1 mb-2">
                       <span className="text-[9px] font-black text-indigo-500/40 uppercase tracking-widest">{c.academicYear || 'Academic Session'}</span>
                       <h4 className="text-2xl font-black text-navy tracking-tight group-hover:text-indigo-600 transition-colors leading-tight">{c.name}</h4>
                    </div>
                    {c.subjectTaught && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50/50 border border-indigo-100/30 w-fit">
                         <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_5px_rgba(129,140,248,0.8)]" />
                         <p className="text-xs font-bold text-indigo-900/60 truncate leading-none uppercase tracking-tight">{c.subjectTaught}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                     <span className="px-2.5 py-1 rounded-lg bg-zinc-50 border border-zinc-100/60 text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                       Semester {c.semester}
                     </span>
                     <div className="h-1 w-1 rounded-full bg-zinc-200" />
                     <span className="text-[9px] font-black text-zinc-300 uppercase tracking-widest">
                       Live Protocol
                     </span>
                  </div>
                </div>
              </div>

              <div className="mt-12 pt-6 border-t border-zinc-100/80 relative z-10">
                <button 
                  onClick={() => navigate('/faculty/pending', { 
                    state: { 
                      classId: c._id,
                      from: 'faculty-my-classes'
                    } 
                  })}
                  className="w-full py-4 rounded-2xl bg-navy text-white text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:bg-navy/90 hover:shadow-xl hover:shadow-navy/20 active:scale-[0.97] flex items-center justify-center gap-2 group/btn"
                >
                  Enter Portal <ChevronRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </motion.div>
    </PageWrapper>
  );
};

export default MyClasses;
