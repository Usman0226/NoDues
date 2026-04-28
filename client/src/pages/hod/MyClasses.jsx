import React from 'react';
import { useNavigate } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';
import { getMyClasses } from '../../api/faculty';
import { GraduationCap, BookOpen, UserCheck, ChevronRight, AlertCircle } from 'lucide-react';
import Button from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';

const MyClasses = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {classes.length === 0 ? (
          <div className="col-span-full bg-white border border-dashed border-zinc-200 rounded-3xl p-12 text-center">
            <div className="bg-zinc-50 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <GraduationCap className="text-zinc-300" size={40} />
            </div>
            <h3 className="text-navy font-brand text-xl mb-2">No Classes Assigned</h3>
            <p className="text-sm text-zinc-500 max-w-sm mx-auto">
              You have no active Class Teacher or Subject Faculty assignments in the currently. 
              Verify assignments in the identity management portal.
            </p>
          </div>
        ) : (
          classes.map((c, idx) => (
            <div 
              key={`${c._id}-${idx}`}
              className="group bg-white rounded-3xl border border-zinc-200 p-6 hover:shadow-2xl hover:shadow-indigo-900/10 hover:border-indigo-200 transition-all duration-300 relative overflow-hidden"
            >
              {/* Background Decoration */}
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-50/50 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex justify-between items-start mb-6">
                <div className={`p-3 rounded-2xl ${c.roleTag === 'classTeacher' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}>
                  {c.roleTag === 'classTeacher' ? <UserCheck size={20} /> : <BookOpen size={20} />}
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Batch</span>
                  <span className="text-sm font-bold text-navy">{c.academicYear}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-brand text-navy leading-none mb-1">{c.name}</h3>
                  <p className="text-xs text-zinc-500 font-medium">Semester {c.semester}</p>
                </div>

                <div className="pt-2">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                    c.roleTag === 'classTeacher' 
                    ? 'bg-amber-100/50 border-amber-200 text-amber-700' 
                    : 'bg-indigo-100/50 border-indigo-200 text-indigo-700'
                  }`}>
                    {c.roleTag === 'classTeacher' ? 'Class Teacher' : 'Subject Faculty'}
                  </span>
                </div>

                {c.subjectTaught && (
                  <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-100">
                    <span className="block text-[8px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-1">Assigned Subject</span>
                    <p className="text-sm font-bold text-navy truncate">{c.subjectTaught}</p>
                    <p className="text-[10px] font-mono text-zinc-500 mt-0.5">{c.subjectCode}</p>
                  </div>
                )}

                <div className="pt-4 flex items-center justify-between">
                  <div className="flex -space-x-2">
                    {/* <div className="h-6 w-6 rounded-full border-2 border-white bg-zinc-100 flex items-center justify-center text-[10px] font-bold text-zinc-400"></div> */}
                    {/* <div className="h-6 w-6 rounded-full border-2 border-white bg-indigo-500 flex items-center justify-center text-[8px] font-bold text-white"></div> */}
                  </div>
                  
                  <button 
                    onClick={() => navigate('/faculty/pending', { 
                      state: { 
                        classId: c._id,
                        from: 'hod-my-classes',
                        facultyId: user?.userId,
                        approvalType: c.roleTag === 'classTeacher' ? 'classTeacher' : 'subject'
                      } 
                    })}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    Manage Queue <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </PageWrapper>
  );
};

export default MyClasses;
