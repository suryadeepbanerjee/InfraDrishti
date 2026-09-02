import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [preferences, setPreferences] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfileAndPreferences(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfileAndPreferences(session.user.id);
      } else {
        setProfile(null);
        setPreferences(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfileAndPreferences = async (userId) => {
    try {
      const { data: prof } = await supabase.from('profiles').select('*').eq('user_id', userId).single();
      const { data: prefs } = await supabase.from('user_preferences').select('*').eq('user_id', userId).single();
      
      setProfile(prof || {
        display_name: "User",
        organization: "Organization",
        job_title: "Planner",
        user_id: userId
      });
      setPreferences(prefs || {
        measurement_unit: "METRIC",
        coordinate_reference: "WGS84",
        default_infrastructure_type: "highway",
        default_facility_type: "logistics_hub",
        map_style: "streets",
        user_id: userId
      });
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email) => {
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase() });
    return { error };
  };

  const verifyOtp = async (email, token) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: 'email',
    });
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const updateProfile = async (fields) => {
    setProfile({ ...profile, ...fields });
    if (user) {
      await supabase.from('profiles').update(fields).eq('user_id', user.id);
    }
    return {};
  };

  const updatePreferences = async (fields) => {
    setPreferences({ ...preferences, ...fields });
    if (user) {
      await supabase.from('user_preferences').update(fields).eq('user_id', user.id);
    }
    return {};
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        profile,
        preferences,
        signIn,
        verifyOtp,
        signOut,
        updateProfile,
        updatePreferences,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
