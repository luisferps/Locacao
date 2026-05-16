import { useState } from "react";
import { api } from "./api.js";

const inputStyle = {
  width: "100%", background: "#0f1623", border: "1px solid #2d3748",
  borderRadius: 8, color: "#e2e8f0", padding: "10px 14px", fontSize: 14,
  boxSizing: "border-box", outline: "none", fontFamily: "inherit",
};

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ nome: "", email: "", senha: "", confirmar: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    setError("");
    if (!form.email || !form.senha) return setError("Preencha email e senha");
    if (mode === "register") {
      if (!form.nome) return setError("Preencha seu nome");
      if (form.senha !== form.confirmar) return setError("As senhas não conferem");
      if (form.senha.length < 6) return setError("Senha deve ter ao menos 6 caracteres");
    }
    setLoading(true);
    try {
      const res = mode === "login"
        ? await api.login({ email: form.email, senha: form.senha })
        : await api.register({ nome: form.nome, email: form.email, senha: form.senha });
      localStorage.setItem("token", res.token);
      localStorage.setItem("user", JSON.stringify(res.user));
      onLogin(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0e1a", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');`}</style>

      <div style={{
        background: "#131929", border: "1px solid #1e2940", borderRadius: 20,
        padding: "40px 36px", width: "100%", maxWidth: 420,
        boxShadow: "0 32px 80px #000c",
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: "#6366f120",
            border: "1px solid #6366f140", display: "flex", alignItems: "center",
            justifyContent: "center", margin: "0 auto 16px", fontSize: 24,
          }}>⌂</div>
          <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Imobiliária</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#e2e8f0" }}>Gestão de Aluguel</div>
          <div style={{ fontSize: 14, color: "#475569", marginTop: 6 }}>
            {mode === "login" ? "Entre na sua conta" : "Crie sua conta"}
          </div>
        </div>

        {mode === "register" && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Nome completo</label>
            <input style={inputStyle} placeholder="Seu nome" value={form.nome} onChange={set("nome")} />
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Email</label>
          <input style={inputStyle} type="email" placeholder="seu@email.com" value={form.email} onChange={set("email")}
            onKeyDown={e => e.key === "Enter" && submit()} />
        </div>

        <div style={{ marginBottom: mode === "register" ? 14 : 20 }}>
          <label style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Senha</label>
          <input style={inputStyle} type="password" placeholder="••••••••" value={form.senha} onChange={set("senha")}
            onKeyDown={e => e.key === "Enter" && submit()} />
        </div>

        {mode === "register" && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Confirmar senha</label>
            <input style={inputStyle} type="password" placeholder="••••••••" value={form.confirmar} onChange={set("confirmar")}
              onKeyDown={e => e.key === "Enter" && submit()} />
          </div>
        )}

        {error && (
          <div style={{
            background: "#ef444420", border: "1px solid #ef444440", borderRadius: 8,
            padding: "10px 14px", color: "#ef4444", fontSize: 13, marginBottom: 16,
          }}>{error}</div>
        )}

        <button
          onClick={submit}
          disabled={loading}
          style={{
            width: "100%", background: "#6366f1", color: "#fff", border: "none",
            borderRadius: 10, padding: "12px", fontSize: 15, fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
            fontFamily: "inherit", marginBottom: 16,
          }}
        >{loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}</button>

        <div style={{ textAlign: "center", fontSize: 14, color: "#475569" }}>
          {mode === "login" ? "Não tem conta? " : "Já tem conta? "}
          <button
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setForm({ nome: "", email: "", senha: "", confirmar: "" }); }}
            style={{ background: "none", border: "none", color: "#818cf8", cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "inherit" }}
          >{mode === "login" ? "Cadastre-se" : "Entrar"}</button>
        </div>
      </div>
    </div>
  );
}
