// Shared Resend email utility — call via base44.functions.invoke('sendEmail', {...})
// This replaces integrations.Core.SendEmail with zero integration credits.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const DEFAULT_FROM = "uRide <noreply@uridehub.com>";

Deno.serve(async (req) => {
  try {
    const { to, subject, body, from_name } = await req.json();

    if (!to || !subject || !body) {
      return Response.json({ error: "Missing required fields: to, subject, body" }, { status: 400 });
    }

    const fromAddress = from_name ? `${from_name} <noreply@uridehub.com>` : DEFAULT_FROM;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        html: body,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[sendEmail] Resend error:", JSON.stringify(data));
      return Response.json({ error: data.message || "Email failed" }, { status: res.status });
    }

    return Response.json({ success: true, id: data.id });
  } catch (error) {
    console.error("[sendEmail] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});