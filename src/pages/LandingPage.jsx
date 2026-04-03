import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

export default function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === "admin") {
      navigate("/dashboard", { replace: true });
    } else {
      navigate("/book-now", { replace: true });
    }
  }, [user, navigate]);

  return null;
}