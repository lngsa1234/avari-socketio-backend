import { useEffect, useRef, useState } from 'react';
import { useSignaling } from '@/hooks/useSignaling';
import { useIceServers } from '@/hooks/useIceServers';

interface VideoCallProps {
  matchId: string;
  userId: string;
  otherUserId: string;
  otherUserName: string;
  onEndCall: () => void;
}

export default function VideoCall({
  matchId,
  userId,
  otherUserId,
  otherUserName,
  onEndCall,
}: VideoCallProps) {
  // State
  const [callState, setCallState] = useState<'idle' | 'calling' | 'ringing' | 'connected' | 'ended'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Hooks
  const { iceServers, loading: iceServersLoading } = useIceServers();
  
  const {
    isConnected,
    isConnecting,
    connectionError,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall: endSignalingCall,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
  } = useSignaling(
    { userId, matchId, enabled: true },
    {
      onOffer: async (offer, from) => {
        if (from !== otherUserId) return;
        await handleRemoteOffer(offer);
      },
      onAnswer: async (answer, from) => {
        if (from !== otherUserId) return;
        await handleRemoteAnswer(answer);
      },
      onIceCandidate: async (candidate, from) => {
        if (from !== otherUserId) return;
        await handleRemoteIceCandidate(candidate);
      },
      onIncomingCall: (from) => {
        if (from !== otherUserId) return;
        setCallState('ringing');
      },
      onCallAccepted: (from) => {
        if (from !== otherUserId) return;
        startCall();
      },
      onCallRejected: (from, reason) => {
        setError(`Call rejected: ${reason}`);
        setCallState('ended');
        cleanup();
      },
      onCallEnded: (from) => {
        setCallState('ended');
        cleanup();
        setTimeout(onEndCall, 1000);
      },
      onError: (error) => {
        console.error('[Avari] Signaling error:', error);
        setError(error.message);
      },
    }
  );

  // Initialize peer connection
  const initializePeerConnection = () => {
    if (peerConnectionRef.current || iceServersLoading) return;

    console.log('[Avari] Initializing peer connection with ICE servers:', iceServers);
    const peerConnection = new RTCPeerConnection({ iceServers });
    peerConnectionRef.current = peerConnection;

    // ICE candidate handler
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[Avari] Sending ICE candidate');
        sendIceCandidate(event.candidate.toJSON(), otherUserId);
      }
    };

    // Remote stream handler
    peerConnection.ontrack = (event) => {
      console.log('[Avari] Received remote track:', event.track.kind);
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Connection state handler
    peerConnection.onconnectionstatechange = () => {
      console.log('[Avari] Connection state:', peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'connected') {
        setCallState('connected');
        setError(null);
      } else if (
        peerConnection.connectionState === 'failed' ||
        peerConnection.connectionState === 'disconnected'
      ) {
        setError('Connection lost');
        handleEndCall();
      }
    };

    // ICE connection state handler
    peerConnection.oniceconnectionstatechange = () => {
      console.log('[Avari] ICE connection state:', peerConnection.iceConnectionState);
    };

    // Add pending ICE candidates
    pendingCandidatesRef.current.forEach(async (candidate) => {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[Avari] Error adding pending ICE candidate:', err);
      }
    });
    pendingCandidatesRef.current = [];
  };

  // Get local media stream
  const getLocalStream = async () => {
    try {
      console.log('[Avari] Getting local media stream');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Add tracks to peer connection
      if (peerConnectionRef.current) {
        stream.getTracks().forEach((track) => {
          peerConnectionRef.current!.addTrack(track, stream);
        });
      }

      return stream;
    } catch (err) {
      console.error('[Avari] Error getting local stream:', err);
      setError('Could not access camera/microphone');
      throw err;
    }
  };

  // Start call (create offer)
  const startCall = async () => {
    try {
      console.log('[Avari] Starting call');
      setCallState('calling');

      initializePeerConnection();
      await getLocalStream();

      const offer = await peerConnectionRef.current!.createOffer();
      await peerConnectionRef.current!.setLocalDescription(offer);

      console.log('[Avari] Sending offer');
      sendOffer(offer, otherUserId);
    } catch (err) {
      console.error('[Avari] Error starting call:', err);
      setError('Failed to start call');
      setCallState('idle');
    }
  };

  // Handle incoming call (answer)
  const handleAnswer = async () => {
    try {
      console.log('[Avari] Answering call');
      acceptCall(otherUserId);

      initializePeerConnection();
      await getLocalStream();
    } catch (err) {
      console.error('[Avari] Error answering call:', err);
      setError('Failed to answer call');
    }
  };

  // Handle remote offer
  const handleRemoteOffer = async (offer: RTCSessionDescriptionInit) => {
    try {
      console.log('[Avari] Handling remote offer');
      
      if (!peerConnectionRef.current) {
        initializePeerConnection();
        await getLocalStream();
      }

      await peerConnectionRef.current!.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await peerConnectionRef.current!.createAnswer();
      await peerConnectionRef.current!.setLocalDescription(answer);

      console.log('[Avari] Sending answer');
      sendAnswer(answer, otherUserId);
      setCallState('connected');
    } catch (err) {
      console.error('[Avari] Error handling remote offer:', err);
      setError('Failed to establish connection');
    }
  };

  // Handle remote answer
  const handleRemoteAnswer = async (answer: RTCSessionDescriptionInit) => {
    try {
      console.log('[Avari] Handling remote answer');
      
      if (!peerConnectionRef.current) {
        console.error('[Avari] No peer connection');
        return;
      }

      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      setCallState('connected');
    } catch (err) {
      console.error('[Avari] Error handling remote answer:', err);
      setError('Failed to establish connection');
    }
  };

  // Handle remote ICE candidate
  const handleRemoteIceCandidate = async (candidate: RTCIceCandidateInit) => {
    try {
      if (!peerConnectionRef.current) {
        console.log('[Avari] Queueing ICE candidate');
        pendingCandidatesRef.current.push(candidate);
        return;
      }

      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[Avari] Error adding ICE candidate:', err);
    }
  };

  // Toggle audio
  const toggleAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsAudioEnabled(!isAudioEnabled);
    }
  };

  // Toggle video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  // Handle end call
  const handleEndCall = () => {
    console.log('[Avari] Ending call');
    endSignalingCall(otherUserId);
    setCallState('ended');
    cleanup();
    onEndCall();
  };

  // Handle reject call
  const handleRejectCall = () => {
    console.log('[Avari] Rejecting call');
    rejectCall(otherUserId, 'User declined');
    setCallState('ended');
    cleanup();
    onEndCall();
  };

  // Cleanup
  const cleanup = () => {
    console.log('[Avari] Cleaning up resources');

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    pendingCandidatesRef.current = [];
  };

  // Initialize call on mount
  useEffect(() => {
    if (isConnected && !iceServersLoading) {
      // Initiate call signaling
      initiateCall(otherUserId);
    }
  }, [isConnected, iceServersLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Error banner */}
      {(error || connectionError) && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg z-50 max-w-md text-center">
          {error || connectionError}
        </div>
      )}

      {/* Connection status */}
      {isConnecting && (
        <div className="absolute top-4 left-4 bg-yellow-500 text-white px-3 py-2 rounded-lg text-sm">
          Connecting to server...
        </div>
      )}

      {/* Video containers */}
      <div className="flex-1 relative">
        {/* Remote video (full screen) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />

        {/* Local video (small preview) */}
        <div className="absolute top-4 right-4 w-48 h-36 bg-gray-900 rounded-lg overflow-hidden shadow-xl">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </div>

        {/* Call state overlay */}
        {callState !== 'connected' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
            <div className="text-center text-white">
              <p className="text-2xl font-semibold mb-2">{otherUserName}</p>
              {callState === 'idle' && <p>Preparing call...</p>}
              {callState === 'calling' && <p>Calling...</p>}
              {callState === 'ringing' && <p>Incoming call...</p>}
              {callState === 'ended' && <p>Call ended</p>}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-gray-900 p-6">
        <div className="max-w-md mx-auto flex items-center justify-center gap-4">
          {callState === 'ringing' ? (
            <>
              <button
                onClick={handleRejectCall}
                className="p-4 bg-red-500 hover:bg-red-600 rounded-full transition"
                title="Reject call"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button
                onClick={handleAnswer}
                className="p-4 bg-green-500 hover:bg-green-600 rounded-full transition"
                title="Accept call"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </>
          ) : (
            <>
              {/* Microphone toggle */}
              <button
                onClick={toggleAudio}
                className={`p-4 rounded-full transition ${
                  isAudioEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'
                }`}
                title={isAudioEnabled ? 'Mute' : 'Unmute'}
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isAudioEnabled ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  )}
                </svg>
              </button>

              {/* Camera toggle */}
              <button
                onClick={toggleVideo}
                className={`p-4 rounded-full transition ${
                  isVideoEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'
                }`}
                title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isVideoEnabled ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  )}
                </svg>
              </button>

              {/* End call */}
              <button
                onClick={handleEndCall}
                className="p-4 bg-red-500 hover:bg-red-600 rounded-full transition"
                title="End call"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Connection indicator */}
      <div className="absolute bottom-24 left-4 text-white text-sm bg-black bg-opacity-50 px-3 py-2 rounded">
        {!isConnected && <p>⚠️ {isConnecting ? 'Connecting...' : 'Disconnected'}</p>}
        {isConnected && callState === 'calling' && <p>📞 Calling...</p>}
        {isConnected && callState === 'connected' && <p>✅ Connected</p>}
      </div>
    </div>
  );
}
