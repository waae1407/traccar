import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { ShieldAlert, AlertTriangle, AlertCircle, Search, SlidersHorizontal, Eye } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminAlert360() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['admin-alert360'],
    queryFn: () => base44.entities.TelematicsSafetyEvent.filter({}, '-first_seen_at', 100),
    refetchInterval: 15000,
  });

  const filteredEvents = events.filter((e) => {
    if (filterStatus === 'active' && !e.is_active) return false;
    if (filterStatus === 'resolved' && e.is_active) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return e.vehicle_display_name?.toLowerCase().includes(q) ||
             e.vin?.toLowerCase().includes(q) ||
             e.alert_title?.toLowerCase().includes(q) ||
             e.host_name?.toLowerCase().includes(q);
    }
    return true;
  });

  const columns = [
    { header: 'Time', accessor: (e) => format(new Date(e.last_seen_at || e.first_seen_at), 'MMM d, h:mm a') },
    { header: 'Alert Type', accessor: (e) => (
      <div className="flex items-center gap-2">
        {e.severity === 'critical' ? <ShieldAlert className="h-4 w-4 text-red-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
        <div>
          <p className="font-semibold text-gray-900">{e.alert_title}</p>
          <p className="text-xs text-gray-500">{e.category}</p>
        </div>
      </div>
    )},
    { header: 'Vehicle', accessor: (e) => (
      <div>
        <p className="font-medium text-gray-900">{e.vehicle_display_name || e.vin}</p>
        <p className="text-xs text-gray-500">{e.host_name || 'Unknown Host'}</p>
      </div>
    )},
    { header: 'Customer', accessor: (e) => e.customer_name || <span className="text-gray-400 italic">No Active Rental</span> },
    { header: 'Status', accessor: (e) => <StatusBadge status={e.status} /> },
    { header: 'Actions', accessor: (e) => (
      <button className="text-blue-600 hover:text-blue-800 text-sm font-semibold flex items-center gap-1">
        <Eye className="h-3 w-3" /> View
      </button>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Alert360" 
        subtitle="Global Telematics Incident & Alert Center"
        icon={AlertCircle}
      />
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Active Critical</p>
          <p className="text-2xl font-black text-red-600 mt-2">{events.filter(e => e.is_active && e.severity === 'critical').length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Active Warnings</p>
          <p className="text-2xl font-black text-amber-600 mt-2">{events.filter(e => e.is_active && e.severity === 'warning').length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Smoke Events Today</p>
          <p className="text-2xl font-black text-gray-900 mt-2">{events.filter(e => e.alert_type === 'cabin_smoke_detected' && new Date(e.first_seen_at) > new Date(Date.now() - 86400000)).length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Impact Events Today</p>
          <p className="text-2xl font-black text-gray-900 mt-2">{events.filter(e => e.alert_type === 'impact_detected' && new Date(e.first_seen_at) > new Date(Date.now() - 86400000)).length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search alerts..." 
                className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm w-64 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select 
              className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="resolved">Resolved</option>
            </select>
            <button className="h-9 w-9 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-gray-50">
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        <DataTable 
          columns={columns}
          data={filteredEvents}
          loading={isLoading}
          emptyMessage="No alerts matching criteria."
        />
      </div>
    </div>
  );
}