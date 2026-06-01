import React, { useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getInstallerChatReply, getInstallerTip } from '@/lib/telematics/installerTroubleshooting';

export default function InstallerHelpChat({ open, onOpenChange, contextTest, onRequestHelp }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');

  const seed = contextTest ? getInstallerTip(contextTest) : 'What failed? I can help with power, GPS, ignition, locks, horn, lights, or starter.';
  const visibleMessages = messages.length ? messages : [{ role: 'assistant', content: seed }];

  const send = () => {
    const value = text.trim();
    if (!value) return;
    setMessages(prev => [...prev, { role: 'user', content: value }, { role: 'assistant', content: getInstallerChatReply(value, contextTest) }]);
    setText('');
  };

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => onOpenChange(true)} className="fixed bottom-24 right-4 z-50 h-12 rounded-full border-slate-200 bg-white px-4 font-black text-slate-900 shadow-xl">
        <MessageCircle className="h-4 w-4" /> Need Help?
      </Button>
    );
  }

  return (
    <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-[2rem] border border-slate-200 bg-white p-4 text-slate-950 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <div><p className="text-xs font-black uppercase tracking-widest text-primary">Need Help?</p><h3 className="text-lg font-black">Installer Support</h3></div>
        <Button type="button" size="icon" variant="ghost" onClick={() => onOpenChange(false)}><X className="h-4 w-4" /></Button>
      </div>
      <div className="max-h-56 space-y-2 overflow-auto rounded-3xl bg-slate-50 p-3">
        {visibleMessages.map((message, index) => (
          <div key={index} className={`rounded-2xl px-3 py-2 text-sm font-semibold ${message.role === 'user' ? 'ml-8 bg-slate-950 text-white' : 'mr-8 bg-white text-slate-700 shadow-sm'}`}>{message.content}</div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask a short question" className="h-11 rounded-2xl bg-white" />
        <Button type="button" onClick={send} className="h-11 rounded-2xl bg-slate-950"><Send className="h-4 w-4" /></Button>
      </div>
      <Button type="button" variant="outline" onClick={onRequestHelp} className="mt-3 h-11 w-full rounded-2xl border-red-200 bg-red-50 font-black text-red-700 hover:bg-red-100">Request Help</Button>
    </div>
  );
}