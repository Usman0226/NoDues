import { useEffect, useRef, useCallback } from 'react';

const useSSE = (url, onMessage) => {
  const sourceRef     = useRef(null);
  const retryTimerRef = useRef(null);
  const onMessageRef  = useRef(onMessage);
  const connectRef    = useRef(null); // holds the connect fn to avoid TDZ in onerror

  // Keep refs current on every render
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  const connect = useCallback(() => {
    if (!url) return;

    // Clean up any existing connection before opening a new one
    sourceRef.current?.close();
    sourceRef.current = null;

    const source = new EventSource(url, { withCredentials: true });
    sourceRef.current = source;

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current?.(data);
      } catch {
        onMessageRef.current?.(event.data);
      }
    };

    source.onerror = () => {
      source.close();
      sourceRef.current = null;
      retryTimerRef.current = setTimeout(() => connectRef.current?.(), 5000);
    };
  }, [url]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(retryTimerRef.current);
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [connect]);
};

export default useSSE;  
