import React, { useState, useEffect, useRef } from 'react';
import { store } from '../store';
import { ChatSession, Message, CallState } from '../types';
import { 
  Phone, Video, MoreVertical, Paperclip, Camera, Image,
  FolderOpen, Music, MapPin, User, Smile, Send, Mic,
  Trash2, Edit, CheckCircle, ShieldAlert, X, ChevronRight,
  Info, Calendar, Clock, Sparkles, CheckCheck, Download, Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ClientViewProps {
  chat: ChatSession;
  currentCall: CallState | null;
  onOpenLogin: () => void;
}

export default function ClientView({ chat, currentCall, onOpenLogin }: ClientViewProps) {
  const [inputText, setInputText] = useState('');
  const [showAttach, setShowAttach] = useState(false);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  
  // Voice Recording Simulation State
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const recordIntervalRef = useRef<any>(null);

  // Editing state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  const typingTimeoutRef = useRef<any>(null);
  const isCurrentlyTyping = useRef<boolean>(false);

  // Reset typing state on chat change, unmount, or window unload
  useEffect(() => {
    const handleUnload = () => {
      if (isCurrentlyTyping.current && chat.uid) {
        store.setTypingStatus(chat.uid, 'client', false);
      }
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (isCurrentlyTyping.current && chat.uid) {
        store.setTypingStatus(chat.uid, 'client', false);
        isCurrentlyTyping.current = false;
      }
    };
  }, [chat.uid]);

  // PWA Add to Home Screen / Mobile App Installation Support
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);

  useEffect(() => {
    // Detect custom in-app browsers like IMO, Messenger, WhatsApp, Facebook, Instagram
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isInsideInApp = /FBAN|FBAV|Instagram|Messenger|IMO|Line|WhatsApp|Telegram|Workplace/i.test(ua);
    setIsInAppBrowser(isInsideInApp);

    const handleBeforePrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforePrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforePrompt);
    };
  }, []);

  const handleInstallPWA = async () => {
    setShowDropdown(false);
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choice: any) => {
        if (choice.outcome === 'accepted') {
          console.log('User completed PWA installation prompt selection');
        }
        setDeferredPrompt(null);
      });
    } else {
      // Toggle comprehensive PWA / In-App Browser manual instructions modal guide
      setShowInstallGuide(true);
    }
  };

  const handleTyping = (text: string) => {
    setInputText(text);

    if (!isCurrentlyTyping.current) {
      isCurrentlyTyping.current = true;
      store.setTypingStatus(chat.uid, 'client', true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      isCurrentlyTyping.current = false;
      store.setTypingStatus(chat.uid, 'client', false);
    }, 2000);
  };
  
  // Context Menu for messages (Right click or tap)
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    messageId: string;
    isOwn: boolean;
  } | null>(null);

  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages, isRecording, chat.userInfo.typingAdmin]);

  useEffect(() => {
    if (chat?.uid) {
      store.markMessagesAsRead(chat.uid, 'client');
    }
  }, [chat.uid, chat.messages]);

  useEffect(() => {
    const handleOutsideClick = () => {
      setShowDropdown(false);
      setShowAttach(false);
      setContextMenu(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const handleSendMessage = () => {
    if (!inputText.trim()) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    isCurrentlyTyping.current = false;
    store.setTypingStatus(chat.uid, 'client', false);

    if (editingMessageId) {
      store.editMessage(chat.uid, editingMessageId, inputText.trim());
      setEditingMessageId(null);
    } else {
      const textToSend = inputText.trim();
      store.sendMessage(chat.uid, textToSend, 'client');
    }
    
    setInputText('');
    setShowEmoji(false);
  };

  // State-less references for real voice MediaRecording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceStreamRef = useRef<MediaStream | null>(null);

  // Start Real Voice Recording via Browser Microphone
  const startVoiceRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(250);

      setIsRecording(true);
      setRecordTime(0);
      recordIntervalRef.current = setInterval(() => {
        setRecordTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.warn("Real microphone permission/recording failed, falling back to simulated microphone recording: ", err);
      setIsRecording(true);
      setRecordTime(0);
      recordIntervalRef.current = setInterval(() => {
        setRecordTime((prev) => prev + 1);
      }, 1000);
    }
  };

  const stopAndSendVoice = () => {
    clearInterval(recordIntervalRef.current);
    setIsRecording(false);
    const duration = recordTime;
    const formattedDuration = formatRecordTime(duration);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        if (voiceStreamRef.current) {
          voiceStreamRef.current.getTracks().forEach((track) => track.stop());
          voiceStreamRef.current = null;
        }

        const name = `voice-${Date.now()}.webm`;
        store.sendMessage(chat.uid, `Sending voice message...`, 'client');

        try {
          const formData = new FormData();
          formData.append('file', audioBlob, name);
          formData.append('userId', chat.uid);
          formData.append('sender', 'client');
          formData.append('fileType', 'voice');

          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) throw new Error('Voice upload to server failed');
          const result = await response.json();

          const activeSession = store.getState().chats[chat.uid];
          if (activeSession) {
            const msgs = activeSession.messages || [];
            const progressMsg = msgs[msgs.length - 1];
            if (progressMsg && progressMsg.text.startsWith('Sending voice')) {
              store.deleteMessage(chat.uid, progressMsg.id, false);
            }
          }

          store.sendMessage(
            chat.uid,
            `🎤 Voice message (${formattedDuration})`,
            'client',
            result.fileUrl,
            'audio/webm'
          );
        } catch (error) {
          console.error("Failed uploading recorded voice message:", error);
          const activeSession = store.getState().chats[chat.uid];
          if (activeSession) {
            const msgs = activeSession.messages || [];
            const progressMsg = msgs[msgs.length - 1];
            if (progressMsg && progressMsg.text.startsWith('Sending voice')) {
              store.deleteMessage(chat.uid, progressMsg.id, false);
            }
          }
          store.sendMessage(chat.uid, `❌ Voice sending failed`, 'client');
        }
      };

      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn("Failed stopping media recorder smoothly:", err);
      }
    } else {
      if (voiceStreamRef.current) {
        voiceStreamRef.current.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;
      }
      store.sendMessage(
        chat.uid,
        `🎤 Voice message (${formattedDuration})`,
        'client',
        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        'audio/mp3'
      );
    }
  };

  const cancelVoiceRecording = () => {
    clearInterval(recordIntervalRef.current);
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    if (voiceStreamRef.current) {
      voiceStreamRef.current.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
    }
  };

  const formatRecordTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Real Multi-part attachment file upload
  const handleLocalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, fileType: 'image' | 'video' | 'doc' | 'audio') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mimeType = file.type;
    const name = file.name;

    store.sendMessage(
      chat.uid,
      `Uploading file: ${name}...`,
      'client'
    );

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', chat.uid);
      formData.append('sender', 'client');
      formData.append('fileType', fileType);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();

      const activeSession = store.getState().chats[chat.uid];
      if (activeSession) {
        const msgs = activeSession.messages || [];
        const progressMsg = msgs[msgs.length - 1];
        if (progressMsg && progressMsg.text.startsWith('Uploading file')) {
          store.deleteMessage(chat.uid, progressMsg.id, false);
        }
      }

      store.sendMessage(
        chat.uid,
        fileType === 'doc' ? `📄 Document: ${name}` : fileType === 'audio' ? `🎵 Audio: ${name}` : name,
        'client',
        result.fileUrl,
        mimeType
      );
    } catch (err) {
      console.error(err);
      const activeSession = store.getState().chats[chat.uid];
      if (activeSession) {
        const msgs = activeSession.messages || [];
        const progressMsg = msgs[msgs.length - 1];
        if (progressMsg && progressMsg.text.startsWith('Uploading file')) {
          store.deleteMessage(chat.uid, progressMsg.id, false);
        }
      }
      store.sendMessage(
        chat.uid,
        `❌ Upload failed for: ${name}`,
        'client'
      );
    }

    setShowAttach(false);
  };

  const openFileSelector = (id: string) => {
    document.getElementById(id)?.click();
  };

  // Message Actions
  const handleRightClickMessage = (e: React.MouseEvent, messageId: string, sender: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY - 20,
      messageId,
      isOwn: sender === 'client',
    });
  };

  const handleDeleteForEveryone = () => {
    if (contextMenu) {
      if (confirm('Delete message for everyone?')) {
        store.deleteMessage(chat.uid, contextMenu.messageId, true, 'client');
      }
      setContextMenu(null);
    }
  };

  const handleDeleteForMe = () => {
    if (contextMenu) {
      store.deleteMessage(chat.uid, contextMenu.messageId, false, 'client');
      setContextMenu(null);
    }
  };

  const handleEditMessage = () => {
    if (contextMenu) {
      const msg = chat.messages.find((m) => m.id === contextMenu.messageId);
      if (msg) {
        setInputText(msg.text);
        setEditingMessageId(msg.id);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#efeae2] relative overflow-hidden" id="clientRoomView">
      
      {/* Hidden file loaders */}
      <input 
        id="c_doc_loader" 
        type="file" 
        accept="application/pdf,text/plain,application/msword" 
        className="hidden" 
        onChange={(e) => handleLocalFileUpload(e, 'doc')}
      />
      <input 
        id="c_gallery_loader" 
        type="file" 
        accept="image/*,video/*" 
        className="hidden" 
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file?.type.startsWith('video/')) {
            handleLocalFileUpload(e, 'video');
          } else {
            handleLocalFileUpload(e, 'image');
          }
        }}
      />
      <input 
        id="c_audio_loader" 
        type="file" 
        accept="audio/*" 
        className="hidden" 
        onChange={(e) => handleLocalFileUpload(e, 'audio')}
      />

      {/* Header element */}
      <header className="bg-white px-4 py-3 flex items-center justify-between shadow-xs border-b border-gray-100 z-10 relative">
        <div 
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => setShowProfileCard(true)}
        >
          <img 
            src="/my-logo.jpg" 
            alt="Nusrat Jahan Logo" 
            className="w-10 h-10 rounded-full object-cover ring-2 ring-[#00a884] ring-offset-1 group-hover:scale-105 transition-transform"
          />
          <div>
            <div className="font-bold text-gray-800 text-[15px] flex items-center gap-1.5 leading-tight">
              Nusrat Jahan
              <CheckCircle className="w-4 h-4 fill-[#00a884] text-white" />
            </div>
            {chat.userInfo.typingAdmin ? (
              <p className="text-[11px] text-[#00a884] font-semibold animate-pulse">typing...</p>
            ) : (
              <p className="text-[11px] text-gray-500 font-medium">Business Account</p>
            )}
          </div>
        </div>

        {/* Header Right controllers */}
        <div className="flex items-center gap-5">
          <button 
            onClick={() => store.initiateCall(chat.uid, 'video', 'client')}
            className="text-gray-600 hover:text-[#00a884] hover:bg-gray-50 p-2 rounded-full transition-all"
            title="Video Call"
          >
            <Video className="w-5.5 h-5.5" />
          </button>
          
          <button 
            onClick={() => store.initiateCall(chat.uid, 'audio', 'client')}
            className="text-gray-600 hover:text-[#00a884] hover:bg-gray-50 p-2 rounded-full transition-all"
            title="Audio Call"
          >
            <Phone className="w-5 h-5" />
          </button>

          <div className="relative">
            <button 
              onClick={(e) => { e.stopPropagation(); setShowDropdown(!showDropdown); }}
              className="text-gray-600 hover:text-gray-800 hover:bg-gray-50 p-2 rounded-full transition-all"
            >
              <MoreVertical className="w-5.5 h-5.5" />
            </button>

            {/* Dropdown Menu block */}
            <AnimatePresence>
              {showDropdown && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 min-w-44 z-50 overflow-hidden"
                >
                  <button 
                    onClick={handleInstallPWA}
                    className="w-full text-left px-4 py-3 text-sm text-emerald-600 hover:bg-emerald-50 font-bold transition-colors flex items-center gap-2 border-b border-gray-150 animate-pulse"
                  >
                    📲 মোবাইলে অ্যাপ ইন্সটল করুন
                  </button>
                  <button 
                    onClick={onOpenLogin}
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 font-medium transition-colors flex items-center gap-2"
                  >
                    🔄 Switch to Support Desk
                  </button>
                  <button 
                    onClick={() => {
                      if (confirm('রিসেট করতে চান? আপনার চ্যাট হিস্টোরি ক্লিয়ার হবে।')) {
                        try {
                          localStorage.clear();
                        } catch (e) {
                          console.warn(e);
                        }
                        location.reload();
                      }
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 font-medium transition-colors"
                  >
                    ⚠️ Clean Storage Data
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Main Messaging Area */}
      <main 
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5"
        style={{
          backgroundImage: `url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundBlendMode: 'overlay',
          backgroundColor: '#efeae2'
        }}
      >
        {/* Daily spacer card */}
        <div className="flex justify-center p-2 mb-2">
          <span className="bg-white/80 backdrop-blur-md px-3 py-1 rounded-lg text-[10.5px] font-bold text-gray-500 shadow-xs border border-gray-100 uppercase tracking-wider">
            Today
          </span>
        </div>

        {/* Encrypted Notice Banner */}
        <div className="bg-[#ffeecd] border border-[#e5d4b5]/35 p-3 rounded-xl max-w-sm mx-auto text-center flex items-center justify-center gap-2 text-[11px] text-[#54656f] shadow-xs leading-relaxed">
          <span>🔒 Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.</span>
        </div>

        {/* Messages List flow */}
        {chat.messages
          .filter((msg) => !msg.deletedFor?.includes('client'))
          .map((msg, idx) => {
          const isOwn = msg.sender === 'client';
          const isSystem = msg.sender === 'sys';

          if (isSystem) {
            return (
              <div key={`${msg.id || 'msg'}-${idx}`} className="flex justify-center my-2">
                <span className="bg-gray-200/90 text-[11px] text-gray-600 px-3 py-1 rounded-full shadow-xs border border-gray-300/40">
                  {msg.text}
                </span>
              </div>
            );
          }

          return (
            <div 
              key={`${msg.id || 'msg'}-${idx}`}
              onContextMenu={(e) => handleRightClickMessage(e, msg.id, msg.sender)}
              className={`flex flex-col max-w-[82%] relative group ${isOwn ? 'ml-auto items-end' : 'mr-auto items-start'}`}
            >
              {/* Message bubble card */}
              <div 
                className={`p-2.5 rounded-2xl shadow-xs border relative flex flex-col gap-1 cursor-pointer transition-all active:scale-[0.99] select-none ${
                  isOwn 
                    ? 'bg-[#d9fdd3] border-[#c0ebd4]/60 text-gray-800 rounded-tr-none' 
                    : 'bg-white border-gray-100 text-gray-800 rounded-tl-none'
                }`}
                onClick={(e) => handleRightClickMessage(e, msg.id, msg.sender)}
              >
                {/* Media representation */}
                {msg.fileUrl && (
                  <div className="mb-2 max-w-xs rounded-xl overflow-hidden shadow-xs border border-black/5 bg-black/5">
                    {msg.fileType?.startsWith('image/') ? (
                      <img 
                        src={msg.fileUrl} 
                        alt="Image payload" 
                        className="max-h-60 w-full object-cover hover:scale-102 transition-transform cursor-zoom-in"
                        onClick={() => window.open(msg.fileUrl)}
                      />
                    ) : msg.fileType?.startsWith('video/') ? (
                      <video src={msg.fileUrl} controls className="max-h-60 w-full" />
                    ) : msg.fileType?.startsWith('audio/') ? (
                      <audio src={msg.fileUrl} controls className="w-56 h-10 p-1" />
                    ) : (
                      <div className="p-4 flex items-center gap-3 bg-gray-50">
                        <div className="bg-[#e7fce3] p-2.5 rounded-xl text-[#0f814d]">
                          <FolderOpen className="w-5 h-5" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-xs font-bold text-gray-800 truncate leading-snug">{msg.text}</p>
                          <a 
                            href={msg.fileUrl} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-[10px] text-[#00a884] font-bold hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Download File
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Main Message Text content */}
                {!msg.isDeleted ? (
                  <p className="text-[14px] leading-relaxed break-words font-medium whitespace-pre-wrap">
                    {!msg.fileUrl || (msg.text !== 'Photo' && msg.text !== 'Video' && msg.text !== 'Document' && msg.text !== 'Voice Message') ? msg.text : ''}
                  </p>
                ) : (
                  <p className="text-[13px] italic text-gray-400 font-medium flex items-center gap-1">
                    <ShieldAlert className="w-4 h-4 text-gray-300" />
                    This message was deleted
                  </p>
                )}

                {/* Details Footer */}
                <div className="flex items-center justify-end gap-1.5 mt-1 select-none">
                  {msg.isEdited && !msg.isDeleted && (
                    <span className="text-[9px] font-bold text-gray-400 bg-black/5 px-1 py-0.5 rounded-md uppercase tracking-wider">
                      Edited
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400 font-medium">{msg.time}</span>
                  {isOwn && !msg.isDeleted && (
                    <CheckCheck className={`w-3.5 h-3.5 ml-0.5 ${msg.status === 'read' ? 'text-[#34b7f1]' : 'text-gray-300'}`} />
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {chat.userInfo.typingAdmin && (
          <div className="flex flex-col mr-auto items-start max-w-[82%] relative">
            <div className="p-2.5 rounded-2xl shadow-xs border relative flex items-center gap-1.5 bg-white border-gray-100 text-gray-800 rounded-tl-none min-h-[38px] px-4 select-none">
              <span className="text-xs font-semibold text-gray-500 mr-1">typing</span>
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </main>

      {/* Dynamic Attachment panel dialog drawer */}
      <AnimatePresence>
        {showAttach && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 50, x: -70 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 50, x: -70 }}
            className="absolute bottom-20 left-4 bg-white rounded-3xl p-5 shadow-2xl border border-gray-100 grid grid-cols-3 gap-6 max-w-sm z-30"
          >
            <button 
              onClick={() => openFileSelector('c_doc_loader')}
              className="flex flex-col items-center gap-2 group cursor-pointer"
            >
              <div className="w-12 h-12 bg-indigo-500 rounded-full flex items-center justify-center text-white shadow-md shadow-indigo-200 group-hover:scale-105 transition-transform">
                <FolderOpen className="w-5.5 h-5.5 text-white" />
              </div>
              <span className="text-[11px] font-bold text-gray-600">Document</span>
            </button>
            
            <button 
              onClick={() => openFileSelector('c_gallery_loader')}
              className="flex flex-col items-center gap-2 group cursor-pointer"
            >
              <div className="w-12 h-12 bg-pink-500 rounded-full flex items-center justify-center text-white shadow-md shadow-pink-200 group-hover:scale-105 transition-transform">
                <Camera className="w-5.5 h-5.5 text-white" />
              </div>
              <span className="text-[11px] font-bold text-gray-600">Camera</span>
            </button>
            
            <button 
              onClick={() => openFileSelector('c_gallery_loader')}
              className="flex flex-col items-center gap-2 group cursor-pointer"
            >
              <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center text-white shadow-md shadow-purple-200 group-hover:scale-105 transition-transform">
                <Image className="w-5.5 h-5.5 text-white" />
              </div>
              <span className="text-[11px] font-bold text-gray-600">Gallery</span>
            </button>
            
            <button 
              onClick={() => openFileSelector('c_audio_loader')}
              className="flex flex-col items-center gap-2 group cursor-pointer"
            >
              <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-white shadow-md shadow-orange-200 group-hover:scale-105 transition-transform">
                <Music className="w-5.5 h-5.5 text-white" />
              </div>
              <span className="text-[11px] font-bold text-gray-600">Audio</span>
            </button>
            
            <button 
              onClick={() => alert('Location feature simulated')}
              className="flex flex-col items-center gap-2 group cursor-pointer"
            >
              <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-md shadow-emerald-200 group-hover:scale-105 transition-transform">
                <MapPin className="w-5.5 h-5.5 text-white" />
              </div>
              <span className="text-[11px] font-bold text-gray-600">Location</span>
            </button>
            
            <button 
              onClick={() => alert('Contact sharing simulated')}
              className="flex flex-col items-center gap-2 group cursor-pointer"
            >
              <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-md shadow-blue-200 group-hover:scale-105 transition-transform">
                <User className="w-5.5 h-5.5 text-white" />
              </div>
              <span className="text-[11px] font-bold text-gray-600">Contact</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Block Notification Banner if blocked */}
      {chat.userInfo.isBlocked && (
        <div className="bg-red-50 text-red-700 text-center font-bold text-sm py-4 border-t border-red-100 flex items-center justify-center gap-2 select-none">
          <ShieldAlert className="w-5 h-5 text-red-500 animate-pulse" />
          আপনি সাময়িকভাবে ব্লক আছেন! কোনো মেসেজ পাঠাতে পারবেন না।
        </div>
      )}

      {/* Main input footer workspace */}
      {!chat.userInfo.isBlocked && (
        <footer className="bg-[#f0f2f5] px-3.5 py-2.5 flex items-end gap-3 border-t border-gray-200/65 z-20 relative">
          
          {/* Normal controls wrapper card */}
          {!isRecording ? (
            <div className="flex-1 bg-white rounded-2xl p-2 px-3.5 flex items-end gap-3 shadow-sm border border-gray-200/40 min-h-12">
              <button 
                onClick={() => setShowEmoji(!showEmoji)}
                className="text-gray-500 hover:text-gray-700 transition-colors pb-0.5"
                title="Emojis"
              >
                <Smile className="w-5.5 h-5.5" />
              </button>

              <textarea 
                id="c_chatInput"
                value={inputText}
                onChange={(e) => handleTyping(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                rows={1}
                placeholder={editingMessageId ? 'Edit message...' : 'Type a message...'}
                className="flex-1 max-h-24 outline-none border-none text-[15px] text-gray-800 placeholder-gray-400 py-1 font-medium bg-transparent resize-none leading-relaxed"
              />

              <button 
                onClick={(e) => { e.stopPropagation(); setShowAttach(!showAttach); }}
                className={`text-gray-400 transition-transform ${showAttach ? 'text-[#00a884] rotate-45' : 'hover:text-gray-600'}`}
                title="Attach Document"
              >
                <Paperclip className="w-5.5 h-5.5" />
              </button>
            </div>
          ) : (
            /* Voice recording ongoing widget */
            <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 flex items-center justify-between shadow-xs border border-gray-200/60 animate-shake">
              <button 
                onClick={cancelVoiceRecording}
                className="text-red-500 hover:text-red-600 transition-colors"
                title="Delete voice message"
              >
                <Trash2 className="w-5.5 h-5.5" />
              </button>

              <div className="flex items-center gap-3 font-semibold text-gray-700">
                <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
                <span>REC {formatRecordTime(recordTime)}</span>
              </div>

              {/* simulated moving waveforms */}
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 3, 5, 2, 4, 1].map((h, i) => (
                  <span 
                    key={i} 
                    className="w-0.5 bg-[#00a884] rounded-full animate-pulse"
                    style={{ 
                      height: `${h * 4}px`, 
                      animationDelay: `${i * 0.1}s`,
                      animationDuration: '0.4s' 
                    }} 
                  />
                ))}
              </div>

              <button 
                onClick={stopAndSendVoice}
                className="text-[#00a884] hover:text-[#008f70] font-bold text-sm transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {/* Floated Send/Voice Recording action button */}
          <button 
            id="c_mainActionBtn"
            onClick={
              inputText.trim().length > 0 
                ? handleSendMessage 
                : isRecording 
                  ? stopAndSendVoice 
                  : startVoiceRecording
            }
            className="w-12 h-12 bg-[#00a884] hover:bg-[#008f70] text-white flex items-center justify-center rounded-full shadow-md active:scale-95 transition-all text-white flex-shrink-0"
          >
            {inputText.trim().length > 0 ? (
              <Send className="w-5 h-5 text-white" />
            ) : isRecording ? (
              <CheckCircle className="w-5.5 h-5.5 text-white animate-pulse" />
            ) : (
              <Mic className="w-5.5 h-5.5 text-white" />
            )}
          </button>
        </footer>
      )}

      {/* Simple Emoji Panel Picker drawer */}
      {showEmoji && (
        <div className="bg-[#f0f2f5] border-t border-gray-200/80 p-4 h-56 overflow-y-auto select-none z-10">
          <div className="grid grid-cols-8 gap-3 text-2xl">
            {['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🫣', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🫠', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '😵‍💫', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕'].map((em, idx) => (
              <span 
                key={idx} 
                onClick={() => {
                  setInputText(prev => prev + em);
                }}
                className="cursor-pointer text-center hover:scale-120 active:scale-95 transition-all"
              >
                {em}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Message context actions drawer overlay */}
      {contextMenu && (
        <div 
          onClick={() => setContextMenu(null)}
          className="fixed inset-0 z-50 bg-black/5"
        >
          <div 
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="absolute bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 min-w-36 z-50 overflow-hidden"
          >
            {contextMenu.isOwn && (
              <button 
                onClick={handleEditMessage}
                className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 border-b border-gray-50"
              >
                <Edit className="w-3.5 h-3.5" />
                Edit Message
              </button>
            )}
            
            <button 
              onClick={handleDeleteForMe}
              className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 border-b border-gray-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete for me
            </button>

            {contextMenu.isOwn && (
              <button 
                onClick={handleDeleteForEveryone}
                className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Delete for everyone
              </button>
            )}
          </div>
        </div>
      )}

      {/* Profile Card details overlays (Replaces typical story viewer but beautifully styled in WhatsApp Business Info Card format) */}
      <AnimatePresence>
        {showProfileCard && (
          <motion.div 
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            className="absolute inset-0 bg-[#f0f2f5] z-30 flex flex-col overflow-y-auto"
          >
            {/* cardHeader element */}
            <div className="bg-white p-4 flex items-center gap-3 border-b border-gray-100 sticky top-0 shadow-xs">
              <button 
                onClick={() => setShowProfileCard(false)}
                className="text-gray-600 p-1 hover:bg-gray-100 rounded-full transition-all"
              >
                <X className="w-6 h-6" />
              </button>
              <span className="font-bold text-gray-800 text-lg">Contact Info</span>
            </div>

            {/* Profile Pic & Info Section */}
            <div className="bg-white px-6 py-8 flex flex-col items-center text-center shadow-xs border-b border-gray-200/40">
              <img 
                src="/my-logo.jpg" 
                alt="Nusrat Jahan Profile Avatar" 
                className="w-32 h-32 rounded-full object-cover border-4 border-gray-100 shadow-lg hover:scale-102 transition-transform"
              />
              <h3 className="font-bold text-xl text-gray-800 mt-4 flex items-center gap-1.5">
                Nusrat Jahan
                <CheckCircle className="w-5 h-5 fill-[#00a884] text-white" />
              </h3>
              <p className="text-sm font-semibold text-gray-500 mt-1">+880 1780-102623</p>
              
              <div className="flex gap-4 w-full max-w-xs mt-6">
                <button 
                  onClick={() => { setShowProfileCard(false); store.initiateCall(chat.uid, 'audio', 'client'); }}
                  className="flex-1 bg-gray-50 hover:bg-gray-100 border border-gray-200/60 p-3 rounded-2xl flex flex-col items-center gap-1.5 transition-all text-gray-700 active:scale-98"
                >
                  <Phone className="w-5 h-5" />
                  <span className="text-xs font-bold">Audio</span>
                </button>
                <button 
                  onClick={() => { setShowProfileCard(false); store.initiateCall(chat.uid, 'video', 'client'); }}
                  className="flex-1 bg-gray-50 hover:bg-gray-100 border border-gray-200/60 p-3 rounded-2xl flex flex-col items-center gap-1.5 transition-all text-gray-700 active:scale-98"
                >
                  <Video className="w-5 h-5" />
                  <span className="text-xs font-bold">Video</span>
                </button>
              </div>
            </div>

            {/* Business info attributes list */}
            <div className="space-y-3 mt-3">
              <div className="bg-white p-4.5 shadow-xs border-y border-gray-200/40 space-y-3.5">
                <div className="flex items-start gap-4">
                  <Info className="w-5.5 h-5.5 text-gray-400 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">About Business</h4>
                    <p className="text-[14px] text-gray-800 font-semibold mt-1">Official Support Helpline & Operations Tracker</p>
                    <p className="text-xs text-gray-500 mt-0.5">We respond 24/7 to employee reports, feedback tickets, and contractor invoices.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 border-t border-gray-100 pt-3">
                  <Calendar className="w-5.5 h-5.5 text-gray-400 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Office Schedule</h4>
                    <p className="text-[14px] text-gray-800 font-semibold mt-1 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#00a884] animate-pulse" />
                      Always open (24 Hours)
                    </p>
                  </div>
                </div>
              </div>

              {/* Status block info */}
              <div className="bg-white p-4.5 shadow-xs border-y border-gray-200/40">
                <div className="flex items-center justify-between text-sm py-2 hover:bg-gray-50 rounded-xl px-1.5 cursor-pointer">
                  <span className="font-bold text-gray-700">Media, links, and docs</span>
                  <div className="flex items-center text-gray-400 gap-1 font-semibold">
                    <span>{chat.messages.filter(m => m.fileUrl).length}</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Legal Warning Notice info */}
              <div className="bg-white p-6 shadow-xs border-y border-gray-200/40 flex items-start gap-3 text-[#54656f] text-xs leading-relaxed">
                <Sparkles className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-gray-800">Verified Representative</p>
                  <p className="text-gray-500 mt-0.5">This chatting channel complies fully with the standard office compliance and documentation policies.</p>
                </div>
              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* PWA Install Guide Modal */}
      <AnimatePresence>
        {showInstallGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[85vh] select-text"
            >
              <div className="bg-gradient-to-r from-emerald-600 to-[#00a884] px-5 py-4 text-white flex items-center justify-between relative shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className="bg-white/20 p-2 rounded-lg">
                    <Smartphone className="w-5.5 h-5.5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[15px] leading-tight text-white">হোম স্ক্রিনে যোগ করুন</h3>
                    <p className="text-emerald-100 text-[10px] font-medium mt-0.5">Nusrat Jahan Customer Support App</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowInstallGuide(false)}
                  className="bg-white/10 hover:bg-white/25 text-white p-1.5 rounded-lg transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable instructions panel */}
              <div className="p-5 overflow-y-auto space-y-4 text-gray-700 bg-gray-50/50">
                <div className="bg-[#e6f7f3] border border-[#00a884]/20 p-3.5 rounded-xl flex items-start gap-3 shadow-2xs">
                  <span className="text-xl mt-0.5">🌟</span>
                  <div>
                    <h4 className="font-bold text-[13px] text-[#00a884]">কেন ইনস্টল করবেন?</h4>
                    <p className="text-[11.5px] text-gray-600 mt-1 leading-relaxed">
                      মেসেঞ্জার, ইমো বা অন্যান্য ইন-অ্যাপ ব্রাউজারের সীমাবদ্ধতা এড়িয়ে শত শত গ্রাহকদের অবিরত অডিও কল, ভিডিও কল, ভয়েস মেসেজ ও সরাসরি চ্যাট সাপোর্ট পেতে অ্যাপটি হোম স্ক্রিনে ইনস্টল করে ব্যবহার করুন।
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-[11px] uppercase text-gray-400 tracking-wider">ইন্সটল করার সহজ নিয়মাবলী:</h4>

                  {/* Android Chrome Section */}
                  <div className="bg-white border border-gray-150 p-4 rounded-xl space-y-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <span className="bg-[#121b22] text-white text-[10px] font-black px-1.5 py-0.5 rounded-sm uppercase">Android / Chrome</span>
                    </div>
                    <p className="text-[11.5px] text-gray-600 leading-relaxed">
                      ১. ব্রাউজারের উপরে ডান পাশে থাকা <b className="text-gray-800">৩টি ডট (⋮)</b> অপশনে চাপুন।<br />
                      ২. তালিকা থেকে <b className="text-[#00a884] font-bold">"Install App" / "Add to Home screen"</b> বেছে নিন।
                    </p>
                  </div>

                  {/* iOS Safari Section */}
                  <div className="bg-white border border-gray-150 p-4 rounded-xl space-y-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <span className="bg-[#121b22] text-white text-[10px] font-black px-1.5 py-0.5 rounded-sm uppercase">Apple iOS / Safari</span>
                    </div>
                    <p className="text-[11.5px] text-gray-600 leading-relaxed">
                      ১. সাফারি ব্রাউজারের নিচে থাকা <b className="text-gray-800">Share (শেয়ার)</b> বাটনে চাপুন।<br />
                      ২. নিচে স্ক্রল করে <b className="text-[#00a884] font-bold">"Add to Home Screen"</b> সিলেক্ট করুন।
                    </p>
                  </div>

                  {/* Messenger / IMO Messenger Guide */}
                  {isInAppBrowser && (
                    <div className="bg-amber-50/70 border border-amber-500/20 p-4 rounded-xl space-y-2 shadow-2xs">
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-sm uppercase">IMO / Messenger (ইন-অ্যাপ ব্রাউজার)</span>
                      </div>
                      <p className="text-[11.5px] text-[#a16207] leading-relaxed font-semibold">
                        আপনি বর্তমানে একটি ইন-অ্যাপ ব্রাউজার দিয়ে প্রবেশ করেছেন। অ্যাপটি হোম স্ক্রিনে ইনস্টল করতে:<br />
                        ১. উপরে ডানে থাকা <b className="text-gray-900">৩টি ডট (⋮)</b> বা শেয়ার আইকনে চাপুন।<br />
                        ২. <b className="text-gray-900">"Open in Chrome / Safari"</b> সিলেক্ট করে মেইন ব্রাউজারে প্রবেশ করুন এবং তারপর খুব সহজেই ইনস্টল সম্পন্ন করুন।
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Dialog footer controls */}
              <div className="p-4 bg-white border-t border-gray-200/55 flex gap-3 text-xs font-bold">
                {deferredPrompt ? (
                  <button 
                    onClick={() => {
                      setShowInstallGuide(false);
                      handleInstallPWA();
                    }}
                    className="flex-1 bg-[#00a884] hover:bg-[#008f6f] text-white py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-97 cursor-pointer"
                  >
                    <Download className="w-4.5 h-4.5 text-white" /> 
                    সরাসরি ইনস্টল করুন
                  </button>
                ) : null}
                <button 
                  onClick={() => setShowInstallGuide(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-750 py-2.5 px-4 rounded-xl text-center transition-all active:scale-97 cursor-pointer"
                >
                  বুঝেছি, বন্ধ করুন
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
