/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useCallback, useRef } from 'react';
import { getTasks, deleteTask, clearTasks } from '../api/tasks';
import { getNotifications, markNotificationRead, deleteNotification } from '../api/notifications';
import { useAuth } from '../hooks/useAuth';

export const UIContext = createContext();

export const UIProvider = ({ children }) => {
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [backgroundTasks, setBackgroundTasks] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const timeoutRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const notifPollIntervalRef = useRef(null);
  const { user } = useAuth();

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    try {
      const res = await getTasks();
      if (res.data?.success) {
        setBackgroundTasks(res.data.data);
      }
    } catch (err) {
      console.error('Failed to sync background tasks:', err);
    }
  }, [user]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await getNotifications();
      if (res.data?.success) {
        setNotifications(res.data.data);
      }
    } catch (err) {
      console.error('Failed to sync notifications:', err);
    }
  }, [user]);

  // Sync on mount or auth change
  React.useEffect(() => {
    if (user) {
      fetchTasks();
      fetchNotifications();
    } else {
      setBackgroundTasks([]);
      setNotifications([]);
    }
  }, [fetchTasks, fetchNotifications, user]);

  // Polling for active tasks
  React.useEffect(() => {
    const hasActiveTasks = backgroundTasks.some(t => t.status === 'processing');
    
    if (hasActiveTasks && !pollIntervalRef.current) {
      pollIntervalRef.current = setInterval(fetchTasks, 3000);
    } else if (!hasActiveTasks && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Polling for notifications (less frequent)
    if (user && !notifPollIntervalRef.current) {
      notifPollIntervalRef.current = setInterval(fetchNotifications, 15000);
    } else if (!user && notifPollIntervalRef.current) {
      clearInterval(notifPollIntervalRef.current);
      notifPollIntervalRef.current = null;
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (notifPollIntervalRef.current) {
        clearInterval(notifPollIntervalRef.current);
        notifPollIntervalRef.current = null;
      }
    };
  }, [backgroundTasks, fetchTasks, fetchNotifications, user]);

  const addBackgroundTask = useCallback((task) => {
    // Optimistically add task (will be overwritten by backend sync)
    const newTask = {
      _id: `temp-${Date.now()}`,
      timestamp: new Date().toISOString(),
      status: 'processing',
      progress: 0,
      ...task
    };
    setBackgroundTasks(prev => [newTask, ...prev].slice(0, 50));
    return newTask._id;
  }, []);

  const clearFinishedTasksState = useCallback(async () => {
    try {
      await clearTasks();
      fetchTasks();
    } catch (err) {
      console.error('Clear tasks failed:', err);
    }
  }, [fetchTasks]);

  const removeTaskState = useCallback(async (id) => {
    if (id.startsWith('temp-')) {
      setBackgroundTasks(prev => prev.filter(t => t._id !== id));
      return;
    }
    try {
      await deleteTask(id);
      fetchTasks();
    } catch (err) {
      console.error('Remove task failed:', err);
    }
  }, [fetchTasks]);

  const updateBackgroundTask = useCallback((id, updates) => {
    setBackgroundTasks(prev => prev.map(task => 
      task._id === id ? { ...task, ...updates } : task
    ));
    // If it's a real task id, we just wait for polling or call fetchTasks
  }, []);

  const markNotifRead = useCallback(async (id) => {
    try {
      await markNotificationRead(id);
      fetchNotifications();
    } catch (err) {
      console.error('Mark read failed:', err);
    }
  }, [fetchNotifications]);

  const removeNotificationState = useCallback(async (id) => {
    try {
      await deleteNotification(id);
      fetchNotifications();
    } catch (err) {
      console.error('Delete notification failed:', err);
    }
  }, [fetchNotifications]);

  const showGlobalLoader = useCallback((message = 'Syncing Records...', minDuration = 1500) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    setLoadingMessage(message);
    setIsGlobalLoading(true);

    return () => {
      timeoutRef.current = setTimeout(() => {
        setIsGlobalLoading(false);
      }, minDuration);
    };
  }, []);

  const hideGlobalLoader = useCallback(() => {
    setIsGlobalLoading(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return (
    <UIContext.Provider value={{ 
      isGlobalLoading, 
      loadingMessage, 
      backgroundTasks,
      notifications,
      addBackgroundTask,
      updateBackgroundTask,
      removeTask: removeTaskState,
      clearFinishedTasks: clearFinishedTasksState,
      markNotificationRead: markNotifRead,
      removeNotification: removeNotificationState,
      refreshTasks: fetchTasks,
      refreshNotifications: fetchNotifications,
      showGlobalLoader, 
      hideGlobalLoader 
    }}>
      {children}
    </UIContext.Provider>
  );
};

