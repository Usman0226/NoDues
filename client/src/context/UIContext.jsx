import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const UIContext = createContext();

export const UIProvider = ({ children }) => {
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const timeoutRef = useRef(null);

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
    <UIContext.Provider value={{ isGlobalLoading, loadingMessage, showGlobalLoader, hideGlobalLoader }}>
      {children}
    </UIContext.Provider>
  );
};

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};
