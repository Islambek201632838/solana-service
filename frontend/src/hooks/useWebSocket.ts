import { useEffect, useRef, useState } from "react";
import { WS_URL } from "../lib/api";

export function useWebSocket() {
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 3000);
      };
      ws.onmessage = (e) => {
        try {
          setLastMessage(JSON.parse(e.data));
        } catch (err) {
          console.warn("[WS] Failed to parse message:", err);
        }
      };
    }

    connect();
    return () => { wsRef.current?.close(); };
  }, []);

  return { lastMessage, connected };
}
