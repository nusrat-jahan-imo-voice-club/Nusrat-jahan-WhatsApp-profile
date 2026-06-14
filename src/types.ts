export interface Message {
  id: string;
  text: string;
  sender: 'client' | 'admin' | 'sys';
  time: string;
  timestamp: number;
  isEdited?: boolean;
  isDeleted?: boolean;
  fileUrl?: string;
  fileType?: string;
  status?: 'sent' | 'read';
  deletedFor?: ('client' | 'admin')[];
}

export interface UserInfo {
  uid: string;
  nickname: string;
  avatar: string;
  lastTime: string;
  unreadCountAdmin: number;
  isBlocked: boolean;
  typingClient?: boolean;
  typingAdmin?: boolean;
}

export interface ChatSession {
  uid: string;
  userInfo: UserInfo;
  messages: Message[];
}

export interface CallState {
  uid: string; // The client uid concerned
  caller: 'client' | 'admin';
  type: 'audio' | 'video';
  status: 'idle' | 'ringing' | 'answered' | 'ended' | 'busy';
  timestamp: number;
  videoUrl?: string; // For mock custom injection
  muted?: boolean;
  videoMuted?: boolean;
  sdpOffer?: string; // WebRTC SDP Offer (JSON string)
  sdpAnswer?: string; // WebRTC SDP Answer (JSON string)
  callerCandidates?: string; // WebRTC Caller ICE Candidates (JSON-serialized array)
  receiverCandidates?: string; // WebRTC Receiver ICE Candidates (JSON-serialized array)
}

export interface CallHistoryItem {
  id: string;
  uid: string;
  status: 'answered' | 'missed' | 'rejected' | 'ended';
  direction: 'incoming' | 'outgoing';
  type: 'audio' | 'video';
  timestamp: number;
}
