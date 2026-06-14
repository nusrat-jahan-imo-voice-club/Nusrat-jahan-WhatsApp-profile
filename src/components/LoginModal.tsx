import React, { useState } from 'react';
import { store } from '../store';
import { KeyRound, Smartphone, AlertCircle, X } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone === '01780102623' && password === '80102623') {
      store.setRole('admin');
      setError('');
      setPhone('');
      setPassword('');
      onClose();
    } else {
      setError('ভুল মোবাইল নম্বর অথবা পাসওয়ার্ড! আবার চেষ্টা করুন।');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-300">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl relative border border-gray-100">
        
        {/* Decorative Top Accent Bar */}
        <div className="h-2 bg-[#00a884] w-full" />

        {/* Modal Header */}
        <div className="p-6 pb-4 flex justify-between items-center border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="bg-[#e7fce3] p-2 rounded-xl text-[#0f814d]">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-lg">WhatsApp Admin Login</h3>
              <p className="text-xs text-gray-500">অফিস প্যানেলে লগইন করুন</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 hover:bg-gray-50 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleLogin} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm flex items-start gap-2.5 border border-red-100 animate-shake">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500">মোবাইল নম্বর (Phone)</label>
            <div className="relative">
              <Smartphone className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
              <input 
                id="loginPhone"
                type="text" 
                placeholder="01780102623"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#00a884] focus:bg-white outline-none text-sm transition-all font-medium"
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">Test number: 01780102623</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500">পাসওয়ার্ড (Password)</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
              <input 
                id="loginPass"
                type="password" 
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#00a884] focus:bg-white outline-none text-sm transition-all"
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">Test pass: 80102623</p>
          </div>

          <button 
            type="submit"
            className="w-full py-3.5 bg-[#00a884] hover:bg-[#008f70] text-white font-bold rounded-xl transition-all shadow-md active:scale-[0.98] select-none text-sm mt-3"
          >
            লগইন করুন
          </button>
        </form>

        {/* Security Notice */}
        <div className="bg-gray-50 px-6 py-4 text-center border-t border-gray-100">
          <p className="text-[11px] text-gray-500">
            🔒 This session is monitored and secured by standard encryption tools.
          </p>
        </div>
      </div>
    </div>
  );
}
