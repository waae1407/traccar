import React from "react";
import ThreadInbox from "@/components/communications/ThreadInbox";

export default function CustomerCommunications() {
  return <ThreadInbox role="customer" canCreate />;
}