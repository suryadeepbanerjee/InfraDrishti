/**
 * send-auth-email — Supabase Auth Hook
 * Calls Resend HTTP API directly. Zero SMTP. Zero 504.
 *
 * Required secret (set via CLI or Dashboard → Settings → Edge Functions):
 *   RESEND_API_KEY = re_...
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = "InfraDrishti <auth@notifications.suryadeepbanerjee.in>";

Deno.serve(async (req: Request) => {
  // Auth hooks always POST
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload: { user?: { email?: string }; email_data?: { token?: string } };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const email = payload?.user?.email;
  const token = payload?.email_data?.token;

  if (!email || !token) {
    console.error("Missing email or token in hook payload:", JSON.stringify(payload));
    return new Response(
      JSON.stringify({ error: "Missing user.email or email_data.token" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`Sending OTP to ${email}, token length: ${token.length}`);

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:Inter,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
  <tr><td align="center">
    <table width="460" cellpadding="0" cellspacing="0"
      style="background:#0d1b2a;border:1px solid rgba(59,130,246,0.2);border-radius:16px;padding:40px;">
      <tr><td style="padding-bottom:20px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <span style="font-size:20px;font-weight:700;color:#f8fafc;">InfraDrishti</span><br>
        <span style="font-size:11px;color:#475569;">Infrastructure Intelligence Platform</span>
      </td></tr>
      <tr><td style="padding:28px 0 20px;">
        <p style="color:#94a3b8;font-size:13px;margin:0 0 20px;">
          Your sign-in code for <strong style="color:#cbd5e1;">${email}</strong>:
        </p>
        <div style="text-align:center;padding:20px;background:rgba(30,41,59,0.8);
          border:1px solid rgba(59,130,246,0.3);border-radius:12px;margin-bottom:20px;">
          <span style="font-size:44px;font-weight:700;letter-spacing:14px;color:#3b82f6;
            font-family:'Courier New',monospace;">${token}</span>
        </div>
        <p style="color:#475569;font-size:12px;margin:0;">
          ⏱ Expires in <strong>10 minutes</strong>. Don't share this code.
        </p>
      </td></tr>
      <tr><td style="padding-top:20px;border-top:1px solid rgba(255,255,255,0.05);">
        <p style="color:#1e293b;font-size:11px;margin:0;">
          If you didn't request this, ignore this email.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        subject: `${token} — InfraDrishti Sign-In Code`,
        html,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error("Resend error:", JSON.stringify(result));
      return new Response(JSON.stringify({ error: "Resend send failed", detail: result }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("OTP email sent:", result.id, "→", email);
    // Supabase expects an empty 200 from auth hooks
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Fetch error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
