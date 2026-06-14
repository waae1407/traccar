import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Legacy questionnaire — redirects to the new fast onboarding flow.
export default function SmartOperatorQuestionnaire() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/become-a-host", { replace: true }); }, [navigate]);
  return null;
}