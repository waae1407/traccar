import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { UserPlus, Trash2, Phone, Mail, Star } from "lucide-react";

export default function EmergencyContactsManager({ user }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    relationship: "",
    is_primary: false,
  });

  useEffect(() => {
    loadContacts();
  }, [user?.id]);

  const loadContacts = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const c = await base44.entities.GPSEmergencyContact.filter(
        { customer_user_id: user.id },
        "-created_date",
        10
      );
      setContacts(c || []);
    } catch (e) {
      console.error("Failed to load emergency contacts:", e);
    }
    setLoading(false);
  };

  const createContact = async () => {
    if (!form.contact_name.trim()) return;
    try {
      await base44.entities.GPSEmergencyContact.create({
        customer_user_id: user.id,
        customer_email: user.email,
        contact_name: form.contact_name.trim(),
        contact_phone: form.contact_phone.trim(),
        contact_email: form.contact_email.trim(),
        relationship: form.relationship.trim(),
        is_primary: form.is_primary,
        receive_sms: true,
        receive_email: true,
        receive_push: true,
      });
      setShowForm(false);
      setForm({ contact_name: "", contact_phone: "", contact_email: "", relationship: "", is_primary: false });
      loadContacts();
    } catch (e) {
      console.error("Failed to create emergency contact:", e);
    }
  };

  const deleteContact = async (id) => {
    await base44.entities.GPSEmergencyContact.delete(id);
    loadContacts();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserPlus size={16} color="#71717A" />
          <h3 className="text-sm font-bold text-white">Emergency Contacts</h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
        >
          <UserPlus size={14} /> Add
        </button>
      </div>

      <p className="text-[10px] text-white/40">
        These contacts will be notified via SMS and email with your vehicle's GPS location when you trigger Panic/SOS.
      </p>

      {showForm && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
          <input
            type="text"
            placeholder="Contact name"
            value={form.contact_name}
            onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-pink-500/50"
          />
          <input
            type="tel"
            placeholder="Phone number (for SMS)"
            value={form.contact_phone}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-pink-500/50"
          />
          <input
            type="email"
            placeholder="Email (for alerts)"
            value={form.contact_email}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-pink-500/50"
          />
          <input
            type="text"
            placeholder="Relationship (e.g. Spouse, Parent)"
            value={form.relationship}
            onChange={(e) => setForm({ ...form, relationship: e.target.value })}
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-pink-500/50"
          />
          <button
            onClick={createContact}
            disabled={!form.contact_name.trim()}
            className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
          >
            Save Contact
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-white/30 text-center py-4">Loading…</p>
      ) : contacts.length === 0 ? (
        <p className="text-xs text-white/30 text-center py-4">
          No emergency contacts yet. Add one so they're notified during Panic/SOS.
        </p>
      ) : (
        contacts.map((contact) => (
          <div
            key={contact.id}
            className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              {contact.is_primary && <Star size={12} color="#FF9F0A" />}
              <div>
                <p className="text-xs font-semibold text-white/80">{contact.contact_name}</p>
                <p className="text-[10px] text-white/40">
                  {contact.relationship && `${contact.relationship} · `}
                  {contact.contact_phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone size={9} /> {contact.contact_phone}
                    </span>
                  )}
                  {contact.contact_phone && contact.contact_email && " · "}
                  {contact.contact_email && (
                    <span className="inline-flex items-center gap-1">
                      <Mail size={9} /> {contact.contact_email}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button onClick={() => deleteContact(contact.id)} className="text-white/30 hover:text-red-400">
              <Trash2 size={14} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}