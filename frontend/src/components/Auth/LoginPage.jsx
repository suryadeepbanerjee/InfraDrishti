/**
 * Auth/LoginPage.jsx — Polished InfraDrishti login screen.
 *
 * Step 1: Enter email → Send OTP
 * Step 2: Enter 6-digit OTP → Verify & Continue
 *
 * Handles: invalid email, OTP sent, invalid/expired OTP,
 *           resend cooldown (60s), network errors, loading states.
 */
import React, { useEffect, useRef, useState } from "react";
import { Mail, Shield, RefreshCw, ArrowLeft, Loader } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN = 60; // seconds

export function LoginPage() {
  const { signIn, verifyOtp } = useAuth();
  const [step, setStep] = useState("email"); // "email" | "otp"
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef(null);
  const otpRef = useRef(null);

  // Start resend cooldown timer
  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  // Focus OTP input when step changes
  useEffect(() => {
    if (step === "otp") setTimeout(() => otpRef.current?.focus(), 100);
  }, [step]);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!EMAIL_RE.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const { error: sendError } = await signIn(email);
      if (sendError) {
        setError(sendError.message || "Failed to send OTP. Please try again.");
      } else {
        setInfo(`A 6-digit code was sent to ${email.trim().toLowerCase()}`);
        setStep("otp");
        setOtp("");
        startCooldown();
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    const code = otp.trim().replace(/\s/g, "");
    if (code.length < 6) {
      setError("Enter the complete 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      const { error: verifyError } = await verifyOtp(email, code);
      if (verifyError) {
        const msg = (verifyError.message || "").toLowerCase();
        // Check for wrong OTP first — Supabase may include "expired" in the
        // message even when the code is simply wrong, so "invalid"/"otp"
        // must be tested before "expired".
        if (msg.includes("invalid") || (msg.includes("otp") && !msg.includes("expired"))) {
          setError("Invalid code. Check the digits and try again.");
        } else if (msg.includes("expired")) {
          setError("Code has expired. Please request a new one.");
        } else {
          setError(verifyError.message || "Verification failed. Please try again.");
        }
      }
      // On success, AuthContext updates session → App re-renders with main UI
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const { error: resendError } = await signIn(email);
      if (resendError) {
        setError(resendError.message || "Failed to resend. Please try again.");
      } else {
        setInfo("A new code was sent.");
        startCooldown();
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      {/* Background grid pattern */}
      <div style={styles.bgGrid} />

      <div style={styles.card}>
        {/* Logo / Brand */}
        <div style={styles.brand}>
          <img src="/logo.png" alt="InfraDrishti" style={{ width: "36px", height: "36px", objectFit: "contain" }} />
          <div>
            <div style={styles.brandName}>InfraDrishti</div>
            <div style={styles.brandSub}>Infrastructure Intelligence Platform</div>
          </div>
        </div>

        <div style={styles.divider} />

        {step === "email" ? (
          <form onSubmit={handleSendOtp} style={styles.form}>
            <div style={styles.stepTitle}>Sign In</div>
            <div style={styles.stepDesc}>
              Enter your email to receive a one-time sign-in code. No password required.
            </div>

            <label style={styles.label} htmlFor="login-email">Email address</label>
            <div style={styles.inputWrapper}>
              <Mail size={15} style={styles.inputIcon} />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                style={styles.input}
                disabled={loading}
              />
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <button
              id="btn-send-otp"
              type="submit"
              style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
              disabled={loading}
            >
              {loading
                ? <><Loader size={14} style={styles.spin} /> Sending…</>
                : "Send Sign-In Code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} style={styles.form}>
            <button
              type="button"
              onClick={() => { setStep("email"); setError(""); setInfo(""); }}
              style={styles.back}
            >
              <ArrowLeft size={13} /> Change email
            </button>

            <div style={styles.stepTitle}>Enter verification code</div>
            <div style={styles.stepDesc}>
              {info || `Check ${email.trim().toLowerCase()} for your 6-digit code.`}
            </div>

            <label style={styles.label} htmlFor="login-otp">6-digit code</label>
            <input
              id="login-otp"
              ref={otpRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              value={otp}
              onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "")); setError(""); }}
              style={{ ...styles.input, letterSpacing: "0.25em", fontSize: "20px", textAlign: "center", padding: "12px 16px" }}
              disabled={loading}
            />

            {error && <div style={styles.error}>{error}</div>}

            <button
              id="btn-verify-otp"
              type="submit"
              style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
              disabled={loading}
            >
              {loading
                ? <><Loader size={14} style={styles.spin} /> Verifying…</>
                : "Verify & Continue"}
            </button>

            <button
              id="btn-resend"
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || loading}
              style={styles.resend}
            >
              <RefreshCw size={13} />
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </form>
        )}

        <div style={styles.footer}>
          Secure authentication powered by Supabase · Email OTP only
        </div>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  overlay: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f8fafc",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    position: "relative",
    overflow: "hidden",
    padding: "16px",
    boxSizing: "border-box",
  },
  bgGrid: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(234, 88, 12, 0.04) 1px, transparent 1px)," +
      "linear-gradient(90deg, rgba(234, 88, 12, 0.04) 1px, transparent 1px)",
    backgroundSize: "36px 36px",
    pointerEvents: "none",
  },
  card: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: "410px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "32px 28px",
    boxShadow: "0 12px 30px -4px rgba(0, 0, 0, 0.06), 0 4px 6px -2px rgba(0, 0, 0, 0.02)",
    boxSizing: "border-box",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "16px",
  },
  brandName: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#0f172a",
    letterSpacing: "-0.02em",
  },
  brandSub: {
    fontSize: "11px",
    color: "#64748b",
    marginTop: "1px",
  },
  divider: {
    height: "1px",
    background: "#f1f5f9",
    marginBottom: "22px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  stepTitle: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#0f172a",
    marginBottom: "2px",
    letterSpacing: "-0.01em",
  },
  stepDesc: {
    fontSize: "13px",
    color: "#64748b",
    lineHeight: 1.45,
    marginBottom: "4px",
  },
  label: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#475569",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  inputWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  inputIcon: {
    position: "absolute",
    left: "12px",
    color: "#94a3b8",
    pointerEvents: "none",
  },
  input: {
    width: "100%",
    padding: "10px 12px 10px 36px",
    background: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    color: "#0f172a",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s, box-shadow 0.15s",
  },
  btn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "11px 16px",
    background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
    boxShadow: "0 2px 8px rgba(234, 88, 12, 0.35)",
    border: "none",
    borderRadius: "6px",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: "4px",
    transition: "all 0.15s ease",
    width: "100%",
  },
  error: {
    padding: "8px 12px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "6px",
    fontSize: "12px",
    color: "#dc2626",
    lineHeight: 1.4,
  },
  resend: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    background: "transparent",
    border: "none",
    color: "#ea580c",
    fontSize: "12px",
    cursor: "pointer",
    padding: "6px",
    fontWeight: 600,
  },
  back: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    background: "transparent",
    border: "none",
    color: "#ea580c",
    fontSize: "12px",
    cursor: "pointer",
    padding: 0,
    marginBottom: "4px",
    fontWeight: 600,
  },
  spin: {
    animation: "spin 1s linear infinite",
  },
  footer: {
    marginTop: "20px",
    fontSize: "11px",
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 1.4,
  },
};
