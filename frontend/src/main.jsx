import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { LoginPage } from "./components/Auth/LoginPage.jsx";
import { useAuth } from "./context/AuthContext.jsx";

/**
 * Root guard: shows LoginPage until Supabase session is confirmed.
 * - loading=true while session is being restored (shows nothing, preventing flash)
 * - user=null after load → LoginPage
 * - user set → App
 */
function AppWithAuth() {
  const { user, loading } = useAuth();

  // Block render until session restore completes — clean brand-aligned loader
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          fontFamily: "'Inter', sans-serif",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/logo.png" alt="InfraDrishti" style={{ height: "42px", objectFit: "contain" }} />
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a", letterSpacing: "-0.02em" }}>
            InfraDrishti
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "18px",
              height: "18px",
              border: "2.5px solid #fed7aa",
              borderTopColor: "#ea580c",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#64748b" }}>
            Initializing Spatial Engine…
          </span>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return <App />;
}

import React, { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[InfraDrishti Root ErrorBoundary]:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          color: "#f8fafc",
          padding: "24px",
          fontFamily: "Inter, sans-serif"
        }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px", color: "#ef4444" }}>
            Application Encountered an Error
          </h2>
          <p style={{ fontSize: "13px", color: "#94a3b8", maxWidth: "500px", textAlign: "center", marginBottom: "16px" }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 18px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "13px"
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AppWithAuth />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
