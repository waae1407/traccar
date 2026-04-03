import React, { useState } from "react";
import { Eye, ExternalLink, Home, Book, Activity, User } from "lucide-react";

const pages = [
  { name: "Home", path: "/book-now", icon: Home, desc: "Main booking page" },
  { name: "My Bookings", path: "/my-bookings", icon: Book, desc: "Customer bookings" },
  { name: "Activity", path: "/activity", icon: Activity, desc: "Activity history" },
  { name: "Account", path: "/account", icon: User, desc: "Account settings" },
];

export default function CustomerPreview() {
  const [selectedPage, setSelectedPage] = useState(pages[0].path);
  const [viewMode, setViewMode] = useState("iframe"); // iframe or link

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2" style={{ fontFamily: "var(--font-syne)" }}>
            <Eye className="h-8 w-8 text-primary" />
            Customer UI Preview
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Test and review the customer experience without switching accounts</p>
        </div>

        {/* Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {pages.map((page) => {
            const Icon = page.icon;
            const isActive = selectedPage === page.path;
            return (
              <button
                key={page.path}
                onClick={() => setSelectedPage(page.path)}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${
                  isActive
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${isActive ? "bg-primary/20" : "bg-muted"}`}>
                      <Icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{page.name}</p>
                      <p className="text-xs text-muted-foreground">{page.desc}</p>
                    </div>
                  </div>
                  {isActive && (
                    <div className="h-2 w-2 rounded-full bg-primary mt-1" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setViewMode("iframe")}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              viewMode === "iframe"
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-foreground hover:border-primary"
            }`}
          >
            Embedded View
          </button>
          <button
            onClick={() => setViewMode("link")}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              viewMode === "link"
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-foreground hover:border-primary"
            }`}
          >
            Open in New Tab
          </button>
        </div>

        {/* Preview */}
        {viewMode === "iframe" ? (
          <div className="rounded-2xl border border-border overflow-hidden shadow-lg bg-card">
            <iframe
              key={selectedPage}
              src={selectedPage}
              className="w-full h-[800px] border-0"
              title="Customer UI Preview"
            />
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center bg-card">
            <ExternalLink className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-semibold mb-2">Open in New Tab</p>
            <p className="text-muted-foreground text-sm mb-4">Click the button below to open the customer page in a new tab for full testing</p>
            <a
              href={selectedPage}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-white transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
            >
              <ExternalLink className="h-4 w-4" />
              Open {pages.find(p => p.path === selectedPage)?.name}
            </a>
          </div>
        )}

        {/* Info */}
        <div className="mt-6 p-4 rounded-lg bg-card border border-border">
          <p className="text-xs text-muted-foreground">
            <strong>Tip:</strong> Use this preview to test the customer experience and validate changes before deployment. You can also open pages in a new tab for full-screen testing.
          </p>
        </div>
      </div>
    </div>
  );
}