import React, { useRef, useState } from "react";
import { Send, Paperclip, Loader2, Shield } from "lucide-react";
import { uploadFile } from "@/utils/uploadFile";

export default function ThreadComposer({ onSend, allowInternal = false, disabled = false, placeholder = "Type your message..." }) {
  const fileRef = useRef(null);
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [internalNote, setInternalNote] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    const uploaded = [];
    for (const file of files) {
      const res = await uploadFile(file);
      uploaded.push({ url: res.file_url, filename: file.name, type: file.type, size: file.size });
    }
    setAttachments(prev => [...prev, ...uploaded]);
    setUploading(false);
    e.target.value = "";
  };

  const handleSubmit = () => {
    if ((!body.trim() && attachments.length === 0) || disabled) return;
    onSend({ body: body.trim(), attachments, internal_note: internalNote });
    setBody("");
    setAttachments([]);
    setInternalNote(false);
  };

  return (
    <div className="space-y-3">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((file, index) => (
            <span key={`${file.url}-${index}`} className="text-[11px] px-2 py-1 rounded-lg bg-muted border border-border text-muted-foreground">
              {file.filename}
            </span>
          ))}
        </div>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={disabled}
        placeholder={disabled ? "This thread is currently locked." : internalNote ? "Internal operational note..." : placeholder}
        className="w-full px-4 py-3 rounded-2xl bg-muted border border-border text-sm focus:outline-none focus:border-primary/50 resize-none disabled:opacity-60"
        rows={3}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/70 text-muted-foreground disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            Evidence
          </button>
          <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt" className="hidden" onChange={handleUpload} />

          {allowInternal && (
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-50 text-orange-700 border border-orange-100 text-xs font-semibold cursor-pointer">
              <input type="checkbox" checked={internalNote} onChange={(e) => setInternalNote(e.target.checked)} className="rounded" />
              <Shield className="h-3.5 w-3.5" /> Internal
            </label>
          )}
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || uploading || (!body.trim() && attachments.length === 0)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> Send
        </button>
      </div>
    </div>
  );
}