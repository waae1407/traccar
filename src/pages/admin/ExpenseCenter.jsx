import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Plus, DollarSign, Car, RefreshCw } from 'lucide-react';

function MetricCard({ label, value, sub, color }) {
  return (
    <div className="rounded-xl bg-secondary/40 border border-border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color || ''}`}>{value}</p>
      {sub && <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

const EXPENSE_CATEGORIES = ['maintenance','repairs','tires','brakes','oil_change','cleaning','insurance','registration','GPS_device','GPS_subscription','towing','parking','tickets','parts','labor','inspection','other'];

export default function ExpenseCenter() {
  const [filterVehicle, setFilterVehicle] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const qc = useQueryClient();

  const { data: vehicles } = useQuery({ queryKey: ['vehicles_exp'], queryFn: () => base44.entities.Vehicle.list('-created_date', 300) });

  const { data, isLoading } = useQuery({
    queryKey: ['expense_center', filterVehicle, filterCategory],
    queryFn: () => base44.functions.invoke('getExpenseCenterMetrics', { vehicle_id: filterVehicle || undefined, category: filterCategory || undefined }).then(r => r.data),
    refetchOnWindowFocus: false,
  });

  const kpis = data?.kpis;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Smart Expense Center</h1>
          <p className="text-muted-foreground text-sm mt-1">HostExpense canonical · VehicleExpense excluded · Recurring expenses tracked</p>
        </div>
      </div>

      {data?.warnings?.map((w, i) => <Alert key={i} className="border-yellow-500/30 bg-yellow-500/10 py-2"><AlertTriangle className="h-3 w-3 text-yellow-400" /><AlertDescription className="text-yellow-300 text-xs">{w}</AlertDescription></Alert>)}

      <div className="flex gap-3 flex-wrap">
        <Select value={filterVehicle} onValueChange={setFilterVehicle}>
          <SelectTrigger className="w-60"><SelectValue placeholder="All vehicles" /></SelectTrigger>
          <SelectContent><SelectItem value={null}>All vehicles</SelectItem>{vehicles?.map(v => <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent><SelectItem value={null}>All categories</SelectItem>{EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g,' ')}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Expenses" value={`$${(kpis?.total_expenses || 0).toLocaleString()}`} color="text-red-400" />
        <MetricCard label="Gross Revenue" value={`$${(kpis?.gross_revenue || 0).toLocaleString()}`} color="text-green-400" />
        <MetricCard label="Profit Impact" value={`$${(kpis?.profit_impact || 0).toLocaleString()}`} color={kpis?.profit_impact >= 0 ? 'text-green-400' : 'text-red-400'} />
        <MetricCard label="Unassigned" value={kpis?.unassigned_expense_count || 0} sub="Not linked to vehicle" color={kpis?.unassigned_expense_count > 0 ? 'text-yellow-400' : ''} />
        <MetricCard label="Recurring Active" value={kpis?.recurring_count || 0} />
        <MetricCard label="Due Soon" value={kpis?.due_soon_count || 0} color="text-yellow-400" />
        <MetricCard label="Overdue" value={kpis?.overdue_count || 0} color="text-red-400" />
      </div>

      <Tabs defaultValue="all">
        <TabsList className="flex-wrap h-auto gap-1">
          {[['all','All Expenses'],['vehicle','Vehicle Breakdown'],['recurring','Recurring'],['categories','By Category'],['unassigned','Unassigned'],['profitability','Profit Impact']].map(([v,l]) => (
            <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-2">
          {data?.expenses?.map(e => (
            <div key={e.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{e.expense_type?.replace(/_/g,' ')} — {e.vehicle_name || 'Fleet/Unassigned'}</p>
                <p className="text-muted-foreground text-xs">{e.date} · {e.description || '—'}</p>
                {!e.vehicle_id && <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Unassigned</Badge>}
              </div>
              <div className="text-right">
                <p className="text-red-400 font-semibold">${(e.amount || 0).toFixed(2)}</p>
                {e.receipt_url && <a href={e.receipt_url} target="_blank" rel="noopener noreferrer" className="text-primary text-xs">Receipt</a>}
              </div>
            </div>
          ))}
          {!data?.expenses?.length && <p className="text-muted-foreground text-sm">No expenses found.</p>}
        </TabsContent>

        <TabsContent value="vehicle" className="mt-4 space-y-2">
          {data?.vehicle_profitability?.sort((a, b) => b.revenue - a.revenue).map(vp => (
            <div key={vp.vehicle_id} className="rounded-lg bg-secondary/30 px-3 py-3 text-sm">
              <p className="font-semibold">{vp.vehicle_name}</p>
              <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
                <div><p className="text-muted-foreground">Revenue</p><p className="text-green-400">${vp.revenue.toFixed(2)}</p></div>
                <div><p className="text-muted-foreground">Expenses</p><p className="text-red-400">${vp.expenses.toFixed(2)}</p></div>
                <div><p className="text-muted-foreground">Profit</p><p className={vp.profit >= 0 ? 'text-green-400' : 'text-red-400'}>${vp.profit.toFixed(2)}</p></div>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="recurring" className="mt-4 space-y-2">
          {data?.recurring_expenses?.map(r => (
            <div key={r.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{r.category?.replace(/_/g,' ')} — {r.vehicle_name || 'Fleet'}</p>
                <p className="text-muted-foreground text-xs">{r.vendor || '—'} · {r.frequency} · Next: {r.next_due_date || '—'}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">${(r.amount || 0).toFixed(2)}</p>
                <Badge className={r.due_status === 'overdue' ? 'bg-red-500/20 text-red-400 text-xs' : r.due_status === 'due_soon' ? 'bg-yellow-500/20 text-yellow-400 text-xs' : 'bg-muted text-muted-foreground text-xs'}>{r.due_status}</Badge>
              </div>
            </div>
          ))}
          {!data?.recurring_expenses?.length && <p className="text-muted-foreground text-sm">No recurring expenses.</p>}
        </TabsContent>

        <TabsContent value="categories" className="mt-4 space-y-2">
          {Object.entries(data?.breakdowns?.by_category || {}).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
            <div key={cat} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <p className="font-medium">{cat.replace(/_/g,' ')}</p>
              <p className="text-red-400 font-semibold">${(amt || 0).toFixed(2)}</p>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="unassigned" className="mt-4 space-y-2">
          {data?.unassigned_expenses?.map(e => (
            <div key={e.id} className="flex justify-between rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-sm">
              <div><p className="font-medium">{e.expense_type?.replace(/_/g,' ')} — {e.description || '—'}</p><p className="text-muted-foreground text-xs">{e.date}</p></div>
              <p className="text-red-400">${(e.amount || 0).toFixed(2)}</p>
            </div>
          ))}
          {!data?.unassigned_expenses?.length && <p className="text-muted-foreground text-sm">No unassigned expenses.</p>}
        </TabsContent>

        <TabsContent value="profitability" className="mt-4 space-y-2">
          {data?.vehicle_profitability?.map(vp => (
            <div key={vp.vehicle_id} className={`rounded-lg px-3 py-2 text-sm border ${vp.profit < 0 ? 'border-red-500/30 bg-red-500/10' : 'border-border bg-secondary/30'}`}>
              <div className="flex justify-between"><p className="font-medium">{vp.vehicle_name}</p><p className={`font-bold ${vp.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>${vp.profit.toFixed(2)}</p></div>
              <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                <span>Revenue: ${vp.revenue.toFixed(2)}</span>
                <span>Expenses: ${vp.expenses.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}