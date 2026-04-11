import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import { Building2, Users, GraduationCap, BookOpen, Layers, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { getDepartments } from '../../api/departments';
import Button from '../../components/ui/Button';

const Departments = () => {
  const { data: response, loading, error, request: fetchDepts } = useApi(getDepartments, { immediate: true });
  const depts = response?.data || [];

  if (loading && !depts) {
    return (
      <PageWrapper title="Departments" subtitle="Fetching academic structure...">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-pulse">
           {[1, 2].map(i => <div key={i} className="h-64 bg-muted/5 rounded-xl border border-muted"></div>)}
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper title="Departments" subtitle="Sync interrupted">
        <div className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm">
          <AlertCircle className="mx-auto text-status-due mb-4" size={48} />
          <h2 className="text-xl font-black text-navy mb-2">Structure Unavailable</h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{error}</p>
          <Button variant="primary" onClick={() => fetchDepts()}>
             <RefreshCw size={14} className="mr-2" /> Retry
          </Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Departments" subtitle="Academic department structure and oversight management">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {(depts || []).map((dept) => (
          <Link key={dept._id} to={`/admin/departments/${dept._id}/classes`}
            className="bg-white rounded-xl border border-muted shadow-sm p-8 hover:shadow-md transition-academic group">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-offwhite flex items-center justify-center group-hover:bg-navy/5 transition-colors">
                  <Building2 size={28} className="text-navy/70" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-navy group-hover:text-gold transition-colors">{dept.name}</h3>
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mt-1">HOD: {dept.hodName || 'Not Assigned'}</p>
                </div>
              </div>
              <ArrowRight size={20} className="text-muted-foreground group-hover:text-gold transition-all translate-x-0 group-hover:translate-x-1" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3.5 rounded-xl bg-offwhite/50 text-center border border-muted/30">
                <BookOpen size={14} className="text-navy mx-auto mb-1.5 opacity-60" />
                <p className="text-lg font-black text-navy">{dept.classesCount || 0}</p>
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Classes</p>
              </div>
              <div className="p-3.5 rounded-xl bg-offwhite/50 text-center border border-muted/30">
                <Users size={14} className="text-navy mx-auto mb-1.5 opacity-60" />
                <p className="text-lg font-black text-navy">{dept.facultyCount || 0}</p>
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Faculty</p>
              </div>
              <div className="p-3.5 rounded-xl bg-offwhite/50 text-center border border-muted/30">
                <GraduationCap size={14} className="text-navy mx-auto mb-1.5 opacity-60" />
                <p className="text-lg font-black text-navy">{dept.studentsCount || 0}</p>
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Students</p>
              </div>
              <div className="p-3.5 rounded-xl bg-offwhite/50 text-center border border-muted/30">
                <Layers size={14} className={`mx-auto mb-1.5 ${dept.activeBatchesCount > 0 ? 'text-gold' : 'text-muted-foreground opacity-40'}`} />
                <p className="text-lg font-black text-navy">{dept.activeBatchesCount || 0}</p>
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Active</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
};

export default Departments;
