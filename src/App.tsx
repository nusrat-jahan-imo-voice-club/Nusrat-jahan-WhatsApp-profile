import React, { useState, useEffect } from 'react';
import { store } from './store';
import ClientView from './components/ClientView';
import AdminView from './components/AdminView';
import LoginModal from './components/LoginModal';
import CallScreen from './components/CallScreen';
import { Bell, MessageSquare, ShieldAlert, Check, Phone, PhoneOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatSession } from './types';

export default function App() {
  const [appState, setAppState] = useState(store.getState());
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [popupNotification, setPopupNotification] = useState<{
    uid: string;
    text: string;
    senderName: string;
    avatar: string;
  } | null>(null);

  const [isShieldActive, setIsShieldActive] = useState(false);
  const [shieldReason, setShieldReason] = useState('');

  // Sreenshot, screen recording, printing, copying, and right-click protection engine
  useEffect(() => {
    // 1. Right Click contextmenu prevention
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener('contextmenu', handleContextMenu);

    // 2. Drag & Drop start prevention
    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
    };
    document.addEventListener('dragstart', handleDragStart);

    // 3. Prevent Copying or Cutting sensitive content
    const handleCopyCut = (e: ClipboardEvent) => {
      e.preventDefault();
      if (e.clipboardData) {
        e.clipboardData.setData('text/plain', '🔒 Security Protection: Operations are protected on this secure application.');
      }
    };
    document.addEventListener('copy', handleCopyCut);
    document.addEventListener('cut', handleCopyCut);

    // 4. Keyboard Shortcuts Interception & Screenshot Key Blockers
    const handleKeyDown = (e: KeyboardEvent) => {
      // Print Screen Key
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        e.preventDefault();
        triggerTemporaryShield('Screenshot Blocked');
        try {
          navigator.clipboard.writeText('🔒 Webpage content is protected.');
        } catch (err) {}
      }

      // Print Key (Ctrl+P / Cmd+P)
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        triggerTemporaryShield('Printing is secure and blocked on this platform');
      }

      // Save Key (Ctrl+S / Cmd+S)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
      }

      // Developer Tools blocks (F12, Ctrl+Shift+I, J, C, View Source)
      if (
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
        ((e.ctrlKey || e.metaKey) && (e.key === 'U' || e.key === 'u'))
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // 5. Blur & Visibilitychange protection wrapper (Crucial for Mobile/In-App screenshot blockers)
    // When the user drops down the quick settings panel to screen-record/screenshot, switches app, 
    // or captures a device frame snapshot, we instantly render the screen completely black.
    const handleBlur = () => {
      setIsShieldActive(true);
      setShieldReason('🔒 Security Active');
    };

    const handleFocus = () => {
      setTimeout(() => {
        setIsShieldActive(false);
      }, 250);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsShieldActive(true);
        setShieldReason('🔒 Security Active');
      } else {
        setTimeout(() => {
          setIsShieldActive(false);
        }, 250);
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('copy', handleCopyCut);
      document.removeEventListener('cut', handleCopyCut);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const triggerTemporaryShield = (reason: string) => {
    setIsShieldActive(true);
    setShieldReason(reason);
    setTimeout(() => {
      setIsShieldActive(false);
    }, 1200);
  };

  // Subscribe to store updates
  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      setAppState({ ...store.getState() });
    });
    return () => unsubscribe();
  }, []);

  // Watch for incoming push notification triggers
  useEffect(() => {
    if (appState.currentRole === 'admin') {
      const activeChats = Object.values(appState.chats) as ChatSession[];
      const unreadWithText = activeChats.find(
        (c) => c.userInfo.unreadCountAdmin > 0 && c.uid !== appState.adminSelectedUid
      );

      if (unreadWithText) {
        const lastMsgObj = unreadWithText.messages[unreadWithText.messages.length - 1];
        if (lastMsgObj) {
          setPopupNotification({
            uid: unreadWithText.uid,
            senderName: unreadWithText.userInfo.nickname,
            text: lastMsgObj.text,
            avatar: unreadWithText.userInfo.avatar,
          });

          // Play a small notification audio tone using browser native synthesizer
          try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.frequency.value = 587.33; // D5 note
            gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
          } catch (e) {
            console.log('Audio synthesis not active.', e);
          }

          // Dismiss toast after a few seconds
          const timer = setTimeout(() => {
            setPopupNotification(null);
          }, 4000);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [appState.chats, appState.currentRole, appState.adminSelectedUid]);

  const handleEndCall = () => {
    store.endCall();
  };

  const handleRejectCall = () => {
    store.rejectCall('rejected');
  };

  const isCaller = !!appState.currentCall && (
    (appState.currentRole === 'admin' && appState.currentCall.caller === 'admin') ||
    (appState.currentRole === 'client' && appState.currentCall.caller === 'client')
  );

  const shouldShowFullScreenCall = !!appState.currentCall && (
    appState.currentCall.status === 'answered' || isCaller
  );

  const shouldShowIncomingCallPopup = !!appState.currentCall && 
    appState.currentCall.status === 'ringing' && 
    !isCaller && (
      appState.currentRole === 'admin' || appState.currentCall.uid === appState.clientSelectedUid
    );

  // Play synthetic dual-tone incoming ringtone loop for the receiver
  useEffect(() => {
    if (!shouldShowIncomingCallPopup) return;

    let audioCtx: AudioContext | null = null;
    let interval: any = null;

    const playRingTone = () => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        audioCtx = new AudioContextClass();
        
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        // 450Hz and 400Hz frequencies produce the iconic telephone/WhatsApp ring experience
        osc1.frequency.setValueAtTime(450, audioCtx.currentTime);
        osc1.type = 'sine';
        
        osc2.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc2.type = 'sine';

        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2.0);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc1.start();
        osc2.start();

        osc1.stop(audioCtx.currentTime + 2.2);
        osc2.stop(audioCtx.currentTime + 2.2);
      } catch (err) {
        console.warn("Audio synthesis context failed or user interaction required:", err);
      }
    };

    playRingTone();
    interval = setInterval(playRingTone, 3200);

    return () => {
      clearInterval(interval);
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    };
  }, [shouldShowIncomingCallPopup]);

  const fallbackChatSession: ChatSession = {
    uid: appState.clientSelectedUid || 'CLIENT',
    userInfo: {
      uid: appState.clientSelectedUid || 'CLIENT',
      nickname: appState.clientSelectedUid || 'CLIENT',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${appState.clientSelectedUid || 'CLIENT'}`,
      lastTime: '',
      unreadCountAdmin: 0,
      isBlocked: false,
    },
    messages: []
  };

  const activeChatSession = (appState.chats[
    appState.currentRole === 'client' ? appState.clientSelectedUid : appState.adminSelectedUid
  ] as ChatSession) || (Object.values(appState.chats)[0] as ChatSession) || fallbackChatSession;

  // Fetch name/avatar for overlay call representation
  const getCallPartnerInfo = () => {
    if (!appState.currentCall) return { name: 'Support Deck', avatar: 'https://cdn-icons-png.flaticon.com/512/847/847969.png' };
    const clientUid = appState.currentCall.uid;
    const client = appState.chats[clientUid]?.userInfo;
    
    if (appState.currentRole === 'client') {
      return {
        name: 'Nusrat Jahan',
        avatar: '/my-logo.jpg',
      };
    } else {
      return {
        name: client ? client.nickname : `Client ${clientUid}`,
        avatar: client ? client.avatar : 'https://cdn-icons-png.flaticon.com/512/847/847969.png',
      };
    }
  };

  const partnerInfo = getCallPartnerInfo();

  return (
    <div className="w-full h-[100dvh] flex flex-col bg-[#121b22] font-sans antialiased overflow-hidden select-none">
      
      {/* Main View layout viewport container */}
      <div className="flex-1 w-full bg-white relative flex flex-col overflow-hidden max-w-7xl mx-auto md:shadow-2xl">
        
        {/* Render Viewport Content based on active role */}
        {appState.currentRole === 'client' ? (
          <ClientView 
            chat={activeChatSession} 
            currentCall={appState.currentCall}
            onOpenLogin={() => setIsLoginOpen(true)}
          />
        ) : (
          <AdminView 
            chats={appState.chats} 
            currentCall={appState.currentCall}
            callHistory={appState.callHistory}
            selectedChatUid={appState.adminSelectedUid}
            onLogout={() => store.setRole('client')}
          />
        )}

        {/* Interactive Floating Incoming Call Popup */}
        <AnimatePresence>
          {shouldShowIncomingCallPopup && (
            <motion.div 
              initial={{ opacity: 0, y: -100, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -100, scale: 0.9 }}
              transition={{ type: 'spring', damping: 20, stiffness: 120 }}
              className="absolute top-4 left-4 right-4 max-w-md mx-auto bg-slate-900/95 text-white backdrop-blur-md rounded-2xl shadow-2xl p-4 flex items-center justify-between gap-4 border border-white/10 z-50 select-none cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative flex-shrink-0">
                  <img 
                    src={partnerInfo.avatar} 
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-emerald-500" 
                    alt="Incoming caller avatar"
                  />
                  <span className="absolute -bottom-1 -right-1 bg-emerald-500 p-1 rounded-full animate-bounce">
                    <span className="block w-2.5 h-2.5 bg-white rounded-full animate-ping" />
                  </span>
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-sm tracking-tight truncate">{partnerInfo.name}</h4>
                  <p className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 mt-0.5 whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Incoming {appState.currentCall?.type === 'video' ? 'Video' : 'Voice'} Call...
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <button 
                  onClick={handleRejectCall}
                  className="w-10 h-10 bg-red-500 hover:bg-red-600 active:scale-95 text-white flex items-center justify-center rounded-full shadow-lg transition-transform"
                  title="Decline Call"
                >
                  <PhoneOff className="w-5 h-5 text-white" />
                </button>
                <button 
                  onClick={() => store.answerCall()}
                  className="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white flex items-center justify-center rounded-full shadow-lg transition-transform"
                  title="Answer Call"
                >
                  <Phone className="w-5 h-5 text-white" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Support Operator Toast alerts for unobserved inbox channels */}
        <AnimatePresence>
          {popupNotification && appState.currentRole === 'admin' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              onClick={() => {
                store.selectAdminChat(popupNotification.uid);
                setPopupNotification(null);
              }}
              className="absolute top-16 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-white rounded-2xl shadow-2xl p-3.5 flex items-center gap-3.5 border border-emerald-100 z-50 cursor-pointer hover:bg-emerald-50/20 active:translate-y-0.5 transition-all animate-shake"
            >
              <div className="bg-[#e7fce3] p-1 rounded-full relative flex-shrink-0">
                <img 
                  src={popupNotification.avatar} 
                  className="w-10 h-10 rounded-full object-cover border border-emerald-50 shadow-xs"
                />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              </div>
              <div className="overflow-hidden flex-1">
                <div className="flex items-center gap-1.5 justify-between">
                  <h4 className="font-bold text-xs text-gray-800 truncate">{popupNotification.senderName}</h4>
                  <span className="text-[9px] bg-[#e7fce3] text-[#0f814d] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">New</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{popupNotification.text}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Full-Screen simulated Call overlays */}
        {shouldShowFullScreenCall && appState.currentCall && (
          <CallScreen 
            call={appState.currentCall} 
            onEnd={handleEndCall}
            peerName={partnerInfo.name}
            peerAvatar={partnerInfo.avatar}
            isAdminMode={appState.currentRole === 'admin'}
          />
        )}

        {/* Switch Account Credential Verification Modal */}
        <LoginModal 
          isOpen={isLoginOpen} 
          onClose={() => setIsLoginOpen(false)} 
        />

        {/* Global Anti-Screenshot & Anti-Screen Recording Pitch-Black Protective Shield overlay */}
        <AnimatePresence>
          {isShieldActive && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-[999999] flex flex-col items-center justify-center text-center p-6 select-none pointer-events-auto"
            >
              <div className="space-y-4">
                <div className="w-16 h-16 bg-white/5 rounded-full mx-auto flex items-center justify-center border border-white/10">
                  <ShieldAlert className="w-8 h-8 text-emerald-500 animate-pulse" />
                </div>
                <h3 className="text-white font-bold text-lg leading-snug">🔒 Security Protection Active</h3>
                <p className="text-gray-400 text-xs max-w-sm mx-auto leading-relaxed font-semibold">
                  গ্রাহকের শতভাগ নিরাপত্তা ও ব্যক্তিগত গোপনীয়তা রক্ষার স্বার্থে এই প্ল্যাটফর্মে কোনো অবস্থাতেই স্ক্রিনশট, ভিডিও রেকর্ড, ছবি বা মিডিয়া ফাইল ডাউনলোড করা অনুমতিপ্রাপ্ত নয়।
                </p>
                <div className="bg-[#121b22] px-4 py-2 rounded-lg border border-white/5 inline-block">
                  <p className="text-[10px] text-[#00a884] font-bold uppercase tracking-widest">
                    PWA Protection Layer v3 Active
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
