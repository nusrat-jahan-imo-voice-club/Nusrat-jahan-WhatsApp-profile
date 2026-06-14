import { ChatSession, Message, CallState, CallHistoryItem, UserInfo } from './types';
import { db, auth } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  collectionGroup, 
  updateDoc 
} from 'firebase/firestore';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
       })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// BroadCastChannel for fallback Cross-Tab Communication
const CHANNEL_NAME = 'whatsapp_office_channel';
let broadcastChannel: BroadcastChannel | null = null;
try {
  broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
} catch (e) {
  console.warn('BroadcastChannel is not supported in this browser.', e);
}

// A safe wrapper for localStorage to handle restricted contexts (like In-App browsers or Private Browsing)
const isLocalStorageAvailable = () => {
  try {
    const key = '__test_local_storage__';
    localStorage.setItem(key, key);
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    return false;
  }
};

const hasLocalStorage = isLocalStorageAvailable();
const memoryStorage: Record<string, string> = {};

export const safeStorage = {
  getItem(key: string): string | null {
    if (hasLocalStorage) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        console.warn('localStorage.getItem failed, using memory storage', e);
      }
    }
    return memoryStorage[key] || null;
  },
  setItem(key: string, value: string): void {
    if (hasLocalStorage) {
      try {
        localStorage.setItem(key, value);
        return;
      } catch (e) {
        console.warn('localStorage.setItem failed, using memory storage', e);
      }
    }
    memoryStorage[key] = value;
  },
  removeItem(key: string): void {
    if (hasLocalStorage) {
      try {
        localStorage.removeItem(key);
        return;
      } catch (e) {
        console.warn('localStorage.removeItem failed', e);
      }
    }
    delete memoryStorage[key];
  }
};

// Generates or retrieves a unique user_id for the first-time visitor
export function getOrCreateCustomerId(): string {
  let customerId = safeStorage.getItem('wa_customer_user_id');
  if (!customerId) {
    // Generate a beautiful distinct 5-digit user ID
    customerId = 'USER-' + Math.floor(10000 + Math.random() * 90000);
    safeStorage.setItem('wa_customer_user_id', customerId);
  }
  return customerId;
}

const customerId = getOrCreateCustomerId();

// Application State Structure
interface AppState {
  chats: Record<string, ChatSession>;
  currentCall: CallState | null;
  callHistory: CallHistoryItem[];
  currentRole: 'client' | 'admin';
  clientSelectedUid: string; // Active chat target for Client mode
  adminSelectedUid: string; // Selected chat target for Admin Dashboard
}

// Load initial state helpers
const getSavedState = (): AppState => {
  const currentCustId = getOrCreateCustomerId();
  const savedHistory = safeStorage.getItem('wa_saved_call_history');
  const savedRole = safeStorage.getItem('wa_saved_role');
  const savedClientUid = safeStorage.getItem('wa_saved_client_uid');
  const savedAdminUid = safeStorage.getItem('wa_saved_admin_uid');

  return {
    chats: {}, // Will be loaded and updated in real-time from Cloud Firestore
    currentCall: null, // Will be loaded and updated in real-time from Cloud Firestore
    callHistory: savedHistory ? JSON.parse(savedHistory) : [],
    currentRole: (savedRole as 'client' | 'admin') || 'client',
    clientSelectedUid: savedClientUid || currentCustId,
    adminSelectedUid: savedAdminUid || currentCustId,
  };
};

let state: AppState = getSavedState();

const listeners = new Set<() => void>();

// Helper to strip any undefined values recursive before sending to Firebase
function cleanUndefined<T>(obj: T): T {
  if (obj === undefined) return null as any;
  if (obj === null) return null as any;
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item)) as any;
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
      const val = (obj as any)[key];
      if (val !== undefined) {
        cleaned[key] = cleanUndefined(val);
      }
    }
    return cleaned;
  }
  return obj;
}

let chatUnsubscribe: (() => void) | null = null;
let callUnsubscribe: (() => void) | null = null;
let historyUnsubscribe: (() => void) | null = null;

export function setupSubscriptions() {
  if (chatUnsubscribe) chatUnsubscribe();
  if (callUnsubscribe) callUnsubscribe();
  if (historyUnsubscribe) historyUnsubscribe();

  const currentCustId = getOrCreateCustomerId();

  if (state.currentRole === 'admin') {
    // Admin listens to ALL chats
    chatUnsubscribe = onSnapshot(collection(db, 'chats'), (snapshot) => {
      const rawChats: Record<string, ChatSession> = {};
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const rawMessages = data.messages || [];
        let messagesArray: Message[] = [];
        if (Array.isArray(rawMessages)) {
          messagesArray = rawMessages.filter(Boolean);
        } else if (typeof rawMessages === 'object') {
          messagesArray = Object.keys(rawMessages)
            .map(k => rawMessages[k])
            .filter(Boolean);
        }
        // Sort by timestamp
        messagesArray.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        rawChats[docSnap.id] = {
          uid: docSnap.id,
          userInfo: {
            uid: docSnap.id,
            nickname: data.userInfo?.nickname || docSnap.id,
            avatar: data.userInfo?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${docSnap.id}`,
            lastTime: data.userInfo?.lastTime || '',
            unreadCountAdmin: data.userInfo?.unreadCountAdmin || 0,
            isBlocked: !!data.userInfo?.isBlocked,
            typingClient: !!data.userInfo?.typingClient,
            typingAdmin: !!data.userInfo?.typingAdmin,
          },
          messages: messagesArray,
        };
      });

      state.chats = rawChats;

      // Ensure reasonable non-empty selection fallbacks
      if (state.adminSelectedUid && !state.chats[state.adminSelectedUid]) {
        state.adminSelectedUid = Object.keys(state.chats)[0] || currentCustId;
      }

      safeStorage.setItem('wa_saved_chats', JSON.stringify(state.chats));
      listeners.forEach((l) => l());
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'chats');
    });

    // Admin listens to ALL active calls dynamically
    callUnsubscribe = onSnapshot(collection(db, 'calls'), (snapshot) => {
      let activeCall: CallState | null = null;
      
      // Prioritize active call for currently selected admin workspace
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as CallState;
        if (docSnap.id === state.adminSelectedUid && (data.status === 'ringing' || data.status === 'answered')) {
          activeCall = data;
        }
      });
      
      // Fallback: If not, show any other active incoming ringing call
      if (!activeCall) {
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as CallState;
          if (data.status === 'ringing') {
            activeCall = data;
          }
        });
      }

      // Fallback: If not, show any other active answered call
      if (!activeCall) {
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as CallState;
          if (data.status === 'answered') {
            activeCall = data;
          }
        });
      }

      state.currentCall = activeCall;
      listeners.forEach((l) => l());
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'calls');
    });

    // Admin listens to ALL call history logs
    historyUnsubscribe = onSnapshot(query(collection(db, 'callHistory'), orderBy('timestamp', 'desc')), (snapshot) => {
      const history: CallHistoryItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        history.push({
          id: docSnap.id,
          uid: data.uid || '',
          status: data.status || 'ended',
          direction: data.direction || 'incoming',
          type: data.type || 'video',
          timestamp: data.timestamp || Date.now(),
        });
      });
      state.callHistory = history;
      safeStorage.setItem('wa_saved_call_history', JSON.stringify(state.callHistory));
      listeners.forEach((l) => l());
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'callHistory');
    });

  } else {
    // Client view: Perfectly secure isolation of custom client chats & calls
    // The client CANNOT listen to, view, or touch other customers' sessions
    chatUnsubscribe = onSnapshot(doc(db, 'chats', currentCustId), (snapshot) => {
      const rawChats: Record<string, ChatSession> = {};
      
      if (snapshot.exists()) {
        const data = snapshot.data();
        const rawMessages = data.messages || [];
        let messagesArray: Message[] = [];
        if (Array.isArray(rawMessages)) {
          messagesArray = rawMessages.filter(Boolean);
        } else if (typeof rawMessages === 'object') {
          messagesArray = Object.keys(rawMessages)
            .map(k => rawMessages[k])
            .filter(Boolean);
        }
        messagesArray.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        rawChats[currentCustId] = {
          uid: currentCustId,
          userInfo: {
            uid: currentCustId,
            nickname: data.userInfo?.nickname || currentCustId,
            avatar: data.userInfo?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentCustId}`,
            lastTime: data.userInfo?.lastTime || '',
            unreadCountAdmin: data.userInfo?.unreadCountAdmin || 0,
            isBlocked: !!data.userInfo?.isBlocked,
            typingClient: !!data.userInfo?.typingClient,
            typingAdmin: !!data.userInfo?.typingAdmin,
          },
          messages: messagesArray,
        };
      } else {
        const formattedTime = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const welcomeMessage: Message = {
          id: 'welcome',
          text: 'আসসালামু আলাইকুম। আমি Nusrat Jahan বলছি। আমি আপনাকে কিভাবে সাহায্য করতে পারি?',
          sender: 'admin',
          time: formattedTime,
          timestamp: Date.now()
        };
        const initialSession = {
          uid: currentCustId,
          userInfo: {
            uid: currentCustId,
            nickname: currentCustId,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentCustId}`,
            lastTime: formattedTime,
            unreadCountAdmin: 0,
            isBlocked: false,
            typingClient: false,
            typingAdmin: false,
          },
          messages: [welcomeMessage]
        };
        
        setDoc(doc(db, 'chats', currentCustId), initialSession).catch(err => {
          handleFirestoreError(err, OperationType.WRITE, `chats/${currentCustId}`);
        });

        rawChats[currentCustId] = {
          uid: currentCustId,
          userInfo: initialSession.userInfo,
          messages: [welcomeMessage]
        };
      }

      state.chats = rawChats;
      state.clientSelectedUid = currentCustId;

      safeStorage.setItem('wa_saved_chats', JSON.stringify(state.chats));
      listeners.forEach((l) => l());
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `chats/${currentCustId}`);
    });

    // Client listens solely to their OWN private call document
    callUnsubscribe = onSnapshot(doc(db, 'calls', currentCustId), (snapshot) => {
      state.currentCall = snapshot.exists() ? (snapshot.data() as CallState) : null;
      listeners.forEach((l) => l());
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `calls/${currentCustId}`);
    });

    // Client listens solely to their OWN private call history logs
    historyUnsubscribe = onSnapshot(
      query(collection(db, 'callHistory'), orderBy('timestamp', 'desc')), 
      (snapshot) => {
        const history: CallHistoryItem[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.uid === currentCustId) {
            history.push({
              id: docSnap.id,
              uid: data.uid || '',
              status: data.status || 'ended',
              direction: data.direction || 'incoming',
              type: data.type || 'video',
              timestamp: data.timestamp || Date.now(),
            });
          }
        });
        state.callHistory = history;
        safeStorage.setItem('wa_saved_call_history', JSON.stringify(state.callHistory));
        listeners.forEach((l) => l());
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'callHistory');
      }
    );
  }
}

// Start initial isolated subscriptions on load
setupSubscriptions();

export const store = {
  getState() {
    return state;
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  notify() {
    // Notify clients instantly
    safeStorage.setItem('wa_saved_role', state.currentRole);
    safeStorage.setItem('wa_saved_client_uid', state.clientSelectedUid);
    safeStorage.setItem('wa_saved_admin_uid', state.adminSelectedUid);
    
    // Notify local components listener loop
    listeners.forEach((l) => l());

    // Broadcast change cross-tabs
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'STATE_CHANGED', state });
    }
  },

  setRole(role: 'client' | 'admin') {
    state.currentRole = role;
    setupSubscriptions();
    this.notify();
  },

  selectClientChat(uid: string) {
    state.clientSelectedUid = uid;
    this.notify();
  },

  selectAdminChat(uid: string) {
    state.adminSelectedUid = uid;
    // Mark as read in Firestore
    if (state.chats[uid]) {
      updateDoc(doc(db, 'chats', uid), {
        'userInfo.unreadCountAdmin': 0
      }).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `chats/${uid}`);
      });
    }
    setupSubscriptions();
    this.notify();
  },

  sendMessage(uid: string, text: string, sender: 'client' | 'admin', fileUrl?: string, fileType?: string) {
    const formattedTime = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const messageId = Math.random().toString(36).substr(2, 9);

    const newMessage: Message = {
      id: messageId,
      text,
      sender,
      time: formattedTime,
      timestamp: Date.now(),
      fileUrl,
      fileType,
      status: 'sent',
      deletedFor: [],
    };

    const currentChat = state.chats[uid];
    const currentMessages = currentChat ? [...(currentChat.messages || [])] : [];
    const updatedMessages = [...currentMessages, newMessage];
    const unreadCountAdmin = sender === 'client' 
      ? ((currentChat?.userInfo?.unreadCountAdmin || 0) + 1)
      : 0;

    const chatData = {
      uid,
      userInfo: {
        uid,
        nickname: currentChat?.userInfo?.nickname || uid,
        avatar: currentChat?.userInfo?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
        lastTime: formattedTime,
        unreadCountAdmin,
        isBlocked: currentChat ? !!currentChat.userInfo.isBlocked : false,
        typingClient: sender === 'client' ? false : (currentChat?.userInfo?.typingClient || false),
        typingAdmin: sender === 'admin' ? false : (currentChat?.userInfo?.typingAdmin || false),
      },
      messages: updatedMessages
    };

    setDoc(doc(db, 'chats', uid), cleanUndefined(chatData)).catch(err => {
      handleFirestoreError(err, OperationType.WRITE, `chats/${uid}`);
    });
  },

  editMessage(uid: string, msgId: string, text: string) {
    const currentChat = state.chats[uid];
    if (currentChat) {
      const updatedMessages = (currentChat.messages || []).map((m) =>
        m.id === msgId ? { ...m, text, isEdited: true } : m
      );
      updateDoc(doc(db, 'chats', uid), {
        messages: cleanUndefined(updatedMessages)
      }).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `chats/${uid}`);
      });
    }
  },

  deleteMessage(uid: string, msgId: string, everyone: boolean, role?: 'client' | 'admin') {
    const currentChat = state.chats[uid];
    if (currentChat) {
      const activeRole = role || state.currentRole;
      let updatedMessages = currentChat.messages || [];
      if (everyone) {
        updatedMessages = updatedMessages.map((m) =>
          m.id === msgId ? { ...m, isDeleted: true } : m
        );
      } else {
        updatedMessages = updatedMessages.map((m) => {
          if (m.id === msgId) {
            const currentDeletedFor = m.deletedFor || [];
            if (!currentDeletedFor.includes(activeRole)) {
              return { ...m, deletedFor: [...currentDeletedFor, activeRole] };
            }
          }
          return m;
        });
      }
      updateDoc(doc(db, 'chats', uid), {
        messages: cleanUndefined(updatedMessages)
      }).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `chats/${uid}`);
      });
    }
  },

  markMessagesAsRead(uid: string, readerRole: 'client' | 'admin') {
    const currentChat = state.chats[uid];
    if (currentChat) {
      let changed = false;
      const updatedMessages = (currentChat.messages || []).map((m) => {
        if (m.sender !== readerRole && m.status !== 'read') {
          changed = true;
          return { ...m, status: 'read' as const };
        }
        return m;
      });

      if (changed) {
        updateDoc(doc(db, 'chats', uid), {
          messages: cleanUndefined(updatedMessages)
        }).catch((err) => {
          handleFirestoreError(err, OperationType.WRITE, `chats/${uid}`);
        });
      }
    }
  },

  setTypingStatus(uid: string, role: 'client' | 'admin', isTyping: boolean) {
    const field = role === 'client' ? 'userInfo.typingClient' : 'userInfo.typingAdmin';
    updateDoc(doc(db, 'chats', uid), {
      [field]: isTyping
    }).catch((err) => {
      handleFirestoreError(err, OperationType.WRITE, `chats/${uid}`);
    });
  },

  setBlocked(uid: string, isBlocked: boolean) {
    if (state.chats[uid]) {
      updateDoc(doc(db, 'chats', uid), {
        'userInfo.isBlocked': isBlocked
      }).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `chats/${uid}`);
      });
    }
  },

  deleteChat(uid: string) {
    if (state.chats[uid]) {
      deleteDoc(doc(db, 'chats', uid)).catch((err) => {
        handleFirestoreError(err, OperationType.DELETE, `chats/${uid}`);
      });
    }
  },

  initiateCall(uid: string, type: 'audio' | 'video', caller: 'client' | 'admin') {
    const callData: CallState = {
      uid,
      caller,
      type,
      status: 'ringing',
      timestamp: Date.now(),
    };
    setDoc(doc(db, 'calls', uid), cleanUndefined(callData)).catch((err) => {
      handleFirestoreError(err, OperationType.WRITE, `calls/${uid}`);
    });
  },

  answerCall() {
    if (state.currentCall) {
      const targetUid = state.currentCall.uid;
      const answeredCall = {
        ...state.currentCall,
        status: 'answered' as const,
        timestamp: Date.now()
      };
      setDoc(doc(db, 'calls', targetUid), cleanUndefined(answeredCall)).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `calls/${targetUid}`);
      });

      // Record call history log
      const historyId = Math.random().toString(36).substr(2, 9);
      const historyItem: CallHistoryItem = {
        id: historyId,
        uid: targetUid,
        status: 'answered',
        direction: state.currentCall.caller === 'client' ? 'incoming' : 'outgoing',
        type: state.currentCall.type,
        timestamp: Date.now(),
      };
      setDoc(doc(db, 'callHistory', historyId), cleanUndefined(historyItem)).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `callHistory/${historyId}`);
      });
    }
  },

  rejectCall(reason: 'missed' | 'rejected' = 'rejected') {
    if (state.currentCall) {
      const targetUid = state.currentCall.uid;
      const historyId = Math.random().toString(36).substr(2, 9);
      const historyItem: CallHistoryItem = {
        id: historyId,
        uid: targetUid,
        status: reason,
        direction: state.currentCall.caller === 'client' ? 'incoming' : 'outgoing',
        type: state.currentCall.type,
        timestamp: Date.now(),
      };
      setDoc(doc(db, 'callHistory', historyId), cleanUndefined(historyItem)).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `callHistory/${historyId}`);
      });

      // Transition to ended
      updateDoc(doc(db, 'calls', targetUid), { status: 'ended' }).then(() => {
        setTimeout(() => {
          deleteDoc(doc(db, 'calls', targetUid)).catch((err) => {
            handleFirestoreError(err, OperationType.DELETE, `calls/${targetUid}`);
          });
        }, 1000);
      }).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `calls/${targetUid}`);
      });
    }
  },

  endCall() {
    if (state.currentCall) {
      const targetUid = state.currentCall.uid;
      updateDoc(doc(db, 'calls', targetUid), { status: 'ended' }).then(() => {
        setTimeout(() => {
          deleteDoc(doc(db, 'calls', targetUid)).catch((err) => {
            handleFirestoreError(err, OperationType.DELETE, `calls/${targetUid}`);
          });
        }, 1000);
      }).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `calls/${targetUid}`);
      });
    }
  },

  injectVideoUrl(url: string) {
    if (state.currentCall) {
      const targetUid = state.currentCall.uid;
      updateDoc(doc(db, 'calls', targetUid), { videoUrl: url }).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `calls/${targetUid}`);
      });
    }
  },

  toggleCallMuted() {
    if (state.currentCall) {
      const targetUid = state.currentCall.uid;
      updateDoc(doc(db, 'calls', targetUid), { muted: !state.currentCall.muted }).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `calls/${targetUid}`);
      });
    }
  },

  toggleCallVideoMuted() {
    if (state.currentCall) {
      const targetUid = state.currentCall.uid;
      updateDoc(doc(db, 'calls', targetUid), { videoMuted: !state.currentCall.videoMuted }).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `calls/${targetUid}`);
      });
    }
  },

  updateCallSignaling(signaling: { sdpOffer?: string; sdpAnswer?: string; callerCandidates?: string; receiverCandidates?: string }) {
    if (state.currentCall) {
      const targetUid = state.currentCall.uid;
      updateDoc(doc(db, 'calls', targetUid), cleanUndefined(signaling)).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `calls/${targetUid}`);
      });
    }
  },

  clearCallHistory() {
    getDocs(collection(db, 'callHistory')).then((snapshot) => {
      snapshot.forEach((snap) => {
        deleteDoc(snap.ref).catch((err) => {
          handleFirestoreError(err, OperationType.DELETE, `callHistory/${snap.id}`);
        });
      });
    }).catch((err) => {
      handleFirestoreError(err, OperationType.GET, 'callHistory');
    });
  },
};

// Handle local browser fallback sync
if (broadcastChannel) {
  broadcastChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'STATE_CHANGED') {
      const incomingState = event.data.state;
      state.currentRole = incomingState.currentRole;
      state.clientSelectedUid = incomingState.clientSelectedUid;
      state.adminSelectedUid = incomingState.adminSelectedUid;
      listeners.forEach((l) => l());
    }
  };
}
