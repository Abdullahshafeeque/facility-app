import { useState } from "react"
import { supabase } from "./supabaseClient"

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setError("")
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      setError("Wrong email or password. Try again.")
      setLoading(false)
    } else {
      onLogin(data.user)
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0D0F14",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'DM Mono', monospace",
    }}>
      <div style={{
        background: "#13161E",
        border: "1px solid #1E2330",
        borderRadius: 8,
        padding: 40,
        width: "100%",
        maxWidth: 380,
      }}>
        <div style={{ color: "#F0A500", fontWeight: 700, letterSpacing: 3, fontSize: 13, marginBottom: 6 }}>
          ⚙ FACILITYOS
        </div>
        <div style={{ color: "#E8EAF0", fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
          Sign in to your account
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ color: "#5C6478", fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>EMAIL</div>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{
              width: "100%",
              background: "#0D0F14",
              border: "1px solid #1E2330",
              borderRadius: 4,
              color: "#E8EAF0",
              padding: "10px 12px",
              fontSize: 13,
              fontFamily: "inherit",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ color: "#5C6478", fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>PASSWORD</div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{
              width: "100%",
              background: "#0D0F14",
              border: "1px solid #1E2330",
              borderRadius: 4,
              color: "#E8EAF0",
              padding: "10px 12px",
              fontSize: 13,
              fontFamily: "inherit",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {error && (
          <div style={{ color: "#FF4D6A", fontSize: 12, marginBottom: 14 }}>
            ⚠ {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: "100%",
            background: "#F0A50022",
            color: "#F0A500",
            border: "1px solid #F0A50055",
            borderRadius: 4,
            padding: "10px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </div>
    </div>
  )
}