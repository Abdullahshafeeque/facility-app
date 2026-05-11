import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const C = { bg: "#F4F6F9", panel: "#FFFFFF", border: "#E2E8F0", accent: "#1E6FDB", text: "#1E293B", textDim: "#64748B", green: "#16A34A", red: "#DC2626" };

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "" });
  
  // UI States
  const [view, setView] = useState("login"); // 'login', 'signup', 'forgot', 'update'

  // Listen for the special "Password Recovery" link from their email
  useEffect(() => {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setView("update");
        setMsg({ text: "Type your new password below.", type: "success" });
      }
    });
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg({ text: "", type: "" });

    try {
      if (view === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        
        // Push them into the "Waiting Room" table upon creation
        if (data.user) {
          await supabase.from("app_users").insert({ email: data.user.email, role: "pending" });
        }
        setMsg({ text: "Account created! Waiting for Director approval.", type: "success" });
        setView("login");
        setPassword("");
      } 
      
      else if (view === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // The App.js useEffect will catch this and log them in
      } 
      
      else if (view === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin, // Sends them back to this exact app URL
        });
        if (error) throw error;
        setMsg({ text: "Check your email for the reset link!", type: "success" });
        setView("login");
      } 
      
      else if (view === "update") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMsg({ text: "Password updated successfully! You can now log in.", type: "success" });
        setView("login");
        setPassword("");
      }
    } catch (error) {
      setMsg({ text: error.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "'DM Mono', monospace" }}>
      <div style={{ background: C.panel, padding: 40, borderRadius: 8, border: `1px solid ${C.border}`, width: "100%", maxWidth: 400, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
        
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 3, color: C.accent, textTransform: "uppercase", marginBottom: 8 }}>⚙ PRFM HR Portal</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>
            {view === "signup" ? "Create Account" : view === "forgot" ? "Reset Password" : view === "update" ? "Set New Password" : "Staff Login"}
          </div>
        </div>

        {msg.text && (
          <div style={{ padding: 12, borderRadius: 4, marginBottom: 20, fontSize: 12, background: msg.type === "error" ? C.red + "15" : C.green + "15", color: msg.type === "error" ? C.red : C.green, border: `1px solid ${msg.type === "error" ? C.red : C.green}44` }}>
            {msg.text}
          </div>
        )}

        <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          
          {view !== "update" && (
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4, fontWeight: 700 }}>EMAIL ADDRESS</div>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 4, border: `1px solid ${C.border}`, outline: "none", fontSize: 14, boxSizing: "border-box" }} />
            </div>
          )}

          {view !== "forgot" && (
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4, fontWeight: 700 }}>{view === "update" ? "NEW PASSWORD" : "PASSWORD"}</div>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} minLength={6} style={{ width: "100%", padding: "10px 12px", borderRadius: 4, border: `1px solid ${C.border}`, outline: "none", fontSize: 14, boxSizing: "border-box" }} />
            </div>
          )}

          <button type="submit" disabled={loading} style={{ background: C.accent, color: "white", padding: 12, borderRadius: 4, border: "none", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", marginTop: 10, textTransform: "uppercase", letterSpacing: 1 }}>
            {loading ? "Processing..." : view === "signup" ? "Request Access" : view === "forgot" ? "Send Reset Link" : view === "update" ? "Update Password" : "Secure Login"}
          </button>
        </form>

        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10, textAlign: "center", fontSize: 12 }}>
          {view === "login" && (
            <>
              <button type="button" onClick={() => setView("forgot")} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", textDecoration: "underline" }}>Forgot your password?</button>
              <div style={{ color: C.textDim }}>Need an account? <button type="button" onClick={() => setView("signup")} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontWeight: 700 }}>Sign up here</button></div>
            </>
          )}
          
          {view !== "login" && (
            <button type="button" onClick={() => setView("login")} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer" }}>← Back to Login</button>
          )}
        </div>

      </div>
    </div>
  );
}