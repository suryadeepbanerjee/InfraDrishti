/**
 * UserProfileModal.jsx — Real user profile and preferences panel.
 *
 * Displays and edits:
 *   - Real email (from Supabase auth)
 *   - display_name, organization, job_title (from public.profiles)
 *   - measurement_unit, coordinate_reference, default_infrastructure_type,
 *     default_facility_type, map_style (from public.user_preferences)
 *
 * All data is persisted to Supabase via AuthContext.
 * No fake government identity, clearance, or role.
 */
import React, { useEffect, useState } from "react";
import { X, Save, LogOut, User, Loader } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function UserProfileModal({ isOpen, onClose, onSignOut }) {
  const { user, profile, preferences, updateProfile, updatePreferences, signOut } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [organization, setOrganization] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [unit, setUnit] = useState("METRIC");
  const [coordRef, setCoordRef] = useState("WGS84");
  const [defaultInfra, setDefaultInfra] = useState("highway");
  const [defaultFacility, setDefaultFacility] = useState("logistics_hub");
  const [mapStyle, setMapStyle] = useState("streets");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Sync local state when profile/preferences load
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setOrganization(profile.organization || "");
      setJobTitle(profile.job_title || "");
    }
  }, [profile]);

  useEffect(() => {
    if (preferences) {
      setUnit(preferences.measurement_unit || "METRIC");
      setCoordRef(preferences.coordinate_reference || "WGS84");
      setDefaultInfra(preferences.default_infrastructure_type || "highway");
      setDefaultFacility(preferences.default_facility_type || "logistics_hub");
      setMapStyle(preferences.map_style || "streets");
    }
  }, [preferences]);

  if (!isOpen) return null;

  const displayInitials = () => {
    const name = displayName || user?.email || "?";
    return name.slice(0, 2).toUpperCase();
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      const [{ error: pErr }, { error: prErr }] = await Promise.all([
        updateProfile({ display_name: displayName, organization, job_title: jobTitle }),
        updatePreferences({
          measurement_unit: unit,
          coordinate_reference: coordRef,
          default_infrastructure_type: defaultInfra,
          default_facility_type: defaultFacility,
          map_style: mapStyle,
        }),
      ]);
      if (pErr || prErr) {
        setSaveError((pErr || prErr).message || "Save failed.");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch (e) {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    onClose();
    if (onSignOut) onSignOut();
  };

  return (
    <div className="drawerOverlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div
        className="sideDrawerCard"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "400px", maxWidth: "90vw", display: "flex", flexDirection: "column", background: "#ffffff" }}
      >
        {/* Header */}
        <div className="drawerHeader">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "36px", height: "36px", borderRadius: "50%",
              background: "linear-gradient(135deg, #3b82f6, #6366f1)",
              color: "#fff", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "13px", fontWeight: 700,
              flexShrink: 0,
            }}>
              {displayInitials()}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                {displayName || user?.email?.split("@")[0] || "User"}
              </h3>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {user?.email}
              </span>
            </div>
          </div>
          <button className="iconActionBtn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="drawerBody" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px 18px", overflowY: "auto" }}>

          {/* Profile Section */}
          <div>
            <div style={sectionLabel}>PROFILE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Field label="Display name">
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={user?.email?.split("@")[0]} style={inputStyle} />
              </Field>
              <Field label="Organization">
                <input value={organization} onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Organization (optional)" style={inputStyle} />
              </Field>
              <Field label="Job title">
                <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Role / title (optional)" style={inputStyle} />
              </Field>
            </div>
          </div>

          {/* Authentication */}
          <div style={{ background: "#f8fafc", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "10px 12px" }}>
            <div style={{ fontSize: "11px", color: "#475569", fontWeight: 600 }}>AUTHENTICATION</div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Email OTP · No password</div>
            <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px", fontFamily: "monospace" }}>{user?.email}</div>
          </div>

          {/* Geospatial Preferences */}
          <div>
            <div style={sectionLabel}>PREFERENCES</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <SelectField label="Units" value={unit} onChange={setUnit}>
                <option value="METRIC">Metric (km, m, ha)</option>
                <option value="IMPERIAL">Imperial (miles, ft, acres)</option>
              </SelectField>
              <SelectField label="Coordinate reference" value={coordRef} onChange={setCoordRef}>
                <option value="WGS84">WGS-84 Decimal Degrees</option>
                <option value="UTM">UTM Universal Transverse</option>
              </SelectField>
              <SelectField label="Default infrastructure" value={defaultInfra} onChange={setDefaultInfra}>
                <option value="highway">Highway</option>
                <option value="railway">Railway</option>
                <option value="power_transmission">Power Transmission</option>
              </SelectField>
              <SelectField label="Default facility" value={defaultFacility} onChange={setDefaultFacility}>
                <option value="logistics_hub">Logistics Hub</option>
                <option value="manufacturing_plant">Manufacturing Plant</option>
                <option value="data_center">Data Center</option>
                <option value="solar_park">Solar Park</option>
              </SelectField>
            </div>
          </div>

          {saveError && (
            <div style={{ fontSize: "12px", color: "#ef4444", padding: "8px 10px", background: "#fef2f2", borderRadius: "5px", border: "1px solid #fecaca" }}>
              {saveError}
            </div>
          )}
          {saved && (
            <div style={{ fontSize: "12px", color: "#10b981", padding: "8px 10px", background: "#ecfdf5", borderRadius: "5px", border: "1px solid #a7f3d0" }}>
              Saved successfully.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border-color)", display: "flex", gap: "8px" }}>
          <button onClick={handleSave} disabled={saving}
            className="runAnalysisActionBtn"
            style={{ flex: 1, margin: 0, height: "32px", fontSize: "12px", opacity: saving ? 0.7 : 1 }}>
            {saving ? <><Loader size={12} /> Saving…</> : <><Save size={12} /><span>Save changes</span></>}
          </button>
          <button onClick={handleSignOut}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 14px", height: "32px", fontSize: "12px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#fff", color: "#ef4444", cursor: "pointer", fontWeight: 500 }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

const sectionLabel = {
  fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
  letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px",
};

const inputStyle = {
  width: "100%", padding: "6px 10px", fontSize: "12px",
  borderRadius: "5px", border: "1px solid var(--border-color)",
  background: "#fff", color: "var(--text-primary)", boxSizing: "border-box",
};

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
      <label style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ padding: "3px 8px", fontSize: "12px", borderRadius: "4px", border: "1px solid var(--border-color)", background: "#fff", color: "var(--text-primary)" }}>
        {children}
      </select>
    </div>
  );
}