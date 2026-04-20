import React, { useState, useMemo } from 'react';
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
  Trash2,
  Info,
  Check,
  AlertTriangle,
  History
} from 'lucide-react';
import { Link } from 'react-router-dom';

const Inbox = () => {
  const { 
    backgroundTasks, 
    notifications, 
    removeTask, 
    clearFinishedTasks,
    markNotificationRead,
    removeNotification
  } = useUI();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('notifications'); // 'notifications' or 'tasks'

  const unreadNotifications = useMemo(() => 
    notifications.filter(n => !n.read), 
  [notifications]);

  const activeTasks = useMemo(() => 
    backgroundTasks.filter(t => t.status === 'processing'), 
  [backgroundTasks]);

  const hasUnread = unreadNotifications.length > 0;
  const hasProcessingTasks = activeTasks.length > 0;

  const getStatusIcon = (type) => {
    switch(type) {
      case 'success': return <CheckCircle size={14} className="text-emerald-500" />;
      case 'error': return <XCircle size={14} className="text-red-500" />;
      case 'warning': return <AlertTriangle size={14} className="text-amber-500" />;
      case 'approval': return <Check size={14} className="text-blue-500" />;
      case 'due': return <AlertTriangle size={14} className="text-red-500" />;
      default: return <Info size={14} className="text-navy" />;
    }
  };

  const getTimeLabel = (date) => {
    const now = new Date();
    const then = new Date(date);
    const diff = now - then;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    return then.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2.5 rounded-full border transition-all relative
          ${isOpen ? 'bg-navy text-white border-navy shadow-lg' : 'bg-white text-muted-foreground border-zinc-200 hover:border-navy/30 hover:bg-zinc-50'}`}
      >
        <Bell size={18} />
        {(hasUnread || hasProcessingTasks) && (
          <span className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border-2 border-white
            ${hasProcessingTasks ? 'bg-status-due animate-pulse' : 'bg-status-approved'}`}
          />
        )}
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-navy/5 backdrop-blur-[1px]" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute right-0 mt-3 w-[340px] sm:w-[400px] bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
            {/* Header */}
            <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-navy uppercase tracking-wider">Activity Center</h3>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-zinc-200 rounded-full transition-colors"
              >
                <X size={14} className="text-zinc-400" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-100 bg-white">
              <button
                onClick={() => setActiveTab('notifications')}
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all relative
                  ${activeTab === 'notifications' ? 'text-navy' : 'text-zinc-400 hover:text-zinc-600'}`}
              >
                Notifications {notifications.length > 0 && `(${notifications.length})`}
                {activeTab === 'notifications' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-navy" />}
              </button>
              <button
                onClick={() => setActiveTab('tasks')}
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all relative
                  ${activeTab === 'tasks' ? 'text-navy' : 'text-zinc-400 hover:text-zinc-600'}`}
              >
                Operations {backgroundTasks.length > 0 && `(${backgroundTasks.length})`}
                {activeTab === 'tasks' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-navy" />}
              </button>
            </div>

            <div className="max-h-[400px] overflow-y-auto no-scrollbar">
              {activeTab === 'notifications' ? (
                notifications.length === 0 ? (
                  <div className="py-12 px-6 text-center">
                    <div className="h-12 w-12 rounded-full bg-zinc-50 flex items-center justify-center mx-auto mb-3 border border-zinc-100">
                      <Bell size={20} className="text-zinc-300" />
                    </div>
                    <p className="text-xs font-bold text-zinc-400">No new notifications</p>
                    <p className="text-[10px] text-zinc-300 mt-1">You're all caught up!</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {notifications.map((notif) => (
                      <div 
                        key={notif._id} 
                        className={`p-4 transition-colors group relative ${notif.read ? 'opacity-60' : 'bg-indigo-50/30'}`}
                        onClick={() => markNotificationRead(notif._id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-1 p-1.5 rounded-lg shrink-0 bg-white border border-zinc-100 shadow-sm`}>
                            {getStatusIcon(notif.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <p className={`text-[11px] font-black uppercase tracking-tight truncate ${notif.read ? 'text-zinc-500' : 'text-navy'}`}>
                                {notif.title}
                              </p>
                              <span className="text-[9px] text-zinc-400 font-bold whitespace-nowrap ml-2">
                                {getTimeLabel(notif.createdAt)}
                              </span>
                            </div>
                            <p className="text-[10px] font-medium text-zinc-500 leading-relaxed">
                              {notif.message}
                            </p>
                            {notif.link && (
                              <Link 
                                to={notif.link}
                                className="inline-flex items-center gap-1 mt-2 text-[9px] font-black text-navy uppercase tracking-widest hover:text-gold transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markNotificationRead(notif._id);
                                  setIsOpen(false);
                                }}
                              >
                                View Details <ChevronRight size={10} />
                              </Link>
                            )}
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              removeNotification(notif._id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all text-zinc-300"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        {!notif.read && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-navy" />
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                backgroundTasks.length === 0 ? (
                  <div className="py-12 px-6 text-center">
                    <div className="h-12 w-12 rounded-full bg-zinc-50 flex items-center justify-center mx-auto mb-3 border border-zinc-100">
                      <InboxIcon size={20} className="text-zinc-300" />
                    </div>
                    <p className="text-xs font-bold text-zinc-400">No active operations</p>
                    <p className="text-[10px] text-zinc-300 mt-1">Bulk tasks progress will appear here</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {backgroundTasks.map((task) => (
                      <div key={task._id} className="p-4 hover:bg-zinc-50/80 transition-colors group">
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
                                {getTimeLabel(task.timestamp)}
                              </span>
                            </div>
                            
                            <p className="text-[10px] font-medium text-zinc-500 leading-relaxed line-clamp-2">
                              {task.message || (task.status === 'processing' ? 'Processing data...' : 'Completed')}
                            </p>

                            {task.status === 'processing' && (
                              <div className="mt-2 h-1 w-full bg-zinc-100 rounded-full overflow-hidden">
                                <div className="h-full bg-navy animate-[shimmer_2s_infinite] transition-all duration-1000" style={{ width: `${task.progress || 40}%` }} />
                              </div>
                            )}
                          </div>

                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              removeTask(task._id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all text-zinc-300"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Footer */}
            {(activeTab === 'notifications' ? notifications.length : backgroundTasks.length) > 0 && (
              <div className="px-5 py-3 bg-zinc-50/50 border-t border-zinc-100 flex items-center justify-between">
                <button 
                  onClick={activeTab === 'notifications' ? () => markNotificationRead() : clearFinishedTasks}
                  className="text-[9px] font-black text-navy uppercase tracking-widest hover:text-gold transition-colors"
                >
                  {activeTab === 'notifications' ? 'Mark all as read' : 'Clear completed'}
                </button>
                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                  End of feed
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
