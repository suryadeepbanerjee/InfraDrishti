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
		return new Response(JSON.stringify({ error: "Missing user.email or email_data.token" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	console.log(`Sending OTP to ${email}, token length: ${token.length}`);

	const html = `<!DOCTYPE html>
  <html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <meta name="x-apple-disable-message-reformatting">
      <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
      <title>InfraDrishti — Sign-In Code</title>
      <!--[if gte mso 9]>
      <xml>
          <o:OfficeDocumentSettings>
              <o:PixelsPerInch>96</o:PixelsPerInch>
          </o:OfficeDocumentSettings>
      </xml>
      <style>
          table, td, div, h1, p { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
      </style>
      <![endif]-->
      <style>
          /* ---------- RESET & BASE ---------- */
          * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
          }

          body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              background-color: #f6f7f9;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
              text-rendering: optimizeLegibility;
          }

          /* ---------- CONTAINER ---------- */
          .email-wrapper {
              width: 100%;
              max-width: 520px;
              margin: 0 auto;
              padding: 40px 20px;
          }

          /* ---------- CARD ---------- */
          .email-card {
              background: #ffffff;
              border-radius: 20px;
              overflow: hidden;
              box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04), 0 8px 32px rgba(15, 23, 42, 0.06);
              border: 1px solid #eef2f6;
          }

          /* ---------- HEADER / TOP ACCENT (ORANGE THEME) ---------- */
          .card-accent {
              height: 5px;
              background: linear-gradient(90deg, #0f172a 0%, #9a3412 40%, #f97316 70%, #fbbf24 100%);
              width: 100%;
          }

          /* ---------- LOGO SECTION ---------- */
          .logo-section {
              text-align: center;
              padding: 44px 32px 0 32px;
          }

          .logo-wrapper {
              display: inline-block;
              border-radius: 50%;
              background: #ffffff;
              padding: 4px;
              box-shadow: 0 0 0 1px #eef2f6, 0 4px 16px rgba(15, 23, 42, 0.06);
          }

          .logo-img {
              width: 72px;
              height: 72px;
              display: block;
          }

          /* ---------- BRAND NAME (ORANGE GRADIENT) ---------- */
          .brand-name {
              font-size: 22px;
              font-weight: 700;
              color: #0f172a;
              letter-spacing: -0.02em;
              margin-top: 20px;
              line-height: 1.3;
          }

          .brand-name span {
              background: linear-gradient(135deg, #0f172a 0%, #c2410c 50%, #f97316 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
          }

          .brand-sub {
              font-size: 13px;
              color: #94a3b8;
              font-weight: 400;
              letter-spacing: 0.04em;
              margin-top: 4px;
          }

          /* ---------- DIVIDER ---------- */
          .divider {
              height: 1px;
              background: #eef2f6;
              margin: 28px 32px 0 32px;
          }

          /* ---------- CONTENT ---------- */
          .content {
              padding: 36px 36px 40px 36px;
              text-align: center;
          }

          .greeting {
              font-size: 15px;
              color: #475569;
              line-height: 1.6;
              margin-bottom: 24px;
              font-weight: 400;
          }

          .greeting strong {
              color: #0f172a;
              font-weight: 600;
          }

          /* ---------- CODE DISPLAY (ORANGE THEME) ---------- */
          .code-label {
              font-size: 11px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.18em;
              color: #94a3b8;
              margin-bottom: 14px;
          }

          .code-box {
              display: inline-block;
              background: #fff7ed;
              border: 2px solid #f97316;
              border-radius: 14px;
              padding: 20px 36px;
              margin: 0 auto 28px auto;
              letter-spacing: 10px;
              font-size: 38px;
              font-weight: 700;
              color: #0f172a;
              font-variant-numeric: tabular-nums;
              box-shadow: 0 2px 8px rgba(249, 115, 22, 0.10);
              font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Roboto Mono', Menlo, Consolas, monospace;
              transition: border-color 0.2s ease;
          }

          .code-box span {
              letter-spacing: 10px;
          }

          /* ---------- INFO TEXT ---------- */
          .info-text {
              font-size: 13px;
              color: #94a3b8;
              line-height: 1.7;
              margin-bottom: 6px;
          }

          .info-text strong {
              color: #475569;
              font-weight: 500;
          }

          /* ---------- EXPIRY BADGE (ORANGE THEME) ---------- */
          .expiry-badge {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              background: #ffedd5;
              border-radius: 100px;
              padding: 8px 18px;
              font-size: 12px;
              color: #9a3412;
              font-weight: 500;
              letter-spacing: 0.01em;
              margin-top: 12px;
          }

          .expiry-badge .dot {
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background: #f97316;
              display: inline-block;
              animation: pulse-dot 2s ease-in-out infinite;
          }

          @keyframes pulse-dot {
              0%,
              100% {
                  opacity: 1;
                  transform: scale(1);
              }
              50% {
                  opacity: 0.35;
                  transform: scale(0.8);
              }
          }

          /* ---------- FOOTER ---------- */
          .footer {
              text-align: center;
              padding: 28px 32px 32px 32px;
              background: #fafbfc;
              border-top: 1px solid #eef2f6;
              border-radius: 0 0 20px 20px;
          }

          .footer-text {
              font-size: 12px;
              color: #c0c7d1;
              line-height: 1.7;
              margin-bottom: 4px;
          }

          .footer-link {
              color: #94a3b8;
              text-decoration: none;
              font-weight: 500;
              transition: color 0.2s ease;
          }

          .footer-link:hover {
              color: #ea580c;
              text-decoration: underline;
          }

          .footer-separator {
              color: #dde3ea;
              margin: 0 8px;
          }

          /* ---------- RESPONSIVE ---------- */
          @media screen and (max-width: 600px) {
              .email-wrapper {
                  padding: 16px 12px;
              }
              .email-card {
                  border-radius: 16px;
              }
              .content {
                  padding: 28px 20px 32px 20px;
              }
              .logo-section {
                  padding: 32px 20px 0 20px;
              }
              .logo-img {
                  width: 60px;
                  height: 60px;
              }
              .code-box {
                  font-size: 30px;
                  letter-spacing: 7px;
                  padding: 16px 24px;
                  border-radius: 12px;
              }
              .code-box span {
                  letter-spacing: 7px;
              }
              .footer {
                  padding: 20px 20px 24px 20px;
              }
              .divider {
                  margin: 20px 20px 0 20px;
              }
              .brand-name {
                  font-size: 19px;
              }
          }

          @media screen and (max-width: 380px) {
              .code-box {
                  font-size: 26px;
                  letter-spacing: 5px;
                  padding: 14px 18px;
              }
              .code-box span {
                  letter-spacing: 5px;
              }
              .content {
                  padding: 24px 14px 28px 14px;
              }
          }

          /* ---------- DARK MODE FIX (Apple Mail / Outlook) ---------- */
          @media (prefers-color-scheme: dark) {
              .email-card {
                  background: #ffffff !important;
              }
              .footer {
                  background: #fafbfc !important;
              }
              .code-box {
                  background: #fff7ed !important;
                  color: #0f172a !important;
                  border-color: #f97316 !important;
              }
              body,
              .email-wrapper {
                  background-color: #f6f7f9 !important;
              }
              .brand-name span {
                  -webkit-text-fill-color: transparent !important;
              }
          }
      </style>
  </head>
  <body style="margin:0; padding:0; background-color:#f6f7f9;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f7f9;">
          <tr>
              <td align="center" valign="top" style="padding:0;">
                  <div class="email-wrapper">

                      <!-- ===== CARD ===== -->
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-card">
                          <tr>
                              <td style="padding:0;">

                                  <!-- Top Accent Bar – Orange brand gradient -->
                                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                      <tr>
                                          <td class="card-accent" style="height:5px; background:linear-gradient(90deg, #0f172a 0%, #9a3412 40%, #f97316 70%, #fbbf24 100%); border-radius:20px 20px 0 0;"></td>
                                      </tr>
                                  </table>

                                  <!-- Logo + Brand -->
                                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                      <tr>
                                          <td class="logo-section" style="text-align:center; padding:44px 32px 0 32px;">
                                              <img
                                                  src="https://infradrishti.suryadeepbanerjee.in/logo.png"
                                                  alt="InfraDrishti Logo"
                                                  class="logo-img"
                                                  style="width:72px; height:72px; display:block; margin:0 auto;"
                                              />
                                              <div class="brand-name" style="font-size:22px; font-weight:700; color:#0f172a; letter-spacing:-0.02em; margin-top:20px; line-height:1.3;">
                                                  <span style="background:linear-gradient(135deg, #0f172a 0%, #c2410c 50%, #f97316 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;">InfraDrishti</span>
                                              </div>
                                              <div class="brand-sub" style="font-size:13px; color:#94a3b8; font-weight:400; letter-spacing:0.04em; margin-top:4px;">
                                                  Intelligent Infrastructure Monitoring
                                              </div>
                                          </td>
                                      </tr>
                                  </table>

                                  <!-- Divider -->
                                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                      <tr>
                                          <td class="divider" style="height:1px; background:#eef2f6; margin:28px 32px 0 32px;"></td>
                                      </tr>
                                  </table>

                                  <!-- Content -->
                                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                      <tr>
                                          <td class="content" style="padding:36px 36px 40px 36px; text-align:center;">

                                              <p class="greeting" style="font-size:15px; color:#475569; line-height:1.6; margin-bottom:24px; font-weight:400;">
                                                  Hello,<br>
                                                  Use the code below to securely sign in to <strong style="color:#0f172a; font-weight:600;">InfraDrishti</strong>.
                                              </p>

                                              <!-- Code Label -->
                                              <div class="code-label" style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.18em; color:#94a3b8; margin-bottom:14px;">
                                                  Your one-time code
                                              </div>

                                              <!-- Code Box – Orange accent -->
                                              <div class="code-box" style="display:inline-block; background:#fff7ed; border:2px solid #f97316; border-radius:14px; padding:20px 36px; margin:0 auto 28px auto; letter-spacing:10px; font-size:38px; font-weight:700; color:#0f172a; font-variant-numeric:tabular-nums; box-shadow:0 2px 8px rgba(249,115,22,0.10); font-family:'SF Mono', 'Fira Code', 'JetBrains Mono', 'Roboto Mono', Menlo, Consolas, monospace;">
                                                  <span>${token}</span>
                                              </div>

                                              <!-- Info -->
                                              <p class="info-text" style="font-size:13px; color:#94a3b8; line-height:1.7; margin-bottom:6px;">
                                                  Enter this code in <strong style="color:#475569; font-weight:500;">InfraDrishti</strong> to sign in.
                                              </p>

                                              <!-- Expiry Badge – Orange theme -->
                                              <div class="expiry-badge" style="display:inline-block; background:#ffedd5; border-radius:100px; padding:8px 18px; font-size:12px; color:#9a3412; font-weight:500; letter-spacing:0.01em; margin-top:12px;">
                                                  <span style="color:#f97316; font-size:8px; vertical-align:middle; margin-right:6px;">&#9679;</span>Expires in 1 hour
                                              </div>

                                          </td>
                                      </tr>
                                  </table>

                                  <!-- Footer -->
                                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                      <tr>
                                          <td class="footer" style="text-align:center; padding:28px 32px 32px 32px; background:#fafbfc; border-top:1px solid #eef2f6; border-radius:0 0 20px 20px;">
                                              <p class="footer-text" style="font-size:12px; color:#c0c7d1; line-height:1.7; margin-bottom:4px;">
                                                  If you did not request this, please ignore this email.
                                              </p>
                                              <p class="footer-text" style="font-size:12px; color:#c0c7d1; line-height:1.7; margin-bottom:0;">
                                                  <a href="https://infradrishti.suryadeepbanerjee.in" class="footer-link" style="color:#94a3b8; text-decoration:none; font-weight:500;">InfraDrishti</a>
                                                  <span class="footer-separator" style="color:#dde3ea; margin:0 8px;">·</span>
                                                  <a href="#" class="footer-link" style="color:#94a3b8; text-decoration:none; font-weight:500;">Help</a>
                                                  <span class="footer-separator" style="color:#dde3ea; margin:0 8px;">·</span>
                                                  <a href="#" class="footer-link" style="color:#94a3b8; text-decoration:none; font-weight:500;">Privacy</a>
                                              </p>
                                          </td>
                                      </tr>
                                  </table>

                              </td>
                          </tr>
                      </table>

                      <!-- Spacing -->
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                              <td style="height:20px; font-size:0; line-height:0;">&nbsp;</td>
                          </tr>
                      </table>

                  </div>
              </td>
          </tr>
      </table>

  </body>
  </html>`;

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
