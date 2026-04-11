import { useEffect, useRef, useCallback } from 'react';

const useSSE = (url, onMessage) => {
  const sourceRef = useRef(null);

  const connect = useCallback(() => {
    if (!url) return;
    const source = new EventSource(url);
    sourceRef.current = source;

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage?.(data);
      } catch {
        onMessage?.(event.data);
      }
    };

    source.onerror = () => {
      source.close();
      // Reconnect after 5s
      setTimeout(connect, 5000);
    };
  }, [url, onMessage]);

  useEffect(() => {
    connect();
    return () => sourceRef.current?.close();
  }, [connect]);
};

export default useSSE;
