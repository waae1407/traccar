import React from "react";
import ThreadInbox from "@/components/communications/ThreadInbox";

export default function AdminCommunications() {
  return <ThreadInbox role="admin" canCreate />;
}