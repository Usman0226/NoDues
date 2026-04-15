import React from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import { useApi } from '../../hooks/useApi';
import { getStudentHistory } from '../../api/student';
import { 
  History as HistoryIcon, 
  Calendar, 
  ChevronRight, 
  FileCheck,
  Search,
  AlertCircle
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const History = () => {
  const { data, loading, error } = useApi(getStudentHistory);
  const records = data?.data || [];

  if (loading && !data) {
    return (
      <PageWrapper title="History" subtitle="Loading your academic records...">
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-zinc-50 rounded-2xl border border-zinc-100" />
          ))}
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper 
      title="Clearance History" 
      subtitle="Archive of all academic clearance cycles"
    >
      <div className="flex flex-col gap-8 pb-12">
        {/* Search/Filter Bar - Minimalist */}
        <div className="relative group max-w-md">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search className="text-zinc-300 group-focus-within:text-navy transition-colors" size={16} />
          </div>
          <input 
            type="text" 
            placeholder="Search by session or semester..."
            className="w-full bg-white border border-zinc-200 rounded-2xl py-3 pl-12 pr-4 text-xs font-bold text-navy placeholder:text-zinc-300 focus:outline-none focus:ring-4 focus:ring-navy/5 focus:border-navy/20 transition-all shadow-sm"
          />
        </div>

        <div className="grid grid-cols-1 gap-6">
          {records.map((record, i) => (
            <motion.div
              key={record.requestId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link 
                to={`/student/history/${record.requestId}`}
                className="block bg-white border border-zinc-100 rounded-[2rem] p-5 sm:p-7 group hover:shadow-2xl hover:shadow-navy/5 transition-all duration-500 active:scale-[0.98] relative overflow-hidden"
              >
                {/* Visual Flair */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-zinc-500/5 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div className="flex items-center gap-6">
                    <div className="h-14 w-14 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-300 group-hover:bg-navy/5 group-hover:text-navy transition-all duration-500 shrink-0 border border-zinc-100 shadow-sm">
                      <FileCheck size={26} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">SESSION {record.academicYear || 'N/A'}</span>
                        <div className="h-1 w-1 rounded-full bg-zinc-200" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">SEM {record.semester || 'N/A'}</span>
                      </div>
                      <h3 className="text-lg sm:text-xl font-black text-navy tracking-tight truncate mb-1">
                        {record.className || 'Academic Cycle'}
                      </h3>
                      <div className="flex items-center gap-2">
                        <Calendar size={12} className="text-zinc-300" />
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                          Archived {new Date(record.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 pt-4 sm:pt-0 border-zinc-50">
                    <div className="flex flex-col items-start sm:items-end gap-1.5">
                      <Badge status={record.status} />
                      {record.overrideRemark && (
                        <span className="text-[8px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50/50 px-2 py-1 rounded-lg border border-indigo-100/50">HoD Exception</span>
                      )}
                    </div>
                    <div className="h-11 w-11 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-300 group-hover:bg-navy group-hover:text-white transition-all duration-500 shadow-sm border border-zinc-100">
                      <ChevronRight size={20} />
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}

          {records.length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center text-center opacity-30">
              <div className="h-20 w-20 bg-zinc-100 rounded-full flex items-center justify-center mb-6">
                <HistoryIcon size={32} className="text-zinc-400" />
              </div>
              <h2 className="text-xl font-bold text-navy mb-2">No History Found</h2>
              <p className="max-w-[240px] text-xs font-medium text-muted-foreground mx-auto">
                Once a clearance cycle is completed and archived, it will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
};

export default History;
