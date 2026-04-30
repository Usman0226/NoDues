import { useEffect, useRef, useCallback } from 'react';

const useSSE = (url, onMessage, eventNames = []) => {
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

    console.log(`[SSE] Connecting to ${url}...`);
    sourceRef.current?.close();
    sourceRef.current = null;

    const source = new EventSource(url, { withCredentials: true });
    sourceRef.current = source;

    const handleEvent = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.debug(`[SSE] ${event.type} received:`, data);
        onMessageRef.current?.({ 
          event: event.type, 
          data: data,
          ts: Date.now()
        });
      } catch {
        console.debug(`[SSE] ${event.type} raw received:`, event.data);
        onMessageRef.current?.({ 
          event: event.type, 
          data: event.data,
          ts: Date.now()
        });
      }
    };

    source.onopen = () => {
      console.log(`[SSE] Connected to ${url}`);
      retryCountRef.current = 0; 
    };

    // Default message listener
    source.onmessage = handleEvent;

    // Specific event listeners
    if (eventNames && eventNames.length > 0) {
      eventNames.forEach(name => {
        source.addEventListener(name, handleEvent);
      });
    }

    source.onerror = (err) => {
      console.error('[SSE] Connection error:', err);
      source.close();
      sourceRef.current = null;
      
      // Exponential backoff: 2s, 4s, 8s, 16s, max 30s
      const delay = Math.min(Math.pow(2, retryCountRef.current) * 1000, 30000);
      retryCountRef.current++;
      
      console.log(`[SSE] Retrying in ${delay}ms... (Attempt ${retryCountRef.current})`);
      retryTimerRef.current = setTimeout(() => connectRef.current?.(), delay);
    };
  }, [url, JSON.stringify(eventNames)]); // Re-connect if URL or event list changes

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