import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Bell, Mail, MessageSquare, Shield } from 'lucide-react';

const HOST_CATEGORIES = ['bookings', 'payments', 'payouts', 'gps', 'compliance', 'maintenance', 'subscriptions', 'operational'];
const CUSTOMER_CATEGORIES = ['bookings', 'payments', 'verification', 'contracts', 'refunds', 'gps', 'rental_reminders'];
const ADMIN_CATEGORIES = ['chargebacks', 'payouts', 'compliance', 'gps', 'subscriptions', 'operational'];

const CRITICAL_CATEGORIES = new Set(['chargebacks', 'compliance', 'gps', 'payouts']);

function isCritical(category) {
  return CRITICAL_CATEGORIES.has(category);
}

function PreferenceRow({ pref, category, userEmail, userRole, onChange }) {
  const critical = isCritical(category);
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 border border-white/5">
      <div className="flex items-center gap-3">
        <div className="text-sm font-semibold text-white capitalize">{category.replace(/_/g, ' ')}</div>
        {critical && <Badge className="bg-orange-500/15 text-orange-300 border border-orange-500/25 text-xs flex items-center gap-1"><Shield className="h-3 w-3" />Critical</Badge>}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-pink-400" />
          <Switch checked={pref?.in_app_enabled !== false} disabled={critical} onCheckedChange={(v) => onChange(category, 'in_app_enabled', v)} />
          <span className="text-xs text-white/40">In-App</span>
        </div>
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-cyan-400" />
          <Switch checked={pref?.email_enabled !== false} onCheckedChange={(v) => onChange(category, 'email_enabled', v)} />
          <span className="text-xs text-white/40">Email</span>
        </div>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-purple-400" />
          <Switch checked={pref?.sms_enabled !== false} onCheckedChange={(v) => onChange(category, 'sms_enabled', v)} />
          <span className="text-xs text-white/40">SMS</span>
        </div>
      </div>
    </div>
  );
}

function UserPreferencesSection({ title, userEmail, userRole, categories, allPrefs }) {
  const qc = useQueryClient();

  const userPrefs = allPrefs.filter(p => p.user_email === userEmail);
  const prefByCategory = Object.fromEntries(userPrefs.map(p => [p.category, p]));

  const upsert = useMutation({
    mutationFn: async ({ category, field, value }) => {
      const existing = prefByCategory[category];
      if (existing) {
        return base44.entities.NotificationPreference.update(existing.id, { [field]: value });
      } else {
        return base44.entities.NotificationPreference.create({
          user_email: userEmail,
          user_role: userRole,
          category,
          sms_enabled: true,
          email_enabled: true,
          in_app_enabled: true,
          [field]: value,
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-prefs'] }),
  });

  return (
    <Card className="glass border-white/10">
      <CardContent className="p-5">
        <h3 className="text-sm font-black text-white mb-1">{title}</h3>
        <p className="text-xs text-white/40 mb-4">{userEmail}</p>
        <div className="space-y-2">
          {categories.map(cat => (
            <PreferenceRow
              key={cat}
              pref={prefByCategory[cat]}
              category={cat}
              userEmail={userEmail}
              userRole={userRole}
              onChange={(category, field, value) => upsert.mutate({ category, field, value })}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminNotificationPreferences() {
  const { data: allPrefs = [] } = useQuery({
    queryKey: ['notif-prefs'],
    queryFn: () => base44.entities.NotificationPreference.list('-created_date', 500),
    staleTime: 30000,
  });

  const { data: hosts = [] } = useQuery({
    queryKey: ['notif-pref-hosts'],
    queryFn: () => base44.entities.Host.list('-created_date', 50),
    staleTime: 60000,
  });

  const [selectedRole, setSelectedRole] = useState('host');
  const [selectedUser, setSelectedUser] = useState(null);

  const hostList = hosts.slice(0, 10);
  const categories = selectedRole === 'host' ? HOST_CATEGORIES : selectedRole === 'customer' ? CUSTOMER_CATEGORIES : ADMIN_CATEGORIES;

  const displayEmail = selectedUser || (hostList[0]?.email);

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.3em] text-primary">Admin → Notifications</p>
        <h1 className="mt-2 text-3xl font-black text-white">Notification Preferences</h1>
        <p className="mt-1 text-sm text-white/55">Configure per-user, per-category delivery channel preferences. Critical events cannot be fully disabled.</p>
      </div>

      <div className="flex gap-2">
        {['host', 'customer', 'admin'].map(role => (
          <button key={role} onClick={() => setSelectedRole(role)} className={`px-4 py-2 rounded-xl text-sm font-bold capitalize transition-all ${selectedRole === role ? 'bg-primary text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>
            {role}
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {hostList.map(h => (
          <button key={h.id} onClick={() => setSelectedUser(h.email)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${selectedUser === h.email ? 'bg-primary text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
            {h.full_name || h.email}
          </button>
        ))}
      </div>

      {displayEmail && (
        <UserPreferencesSection
          title={`${selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)} Preferences`}
          userEmail={displayEmail}
          userRole={selectedRole}
          categories={categories}
          allPrefs={allPrefs}
        />
      )}

      <Card className="glass border-yellow-500/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-white mb-1">Critical Event Override</div>
              <p className="text-xs text-white/50">The following categories always deliver in-app notifications regardless of preferences: chargebacks, compliance suspension, GPS offline, payout holds. Users may disable email or SMS independently.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}