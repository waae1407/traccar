import React, { useState } from "react";
import { Menu, Search, Bell } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function TopBar({ onMenuClick, title }) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 md:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground hidden sm:block">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, VIN, phone..."
            className="pl-9 w-64 bg-secondary border-0"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1 right-1 h-2.5 w-2.5 bg-primary rounded-full" />
        </Button>
      </div>
    </header>
  );
}