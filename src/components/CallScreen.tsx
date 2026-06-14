import React, { useEffect, useRef, useState } from 'react';
import { store } from '../store';
import { CallState } from '../types';
import { 
  PhoneOff, Mic, MicOff, Video, VideoOff, 
  Volume2, VolumeX, RefreshCw, Plus, ChevronDown, Radio, Lock
} from 'lucide-react';

interface CallScreenProps {
  call: CallState;
  onEnd: () => void;
  peerName: string;
  peerAvatar: string;
  isAdminMode: boolean;
}

export default function CallScreen({ call, onEnd, peerName, peerAvatar, isAdminMode }: CallScreenProps) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const [speakerOn, setSpeakerOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [callDuration, setCallDuration] = useState(0);
  const [fakeAudioMuted, setFakeAudioMuted] = useState(false);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const dialtoneContextRef = useRef<AudioContext | null>(null);
  const ringIntervalRef = useRef<any>(null);

  const isCaller = (isAdminMode && call.caller === 'admin') || (!isAdminMode && call.caller === 'client');

  // Sound generator for call dialing / ringing phase
  useEffect(() => {
    if (call.status === 'ringing') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        const ctx = new AudioCtxClass();
        dialtoneContextRef.current = ctx;

        const playRing = () => {
          if (ctx.state === 'suspended') ctx.resume();
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          
          osc1.frequency.value = 440;
          osc2.frequency.value = 480;
          gain.gain.setValueAtTime(0.06, ctx.currentTime);
          
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);
          
          osc1.start();
          osc2.start();
          
          osc1.stop(ctx.currentTime + 1.2);
          osc2.stop(ctx.currentTime + 1.2);
        };

        playRing();
        ringIntervalRef.current = setInterval(playRing, 3500);
      }
    } else {
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
      }
      if (dialtoneContextRef.current) {
        try {
          if (dialtoneContextRef.current.state !== 'closed') {
            dialtoneContextRef.current.close();
          }
        } catch (e) {
          console.warn('Error closing dialtone AudioContext: ', e);
        }
        dialtoneContextRef.current = null;
      }
    }

    return () => {
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
      }
      if (dialtoneContextRef.current) {
        try {
          dialtoneContextRef.current.close();
        } catch (e) {}
      }
    };
  }, [call.status]);

  // Acquire local webcam and microphone stream
  useEffect(() => {
    let stream: MediaStream | null = null;

    const startMedia = async () => {
      try {
        if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode },
            audio: true
          });
          setLocalStream(stream);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        } else {
          console.warn('Audio/Video media devices are not supported or blocked in this browser.');
        }
      } catch (err) {
        console.warn('Camera failed; attempting microphone-only stream:', err);
        try {
          if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false
            });
            setLocalStream(stream);
          }
        } catch (err2) {
          console.error('All media input devices access denied:', err2);
        }
      }
    };

    if (call.status === 'answered' || call.status === 'ringing') {
      startMedia();
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [call.status, facingMode]);

  // Manage WebRTC connection signaling in real-time using Firestore sync
  useEffect(() => {
    if (call.status !== 'answered' || !localStream) return;

    if (typeof RTCPeerConnection === 'undefined') {
      console.warn('RTCPeerConnection is not supported in this in-app browser.');
      return;
    }

    let pc: RTCPeerConnection;
    try {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19002' }]
      });
      pcRef.current = pc;
    } catch (e) {
      console.error('Failed to create RTCPeerConnection:', e);
      return;
    }

    // Stream our local tracks to the other side
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream!);
    });

    // Handle remote tracks addition
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      }
    };

    // Gather ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        if (isCaller) {
          const currentCandidates = call.callerCandidates ? JSON.parse(call.callerCandidates) : [];
          if (!currentCandidates.some((c: any) => c.candidate === event.candidate?.candidate)) {
            store.updateCallSignaling({
              callerCandidates: JSON.stringify([...currentCandidates, event.candidate?.toJSON()])
            });
          }
        } else {
          const currentCandidates = call.receiverCandidates ? JSON.parse(call.receiverCandidates) : [];
          if (!currentCandidates.some((c: any) => c.candidate === event.candidate?.candidate)) {
            store.updateCallSignaling({
              receiverCandidates: JSON.stringify([...currentCandidates, event.candidate?.toJSON()])
            });
          }
        }
      }
    };

    // Run custom WebRTC SDP signaling handshake
    const negotiateOfferAnswer = async () => {
      if (isCaller) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        store.updateCallSignaling({ sdpOffer: JSON.stringify(offer) });
      } else {
        if (call.sdpOffer && !pc.remoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(call.sdpOffer)));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          store.updateCallSignaling({ sdpAnswer: JSON.stringify(answer) });
        }
      }
    };

    negotiateOfferAnswer();

    return () => {
      pc.close();
      pcRef.current = null;
    };
  }, [call.status, !!localStream]);

  // Continuously apply incoming signals from the opposite peer
  useEffect(() => {
    const pc = pcRef.current;
    if (!pc || call.status !== 'answered') return;

    const applySignals = async () => {
      if (isCaller && call.sdpAnswer && !pc.remoteDescription) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(call.sdpAnswer)));
        } catch (e) {
          console.warn('Error setting remote description:', e);
        }
      }

      const targetCandidates = isCaller ? call.receiverCandidates : call.callerCandidates;
      if (targetCandidates) {
        try {
          const parsed = JSON.parse(targetCandidates);
          for (const cand of parsed) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (err) {
              console.warn('Error adding ICE Candidate:', err);
            }
          }
        } catch (e) {}
      }
    };

    applySignals();
  }, [call.sdpOffer, call.sdpAnswer, call.callerCandidates, call.receiverCandidates]);

  // Sync microphone and camera state with browser media tracks
  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !call.muted;
      });
    }
  }, [call.muted, localStream]);

  useEffect(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !call.videoMuted;
      });
    }
  }, [call.videoMuted, localStream]);

  // Mute speakerphone
  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !speakerOn;
    }
  }, [speakerOn]);

  // Keep track of active timing
  useEffect(() => {
    let timer: any = null;
    if (call.status === 'answered') {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [call.status]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleFlipCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const handleInjectVideo = () => {
    const videoUrl = prompt('ইনজেক্ট করার জন্য একটি ডিরেক্ট MP4 ভিডিও লিংক দিন:', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4');
    if (videoUrl && videoUrl.trim()) {
      store.injectVideoUrl(videoUrl.trim());
    }
  };

  return (
    <div className="absolute inset-0 bg-[#0e181e] text-white flex flex-col justify-between z-45 overflow-hidden select-none font-sans">
      
      {/* Background Media Stream / Video Feed */}
      <div className="absolute inset-0 pointer-events-none z-0">
        {!isAdminMode ? (
          /* Client side: Plays my-video.mp4 live continuously with active simulation overlay */
          <video 
            src="/my-video.mp4" 
            className="w-full h-full object-cover opacity-90"
            autoPlay 
            loop 
            playsInline
            muted={true}
            controls={false}
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
            onContextMenu={(e) => e.preventDefault()}
          />
        ) : (
          /* Admin side: Shows Client's face / camera feed via WebRTC stream channel */
          remoteStream && call.status === 'answered' ? (
            <video 
              ref={remoteVideoRef}
              className="w-full h-full object-cover"
              autoPlay 
              playsInline
              controls={false}
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
              onContextMenu={(e) => e.preventDefault()}
            />
          ) : call.videoUrl && call.status === 'answered' ? (
            <video 
              src={call.videoUrl} 
              className="w-full h-full object-cover opacity-90"
              autoPlay 
              loop 
              playsInline
              muted={fakeAudioMuted}
              controls={false}
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
              onContextMenu={(e) => e.preventDefault()}
            />
          ) : (
            <div className="w-full h-full bg-[#121b22] flex items-center justify-center opacity-85">
              <div className="text-center p-6 space-y-4">
                <div className="w-24 h-24 bg-teal-500/10 rounded-full mx-auto flex items-center justify-center border border-teal-500/20 animate-pulse">
                  <Volume2 className="w-10 h-10 text-teal-400" />
                </div>
                <p className="text-[11px] text-teal-300 font-bold uppercase tracking-widest">Securing WhatsApp Peer Signal...</p>
              </div>
            </div>
          )
        )}
      </div>

      {/* Floating local webcam preview overlay - Exact WhatsApp Selfie Window aspect-ratio */}
      {call.status === 'answered' && !call.videoMuted && localStream && localStream.getVideoTracks().length > 0 && (
        <div className="absolute right-4 top-22 w-28 h-40 bg-black rounded-xl border border-white/20 shadow-2xl z-20 overflow-hidden">
          <video 
            ref={localVideoRef}
            autoPlay 
            playsInline 
            muted 
            controls={false}
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
            onContextMenu={(e) => e.preventDefault()}
            className="w-full h-full object-cover scale-x-[-1]"
          />
        </div>
      )}

      {/* Top Header - Authentic WhatsApp Call Header layout */}
      <div className="relative pt-12 px-5 flex justify-between items-center z-10 w-full bg-gradient-to-b from-black/60 to-transparent pb-10">
        <button 
          onClick={onEnd}
          className="bg-black/20 hover:bg-black/40 p-2.5 backdrop-blur-md rounded-full transition-all text-white border border-white/10 active:scale-95 cursor-pointer"
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        {/* WhatsApp Realism Encryption Status */}
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-1.5 text-[11px] bg-black/35 px-3 py-1 rounded-full text-gray-300 font-medium tracking-wide backdrop-blur-md border border-white/5 select-none uppercase">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>End-to-end encrypted</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button 
            onClick={handleFlipCamera}
            className="bg-black/20 hover:bg-black/40 p-2.5 backdrop-blur-md rounded-full transition-all border border-white/10 active:scale-95 cursor-pointer"
            title="Flip Camera"
          >
            <RefreshCw className="w-5 h-5 text-gray-200" />
          </button>
          
          <button 
            className="bg-black/20 hover:bg-black/30 p-2.5 backdrop-blur-md rounded-full transition-all border border-white/5 opacity-60 pointer-events-none"
            title="Add Participant"
          >
            <Plus className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* WhatsApp Profile Meta Area */}
      <div className="relative flex flex-col items-center text-center px-6 py-2 z-10 -mt-2 mb-auto">
        <h2 className="text-2xl font-bold tracking-tight text-white drop-shadow-lg font-sans">{peerName}</h2>
        <div className="bg-black/25 px-3 py-1 rounded-lg mt-1.5 backdrop-blur-2xs inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-[12px] font-bold text-gray-200 uppercase tracking-widest drop-shadow-sm">
            {call.status === 'ringing' ? 'Calling...' : call.status === 'answered' ? `WhatsApp Video • ${formatDuration(callDuration)}` : 'Connecting...'}
          </p>
        </div>

        {call.status !== 'answered' && (
          <div className="relative mt-12 animate-pulse">
            <div className="absolute -inset-1 rounded-full bg-emerald-500/20 blur-md" />
            <img 
              src={peerAvatar} 
              alt="Calling avatar" 
              className="relative w-28 h-28 rounded-full object-cover border-4 border-[#075e54]/50 shadow-2xl"
            />
          </div>
        )}
      </div>

      {/* Dialtone Incoming overlay ring handler */}
      {call.status === 'ringing' && ((isAdminMode && call.caller === 'client') || (!isAdminMode && call.caller === 'admin')) && (
        <div className="relative bottom-8 flex flex-col items-center gap-4.5 z-20 animate-bounce">
          <div className="bg-[#128c7e] text-white text-xs font-bold px-4 py-2 rounded-full shadow-2xl border border-white/10 animate-pulse flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-200 animate-ping" />
            WhatsApp Video Call is Ringing...
          </div>
          <button 
            onClick={() => store.answerCall()}
            className="w-16 h-16 bg-[#25D366] hover:bg-[#20ba59] text-white flex items-center justify-center rounded-full shadow-2xl scale-110 active:scale-95 transition-all cursor-pointer border-2 border-white"
          >
            <Volume2 className="w-8 h-8 text-white" />
          </button>
        </div>
      )}

      {/* Styled Floating Controls Panel - Exact high-fidelity WhatsApp visual aesthetic */}
      <div className="relative pb-10 px-6 flex flex-col items-center gap-5 z-10 w-full bg-gradient-to-t from-black/80 to-transparent pt-12">
        {isAdminMode && call.videoUrl && call.status === 'answered' && (
          <button 
            onClick={() => setFakeAudioMuted(p => !p)}
            className={`px-4 py-2 rounded-full text-[10px] font-black tracking-widest border uppercase flex items-center gap-1.5 shadow-xl transition-all backdrop-blur-md ${
              fakeAudioMuted 
                ? 'bg-red-500/30 text-red-200 border-red-500/25' 
                : 'bg-emerald-500/30 text-emerald-200 border-emerald-500/25'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
            Client Voice: {fakeAudioMuted ? 'Muted' : 'Playing Feed'}
          </button>
        )}

        {/* Circular Dock Bar built precisely like modern native WhatsApp Video call panel */}
        <div className="bg-[#222d34]/95 backdrop-blur-lg rounded-[2.5rem] px-5 py-3.5 flex items-center justify-between w-full max-w-[340px] shadow-2xl border border-white/5">
          
          {/* Speaker Button - WhatsApp Circle grey style */}
          <button 
            onClick={() => setSpeakerOn(!speakerOn)}
            className={`p-3.5 rounded-full transition-all border cursor-pointer ${
              speakerOn 
                ? 'bg-white text-[#222d34] border-white' 
                : 'bg-white/10 border-white/5 text-gray-300 hover:bg-white/15'
            }`}
            title="Speakerphone"
          >
            {speakerOn ? <Volume2 className="w-5.5 h-5.5" /> : <VolumeX className="w-5.5 h-5.5" />}
          </button>

          {/* Video Toggle Button - WhatsApp Circle grey/red style */}
          <button 
            onClick={() => store.toggleCallVideoMuted()}
            className={`p-3.5 rounded-full transition-all border cursor-pointer ${
              !call.videoMuted 
                ? 'bg-white/10 border-white/5 text-white hover:bg-white/15' 
                : 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-500/20'
            }`}
            title="Camera Toggle"
          >
            {call.videoMuted ? <VideoOff className="w-5.5 h-5.5" /> : <Video className="w-5.5 h-5.5" />}
          </button>

          {/* Microphone Mute Button - WhatsApp Circle style */}
          <button 
            onClick={() => store.toggleCallMuted()}
            className={`p-3.5 rounded-full transition-all border cursor-pointer ${
              !call.muted 
                ? 'bg-white/10 border-white/5 text-white hover:bg-white/15' 
                : 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-500/20'
            }`}
            title="Mute Mic"
          >
            {call.muted ? <MicOff className="w-5.5 h-5.5" /> : <Mic className="w-5.5 h-5.5" />}
          </button>

          {/* Inject Dynamic Content Feed (Admin Controls) */}
          {isAdminMode && (
            <button 
              onClick={handleInjectVideo}
              className="p-3.5 bg-purple-600/20 border border-purple-500/20 text-purple-200 rounded-full hover:bg-purple-600/30 transition-all cursor-pointer"
              title="Inject demo video stream"
            >
              <Radio className="w-5.5 h-5.5" />
            </button>
          )}

          {/* WhatsApp Direct Hang Up (Decline Call button styled explicitly inside dock) */}
          {!(call.status === 'answered' && !isAdminMode) ? (
            <button 
              onClick={onEnd}
              className="p-3.5 bg-[#f43f5e] hover:bg-[#ea2e4f] text-white rounded-full shadow-lg shadow-red-600/30 active:scale-95 transition-all border border-red-500 cursor-pointer"
              title="Hang up"
            >
              <PhoneOff className="w-6 h-6 text-white" />
            </button>
          ) : (
            <div className="flex flex-col items-center justify-center px-1 text-center select-none font-sans">
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-3 py-1.5 rounded-full font-black tracking-widest uppercase border border-emerald-500/30 whitespace-nowrap">
                Live
              </span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
