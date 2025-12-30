import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseSignalingParams {
  userId: string;
  matchId: string;
  enabled?: boolean;
}

interface SignalingCallbacks {
  onOffer?: (offer: RTCSessionDescriptionInit, from: string) => void;
  onAnswer?: (answer: RTCSessionDescriptionInit, from: string) => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit, from: string) => void;
  onIncomingCall?: (from: string) => void;
  onCallAccepted?: (from: string) => void;
  onCallRejected?: (from: string, reason?: string) => void;
  onCallEnded?: (from: string) => void;
  onUserJoined?: (userId: string) => void;
  onUserLeft?: (userId: string) => void;
  onError?: (error: { type: string; message: string }) => void;
}

/**
 * Avari Signaling Hook - Socket.IO Version
 * 
 * Production-ready WebRTC signaling for Avari video calls
 * Features:
 * - Automatic reconnection
 * - Connection state management
 * - Error handling
 * - Participant tracking
 */
export const useSignaling = (
  { userId, matchId, enabled = true }: UseSignalingParams,
  callbacks: SignalingCallbacks
) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Initialize Socket.IO connection
  useEffect(() => {
    if (!enabled || !userId || !matchId) {
      return;
    }

    const serverUrl = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || 'http://localhost:3001';
    
    console.log('[Avari] Connecting to:', serverUrl);
    setIsConnecting(true);
    
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'], // WebSocket first, fallback to polling
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 20000,
    });

    socketRef.current = socket;

    // ================================================
    // CONNECTION EVENTS
    // ================================================

    socket.on('connect', () => {
      console.log('[Avari] Connected to signaling server');
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionError(null);
      
      // Register with server
      socket.emit('register', { userId, matchId });
    });

    socket.on('disconnect', (reason) => {
      console.log('[Avari] Disconnected:', reason);
      setIsConnected(false);
      
      if (reason === 'io server disconnect') {
        // Server disconnected us, try to reconnect
        socket.connect();
      }
    });

    socket.on('connect_error', (error) => {
      console.error('[Avari] Connection error:', error);
      setIsConnecting(false);
      setConnectionError(error.message);
      callbacks.onError?.({ 
        type: 'connection', 
        message: 'Failed to connect to server' 
      });
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log(`[Avari] Reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
      setConnectionError(null);
      
      // Re-register after reconnection
      socket.emit('register', { userId, matchId });
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`[Avari] Reconnection attempt ${attemptNumber}`);
      setIsConnecting(true);
    });

    socket.on('reconnect_error', (error) => {
      console.error('[Avari] Reconnection error:', error);
    });

    socket.on('reconnect_failed', () => {
      console.error('[Avari] Reconnection failed after all attempts');
      setConnectionError('Failed to reconnect');
      callbacks.onError?.({ 
        type: 'reconnection', 
        message: 'Could not reconnect to server' 
      });
    });

    // ================================================
    // ROOM/MATCH EVENTS
    // ================================================

    socket.on('joined', ({ matchId: joinedMatchId, participants: roomParticipants }) => {
      console.log(`[Avari] Joined match ${joinedMatchId}`);
      console.log('[Avari] Participants:', roomParticipants);
      setParticipants(roomParticipants);
    });

    socket.on('user-joined', ({ userId: joinedUserId }) => {
      console.log('[Avari] User joined:', joinedUserId);
      setParticipants(prev => {
        if (prev.includes(joinedUserId)) return prev;
        return [...prev, joinedUserId];
      });
      callbacks.onUserJoined?.(joinedUserId);
    });

    socket.on('user-left', ({ userId: leftUserId }) => {
      console.log('[Avari] User left:', leftUserId);
      setParticipants(prev => prev.filter(id => id !== leftUserId));
      callbacks.onUserLeft?.(leftUserId);
    });

    // ================================================
    // CALL CONTROL EVENTS
    // ================================================

    socket.on('incoming-call', ({ from }) => {
      console.log('[Avari] Incoming call from:', from);
      callbacks.onIncomingCall?.(from);
    });

    socket.on('call-accepted', ({ from }) => {
      console.log('[Avari] Call accepted by:', from);
      callbacks.onCallAccepted?.(from);
    });

    socket.on('call-rejected', ({ from, reason }) => {
      console.log('[Avari] Call rejected by:', from, 'Reason:', reason);
      callbacks.onCallRejected?.(from, reason);
    });

    socket.on('call-ended', ({ from }) => {
      console.log('[Avari] Call ended by:', from);
      callbacks.onCallEnded?.(from);
    });

    // ================================================
    // WEBRTC SIGNALING EVENTS
    // ================================================

    socket.on('offer', ({ offer, from }) => {
      console.log('[Avari] Received offer from:', from);
      callbacks.onOffer?.(offer, from);
    });

    socket.on('answer', ({ answer, from }) => {
      console.log('[Avari] Received answer from:', from);
      callbacks.onAnswer?.(answer, from);
    });

    socket.on('ice-candidate', ({ candidate, from }) => {
      console.log('[Avari] Received ICE candidate from:', from);
      callbacks.onIceCandidate?.(candidate, from);
    });

    // ================================================
    // ERROR EVENTS
    // ================================================

    socket.on('error', ({ type, message }) => {
      console.error('[Avari] Server error:', type, message);
      callbacks.onError?.({ type, message });
    });

    socket.on('server-shutdown', ({ message }) => {
      console.warn('[Avari] Server shutting down:', message);
      callbacks.onError?.({ 
        type: 'server_shutdown', 
        message 
      });
    });

    // ================================================
    // CLEANUP
    // ================================================

    return () => {
      console.log('[Avari] Cleaning up socket connection');
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId, matchId, enabled]);

  // ================================================
  // SIGNALING METHODS
  // ================================================

  const sendMessage = useCallback((event: string, data: any) => {
    if (!socketRef.current?.connected) {
      console.error('[Avari] Cannot send message - not connected');
      return false;
    }
    socketRef.current.emit(event, data);
    return true;
  }, []);

  const sendOffer = useCallback((offer: RTCSessionDescriptionInit, to: string) => {
    console.log('[Avari] Sending offer to:', to);
    return sendMessage('offer', { offer, to });
  }, [sendMessage]);

  const sendAnswer = useCallback((answer: RTCSessionDescriptionInit, to: string) => {
    console.log('[Avari] Sending answer to:', to);
    return sendMessage('answer', { answer, to });
  }, [sendMessage]);

  const sendIceCandidate = useCallback((candidate: RTCIceCandidateInit, to: string) => {
    return sendMessage('ice-candidate', { candidate, to });
  }, [sendMessage]);

  const initiateCall = useCallback((to: string) => {
    console.log('[Avari] Initiating call to:', to);
    return sendMessage('initiate-call', { to });
  }, [sendMessage]);

  const acceptCall = useCallback((to: string) => {
    console.log('[Avari] Accepting call from:', to);
    return sendMessage('accept-call', { to });
  }, [sendMessage]);

  const rejectCall = useCallback((to: string, reason?: string) => {
    console.log('[Avari] Rejecting call from:', to);
    return sendMessage('reject-call', { to, reason });
  }, [sendMessage]);

  const endCall = useCallback((to?: string) => {
    console.log('[Avari] Ending call');
    return sendMessage('end-call', { to });
  }, [sendMessage]);

  return {
    // Connection state
    isConnected,
    isConnecting,
    connectionError,
    
    // Participants
    participants,
    
    // Signaling methods
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    
    // Call control
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
  };
};
