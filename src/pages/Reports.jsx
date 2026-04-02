import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

export default function Reports() {
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => base44.entities.Vehicle.list() });
  const { data: bookings = [] } = useQuery({ queryKey: ["bookings"], queryFn: () => base44.entities.Booking.list() });
  const { data: payments = [] } = useQuery({ queryKey: ["payments"], queryFn: () => base44.entities.Payment.list() });

  // Revenue per vehicle
  const vehicleRevenue = {};
  payments.filter((p) => p.status === "Paid").forEach((p) => {
    const booking = bookings.find((b) => b.id === p.booking_id);
    if (booking) {
      const vName = booking.vehicle_name || "Unknown";
      vehicleRevenue[vName] = (vehicleRevenue[vName] || 0) + (p.amount || 0);
    }
  });
  const vehicleRevenueData = Object.entries(vehicleRevenue).map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // Utilization rate by city
  const cityStats = {};
  vehicles.forEach((v) => {
    const city = v.current_city || "Unknown";
    if (!cityStats[city]) cityStats[city] = { total: 0, booked: 0 };
    cityStats[city].total += 1;
    if (v.status === "Booked") cityStats[city].booked += 1;
  });
  const utilizationData = Object.entries(cityStats).map(([city, s]) => ({
    city,
    rate: s.total > 0 ? Math.round((s.booked / s.total) * 100) : 0,
  }));

  // Payment compliance
  const totalPayments = payments.length;
  const paidPayments = payments.filter((p) => p.status === "Paid").length;
  const complianceRate = totalPayments > 0 ? Math.round((paidPayments / totalPayments) * 100) : 0;

  // Monthly revenue trend
  const monthlyData = {};
  payments.filter((p) => p.status === "Paid" && p.paid_date).forEach((p) => {
    const d = new Date(p.paid_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyData[key] = (monthlyData[key] || 0) + (p.amount || 0);
  });
  const trendData = Object.entries(monthlyData).sort().map(([month, revenue]) => ({ month, revenue }));

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Payment Compliance</p>
            <p className="text-4xl font-bold text-primary mt-2">{complianceRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">{paidPayments} of {totalPayments} payments</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Fleet Size</p>
            <p className="text-4xl font-bold text-foreground mt-2">{vehicles.length}</p>
            <p className="text-xs text-muted-foreground mt-1">vehicles</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Total Bookings</p>
            <p className="text-4xl font-bold text-foreground mt-2">{bookings.length}</p>
            <p className="text-xs text-muted-foreground mt-1">all time</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Revenue by Vehicle (Top 10)</CardTitle></CardHeader>
          <CardContent>
            {vehicleRevenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={vehicleRevenueData} layout="vertical">
                  <XAxis type="number" fontSize={12} />
                  <YAxis type="category" dataKey="name" fontSize={11} width={120} />
                  <Tooltip formatter={(v) => `$${v.toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="hsl(340,82%,42%)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">No data yet</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Utilization by City</CardTitle></CardHeader>
          <CardContent>
            {utilizationData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={utilizationData}>
                  <XAxis dataKey="city" fontSize={12} />
                  <YAxis fontSize={12} unit="%" />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="rate" fill="hsl(145,63%,42%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">No data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-base">Monthly Revenue Trend</CardTitle></CardHeader>
        <CardContent>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v) => `$${v.toLocaleString()}`} />
                <Line type="monotone" dataKey="revenue" stroke="hsl(340,82%,42%)" strokeWidth={2} dot={{ fill: "hsl(340,82%,42%)" }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">No revenue data yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}