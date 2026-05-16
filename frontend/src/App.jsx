import { useState, useEffect, useMemo, useRef } from "react";
import { api } from "./api.js";
import Auth from "./Auth.jsx";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v) => Number(v)?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "R$ 0,00";
const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "-";

const statusColors = {
  Ativo: "#22c55e", Inativo: "#94a3b8", Pago: "#22c55e",
  Pendente: "#f59e0b", Atrasado: "#ef4444", Repassado: "#6366f1", Aguardando: "#f59e0b",
};

const Badge = ({ label }) => (
  <span style={{
    background: (statusColors[label] || "#64748b") + "22",
    color: statusColors[label] || "#64748b",
    border: `1px solid ${(statusColors[label] || "#64748b")}44`,
    padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
  }}>{label}</span>
);

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000088", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#1a1f2e", borderRadius: 16, padding: 28, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", border: "1px solid #2d3748", boxShadow: "0 25px 60px #000a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 18, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", background: "#0f1623", border: "1px solid #2d3748", borderRadius: 8, color: "#e2e8f0", padding: "8px 12px", fontSize: 14, boxSizing: "border-box", outline: "none", fontFamily: "inherit" };
const labelStyle = { color: "#94a3b8", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 };
const Field = ({ label, children }) => <div style={{ marginBottom: 14 }}><label style={labelStyle}>{label}</label>{children}</div>;

function Toast({ msg, type }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: type === "error" ? "#ef4444" : "#22c55e",
      color: "#fff", padding: "12px 20px", borderRadius: 10,
      fontWeight: 600, fontSize: 14, boxShadow: "0 8px 24px #0008",
      animation: "fadeIn .2s ease",
    }}>{msg}</div>
  );
}

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
  });
  const isAdmin = user?.role === "admin";
  const [imoveis, setImoveis] = useState([]);
  const [recebimentos, setRecebimentos] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [repasses, setRepasses] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Modais
  const [modalImovel, setModalImovel] = useState(null);
  const [modalReceb, setModalReceb] = useState(null);
  const [modalDesp, setModalDesp] = useState(null);
  const [modalRepasse, setModalRepasse] = useState(null);
  const [detalheImovel, setDetalheImovel] = useState(null);

  // Forms
  const emptyImovel = { codigo: "", endereco: "", bairro: "", tipo: "Apartamento", locatario: "", locador: "", aluguel: "", vencimento: "", status: "Ativo", inicio: "", telefoneLocatario: "", telefoneLocador: "", taxaAdm: 10 };
  const [formImovel, setFormImovel] = useState(emptyImovel);
  const emptyReceb = { imovelId: "", data: "", valor: "", tipo: "Aluguel", status: "Pago", obs: "" };
  const [formReceb, setFormReceb] = useState(emptyReceb);
  const emptyDesp = { imovelId: "", data: "", valor: "", tipo: "Manutenção", descricao: "", status: "Pago" };
  const [formDesp, setFormDesp] = useState(emptyDesp);
  const emptyRepasse = { imovelId: "", mes: "", data: "", status: "Repassado" };
  const [formRepasse, setFormRepasse] = useState(emptyRepasse);

  // Relatório
  const [relLocador, setRelLocador] = useState("");
  const [relMesInicio, setRelMesInicio] = useState("");
  const [relMesFim, setRelMesFim] = useState("");
  const [relGerado, setRelGerado] = useState(false);
  const printRef = useRef(null);

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (!user) return <Auth onLogin={(u) => { setUser(u); }} />;

  // ── Load inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    const loads = [api.getImoveis(), api.getRecebimentos(), api.getDespesas(), api.getRepasses()];
    if (user?.role === "admin") loads.push(api.getUsuarios());
    Promise.all(loads)
      .then(([im, rec, dep, rep, usu]) => {
        setImoveis(im); setRecebimentos(rec); setDespesas(dep); setRepasses(rep);
        if (usu) setUsuarios(usu);
      })
      .catch(() => showToast("Erro ao conectar com o servidor", "error"))
      .finally(() => setLoading(false));
  }, []);

  // ── Metrics ───────────────────────────────────────────────────────────────
  const totalAluguel = imoveis.filter(i => i.status === "Ativo").reduce((s, i) => s + Number(i.aluguel), 0);
  const recebMes = recebimentos.filter(r => r.status === "Pago").reduce((s, r) => s + Number(r.valor), 0);
  const despTotal = despesas.reduce((s, d) => s + Number(d.valor), 0);
  const repasseTotal = repasses.reduce((s, r) => s + Number(r.valorLiquido), 0);
  const pendentes = recebimentos.filter(r => r.status === "Pendente").length;

  // ── Handlers Imóveis ──────────────────────────────────────────────────────
  const saveImovel = async () => {
    if (!formImovel.codigo || !formImovel.endereco || !formImovel.locatario) return;
    const payload = { ...formImovel, aluguel: +formImovel.aluguel, vencimento: +formImovel.vencimento, taxaAdm: +formImovel.taxaAdm };
    try {
      if (modalImovel === "new") {
        const novo = await api.createImovel(payload);
        setImoveis(p => [...p, novo]);
        showToast("Imóvel cadastrado!");
      } else {
        const atualizado = await api.updateImovel(modalImovel, payload);
        setImoveis(p => p.map(i => i.id === modalImovel ? atualizado : i));
        showToast("Imóvel atualizado!");
      }
      setModalImovel(null);
    } catch { showToast("Erro ao salvar imóvel", "error"); }
  };

  const delImovel = async (id) => {
    if (!confirm("Excluir este imóvel e todos os seus dados?")) return;
    try { await api.deleteImovel(id); setImoveis(p => p.filter(i => i.id !== id)); showToast("Imóvel excluído"); }
    catch { showToast("Erro ao excluir", "error"); }
  };

  // ── Handlers Recebimentos ─────────────────────────────────────────────────
  const saveReceb = async () => {
    if (!formReceb.imovelId || !formReceb.data || !formReceb.valor) return;
    const payload = { ...formReceb, valor: +formReceb.valor, imovelId: +formReceb.imovelId };
    try {
      if (modalReceb === "new") {
        const novo = await api.createRecebimento(payload);
        setRecebimentos(p => [novo, ...p]);
        showToast("Recebimento registrado!");
      } else {
        const atualizado = await api.updateRecebimento(modalReceb, payload);
        setRecebimentos(p => p.map(r => r.id === modalReceb ? atualizado : r));
        showToast("Recebimento atualizado!");
      }
      setModalReceb(null);
    } catch { showToast("Erro ao salvar recebimento", "error"); }
  };

  // ── Handlers Despesas ─────────────────────────────────────────────────────
  const saveDesp = async () => {
    if (!formDesp.imovelId || !formDesp.data || !formDesp.valor) return;
    const payload = { ...formDesp, valor: +formDesp.valor, imovelId: +formDesp.imovelId };
    try {
      if (modalDesp === "new") {
        const novo = await api.createDespesa(payload);
        setDespesas(p => [novo, ...p]);
        showToast("Despesa registrada!");
      } else {
        const atualizado = await api.updateDespesa(modalDesp, payload);
        setDespesas(p => p.map(d => d.id === modalDesp ? atualizado : d));
        showToast("Despesa atualizada!");
      }
      setModalDesp(null);
    } catch { showToast("Erro ao salvar despesa", "error"); }
  };

  const delDesp = async (id) => {
    try { await api.deleteDespesa(id); setDespesas(p => p.filter(d => d.id !== id)); showToast("Despesa excluída"); }
    catch { showToast("Erro ao excluir", "error"); }
  };

  // ── Handlers Repasses ─────────────────────────────────────────────────────
  const calcRepasse = (imovelId) => {
    const im = imoveis.find(i => i.id === +imovelId);
    if (!im) return null;
    const taxa = (Number(im.aluguel) * Number(im.taxaAdm)) / 100;
    return { valorBruto: Number(im.aluguel), taxaAdm: taxa, valorLiquido: Number(im.aluguel) - taxa };
  };

  const saveRepasse = async () => {
    if (!formRepasse.imovelId || !formRepasse.mes || !formRepasse.data) return;
    const calc = calcRepasse(formRepasse.imovelId);
    if (!calc) return;
    try {
      const novo = await api.createRepasse({ ...formRepasse, imovelId: +formRepasse.imovelId, ...calc });
      setRepasses(p => [novo, ...p]);
      showToast("Repasse registrado!");
      setModalRepasse(null);
    } catch { showToast("Erro ao salvar repasse", "error"); }
  };

  const imovelNome = (id) => imoveis.find(i => i.id === +id)?.codigo || "—";
  const locadoresUnicos = [...new Set(imoveis.map(i => i.locador))].sort();

  // ── Relatório ─────────────────────────────────────────────────────────────
  const dadosRelatorio = useMemo(() => {
    if (!relLocador) return null;
    const imoveisLocador = imoveis.filter(i => i.locador === relLocador);
    const filtrar = (data) => {
      if (!relMesInicio && !relMesFim) return true;
      if (!data) return false;
      const d = (data + "").slice(0, 7);
      if (relMesInicio && d < relMesInicio) return false;
      if (relMesFim && d > relMesFim) return false;
      return true;
    };
    return imoveisLocador.map(im => {
      const recebsImovel = recebimentos.filter(r => r.imovelId === im.id && filtrar(r.data));
      const despesasImovel = despesas.filter(d => d.imovelId === im.id && filtrar(d.data));
      const repassesImovel = repasses.filter(r => r.imovelId === im.id && filtrar(r.data));
      return {
        im, recebsImovel, despesasImovel, repassesImovel,
        totalRecebido: recebsImovel.filter(r => r.status === "Pago").reduce((s, r) => s + Number(r.valor), 0),
        totalDespesas: despesasImovel.reduce((s, d) => s + Number(d.valor), 0),
        totalTaxaAdm: repassesImovel.reduce((s, r) => s + Number(r.taxaAdm), 0),
        totalRepassado: repassesImovel.reduce((s, r) => s + Number(r.valorLiquido), 0),
      };
    });
  }, [relLocador, relMesInicio, relMesFim, imoveis, recebimentos, despesas, repasses]);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>Relatório Financeiro — ${relLocador}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap');
      *{box-sizing:border-box;margin:0;padding:0} body{font-family:'DM Sans',sans-serif;color:#1a202c;background:#fff;padding:32px}
      h1{font-size:22px;font-weight:800} p{color:#64748b;font-size:13px;margin-top:4px}
      .header{border-bottom:3px solid #6366f1;padding-bottom:20px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:flex-end}
      .block{margin-bottom:28px;page-break-inside:avoid} .block-title{font-size:15px;font-weight:700;margin-bottom:2px}
      .block-sub{font-size:12px;color:#64748b;margin-bottom:12px}
      .section-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
      .green{color:#16a34a} .amber{color:#d97706} .purple{color:#7c3aed}
      table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:13px}
      th{background:#f1f5f9;padding:7px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700}
      td{padding:8px 10px;border-bottom:1px solid #e2e8f0}
      .mono{font-family:'DM Mono',monospace}
      .summary{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-top:8px}
      .srow{display:flex;justify-content:space-between;padding:5px 0;font-size:13px}
      .srow.total{border-top:2px solid #6366f1;margin-top:8px;padding-top:10px;font-size:16px;font-weight:800;color:#6366f1}
      .consolidado{background:#1e293b;color:#fff;border-radius:10px;padding:20px;margin-top:28px}
      .consolidado h3{font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
      .crow{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #334155;font-size:13px}
      .cfinal{font-size:20px;font-weight:800;color:#4ade80;border-top:2px solid #4ade80;border-bottom:none;margin-top:8px;padding-top:12px}
      .footer{margin-top:32px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;display:flex;justify-content:space-between}
    </style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  // ── Estilos ───────────────────────────────────────────────────────────────
  const s = {
    app: { minHeight: "100vh", background: "#0a0e1a", fontFamily: "'DM Sans', sans-serif", color: "#e2e8f0" },
    sidebar: { position: "fixed", top: 0, left: 0, bottom: 0, width: 220, background: "#0f1623", borderRight: "1px solid #1e2940", display: "flex", flexDirection: "column", padding: "24px 0", zIndex: 100 },
    main: { marginLeft: 220, padding: 28, minHeight: "100vh" },
    card: { background: "#131929", border: "1px solid #1e2940", borderRadius: 14, padding: 20, marginBottom: 16 },
    btn: (c = "#6366f1") => ({ background: c, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit" }),
    btnGhost: { background: "transparent", color: "#94a3b8", border: "1px solid #2d3748", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontWeight: 500, fontSize: 13, fontFamily: "inherit" },
    th: { textAlign: "left", padding: "10px 14px", color: "#64748b", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 },
    td: { padding: "12px 14px", fontSize: 14, borderTop: "1px solid #1e2940", color: "#cbd5e1" },
    statCard: { background: "#131929", border: "1px solid #1e2940", borderRadius: 14, padding: "20px 24px", flex: 1 },
  };

  const navItems = [
    { id: "dashboard", icon: "◈", label: "Dashboard" },
    { id: "imoveis", icon: "⌂", label: "Imóveis" },
    { id: "recebimentos", icon: "↓", label: "Recebimentos" },
    { id: "despesas", icon: "↑", label: "Despesas" },
    { id: "repasses", icon: "⇌", label: "Repasses" },
    { id: "relatorio", icon: "≡", label: "Relatório" },
    ...(isAdmin ? [{ id: "usuarios", icon: "◎", label: "Usuários" }] : []),
  ];

  if (loading) return (
    <div style={{ ...s.app, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 40, height: 40, border: "3px solid #6366f1", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <span style={{ color: "#64748b" }}>Carregando dados...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={s.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box} ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:#0a0e1a}
        ::-webkit-scrollbar-thumb{background:#2d3748;border-radius:3px}
        table{width:100%;border-collapse:collapse} input,select,textarea{font-family:'DM Sans',sans-serif}
        select option{background:#1a1f2e} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* SIDEBAR */}
      <div style={s.sidebar}>
        <div style={{ padding: "0 20px 24px", borderBottom: "1px solid #1e2940" }}>
          <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>Imobiliária</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#e2e8f0", marginTop: 2 }}>Gestão de Aluguel</div>
        </div>
        <nav style={{ marginTop: 16 }}>
          {navItems.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 20px",
              background: tab === n.id ? "#6366f120" : "none", border: "none",
              borderLeft: `3px solid ${tab === n.id ? "#6366f1" : "transparent"}`,
              color: tab === n.id ? "#818cf8" : "#64748b", cursor: "pointer",
              fontFamily: "inherit", fontWeight: 600, fontSize: 14, textAlign: "left",
            }}><span style={{ fontSize: 16 }}>{n.icon}</span>{n.label}</button>
          ))}
        </nav>
        <div style={{ marginTop: "auto", padding: "16px 20px", borderTop: "1px solid #1e2940" }}>
          <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 500, marginBottom: 2 }}>{user?.nome}</div>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 10 }}>
            {isAdmin ? "Administrador" : "Usuário"} · {imoveis.filter(i => i.status === "Ativo").length} imóveis
          </div>
          <button
            onClick={() => { localStorage.removeItem("token"); localStorage.removeItem("user"); setUser(null); }}
            style={{ ...s.btnGhost, fontSize: 12, padding: "5px 12px", color: "#ef4444", borderColor: "#ef444430", width: "100%" }}
          >Sair</button>
        </div>
      </div>

      {/* MAIN */}
      <div style={s.main}>

        {/* ── DASHBOARD ── */}
        {tab === "dashboard" && (
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 24, marginBottom: 6 }}>Dashboard</h2>
            <p style={{ color: "#475569", marginBottom: 24, fontSize: 14 }}>Visão geral da carteira de aluguéis</p>
            <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
              {[
                { label: "Carteira Mensal", value: fmt(totalAluguel), color: "#6366f1", icon: "⌂" },
                { label: "Recebido (total)", value: fmt(recebMes), color: "#22c55e", icon: "↓" },
                { label: "Despesas", value: fmt(despTotal), color: "#f59e0b", icon: "↑" },
                { label: "Repasses", value: fmt(repasseTotal), color: "#06b6d4", icon: "⇌" },
                { label: "Pendentes", value: `${pendentes} boleto${pendentes !== 1 ? "s" : ""}`, color: "#ef4444", icon: "!" },
              ].map(m => (
                <div key={m.label} style={{ ...s.statCard, minWidth: 150 }}>
                  <div style={{ color: m.color, fontSize: 22, marginBottom: 6 }}>{m.icon}</div>
                  <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 700 }}>{m.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={s.card}>
                <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Imóveis</h3>
                <table><thead><tr><th style={s.th}>Código</th><th style={s.th}>Locatário</th><th style={s.th}>Aluguel</th><th style={s.th}>Status</th></tr></thead>
                  <tbody>{imoveis.map(im => <tr key={im.id}>
                    <td style={s.td}><span style={{ fontFamily: "'DM Mono', monospace", color: "#818cf8" }}>{im.codigo}</span></td>
                    <td style={s.td}>{im.locatario}</td>
                    <td style={s.td}>{fmt(im.aluguel)}</td>
                    <td style={s.td}><Badge label={im.status} /></td>
                  </tr>)}</tbody>
                </table>
              </div>
              <div style={s.card}>
                <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Últimos Recebimentos</h3>
                <table><thead><tr><th style={s.th}>Imóvel</th><th style={s.th}>Data</th><th style={s.th}>Valor</th><th style={s.th}>Status</th></tr></thead>
                  <tbody>{recebimentos.slice(0, 6).map(r => <tr key={r.id}>
                    <td style={s.td}><span style={{ fontFamily: "'DM Mono', monospace", color: "#818cf8" }}>{imovelNome(r.imovelId)}</span></td>
                    <td style={s.td}>{fmtDate(r.data)}</td>
                    <td style={s.td}>{fmt(r.valor)}</td>
                    <td style={s.td}><Badge label={r.status} /></td>
                  </tr>)}</tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── IMÓVEIS ── */}
        {tab === "imoveis" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div><h2 style={{ fontWeight: 800, fontSize: 24, margin: 0 }}>Imóveis</h2><p style={{ color: "#475569", fontSize: 14, marginTop: 4 }}>Carteira de imóveis locados</p></div>
              <button style={s.btn()} onClick={() => { setFormImovel(emptyImovel); setModalImovel("new"); }}>+ Novo Imóvel</button>
            </div>
            <div style={s.card}>
              <table><thead><tr>
                <th style={s.th}>Código</th><th style={s.th}>Endereço</th><th style={s.th}>Tipo</th>
                <th style={s.th}>Locatário</th><th style={s.th}>Locador</th>
                <th style={s.th}>Aluguel</th><th style={s.th}>Venc.</th><th style={s.th}>Status</th><th style={s.th}></th>
              </tr></thead>
                <tbody>{imoveis.map(im => <tr key={im.id}>
                  <td style={s.td}><span style={{ fontFamily: "'DM Mono', monospace", color: "#818cf8", fontWeight: 600 }}>{im.codigo}</span></td>
                  <td style={{ ...s.td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{im.endereco}</td>
                  <td style={s.td}>{im.tipo}</td>
                  <td style={s.td}>{im.locatario}</td>
                  <td style={s.td}>{im.locador}</td>
                  <td style={{ ...s.td, fontFamily: "'DM Mono', monospace" }}>{fmt(im.aluguel)}</td>
                  <td style={s.td}>Dia {im.vencimento}</td>
                  <td style={s.td}><Badge label={im.status} /></td>
                  <td style={s.td}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={s.btnGhost} onClick={() => setDetalheImovel(im)}>Ver</button>
                      <button style={s.btnGhost} onClick={() => { setFormImovel({ ...im, aluguel: String(im.aluguel), vencimento: String(im.vencimento), taxaAdm: String(im.taxaAdm) }); setModalImovel(im.id); }}>✎</button>
                      <button style={{ ...s.btnGhost, color: "#ef4444", borderColor: "#ef444440" }} onClick={() => delImovel(im.id)}>✕</button>
                    </div>
                  </td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── RECEBIMENTOS ── */}
        {tab === "recebimentos" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div><h2 style={{ fontWeight: 800, fontSize: 24, margin: 0 }}>Recebimentos</h2><p style={{ color: "#475569", fontSize: 14, marginTop: 4 }}>Controle de aluguéis recebidos</p></div>
              <button style={s.btn("#22c55e")} onClick={() => { setFormReceb(emptyReceb); setModalReceb("new"); }}>+ Registrar</button>
            </div>
            <div style={s.card}>
              <table><thead><tr>
                <th style={s.th}>Imóvel</th><th style={s.th}>Data</th><th style={s.th}>Tipo</th><th style={s.th}>Valor</th><th style={s.th}>Status</th><th style={s.th}>Obs</th><th style={s.th}></th>
              </tr></thead>
                <tbody>{recebimentos.map(r => <tr key={r.id}>
                  <td style={s.td}><span style={{ fontFamily: "'DM Mono', monospace", color: "#818cf8" }}>{imovelNome(r.imovelId)}</span></td>
                  <td style={s.td}>{fmtDate(r.data)}</td>
                  <td style={s.td}>{r.tipo}</td>
                  <td style={{ ...s.td, fontFamily: "'DM Mono', monospace" }}>{fmt(r.valor)}</td>
                  <td style={s.td}><Badge label={r.status} /></td>
                  <td style={{ ...s.td, color: "#64748b" }}>{r.obs || "—"}</td>
                  <td style={s.td}><button style={s.btnGhost} onClick={() => { setFormReceb({ ...r, imovelId: String(r.imovelId) }); setModalReceb(r.id); }}>✎</button></td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── DESPESAS ── */}
        {tab === "despesas" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div><h2 style={{ fontWeight: 800, fontSize: 24, margin: 0 }}>Despesas</h2><p style={{ color: "#475569", fontSize: 14, marginTop: 4 }}>Custos e manutenções dos imóveis</p></div>
              <button style={s.btn("#f59e0b")} onClick={() => { setFormDesp(emptyDesp); setModalDesp("new"); }}>+ Registrar</button>
            </div>
            <div style={s.card}>
              <table><thead><tr>
                <th style={s.th}>Imóvel</th><th style={s.th}>Data</th><th style={s.th}>Tipo</th><th style={s.th}>Descrição</th><th style={s.th}>Valor</th><th style={s.th}>Status</th><th style={s.th}></th>
              </tr></thead>
                <tbody>{despesas.map(d => <tr key={d.id}>
                  <td style={s.td}><span style={{ fontFamily: "'DM Mono', monospace", color: "#818cf8" }}>{imovelNome(d.imovelId)}</span></td>
                  <td style={s.td}>{fmtDate(d.data)}</td>
                  <td style={s.td}>{d.tipo}</td>
                  <td style={s.td}>{d.descricao}</td>
                  <td style={{ ...s.td, fontFamily: "'DM Mono', monospace", color: "#f59e0b" }}>{fmt(d.valor)}</td>
                  <td style={s.td}><Badge label={d.status} /></td>
                  <td style={s.td}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={s.btnGhost} onClick={() => { setFormDesp({ ...d, imovelId: String(d.imovelId) }); setModalDesp(d.id); }}>✎</button>
                      <button style={{ ...s.btnGhost, color: "#ef4444", borderColor: "#ef444440" }} onClick={() => delDesp(d.id)}>✕</button>
                    </div>
                  </td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── REPASSES ── */}
        {tab === "repasses" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div><h2 style={{ fontWeight: 800, fontSize: 24, margin: 0 }}>Repasses</h2><p style={{ color: "#475569", fontSize: 14, marginTop: 4 }}>Repasse líquido aos locadores</p></div>
              <button style={s.btn("#06b6d4")} onClick={() => { setFormRepasse(emptyRepasse); setModalRepasse("new"); }}>+ Gerar Repasse</button>
            </div>
            <div style={s.card}>
              <table><thead><tr>
                <th style={s.th}>Imóvel</th><th style={s.th}>Mês</th><th style={s.th}>Data</th><th style={s.th}>Bruto</th><th style={s.th}>Taxa Adm</th><th style={s.th}>Líquido</th><th style={s.th}>Status</th>
              </tr></thead>
                <tbody>{repasses.map(r => <tr key={r.id}>
                  <td style={s.td}><span style={{ fontFamily: "'DM Mono', monospace", color: "#818cf8" }}>{imovelNome(r.imovelId)}</span></td>
                  <td style={s.td}>{r.mes}</td>
                  <td style={s.td}>{fmtDate(r.data)}</td>
                  <td style={{ ...s.td, fontFamily: "'DM Mono', monospace" }}>{fmt(r.valorBruto)}</td>
                  <td style={{ ...s.td, fontFamily: "'DM Mono', monospace", color: "#f59e0b" }}>{fmt(r.taxaAdm)}</td>
                  <td style={{ ...s.td, fontFamily: "'DM Mono', monospace", color: "#22c55e", fontWeight: 700 }}>{fmt(r.valorLiquido)}</td>
                  <td style={s.td}><Badge label={r.status} /></td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── RELATÓRIO ── */}
        {tab === "relatorio" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div><h2 style={{ fontWeight: 800, fontSize: 24, margin: 0 }}>Relatório Financeiro</h2><p style={{ color: "#475569", fontSize: 14, marginTop: 4 }}>Demonstrativo por locador</p></div>
              {relGerado && dadosRelatorio?.length > 0 && <button style={s.btn()} onClick={handlePrint}>⎙ Imprimir / PDF</button>}
            </div>
            <div style={{ ...s.card, display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 2, minWidth: 180 }}>
                <label style={labelStyle}>Locador *</label>
                <select style={inputStyle} value={relLocador} onChange={e => { setRelLocador(e.target.value); setRelGerado(false); }}>
                  <option value="">Selecione o locador...</option>
                  {locadoresUnicos.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={labelStyle}>De</label>
                <input style={inputStyle} type="month" value={relMesInicio} onChange={e => { setRelMesInicio(e.target.value); setRelGerado(false); }} />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={labelStyle}>Até</label>
                <input style={inputStyle} type="month" value={relMesFim} onChange={e => { setRelMesFim(e.target.value); setRelGerado(false); }} />
              </div>
              <button style={{ ...s.btn(), opacity: relLocador ? 1 : 0.4 }} disabled={!relLocador} onClick={() => setRelGerado(true)}>Gerar</button>
            </div>

            {relGerado && dadosRelatorio && (
              dadosRelatorio.length === 0
                ? <div style={{ ...s.card, textAlign: "center", color: "#64748b", padding: 40 }}>Nenhum dado encontrado para este locador no período.</div>
                : <div ref={printRef}>
                  {/* Header imprimível */}
                  <div className="header" style={{ background: "#131929", border: "1px solid #1e2940", borderRadius: 14, padding: "20px 24px", marginBottom: 20, borderLeft: "4px solid #6366f1" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Relatório Financeiro ao Locador</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#e2e8f0" }}>{relLocador}</div>
                        <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                          {relMesInicio || relMesFim ? `Período: ${relMesInicio || "início"} até ${relMesFim || "fim"}` : "Período: todos os registros"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "#475569" }}>Emitido em</div>
                        <div style={{ fontFamily: "'DM Mono', monospace", color: "#94a3b8" }}>{new Date().toLocaleDateString("pt-BR")}</div>
                      </div>
                    </div>
                  </div>

                  {dadosRelatorio.map(({ im, recebsImovel, despesasImovel, repassesImovel, totalRecebido, totalDespesas, totalTaxaAdm, totalRepassado }) => (
                    <div key={im.id} style={{ ...s.card, marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", color: "#818cf8", background: "#6366f115", border: "1px solid #6366f133", borderRadius: 20, padding: "2px 12px", fontSize: 13, fontWeight: 700 }}>{im.codigo}</span>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{im.endereco}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
                        Locatário: <strong style={{ color: "#94a3b8" }}>{im.locatario}</strong> · Aluguel: <strong style={{ color: "#94a3b8" }}>{fmt(im.aluguel)}</strong> · Taxa adm: <strong style={{ color: "#94a3b8" }}>{im.taxaAdm}%</strong>
                      </div>

                      {[
                        { label: "↓ Recebimentos", color: "#22c55e", rows: recebsImovel, cols: ["Data", "Tipo", "Valor", "Status", "Obs"], render: r => [fmtDate(r.data), r.tipo, <span style={{ fontFamily: "'DM Mono', monospace", color: "#22c55e" }}>{fmt(r.valor)}</span>, <Badge label={r.status} />, r.obs || "—"] },
                        { label: "↑ Despesas", color: "#f59e0b", rows: despesasImovel, cols: ["Data", "Tipo", "Descrição", "Valor", "Status"], render: d => [fmtDate(d.data), d.tipo, d.descricao, <span style={{ fontFamily: "'DM Mono', monospace", color: "#f59e0b" }}>{fmt(d.valor)}</span>, <Badge label={d.status} />] },
                        { label: "⇌ Repasses", color: "#6366f1", rows: repassesImovel, cols: ["Mês", "Data", "Bruto", "Taxa Adm", "Líquido", "Status"], render: r => [r.mes, fmtDate(r.data), <span style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(r.valorBruto)}</span>, <span style={{ fontFamily: "'DM Mono', monospace", color: "#f59e0b" }}>- {fmt(r.taxaAdm)}</span>, <span style={{ fontFamily: "'DM Mono', monospace", color: "#22c55e", fontWeight: 700 }}>{fmt(r.valorLiquido)}</span>, <Badge label={r.status} />] },
                      ].map(sec => (
                        <div key={sec.label} style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: sec.color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{sec.label}</div>
                          {sec.rows.length === 0
                            ? <div style={{ color: "#475569", fontSize: 13 }}>Nenhum registro no período</div>
                            : <table><thead><tr>{sec.cols.map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
                              <tbody>{sec.rows.map((row, i) => <tr key={i}>{sec.render(row).map((cell, j) => <td key={j} style={s.td}>{cell}</td>)}</tr>)}</tbody>
                            </table>}
                        </div>
                      ))}

                      <div style={{ background: "#0f1623", borderRadius: 10, padding: 16, border: "1px solid #2d3748" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Resumo — {im.codigo}</div>
                        {[["Total recebido", fmt(totalRecebido), "#22c55e"], ["Total despesas", fmt(totalDespesas), "#f59e0b"], ["Taxa administração", fmt(totalTaxaAdm), "#f59e0b"], ["Total repassado", fmt(totalRepassado), "#818cf8"]].map(([k, v, c]) => (
                          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1e2940" }}>
                            <span style={{ color: "#94a3b8", fontSize: 13 }}>{k}</span>
                            <span style={{ fontFamily: "'DM Mono', monospace", color: c, fontWeight: 600, fontSize: 14 }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {dadosRelatorio.length > 1 && (() => {
                    const gr = dadosRelatorio.reduce((a, d) => ({ recebido: a.recebido + d.totalRecebido, despesas: a.despesas + d.totalDespesas, taxaAdm: a.taxaAdm + d.totalTaxaAdm, repassado: a.repassado + d.totalRepassado }), { recebido: 0, despesas: 0, taxaAdm: 0, repassado: 0 });
                    return (
                      <div style={{ background: "#1e1b4b", border: "1px solid #4338ca44", borderRadius: 14, padding: "20px 24px", marginTop: 8 }}>
                        <div style={{ fontSize: 12, color: "#818cf8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, marginBottom: 14 }}>Consolidado Total — {relLocador}</div>
                        {[["Total recebido", fmt(gr.recebido), "#22c55e"], ["Total despesas", fmt(gr.despesas), "#f59e0b"], ["Total taxa administração", fmt(gr.taxaAdm), "#f59e0b"]].map(([k, v, c]) => (
                          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #312e81" }}>
                            <span style={{ color: "#94a3b8", fontSize: 13 }}>{k}</span>
                            <span style={{ fontFamily: "'DM Mono', monospace", color: c, fontWeight: 600 }}>{v}</span>
                          </div>
                        ))}
                        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 14, marginTop: 6, borderTop: "2px solid #6366f1" }}>
                          <span style={{ fontWeight: 800, fontSize: 16 }}>Total repassado ao locador</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", color: "#4ade80", fontWeight: 800, fontSize: 22 }}>{fmt(gr.repassado)}</span>
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ marginTop: 24, fontSize: 11, color: "#475569", borderTop: "1px solid #1e2940", paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
                    <span>Relatório gerado em {new Date().toLocaleString("pt-BR")}</span>
                    <span>Sistema de Gestão de Aluguel</span>
                  </div>
                </div>
            )}
          </div>
        )}

        {/* ── USUÁRIOS ── */}
        {tab === "usuarios" && isAdmin && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div><h2 style={{ fontWeight: 800, fontSize: 24, margin: 0 }}>Usuários</h2><p style={{ color: "#475569", fontSize: 14, marginTop: 4 }}>Gerenciar acesso ao sistema</p></div>
            </div>
            <div style={s.card}>
              <table><thead><tr>
                <th style={s.th}>Nome</th><th style={s.th}>Email</th><th style={s.th}>Perfil</th><th style={s.th}>Status</th><th style={s.th}>Cadastro</th><th style={s.th}></th>
              </tr></thead>
                <tbody>{usuarios.map(u => (
                  <tr key={u.id}>
                    <td style={s.td}>{u.nome}</td>
                    <td style={{ ...s.td, color: "#64748b" }}>{u.email}</td>
                    <td style={s.td}>
                      <span style={{
                        background: u.role === "admin" ? "#6366f120" : "#1e2940",
                        color: u.role === "admin" ? "#818cf8" : "#64748b",
                        border: `1px solid ${u.role === "admin" ? "#6366f140" : "#2d3748"}`,
                        padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                      }}>{u.role === "admin" ? "Admin" : "Usuário"}</span>
                    </td>
                    <td style={s.td}><Badge label={u.ativo ? "Ativo" : "Inativo"} /></td>
                    <td style={{ ...s.td, color: "#64748b", fontSize: 13 }}>{fmtDate(u.createdAt)}</td>
                    <td style={s.td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {u.id !== user.id ? (
                          <>
                            <button style={s.btnGhost} onClick={async () => {
                              try {
                                const updated = await api.updateUsuario(u.id, { nome: u.nome, role: u.role === "admin" ? "usuario" : "admin", ativo: u.ativo });
                                setUsuarios(p => p.map(x => x.id === u.id ? updated : x));
                                showToast("Perfil alterado!");
                              } catch (e) { showToast(e.message, "error"); }
                            }}>{u.role === "admin" ? "→ Usuário" : "→ Admin"}</button>
                            <button style={s.btnGhost} onClick={async () => {
                              try {
                                const updated = await api.updateUsuario(u.id, { nome: u.nome, role: u.role, ativo: !u.ativo });
                                setUsuarios(p => p.map(x => x.id === u.id ? updated : x));
                                showToast(u.ativo ? "Usuário desativado" : "Usuário ativado");
                              } catch (e) { showToast(e.message, "error"); }
                            }}>{u.ativo ? "Desativar" : "Ativar"}</button>
                            <button style={{ ...s.btnGhost, color: "#ef4444", borderColor: "#ef444440" }} onClick={async () => {
                              if (!confirm(`Excluir ${u.nome}?`)) return;
                              try {
                                await api.deleteUsuario(u.id);
                                setUsuarios(p => p.filter(x => x.id !== u.id));
                                showToast("Usuário excluído");
                              } catch (e) { showToast(e.message, "error"); }
                            }}>✕</button>
                          </>
                        ) : <span style={{ fontSize: 12, color: "#475569" }}>Você</span>}
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
              {usuarios.length === 0 && <div style={{ textAlign: "center", color: "#475569", padding: "32px 0", fontSize: 14 }}>Nenhum usuário cadastrado ainda.</div>}
            </div>
          </div>
        )}

      </div>

      {/* ── MODAIS ── */}

      {modalImovel && (
        <Modal title={modalImovel === "new" ? "Novo Imóvel" : "Editar Imóvel"} onClose={() => setModalImovel(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="Código *"><input style={inputStyle} value={formImovel.codigo} onChange={e => setFormImovel(p => ({ ...p, codigo: e.target.value }))} placeholder="AP-001" /></Field>
            <Field label="Tipo"><select style={inputStyle} value={formImovel.tipo} onChange={e => setFormImovel(p => ({ ...p, tipo: e.target.value }))}>{["Apartamento","Casa","Comercial","Sala","Galpão"].map(t => <option key={t}>{t}</option>)}</select></Field>
          </div>
          <Field label="Endereço *"><input style={inputStyle} value={formImovel.endereco} onChange={e => setFormImovel(p => ({ ...p, endereco: e.target.value }))} /></Field>
          <Field label="Bairro"><input style={inputStyle} value={formImovel.bairro} onChange={e => setFormImovel(p => ({ ...p, bairro: e.target.value }))} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="Locatário *"><input style={inputStyle} value={formImovel.locatario} onChange={e => setFormImovel(p => ({ ...p, locatario: e.target.value }))} /></Field>
            <Field label="Tel. Locatário"><input style={inputStyle} value={formImovel.telefoneLocatario} onChange={e => setFormImovel(p => ({ ...p, telefoneLocatario: e.target.value }))} /></Field>
            <Field label="Locador *"><input style={inputStyle} value={formImovel.locador} onChange={e => setFormImovel(p => ({ ...p, locador: e.target.value }))} /></Field>
            <Field label="Tel. Locador"><input style={inputStyle} value={formImovel.telefoneLocador} onChange={e => setFormImovel(p => ({ ...p, telefoneLocador: e.target.value }))} /></Field>
            <Field label="Aluguel (R$) *"><input style={inputStyle} type="number" value={formImovel.aluguel} onChange={e => setFormImovel(p => ({ ...p, aluguel: e.target.value }))} /></Field>
            <Field label="Dia Vencimento *"><input style={inputStyle} type="number" min="1" max="31" value={formImovel.vencimento} onChange={e => setFormImovel(p => ({ ...p, vencimento: e.target.value }))} /></Field>
            <Field label="Taxa Adm (%)"><input style={inputStyle} type="number" value={formImovel.taxaAdm} onChange={e => setFormImovel(p => ({ ...p, taxaAdm: e.target.value }))} /></Field>
            <Field label="Início Contrato"><input style={inputStyle} type="date" value={formImovel.inicio} onChange={e => setFormImovel(p => ({ ...p, inicio: e.target.value }))} /></Field>
            <Field label="Status"><select style={inputStyle} value={formImovel.status} onChange={e => setFormImovel(p => ({ ...p, status: e.target.value }))}>{["Ativo","Inativo"].map(t => <option key={t}>{t}</option>)}</select></Field>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={s.btnGhost} onClick={() => setModalImovel(null)}>Cancelar</button>
            <button style={s.btn()} onClick={saveImovel}>Salvar</button>
          </div>
        </Modal>
      )}

      {modalReceb && (
        <Modal title={modalReceb === "new" ? "Registrar Recebimento" : "Editar Recebimento"} onClose={() => setModalReceb(null)}>
          <Field label="Imóvel *"><select style={inputStyle} value={formReceb.imovelId} onChange={e => setFormReceb(p => ({ ...p, imovelId: e.target.value }))}><option value="">Selecione...</option>{imoveis.map(im => <option key={im.id} value={im.id}>{im.codigo} — {im.locatario}</option>)}</select></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="Data *"><input style={inputStyle} type="date" value={formReceb.data} onChange={e => setFormReceb(p => ({ ...p, data: e.target.value }))} /></Field>
            <Field label="Valor (R$) *"><input style={inputStyle} type="number" value={formReceb.valor} onChange={e => setFormReceb(p => ({ ...p, valor: e.target.value }))} /></Field>
            <Field label="Tipo"><select style={inputStyle} value={formReceb.tipo} onChange={e => setFormReceb(p => ({ ...p, tipo: e.target.value }))}>{["Aluguel","Condomínio","IPTU","Multa","Outros"].map(t => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Status"><select style={inputStyle} value={formReceb.status} onChange={e => setFormReceb(p => ({ ...p, status: e.target.value }))}>{["Pago","Pendente","Atrasado"].map(t => <option key={t}>{t}</option>)}</select></Field>
          </div>
          <Field label="Observação"><input style={inputStyle} value={formReceb.obs} onChange={e => setFormReceb(p => ({ ...p, obs: e.target.value }))} /></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={s.btnGhost} onClick={() => setModalReceb(null)}>Cancelar</button>
            <button style={s.btn("#22c55e")} onClick={saveReceb}>Salvar</button>
          </div>
        </Modal>
      )}

      {modalDesp && (
        <Modal title={modalDesp === "new" ? "Registrar Despesa" : "Editar Despesa"} onClose={() => setModalDesp(null)}>
          <Field label="Imóvel *"><select style={inputStyle} value={formDesp.imovelId} onChange={e => setFormDesp(p => ({ ...p, imovelId: e.target.value }))}><option value="">Selecione...</option>{imoveis.map(im => <option key={im.id} value={im.id}>{im.codigo} — {im.locatario}</option>)}</select></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="Data *"><input style={inputStyle} type="date" value={formDesp.data} onChange={e => setFormDesp(p => ({ ...p, data: e.target.value }))} /></Field>
            <Field label="Valor (R$) *"><input style={inputStyle} type="number" value={formDesp.valor} onChange={e => setFormDesp(p => ({ ...p, valor: e.target.value }))} /></Field>
            <Field label="Tipo"><select style={inputStyle} value={formDesp.tipo} onChange={e => setFormDesp(p => ({ ...p, tipo: e.target.value }))}>{["Manutenção","Condomínio","IPTU","Seguro","Pintura","Elétrica","Hidráulica","Outros"].map(t => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Status"><select style={inputStyle} value={formDesp.status} onChange={e => setFormDesp(p => ({ ...p, status: e.target.value }))}>{["Pago","Pendente"].map(t => <option key={t}>{t}</option>)}</select></Field>
          </div>
          <Field label="Descrição"><input style={inputStyle} value={formDesp.descricao} onChange={e => setFormDesp(p => ({ ...p, descricao: e.target.value }))} /></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={s.btnGhost} onClick={() => setModalDesp(null)}>Cancelar</button>
            <button style={s.btn("#f59e0b")} onClick={saveDesp}>Salvar</button>
          </div>
        </Modal>
      )}

      {modalRepasse && (
        <Modal title="Gerar Repasse ao Locador" onClose={() => setModalRepasse(null)}>
          <Field label="Imóvel *"><select style={inputStyle} value={formRepasse.imovelId} onChange={e => setFormRepasse(p => ({ ...p, imovelId: e.target.value }))}><option value="">Selecione...</option>{imoveis.map(im => <option key={im.id} value={im.id}>{im.codigo} — {im.locador} ({im.taxaAdm}% adm)</option>)}</select></Field>
          {formRepasse.imovelId && (() => {
            const c = calcRepasse(formRepasse.imovelId);
            return c ? (
              <div style={{ background: "#0f1623", borderRadius: 10, padding: 16, marginBottom: 14, border: "1px solid #2d3748" }}>
                {[["Aluguel bruto", fmt(c.valorBruto), "#e2e8f0"], ["Taxa administração", `- ${fmt(c.taxaAdm)}`, "#f59e0b"]].map(([k, v, c]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ color: "#64748b" }}>{k}</span><span style={{ fontFamily: "'DM Mono', monospace", color: c }}>{v}</span></div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid #2d3748" }}>
                  <span style={{ color: "#22c55e", fontWeight: 700 }}>Valor líquido</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", color: "#22c55e", fontWeight: 700, fontSize: 18 }}>{fmt(c.valorLiquido)}</span>
                </div>
              </div>
            ) : null;
          })()}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="Mês de referência *"><input style={inputStyle} value={formRepasse.mes} onChange={e => setFormRepasse(p => ({ ...p, mes: e.target.value }))} placeholder="Ex: Maio/2025" /></Field>
            <Field label="Data do repasse *"><input style={inputStyle} type="date" value={formRepasse.data} onChange={e => setFormRepasse(p => ({ ...p, data: e.target.value }))} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={s.btnGhost} onClick={() => setModalRepasse(null)}>Cancelar</button>
            <button style={s.btn("#06b6d4")} onClick={saveRepasse}>Confirmar Repasse</button>
          </div>
        </Modal>
      )}

      {detalheImovel && (
        <Modal title={`Imóvel ${detalheImovel.codigo}`} onClose={() => setDetalheImovel(null)}>
          {[["Endereço", detalheImovel.endereco], ["Bairro", detalheImovel.bairro], ["Tipo", detalheImovel.tipo], ["Locatário", detalheImovel.locatario], ["Tel. Locatário", detalheImovel.telefoneLocatario], ["Locador", detalheImovel.locador], ["Tel. Locador", detalheImovel.telefoneLocador], ["Aluguel", fmt(detalheImovel.aluguel)], ["Vencimento", `Dia ${detalheImovel.vencimento}`], ["Taxa Adm", `${detalheImovel.taxaAdm}%`], ["Início Contrato", fmtDate(detalheImovel.inicio)], ["Status", detalheImovel.status]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1e2940" }}>
              <span style={{ color: "#64748b", fontSize: 13 }}>{k}</span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{v || "—"}</span>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
