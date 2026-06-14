import React, { useState, useEffect, useRef } from 'react';
import { store } from '../store';
import { ChatSession, Message, CallState, CallHistoryItem } from '../types';
import { 
  Phone, Video, MoreVertical, Paperclip, Camera, Image,
  FolderOpen, Music, MapPin, User, Smile, Send, Mic,
  Trash2, Edit, CheckCircle, ShieldAlert, X, ChevronRight, ChevronLeft,
  Info, Calendar, Clock, Sparkles, LogOut, Search, Filter,
  MessageSquare, VideoOff, History, Trash, Shield, Ban, Check, UserMinus, CheckCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AdminViewProps {
  chats: Record<string, ChatSession>;
  currentCall: CallState | null;
  callHistory: CallHistoryItem[];
  selectedChatUid: string;
  onLogout: () => void;
}

export default function AdminView({ chats, currentCall, callHistory, selectedChatUid, onLogout }: AdminViewProps) {
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'unread'>('all');
  const [activeTab, setActiveTab] = useState<'chats' | 'calls' | 'updates'>('chats');
  
  const [showAttach, setShowAttach] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  
  // Voice recording simulation
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const recordIntervalRef = useRef<any>(null);

  // Edit states
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  const typingTimeoutRef = useRef<any>(null);
  const isCurrentlyTyping = useRef<boolean>(false);

  // Reset typing state on chat change, unmount, or window unload
  useEffect(() => {
    const handleUnload = () => {
      if (isCurrentlyTyping.current && selectedChatUid) {
        store.setTypingStatus(selectedChatUid, 'admin', false);
      }
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (isCurrentlyTyping.current && selectedChatUid) {
        store.setTypingStatus(selectedChatUid, 'admin', false);
        isCurrentlyTyping.current = false;
      }
    };
  }, [selectedChatUid]);

  const handleTyping = (text: string) => {
    setInputText(text);

    if (!selectedChatUid) return;

    if (!isCurrentlyTyping.current) {
      isCurrentlyTyping.current = true;
      store.setTypingStatus(selectedChatUid, 'admin', true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      isCurrentlyTyping.current = false;
      if (selectedChatUid) {
        store.setTypingStatus(selectedChatUid, 'admin', false);
      }
    }, 2000);
  };

  // Message Context Menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    messageId: string;
    isOwn: boolean;
  } | null>(null);

  const inboxBottomRef = useRef<HTMLDivElement | null>(null);
  const sidebarList = Object.values(chats);

  // Auto-scroll inside chat
  useEffect(() => {
    inboxBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedChatUid, chats[selectedChatUid]?.messages, isRecording, chats[selectedChatUid]?.userInfo?.typingClient]);

  useEffect(() => {
    if (selectedChatUid) {
      store.markMessagesAsRead(selectedChatUid, 'admin');
    }
  }, [selectedChatUid, chats[selectedChatUid]?.messages]);

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
    if (selectedChatUid) {
      store.setTypingStatus(selectedChatUid, 'admin', false);
    }

    if (editingMessageId) {
      store.editMessage(selectedChatUid, editingMessageId, inputText.trim());
      setEditingMessageId(null);
    } else {
      store.sendMessage(selectedChatUid, inputText.trim(), 'admin');
    }

    setInputText('');
    setShowEmoji(false);
  };

  // State-less references for real voice MediaRecording (Admin side)
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
      console.warn("Real microphone permission/recording failed for admin, falling back to simulated microphone recording: ", err);
      setIsRecording(true);
      setRecordTime(0);
      recordIntervalRef.current = setInterval(() => {
        setRecordTime((prev) => prev + 1);
      }, 1000);
    }
  };

  const stopAndSendVoice = () => {
    if (!selectedChatUid) return;
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
        store.sendMessage(selectedChatUid, `Sending voice message...`, 'admin');

        try {
          const formData = new FormData();
          formData.append('file', audioBlob, name);
          formData.append('userId', selectedChatUid);
          formData.append('sender', 'admin');
          formData.append('fileType', 'voice');

          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) throw new Error('Voice upload to server failed');
          const result = await response.json();

          const activeSession = store.getState().chats[selectedChatUid];
          if (activeSession) {
            const msgs = activeSession.messages || [];
            const progressMsg = msgs[msgs.length - 1];
            if (progressMsg && progressMsg.text.startsWith('Sending voice')) {
              store.deleteMessage(selectedChatUid, progressMsg.id, false);
            }
          }

          store.sendMessage(
            selectedChatUid,
            `🎤 Voice message (${formattedDuration})`,
            'admin',
            result.fileUrl,
            'audio/webm'
          );
        } catch (error) {
          console.error("Failed uploading recorded voice message:", error);
          const activeSession = store.getState().chats[selectedChatUid];
          if (activeSession) {
            const msgs = activeSession.messages || [];
            const progressMsg = msgs[msgs.length - 1];
            if (progressMsg && progressMsg.text.startsWith('Sending voice')) {
              store.deleteMessage(selectedChatUid, progressMsg.id, false);
            }
          }
          store.sendMessage(selectedChatUid, `❌ Voice sending failed`, 'admin');
        }
      };

      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn("Failed stopping admin media recorder smoothly:", err);
      }
    } else {
      if (voiceStreamRef.current) {
        voiceStreamRef.current.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;
      }
      store.sendMessage(
        selectedChatUid,
        `🎤 Voice message (${formattedDuration})`,
        'admin',
        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
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

  // Real Multi-part attachment file upload (Admin side)
  const handleLocalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, fileType: 'image' | 'video' | 'doc' | 'audio') => {
    if (!selectedChatUid) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const mimeType = file.type;
    const name = file.name;

    store.sendMessage(selectedChatUid, `Uploading file: ${name}...`, 'admin');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', selectedChatUid);
      formData.append('sender', 'admin');
      formData.append('fileType', fileType);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();

      const activeSession = store.getState().chats[selectedChatUid];
      if (activeSession) {
        const msgs = activeSession.messages || [];
        const progressMsg = msgs[msgs.length - 1];
        if (progressMsg && progressMsg.text.startsWith('Uploading file')) {
          store.deleteMessage(selectedChatUid, progressMsg.id, false);
        }
      }

      store.sendMessage(
        selectedChatUid,
        fileType === 'doc' ? `📄 Document: ${name}` : fileType === 'audio' ? `🎵 Audio: ${name}` : name,
        'admin',
        result.fileUrl,
        mimeType
      );
    } catch (err) {
      console.error(err);
      const activeSession = store.getState().chats[selectedChatUid];
      if (activeSession) {
        const msgs = activeSession.messages || [];
        const progressMsg = msgs[msgs.length - 1];
        if (progressMsg && progressMsg.text.startsWith('Uploading file')) {
          store.deleteMessage(selectedChatUid, progressMsg.id, false);
        }
      }
      store.sendMessage(
        selectedChatUid,
        `❌ Upload failed for: ${name}`,
        'admin'
      );
    }

    setShowAttach(false);
  };

  const openFileSelector = (id: string) => {
    document.getElementById(id)?.click();
  };

  const handleRightClickMessage = (e: React.MouseEvent, messageId: string, sender: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      messageId,
      isOwn: sender === 'admin',
    });
  };

  const handleDeleteForEveryone = () => {
    if (contextMenu) {
      if (confirm('Delete message for everyone?')) {
        store.deleteMessage(selectedChatUid, contextMenu.messageId, true, 'admin');
      }
      setContextMenu(null);
    }
  };

  const handleDeleteForMe = () => {
    if (contextMenu) {
      store.deleteMessage(selectedChatUid, contextMenu.messageId, false, 'admin');
      setContextMenu(null);
    }
  };

  const handleEditMessage = () => {
    if (contextMenu) {
      const msg = chats[selectedChatUid]?.messages.find((m) => m.id === contextMenu.messageId);
      if (msg) {
        setInputText(msg.text);
        setEditingMessageId(msg.id);
      }
    }
  };

  const toggleBlockUser = () => {
    if (chats[selectedChatUid]) {
      const isBlocked = chats[selectedChatUid].userInfo.isBlocked;
      store.setBlocked(selectedChatUid, !isBlocked);
      alert(isBlocked ? 'ক্লিনেন্টকে আনব্লক করা হয়েছে!' : 'ক্লায়েন্টকে ব্লক করা হয়েছে!');
    }
  };

  const handleDeleteChat = () => {
    if (confirm('Are you sure you want to permanently delete this chat session? This action cannot be undone.')) {
      store.deleteChat(selectedChatUid);
    }
  };

  // Searching & Filtering queries
  const filteredChatList = sidebarList.filter((c) => {
    const matchesSearch = c.userInfo.nickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.uid.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterMode === 'unread') {
      return matchesSearch && c.userInfo.unreadCountAdmin > 0;
    }
    return matchesSearch;
  });

  const activeChat = chats[selectedChatUid];

  return (
    <div className="flex-1 flex h-full bg-[#f0f2f5] select-none" id="adminDeskContainer">
      
      {/* Dynamic File Loader inputs */}
      <input 
        id="a_doc_loader" 
        type="file" 
        accept="application/pdf,text/plain,application/msword" 
        className="hidden" 
        onChange={(e) => handleLocalFileUpload(e, 'doc')}
      />
      <input 
        id="a_gallery_loader" 
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
        id="a_audio_loader" 
        type="file" 
        accept="audio/*" 
        className="hidden" 
        onChange={(e) => handleLocalFileUpload(e, 'audio')}
      />

      {/* ==========================================
           LEFT SIDEBAR - DESKTOP LAYOUT
           ========================================== */}
      <aside className={`w-full md:w-[360px] bg-white border-r border-gray-200/85 flex flex-col h-full z-10 relative ${selectedChatUid ? 'hidden md:flex' : 'flex'}`}>
        
        {/* Sidebar Header elements */}
        <div className="p-4 flex items-center justify-between border-b border-[#047a5f]/10 bg-[#00a884]/5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#00a884] rounded-full animate-pulse inline-block" />
            <h1 className="font-bold text-gray-800 text-[15px] tracking-tight">WhatsApp Desk</h1>
          </div>
          <button 
            onClick={onLogout}
            className="text-red-500 hover:text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-all border border-transparent hover:border-red-100"
            title="Log out of Admin Dashboard"
          >
            <LogOut className="w-3.5 h-3.5" />
            Exit Desk
          </button>
        </div>

        {/* Master Identity Card (Nusrat Jahan) */}
        <div className="bg-gradient-to-r from-emerald-600 to-[#00a884] p-4 text-white flex items-center gap-3.5 shadow-xs border-b border-emerald-700/10 relative overflow-hidden select-none">
          <div className="absolute right-0 bottom-0 opacity-15 pointer-events-none transform translate-y-3 translate-x-3">
            <CheckCircle className="w-24 h-24 stroke-[1]" />
          </div>
          <img 
            src="/my-logo.jpg" 
            alt="Nusrat Jahan Avatar" 
            className="w-12 h-12 rounded-full object-cover border-2 border-white/60 shadow-md flex-shrink-0"
          />
          <div className="overflow-hidden relative z-10">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight truncate">Nusrat Jahan</span>
              <CheckCircle className="w-4 h-4 fill-white text-emerald-600 flex-shrink-0" />
            </div>
            <p className="text-[10px] text-emerald-100 font-semibold tracking-wider uppercase mt-1">Primary Admin Operator</p>
          </div>
        </div>

        {/* View Switch / Search element */}
        <div className="p-3 space-y-2">
          <div className="bg-gray-100 rounded-xl px-3 py-2.5 flex items-center gap-2.5 border border-transparent focus-within:border-gray-200 focus-within:bg-white transition-all">
            <Search className="w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search Client or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-xs text-gray-700 w-full font-medium"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-2 pt-1 select-none">
            <button 
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                filterMode === 'all' 
                  ? 'bg-[#e7fce3] text-[#0f814d] border border-transparent' 
                  : 'bg-gray-50 text-gray-500 hover:text-gray-700 border border-transparent'
              }`}
            >
              All Clients
            </button>
            <button 
              onClick={() => setFilterMode('unread')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterMode === 'unread' 
                  ? 'bg-red-50 text-red-700 border border-transparent' 
                  : 'bg-gray-50 text-gray-500 hover:text-gray-700 border border-transparent'
              }`}
            >
              Unread Messages
              {sidebarList.some(c => c.userInfo.unreadCountAdmin > 0) && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />
              )}
            </button>
          </div>
        </div>

        {/* Lists Container (Chats list or Calls History logs depending on Bottom Nav Active Tab) */}
        <div className="flex-1 overflow-y-auto border-t border-gray-100">
          {activeTab === 'chats' ? (
            /* Selected Client lists */
            filteredChatList.length === 0 ? (
              <div className="text-center p-8 text-gray-400 text-xs font-medium space-y-2 mt-8">
                <p>কোনো চ্যাট সেশন পাওয়া যায়নি।</p>
                <p className="text-gray-400">নতুন ক্লায়েন্ট কল বা মেসেজ করলে এখানে যোগ হবে।</p>
              </div>
            ) : (
              filteredChatList.map((c) => {
                const isSelected = c.uid === selectedChatUid;
                const visibleMessages = (c.messages || []).filter((msg) => !msg.deletedFor?.includes('admin'));
                const lastMsgObj = visibleMessages[visibleMessages.length - 1];
                let lastMessageContent = lastMsgObj ? lastMsgObj.text : 'No messages yet';
                
                if (lastMsgObj?.isDeleted) {
                  lastMessageContent = '🚫 This message was deleted';
                }

                return (
                  <div 
                    key={c.uid}
                    onClick={() => store.selectAdminChat(c.uid)}
                    className={`flex items-center gap-3.5 px-4.5 py-4 cursor-pointer transition-colors border-b border-gray-50 uppercase relative ${
                      isSelected ? 'bg-gray-100/90 border-r-4 border-[#00a884]' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <img 
                        src={c.userInfo.avatar} 
                        alt="Client representative" 
                        className="w-11 h-11 rounded-full object-cover border border-gray-100"
                      />
                      <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-[#00a884] ring-2 ring-white border border-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-[13.5px] text-gray-800 truncate pr-2 flex items-center gap-1">
                          {c.userInfo.nickname}
                          {c.userInfo.isBlocked && <Ban className="w-3.5 h-3.5 text-red-500 flex-shrink-0" title="Blocked Client" />}
                        </h4>
                        <span className={`text-[10px] whitespace-nowrap ${c.userInfo.unreadCountAdmin > 0 ? 'text-[#00a884] font-bold' : 'text-gray-400'}`}>
                          {c.userInfo.lastTime || '12:00 PM'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-1 select-none">
                        <div className={`text-xs flex items-center min-w-0 ${c.userInfo.unreadCountAdmin > 0 ? 'text-gray-800 font-bold' : 'text-gray-500'}`}>
                          {c.userInfo.typingClient ? (
                            <span className="text-[#00a884] font-semibold animate-pulse italic truncate">typing...</span>
                          ) : (
                            <div className="flex items-center min-w-0">
                              {lastMsgObj && lastMsgObj.sender === 'admin' && !lastMsgObj.isDeleted && (
                                <CheckCheck className={`w-3.5 h-3.5 mr-1.5 flex-shrink-0 ${lastMsgObj.status === 'read' ? 'text-[#34b7f1]' : 'text-gray-400'}`} />
                              )}
                              <span className="truncate max-w-[190px]">{lastMessageContent}</span>
                            </div>
                          )}
                        </div>
                        
                        {c.userInfo.unreadCountAdmin > 0 && (
                          <span className="bg-[#25D366] text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 animate-pulse ml-2.5 shadow-sm">
                            {c.userInfo.unreadCountAdmin}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            /* Calls history log view list */
            <div className="p-2 space-y-1 select-none">
              <div className="flex items-center justify-between p-2 mb-2">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Historical Logs</span>
                {callHistory.length > 0 && (
                  <button 
                    onClick={() => store.clearCallHistory()}
                    className="text-xs text-red-500 font-bold hover:underline"
                  >
                    Clear Logs
                  </button>
                )}
              </div>

              {callHistory.length === 0 ? (
                <div className="text-center p-8 text-gray-400 text-xs font-medium space-y-1.5 mt-8">
                  <p>কোনো কল হিস্টোরি পাওয়া যায়নি।</p>
                </div>
              ) : (
                callHistory.map((item) => {
                  const correlatedClient = chats[item.uid]?.userInfo;
                  const name = correlatedClient ? correlatedClient.nickname : `Client-${item.uid}`;
                  const avatar = correlatedClient ? correlatedClient.avatar : 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback';
                  
                  return (
                    <div 
                      key={item.id}
                      className="p-3 bg-gray-50/50 hover:bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <img src={avatar} className="w-8 h-8 rounded-full object-cover" />
                        <div>
                          <p className="font-bold text-gray-800 leading-snug pr-1 truncate">{name}</p>
                          <p className={`text-[10px] mt-0.5 font-semibold ${
                            item.status === 'missed' ? 'text-red-600' : 'text-gray-500'
                          }`}>
                            {item.direction === 'incoming' ? '📥 Incoming' : '📤 Outgoing'} • {item.type}
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 min-w-20 pr-1">
                        <p className="text-[10px] text-gray-400 font-semibold">{new Date(item.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                        <p className={`text-[9px] font-bold uppercase tracking-wider mt-0.5 ${
                          item.status === 'missed' ? 'text-red-500' : 'text-[#00a884]'
                        }`}>{item.status}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Sidebar Footer Tab navigation */}
        <footer className="bg-white border-t border-gray-100 p-3 flex justify-around select-none">
          <button 
            onClick={() => setActiveTab('chats')}
            className={`flex flex-col items-center gap-1 flex-1 py-1 text-xs font-bold transition-all ${
              activeTab === 'chats' ? 'text-[#00a884] scale-102' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <MessageSquare className="w-5.5 h-5.5" />
            <span>Chats</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('calls')}
            className={`flex flex-col items-center gap-1 flex-1 py-1 text-xs font-bold transition-all ${
              activeTab === 'calls' ? 'text-[#00a884] scale-102' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <History className="w-5.5 h-5.5" />
            <span>Calls</span>
          </button>
        </footer>
      </aside>

      {/* ==========================================
           RIGHT MAIN PANEL - CHAT VIEWS
           ========================================== */}
      <main className={`flex-1 flex-col h-full bg-[#efeae2] relative overflow-hidden ${selectedChatUid ? 'flex' : 'hidden md:flex'}`}>
        {activeChat ? (
          /* Active chat panel view */
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            
            {/* Active Header element */}
            <header className="bg-white px-5 py-3 border-b border-gray-100 shadow-xs flex items-center justify-between z-10 relative">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => store.selectAdminChat('')}
                  className="md:hidden text-gray-500 hover:text-gray-800 p-1.5 -ml-2 rounded-full hover:bg-gray-100 transition-colors mr-1 flex items-center justify-center"
                  title="Back to Chats list"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <img 
                  src={activeChat.userInfo.avatar} 
                  alt="Current recipient profile" 
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-[#00a884]"
                />
                <div>
                  <h3 className="font-bold text-gray-800 text-[15px] flex items-center gap-1.5 leading-tight">
                    {activeChat.userInfo.nickname}
                  </h3>
                  {activeChat.userInfo.typingClient ? (
                    <p className="text-[11px] text-[#00a884] font-bold flex items-center gap-1 select-none animate-pulse">
                      typing...
                    </p>
                  ) : (
                    <p className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 select-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Online • active session
                    </p>
                  )}
                </div>
              </div>

              {/* Action buttons list */}
              <div className="flex items-center gap-5">
                <button 
                  onClick={() => store.initiateCall(activeChat.uid, 'video', 'admin')}
                  className="text-gray-600 hover:text-[#00a884] hover:bg-gray-50 p-2 rounded-full transition-all"
                  title="Make outbound Video Call"
                >
                  <Video className="w-5.5 h-5.5" />
                </button>
                
                <button 
                  onClick={() => store.initiateCall(activeChat.uid, 'audio', 'admin')}
                  className="text-gray-600 hover:text-[#00a884] hover:bg-gray-50 p-2 rounded-full transition-all"
                  title="Make outbound Voice Call"
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

                  <AnimatePresence>
                    {showDropdown && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        className="absolute right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 min-w-44 z-50 overflow-hidden"
                      >
                        <button 
                          onClick={toggleBlockUser}
                          className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 border-b border-gray-50"
                        >
                          <Shield className="w-4 h-4 text-red-500" />
                          {activeChat.userInfo.isBlocked ? '🔓 Unblock Client' : '🚫 Block Client'}
                        </button>
                        <button 
                          onClick={handleDeleteChat}
                          className="w-full text-left px-4 py-3 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                          Delete Session
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </header>

            {/* Inbound/Outbound chat area stream flow */}
            <main 
              className="flex-1 overflow-y-auto px-6 py-4 space-y-3.5 relative"
              style={{
                backgroundImage: `url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundBlendMode: 'overlay',
                backgroundColor: '#efeae2'
              }}
            >
              <div className="flex justify-center p-2 mb-2">
                <span className="bg-white/80 backdrop-blur-md px-3 py-1 rounded-lg text-[10px] font-bold text-gray-500 shadow-xs border border-gray-100 uppercase tracking-wider">
                  Today
                </span>
              </div>

              {activeChat.messages
                .filter((msg) => !msg.deletedFor?.includes('admin'))
                .map((msg, idx) => {
                const isOwn = msg.sender === 'admin';
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
                    className={`flex flex-col max-w-[80%] relative group ${isOwn ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                  >
                    <div 
                      className={`p-2.5 rounded-2xl shadow-xs border relative flex flex-col gap-1 cursor-pointer transition-all active:scale-[0.99] select-none ${
                        isOwn 
                          ? 'bg-[#d9fdd3] border-[#c0ebd4]/60 text-gray-800 rounded-tr-none' 
                          : 'bg-white border-gray-100 text-gray-800 rounded-tl-none'
                      }`}
                      onClick={(e) => handleRightClickMessage(e, msg.id, msg.sender)}
                    >
                      {/* Media container element */}
                      {msg.fileUrl && (
                        <div className="mb-2 max-w-xs rounded-xl overflow-hidden shadow-xs border border-black/5 bg-black/5">
                          {msg.fileType?.startsWith('image/') ? (
                            <img 
                              src={msg.fileUrl} 
                              alt="Payload element" 
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

              {activeChat.userInfo.typingClient && (
                <div className="flex flex-col mr-auto items-start max-w-[82%] relative">
                  <div className="p-2.5 rounded-2xl shadow-xs border relative flex items-center gap-1.5 bg-white border-gray-100 text-gray-800 rounded-tl-none min-h-[38px] px-4 select-none">
                    <span className="text-xs font-semibold text-gray-500 mr-1">typing</span>
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              <div ref={inboxBottomRef} />
            </main>

            {/* Floating Attachments drawer panel */}
            <AnimatePresence>
              {showAttach && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 50, x: -70 }}
                  animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 50, x: -70 }}
                  className="absolute bottom-20 left-4 bg-white rounded-3xl p-5 shadow-2xl border border-gray-100 grid grid-cols-3 gap-6 max-w-sm z-30"
                >
                  <button 
                    onClick={() => openFileSelector('a_doc_loader')}
                    className="flex flex-col items-center gap-2 group"
                  >
                    <div className="w-12 h-12 bg-indigo-505 bg-indigo-500 rounded-full flex items-center justify-center text-white shadow-md shadow-indigo-200 group-hover:scale-105 transition-transform">
                      <FolderOpen className="w-5.5 h-5.5 text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-gray-600">Document</span>
                  </button>
                  
                  <button 
                    onClick={() => openFileSelector('a_gallery_loader')}
                    className="flex flex-col items-center gap-2 group"
                  >
                    <div className="w-12 h-12 bg-pink-500 rounded-full flex items-center justify-center text-white shadow-md shadow-pink-200 group-hover:scale-105 transition-transform">
                      <Camera className="w-5.5 h-5.5 text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-gray-600">Camera</span>
                  </button>
                  
                  <button 
                    onClick={() => openFileSelector('a_gallery_loader')}
                    className="flex flex-col items-center gap-2 group"
                  >
                    <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center text-white shadow-md shadow-purple-200 group-hover:scale-105 transition-transform">
                      <Image className="w-5.5 h-5.5 text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-gray-600">Gallery</span>
                  </button>
                  
                  <button 
                    onClick={() => openFileSelector('a_audio_loader')}
                    className="flex flex-col items-center gap-2 group"
                  >
                    <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-white shadow-md shadow-orange-200 group-hover:scale-105 transition-transform">
                      <Music className="w-5.5 h-5.5 text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-gray-600">Audio</span>
                  </button>
                  
                  <button 
                    onClick={() => alert('Location features simulated')}
                    className="flex flex-col items-center gap-2 group"
                  >
                    <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-md shadow-emerald-200 group-hover:scale-105 transition-transform">
                      <MapPin className="w-5.5 h-5.5 text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-gray-600">Location</span>
                  </button>
                  
                  <button 
                    onClick={() => alert('Contact sharing simulated')}
                    className="flex flex-col items-center gap-2 group"
                  >
                    <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-md shadow-blue-200 group-hover:scale-105 transition-transform">
                      <User className="w-5.5 h-5.5 text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-gray-600">Contact</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input keyboard Footer wrapper */}
            <footer className="bg-[#f0f2f5] px-4 py-3.5 flex items-end gap-3.5 border-t border-gray-200/65 z-20 relative">
              {!isRecording ? (
                <div className="flex-1 bg-white rounded-2xl p-2 px-3.5 flex items-end gap-3 shadow-xs border border-gray-200/40 min-h-12">
                  <button 
                    onClick={() => setShowEmoji(!showEmoji)}
                    className="text-gray-500 hover:text-gray-700 transition-colors pb-0.5"
                    title="Emojis"
                  >
                    <Smile className="w-5.5 h-5.5" />
                  </button>

                  <textarea 
                    id="a_chatInput"
                    value={inputText}
                    onChange={(e) => handleTyping(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    rows={1}
                    placeholder={editingMessageId ? 'Edit support reply...' : 'Type a support reply...'}
                    className="flex-1 max-h-24 outline-none border-none text-[15px] text-gray-800 placeholder-gray-400 py-1 font-medium bg-transparent resize-none leading-relaxed"
                  />

                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowAttach(!showAttach); }}
                    className={`text-gray-400 transition-transform ${showAttach ? 'text-[#00a884] rotate-45' : 'hover:text-gray-600'}`}
                    title="Attach File"
                  >
                    <Paperclip className="w-5.5 h-5.5" />
                  </button>
                </div>
              ) : (
                /* voice record status pane */
                <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 flex items-center justify-between shadow-xs border border-gray-200/60 animate-shake">
                  <button 
                    onClick={cancelVoiceRecording}
                    className="text-red-500 hover:text-red-600 transition-colors"
                    title="Delete voice request"
                  >
                    <Trash2 className="w-5.5 h-5.5" />
                  </button>

                  <div className="flex items-center gap-3 font-semibold text-gray-700">
                    <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
                    <span>RECORD {formatRecordTime(recordTime)}</span>
                  </div>

                  <div className="flex items-center gap-0.5">
                    {[2, 3, 4, 2, 5, 3, 2].map((h, i) => (
                      <span 
                        key={i} 
                        className="w-0.5 bg-[#00a884] rounded-full animate-pulse"
                        style={{ 
                          height: `${h * 4}px`, 
                          animationDelay: `${i * 0.12}s`,
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

              <button 
                id="a_mainActionBtn"
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
                ) : (
                  <Mic className="w-5.5 h-5.5 text-white" />
                )}
              </button>
            </footer>

            {/* Emoji container picker block */}
            {showEmoji && (
              <div className="bg-[#f0f2f5] border-t border-gray-200/85 p-4 h-56 overflow-y-auto">
                <div className="grid grid-cols-12 gap-3.5 text-2xl">
                  {['👍', '👎', '👌', '🤝', '🤝', '🙌', '👏', '🙏', '🙋', '✔️', '❌', '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛'].map((em, idx) => (
                    <span 
                      key={idx} 
                      onClick={() => setInputText(prev => prev + em)}
                      className="cursor-pointer text-center hover:scale-120 active:scale-95 transition-all"
                    >
                      {em}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Empty landing placeholder card */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#f8f9fa] select-none h-full relative">
            <div className="max-w-md space-y-4">
              <div className="w-36 h-36 mx-auto bg-[#e7fce3] flex items-center justify-center rounded-full shadow-sm text-[#0f814d] border border-[#d9fdd3]">
                <MessageSquare className="w-16 h-16 animate-pulse" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 tracking-tight">WhatsApp Web for Support</h2>
              <p className="text-sm text-gray-500 leading-relaxed font-semibold">
                সিলেক্ট চ্যাট প্যানেল থেকে যেকোনো ক্লায়েন্ট বেছে নিয়ে ডিরেক্ট মেসেজিং, ফাইল এক্সচেঞ্জ, ভয়েস মেসেজ এবং Webrtc ভিডিও সেশন কনফিগার করতে পারেন।
              </p>
            </div>

            <div className="absolute bottom-10 flex items-center gap-1.5 text-xs text-gray-400 font-bold border-t border-gray-200/40 pt-4 w-full justify-center">
              <span>🔒 Complies fully with standard end-to-end office security certificates.</span>
            </div>
          </div>
        )}
      </main>

      {/* Message context panel actions drawer */}
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
                Edit Answer
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

    </div>
  );
}
