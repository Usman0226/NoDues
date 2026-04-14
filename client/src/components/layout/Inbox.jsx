import React, { useState } from 'react';
import { useUI } from '../../hooks/useUI';
import { 
  Inbox as InboxIcon, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Bell,
  X,
  ChevronRight,
  Loader2,
  Trash2
} from 'lucide-react';

const Inbox = () => {
  const { backgroundTasks, removeTask, clearFinishedTasks } = useUI();
  const [isOpen, setIsOpen] = useState(false);

  const activeCount = backgroundTasks.filter(t => t.status === 'processing').length;
  const hasFinished = backgroundTasks.some(t => t.status !== 'processing');

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2.5 rounded-full border transition-all relative
          ${isOpen ? 'bg-navy text-white border-navy shadow-lg' : 'bg-white text-muted-foreground border-zinc-200 hover:border-navy/30 hover:bg-zinc-50'}`}
      >
        <Bell size={18} />
        {backgroundTasks.length > 0 && (
          <span className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border-2 border-white
            ${activeCount > 0 ? 'bg-status-due animate-pulse' : 'bg-status-approved'}`}
          />
        )}
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-navy/5 backdrop-blur-[1px]" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
            <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-navy uppercase tracking-wider">Activity Center</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[10px] text-zinc-500 font-bold">
                    {backgroundTasks.length === 0 ? 'No recent activity' : `${backgroundTasks.length} total operations`}
                  </p>
                  {hasFinished && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-zinc-300" />
                      <button 
                        onClick={clearFinishedTasks}
                        className="text-[10px] text-navy font-black hover:underline underline-offset-2"
                      >
                        Clear All
                      </button>
                    </>
                  )}
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-zinc-200 rounded-full transition-colors"
              >
                <X size={14} className="text-zinc-400" />
              </button>
            </div>

            <div className="max-h-[400px] overflow-y-auto no-scrollbar">
              {backgroundTasks.length === 0 ? (
                <div className="py-12 px-6 text-center">
                  <div className="h-12 w-12 rounded-full bg-zinc-50 flex items-center justify-center mx-auto mb-3 border border-zinc-100">
                    <InboxIcon size={20} className="text-zinc-300" />
                  </div>
                  <p className="text-xs font-bold text-zinc-400">Your inbox is empty</p>
                  <p className="text-[10px] text-zinc-300 mt-1">Bulk operations status will appear here</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {backgroundTasks.map((task) => (
                    <div key={task.id} className="p-4 hover:bg-zinc-50/80 transition-colors group">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 p-2 rounded-xl shrink-0
                          ${task.status === 'processing' ? 'bg-navy/5 text-navy' : 
                            task.status === 'success' ? 'bg-emerald-50 text-emerald-600' : 
                            'bg-red-50 text-red-600'}`}>
                          {task.status === 'processing' ? <Loader2 size={16} className="animate-spin" /> :
                           task.status === 'success' ? <CheckCircle size={16} /> :
                           <XCircle size={16} />}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <p className="text-[11px] font-black text-navy uppercase tracking-tight truncate">
                              {task.label}
                            </p>
                            <span className="text-[9px] text-zinc-400 font-bold whitespace-nowrap ml-2">
                              {new Date(task.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          
                          <p className="text-[10px] font-medium text-zinc-500 leading-relaxed line-clamp-2">
                            {task.message || (task.status === 'processing' ? 'Processing data...' : 'Waiting for completion')}
                          </p>

                          {task.status === 'processing' && (
                            <div className="mt-2 h-1 w-full bg-zinc-100 rounded-full overflow-hidden">
                              <div className="h-full bg-navy animate-[shimmer_2s_infinite] transition-all duration-1000" style={{ width: '40%' }} />
                            </div>
                          )}
                        </div>

                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTask(task.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all text-zinc-300"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {backgroundTasks.length > 0 && (
              <div className="p-3 bg-zinc-50/50 border-t border-zinc-100 text-center">
                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                  End of history
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Inbox;
