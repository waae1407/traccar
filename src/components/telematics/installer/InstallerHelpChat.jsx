import React, { useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getInstallerChatReply, getInstallerTip } from '@/lib/telematics/installerTroubleshooting';
import { MT2V_DEVICE_KNOWLEDGE } from '@/lib/telematics/mt2vDeviceKnowledge';

const escapeHtml = (value) => String(value || '').replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));

export default function InstallerHelpChat({ open, onOpenChange, contextTest, onRequestHelp }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [emailStatus, setEmailStatus] = useState('');

  const seed = contextTest
    ? `${getInstallerTip(contextTest)}\n\nAsk me for MT2V wiring diagram, LED codes, SIM/eSIM support, APN setup, SMS commands, or installation checklist.`
    : 'What failed? I can help with MT2V wiring diagrams, LED codes, SIM/eSIM support, APN setup, SMS commands, GPS, ignition, locks, horn, lights, or starter.';
  const visibleMessages = messages.length ? messages : [{ role: 'assistant', content: seed }];

  const ask = (value) => {
    if (!value) return;
    setMessages(prev => [...prev, { role: 'user', content: value }, { role: 'assistant', content: getInstallerChatReply(value, contextTest) }]);
  };

  const send = () => {
    const value = text.trim();
    if (!value) return;
    ask(value);
    setText('');
  };

  const emailWiringSketch = async () => {
    const email = window.prompt('Enter installer email to send the MT2V wiring sketch');
    if (!email) return;
    setEmailStatus('Sending wiring sketch...');
    await base44.functions.invoke('sendEmail', {
      to: email,
      subject: 'MT2V Wiring Sketch',
      body: `<div style="font-family:Arial,sans-serif;color:#111827"><h2>MT2V Wiring Sketch</h2><p>Use this sketch during installation. Verify DC+, GND, and ACC before testing commands.</p><pre style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:16px;font-family:Menlo,Consolas,monospace;font-size:12px;line-height:1.4">${escapeHtml(MT2V_DEVICE_KNOWLEDGE.wiringDiagram)}</pre></div>`,
      from_name: 'uRide Installer Support'
    });
    setEmailStatus('Wiring sketch sent.');
    setMessages(prev => [...prev, { role: 'assistant', content: `I sent the MT2V wiring sketch to ${email}.` }]);
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
          <div key={index} className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm font-semibold ${message.role === 'user' ? 'ml-8 bg-slate-950 text-white' : 'mr-8 bg-white text-slate-700 shadow-sm'}`}>{message.content}</div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {['Wiring diagram', 'LED codes', 'SIM/eSIM?', 'APN setup'].map((prompt) => (
          <Button key={prompt} type="button" variant="outline" onClick={() => ask(prompt)} className="h-8 rounded-full border-slate-200 bg-white px-3 text-xs font-black text-slate-700">{prompt}</Button>
        ))}
        <Button type="button" variant="outline" onClick={emailWiringSketch} className="h-8 rounded-full border-primary/30 bg-pink-50 px-3 text-xs font-black text-primary">Email wiring sketch</Button>
      </div>
      {emailStatus && <p className="mt-2 text-xs font-black text-emerald-600">{emailStatus}</p>}
      <div className="mt-3 flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask a short question" className="h-11 rounded-2xl bg-white" />
        <Button type="button" onClick={send} className="h-11 rounded-2xl bg-slate-950"><Send className="h-4 w-4" /></Button>
      </div>
      <Button type="button" variant="outline" onClick={onRequestHelp} className="mt-3 h-11 w-full rounded-2xl border-red-200 bg-red-50 font-black text-red-700 hover:bg-red-100">Request Help</Button>
    </div>
  );
}