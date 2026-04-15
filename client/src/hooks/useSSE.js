import { useEffect, useRef, useCallback } from 'react';

const useSSE = (url, onMessage) => {
  const sourceRef     = useRef(null);
  const retryTimerRef = useRef(null);
  const retryCountRef = useRef(0);
  const onMessageRef  = useRef(onMessage);
  const connectRef    = useRef(null);

  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  const connect = useCallback(() => {
    if (!url) return;

    sourceRef.current?.close();
    sourceRef.current = null;

    const source = new EventSource(url, { withCredentials: true });
    sourceRef.current = source;

    source.onopen = () => {
      retryCountRef.current = 0; // Reset on success
    };

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
      
      // Exponential backoff: 2s, 4s, 8s, 16s, max 30s
      const delay = Math.min(Math.pow(2, retryCountRef.current) * 1000, 30000);
      retryCountRef.current++;
      
      retryTimerRef.current = setTimeout(() => connectRef.current?.(), delay);
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
