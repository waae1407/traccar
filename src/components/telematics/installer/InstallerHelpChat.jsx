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
      body: `<div style="font-family:Arial,sans-serif;color:#111827;max-width:680px;margin:0 auto"><h2 style="margin:0 0 8px;font-size:24px">MT2V Wiring Sketch</h2><p style="margin:0 0 18px;color:#4b5563">Clean installer view for mobile. Verify DC+, GND, and ACC before testing commands.</p><div style="border:2px solid #111827;border-radius:18px;padding:16px;margin-bottom:14px;text-align:center"><div style="font-weight:800;font-size:18px">MT2V Device</div><div style="color:#6b7280;font-size:13px">Car GPS Tracker</div></div><div style="display:grid;gap:12px"><div style="border:1px solid #e5e7eb;border-radius:16px;padding:14px;background:#f9fafb"><h3 style="margin:0 0 10px;font-size:16px">Power connections</h3><p style="margin:6px 0"><b>Battery +</b> → Fuse / protected power → <b>DC+ Pin 1</b></p><p style="margin:6px 0"><b>Vehicle ground</b> → <b>GND Pin 6</b></p><p style="margin:6px 0"><b>Ignition / accessory</b> → <b>ACC Pin 4</b></p></div><div style="border:1px solid #e5e7eb;border-radius:16px;padding:14px;background:#fff"><h3 style="margin:0 0 10px;font-size:16px">Control wires</h3><p style="margin:6px 0"><b>Horn:</b> Interface 1 Pins 1–2 → Horn circuit</p><p style="margin:6px 0"><b>Starter cut:</b> Interface 1 Pins 3–4 → Starter / fuel cut relay</p><p style="margin:6px 0"><b>Lights:</b> Interface 1 Pins 5–6 → Light circuit</p><p style="margin:6px 0"><b>Lock:</b> Interface 2 Pins 3 & 8 → Lock trigger / relay</p><p style="margin:6px 0"><b>Unlock:</b> Interface 2 Pins 5 & 10 → Unlock trigger / relay</p><p style="margin:6px 0"><b>Door:</b> Interface 2 Pin 9 → Door sensor</p><p style="margin:6px 0"><b>SOS:</b> Interface 2 Pin 7 → SOS button</p></div><div style="border:1px solid #e5e7eb;border-radius:16px;padding:14px;background:#f9fafb"><h3 style="margin:0 0 10px;font-size:16px">Antenna placement</h3><p style="margin:6px 0"><b>GPS:</b> clear sky view, away from metal.</p><p style="margin:6px 0"><b>GSM:</b> open signal area, not buried under metal trim.</p></div><div style="border:1px solid #fecaca;border-radius:16px;padding:14px;background:#fff1f2"><h3 style="margin:0 0 10px;font-size:16px;color:#be123c">If device does not power on</h3><ol style="margin:0;padding-left:20px"><li>Confirm DC+ has 9–36V constant power.</li><li>Confirm GND is solid chassis ground.</li><li>Confirm ACC changes with ignition/accessory.</li><li>Check fuse and polarity.</li></ol></div></div></div>`,
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