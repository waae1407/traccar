import React from "react";
import { useOutletContext } from "react-router-dom";

export default function MyVehicle() {
  const { user } = useOutletContext() || {};

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-white">Please sign in</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4">
      <h1 className="text-2xl font-bold text-white">My Vehicle Page</h1>
      <p className="text-white/60">User: {user.email}</p>
    </div>
  );
}