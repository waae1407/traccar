import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Car, Users, CalendarDays, DollarSign, FileKey, AlertTriangle } from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ["hsl(340,82%,42%)", "hsl(145,63%,42%)", "hsl(45,93%,47%)", "hsl(220,70%,50%)", "hsl(0,84%,60%)"];

export default function Dashboard() {
  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => base44.entities.Vehicle.list(),
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list(),
  });
  const { data: bookings = [] } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => base44.entities.Booking.list(),
  });
  const { data: payments = [] } = useQuery({
    queryKey: ["payments"],
    queryFn: () => base44.entities.Payment.list(),
  });
  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => base44.entities.RentToOwnContract.list(),
  });

  const activeRentals = bookings.filter((b) => b.status === "Active").length;
  const availableVehicles = vehicles.filter((v) => v.status === "Available").length;
  const overduePayments = payments.filter((p) => p.status === "Overdue");
  const activeContracts = contracts.filter((c) => c.status === "Active").length;

  const totalRevenue = payments
    .filter((p) => p.status === "Paid")
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const thisMonthPayments = payments.filter((p) => {
    if (!p.paid_date) return false;
    const d = new Date(p.paid_date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthlyRevenue = thisMonthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Revenue by city
  const cityRevenue = {};
  bookings.forEach((b) => {
    if (b.status === "Active" || b.status === "Completed") {
      const vehicle = vehicles.find((v) => v.id === b.vehicle_id);
      const city = vehicle?.current_city || "Unknown";
      const bookingPayments = payments.filter((p) => p.booking_id === b.id && p.status === "Paid");
      const rev = bookingPayments.reduce((s, p) => s + (p.amount || 0), 0);
      cityRevenue[city] = (cityRevenue[city] || 0) + rev;
    }
  });
  const cityChartData = Object.entries(cityRevenue).map(([name, value]) => ({ name, value }));

  // Vehicle status pie
  const statusCounts = {};
  vehicles.forEach((v) => {
    statusCounts[v.status] = (statusCounts[v.status] || 0) + 1;
  });
  const vehiclePieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  const recentBookings = [...bookings].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="Active Rentals" value={activeRentals} icon={CalendarDays} color="bg-primary/10" />
        <StatCard title="Available Vehicles" value={availableVehicles} icon={Car} color="bg-green-100" />
        <StatCard title="Total Revenue" value={`$${totalRevenue.toLocaleString()}`} icon={DollarSign} color="bg-blue-100" />
        <StatCard title="Monthly Revenue" value={`$${monthlyRevenue.toLocaleString()}`} icon={DollarSign} color="bg-purple-100" />
        <StatCard title="Overdue Payments" value={overduePayments.length} icon={AlertTriangle} color="bg-red-100" />
        <StatCard title="Active RTO" value={activeContracts} icon={FileKey} color="bg-yellow-100" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Revenue by City */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Revenue by City</CardTitle>
          </CardHeader>
          <CardContent>
            {cityChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={cityChartData}>
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v) => `$${v.toLocaleString()}`} />
                  <Bar dataKey="value" fill="hsl(340,82%,42%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">No revenue data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Vehicle Status */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Fleet Status</CardTitle>
          </CardHeader>
          <CardContent>
            {vehiclePieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={vehiclePieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                    {vehiclePieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">No vehicles yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Bookings & Overdue Payments */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Bookings</CardTitle>
            <Link to="/bookings" className="text-sm text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentBookings.length > 0 ? recentBookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">{b.customer_name || "Customer"}</p>
                  <p className="text-xs text-muted-foreground">{b.vehicle_name || "Vehicle"} · {b.booking_type}</p>
                </div>
                <StatusBadge status={b.status} />
              </div>
            )) : (
              <p className="text-muted-foreground text-sm text-center py-4">No bookings yet</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Overdue Payments</CardTitle>
            <Link to="/payments" className="text-sm text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {overduePayments.length > 0 ? overduePayments.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">{p.customer_name || "Customer"}</p>
                  <p className="text-xs text-muted-foreground">Due: {p.due_date ? format(new Date(p.due_date), "MMM d, yyyy") : "N/A"}</p>
                </div>
                <p className="font-semibold text-red-600">${p.amount?.toLocaleString()}</p>
              </div>
            )) : (
              <p className="text-muted-foreground text-sm text-center py-4">No overdue payments</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}