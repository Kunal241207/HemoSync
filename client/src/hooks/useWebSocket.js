import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket(onEvent) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const callbackRef = useRef(onEvent);
  const stoppedRef = useRef(false);

  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  const connect = useCallback(() => {
    stoppedRef.current = false;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // If running through Vite dev proxy or production
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          if (callbackRef.current) {
            callbackRef.current(data);
          }
        } catch (e) {
          // Non-JSON message
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (stoppedRef.current) return;
        // Attempt reconnection after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!stoppedRef.current) connect();
        }, 3000);
      };

      ws.onerror = () => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      };
    } catch (err) {
      setConnected(false);
      if (stoppedRef.current) return;
      reconnectTimeoutRef.current = setTimeout(() => {
        if (!stoppedRef.current) connect();
      }, 3000);
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      stoppedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  }, []);

  return { connected, lastMessage, sendMessage };
}

export default useWebSocket;
