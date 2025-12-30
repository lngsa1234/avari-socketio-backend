import { useState, useEffect } from 'react';

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

interface UseIceServersReturn {
  iceServers: IceServer[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch ICE servers (STUN/TURN) from Avari backend
 * 
 * Usage:
 * ```typescript
 * const { iceServers, loading, error } = useIceServers();
 * 
 * // Use in RTCPeerConnection
 * const peerConnection = new RTCPeerConnection({ iceServers });
 * ```
 */
export const useIceServers = (): UseIceServersReturn => {
  const [iceServers, setIceServers] = useState<IceServer[]>([
    // Default STUN servers as fallback
    { urls: 'stun:stun.l.google.com:19302' },
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchIceServers = async () => {
      try {
        const serverUrl = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || 'http://localhost:3001';
        const response = await fetch(`${serverUrl}/api/ice-servers`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.iceServers && Array.isArray(data.iceServers)) {
          console.log('[Avari] Fetched ICE servers:', data.iceServers.length);
          setIceServers(data.iceServers);
        }
        
        setError(null);
      } catch (err) {
        console.error('[Avari] Failed to fetch ICE servers:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch ICE servers');
        // Keep using default STUN servers
      } finally {
        setLoading(false);
      }
    };

    fetchIceServers();
  }, []);

  return { iceServers, loading, error };
};
