import { useState, useEffect, useMemo, useRef } from "react";
import { api } from "./api.js";
import Auth from "./Auth.jsx";

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "-";
const statusColors = { Ativo:"#22c55e",Inativo:"#94a3b8",Pago:"#22c55e",Pendente:"#f59e0b",Atrasado:"#ef4444",Repassado:"#6366f1" };
const Badge = ({ label }) => <span style={{ background:(statusColors[label]||"#64748b")+"22", color:statusColors[label]||"#64748b", border:`1px solid ${(statusColors[label]||"#64748b")}44`, padding:"2px 10px", borderRadius:20, fontSize:12, fontWeight:600 }}>{label}</span>;
const pagaOpts = ["Locatário","Locador","ADM"];
const fpOpts = ["Pix","Boleto bancário","Transferência","Todos"];

function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto" }}>
      <div style={{ background:"#1a1f2e",borderRadius:16,padding:28,width:"100%",maxWidth:wide?760:580,maxHeight:"92vh",overflowY:"auto",border:"1px solid #2d3748",boxShadow:"0 25px 60px #000a",margin:"auto" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
          <h3 style={{ color:"#e2e8f0",fontWeight:700,fontSize:18,margin:0 }}>{title}</h3>
          <button onClick={onClose} style={{ background:"none",border:"none",color:"#94a3b8",fontSize:22,cursor:"pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const iStyle = { width:"100%",background:"#0f1623",border:"1px solid #2d3748",borderRadius:8,color:"#e2e8f0",padding:"8px 12px",fontSize:14,boxSizing:"border-box",outline:"none",fontFamily:"inherit" };
const lStyle = { color:"#94a3b8",fontSize:12,fontWeight:600,display:"block",marginBottom:4 };
const Field = ({ label, children, half }) => <div style={{ marginBottom:14,flex:half?"1 1 45%":"1 1 100%" }}><label style={lStyle}>{label}</label>{children}</div>;
const Row = ({ children }) => <div style={{ display:"flex",gap:16,flexWrap:"wrap" }}>{children}</div>;
const SectionTitle = ({ children }) => <div style={{ fontSize:11,fontWeight:700,color:"#6366f1",textTransform:"uppercase",letterSpacing:2,margin:"20px 0 12px",paddingBottom:6,borderBottom:"1px solid #1e2940" }}>{children}</div>;

function PagaField({ label, valorKey, pagaKey, form, setForm }) {
  return (
    <div style={{ marginBottom:14,flex:"1 1 45%" }}>
      <label style={lStyle}>{label}</label>
      <div style={{ display:"flex",gap:6 }}>
        <input style={{ ...iStyle,flex:1 }} type="number" placeholder="R$" value={form[valorKey]||""} onChange={e=>setForm(p=>({...p,[valorKey]:e.target.value}))} />
        <select style={{ ...iStyle,width:130 }} value={form[pagaKey]||"Locatário"} onChange={e=>setForm(p=>({...p,[pagaKey]:e.target.value}))}>
          {pagaOpts.map(o=><option key={o}>{o}</option>)}
        </select>
      </div>
    </div>
  );
}

function Toast({ msg, type }) {
  return <div style={{ position:"fixed",bottom:24,right:24,zIndex:9999,background:type==="error"?"#ef4444":"#22c55e",color:"#fff",padding:"12px 20px",borderRadius:10,fontWeight:600,fontSize:14,boxShadow:"0 8px 24px #0008" }}>{msg}</div>;
}

// Mini bar chart
function BarChart({ data }) {
  if (!data?.length) return <div style={{ color:"#475569",fontSize:13,textAlign:"center",padding:32 }}>Sem dados ainda</div>;
  const max = Math.max(...data.map(d=>+d.recebido), 1);
  return (
    <div style={{ display:"flex",alignItems:"flex-end",gap:8,height:120,padding:"0 4px" }}>
      {data.map(d=>(
        <div key={d.mes} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4 }}>
          <div style={{ fontSize:10,color:"#64748b" }}>{fmt(d.recebido).replace("R$","").trim()}</div>
          <div style={{ width:"100%",background:"#6366f1",borderRadius:"4px 4px 0 0",height:`${(+d.recebido/max)*80}px`,minHeight:4,transition:"height .3s" }} />
          <div style={{ fontSize:10,color:"#475569",whiteSpace:"nowrap" }}>{d.mes?.slice(5)}/{d.mes?.slice(0,4)}</div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem("user")); } catch { return null; } });
  const isAdmin = user?.role === "admin";
  const [imoveis, setImoveis] = useState([]);
  const [recebimentos, setRecebimentos] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [repasses, setRepasses] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const [modalImovel, setModalImovel] = useState(null);
  const [modalReceb, setModalReceb] = useState(null);
  const [modalDesp, setModalDesp] = useState(null);
  const [modalRepasse, setModalRepasse] = useState(null);
  const [detalheImovel, setDetalheImovel] = useState(null);

  const emptyImovel = { codigo:"",endereco:"",bairro:"",tipo:"Apartamento",locatario:"",locador:"",aluguel:"",aluguelPagaPor:"Locatário",condominio:"",condominioPagaPor:"Locatário",iptu:"",iptuPagaPor:"Locatário",vencimento:"",status:"Ativo",inicio:"",duracaoMeses:"",telefoneLocatario:"",telefoneLocador:"",taxaAdm:10,multaRescisao:"",multaAtraso:"",jurosAtraso:"",honorariosPct:"",honorariosDias:"",honorariosAdvPct:"",honorariosAdvDias:"",formaPagamento:"Todos" };
  const [formImovel, setFormImovel] = useState(emptyImovel);
  const [contratoFile, setContratoFile] = useState(null);
  const emptyReceb = { imovelId:"",data:"",valor:"",tipo:"Aluguel",status:"Pago",obs:"" };
  const [formReceb, setFormReceb] = useState(emptyReceb);
  const emptyDesp = { imovelId:"",data:"",valor:"",tipo:"Manutenção",descricao:"",status:"Pago" };
  const [formDesp, setFormDesp] = useState(emptyDesp);
  const emptyRepasse = { imovelId:"",mes:"",data:"",status:"Repassado",formaPagamento:"Pix",valorBruto:"",taxaAdm:"",valorLiquido:"" };
  const [formRepasse, setFormRepasse] = useState(emptyRepasse);
  const [repasseEditado, setRepasseEditado] = useState(false);

  const [relLocador, setRelLocador] = useState("");
  const [relMesInicio, setRelMesInicio] = useState("");
  const [relMesFim, setRelMesFim] = useState("");
  const [relGerado, setRelGerado] = useState(false);
  const printRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const loads = [api.getImoveis(),api.getRecebimentos(),api.getDespesas(),api.getRepasses(),api.getDashboard()];
    if (isAdmin) loads.push(api.getUsuarios());
    Promise.all(loads)
      .then(([im,rec,dep,rep,dash,usu]) => {
        setImoveis(im); setRecebimentos(rec); setDespesas(dep); setRepasses(rep); setDashboard(dash);
        if (usu) setUsuarios(usu);
      })
      .catch(()=>showToast("Erro ao carregar dados","error"))
      .finally(()=>setLoading(false));
  }, [user]);

  if (!user) return <Auth onLogin={()=>window.location.reload()} />;

  const imovelNome = (id) => imoveis.find(i=>i.id===+id)?.codigo||"—";

  // Imóvel handlers
  const saveImovel = async () => {
    if (!formImovel.codigo||!formImovel.endereco||!formImovel.locatario) return showToast("Preencha os campos obrigatórios","error");
    const payload = { ...formImovel, aluguel:+formImovel.aluguel, condominio:+formImovel.condominio||0, iptu:+formImovel.iptu||0, vencimento:+formImovel.vencimento, taxaAdm:+formImovel.taxaAdm, duracaoMeses:+formImovel.duracaoMeses||null, multaRescisao:+formImovel.multaRescisao||0, multaAtraso:+formImovel.multaAtraso||0, jurosAtraso:+formImovel.jurosAtraso||0, honorariosPct:+formImovel.honorariosPct||0, honorariosDias:+formImovel.honorariosDias||0, honorariosAdvPct:+formImovel.honorariosAdvPct||0, honorariosAdvDias:+formImovel.honorariosAdvDias||0 };
    try {
      if (modalImovel==="new") {
        const novo = await api.createImovel(payload);
        if (contratoFile) await api.uploadContrato(novo.id, contratoFile);
        setImoveis(p=>[...p,novo]);
        showToast("Imóvel cadastrado!");
      } else {
        const atualizado = await api.updateImovel(modalImovel, payload);
        if (contratoFile) await api.uploadContrato(modalImovel, contratoFile);
        setImoveis(p=>p.map(i=>i.id===modalImovel?atualizado:i));
        showToast("Imóvel atualizado!");
      }
      setModalImovel(null); setContratoFile(null);
    } catch(e) { showToast(e.message,"error"); }
  };

  const delImovel = async (id) => {
    if (!confirm("Excluir este imóvel?")) return;
    try { await api.deleteImovel(id); setImoveis(p=>p.filter(i=>i.id!==id)); showToast("Excluído"); }
    catch(e) { showToast(e.message,"error"); }
  };

  // Recebimento handlers
  const saveReceb = async () => {
    if (!formReceb.imovelId||!formReceb.data||!formReceb.valor) return;
    const payload = {...formReceb,valor:+formReceb.valor,imovelId:+formReceb.imovelId};
    try {
      if (modalReceb==="new") { const n=await api.createRecebimento(payload); setRecebimentos(p=>[n,...p]); showToast("Recebimento registrado!"); }
      else { const n=await api.updateRecebimento(modalReceb,payload); setRecebimentos(p=>p.map(r=>r.id===modalReceb?n:r)); showToast("Atualizado!"); }
      setModalReceb(null);
    } catch(e) { showToast(e.message,"error"); }
  };

  // Despesa handlers
  const saveDesp = async () => {
    if (!formDesp.imovelId||!formDesp.data||!formDesp.valor) return;
    const payload = {...formDesp,valor:+formDesp.valor,imovelId:+formDesp.imovelId};
    try {
      if (modalDesp==="new") { const n=await api.createDespesa(payload); setDespesas(p=>[n,...p]); showToast("Despesa registrada!"); }
      else { const n=await api.updateDespesa(modalDesp,payload); setDespesas(p=>p.map(d=>d.id===modalDesp?n:d)); showToast("Atualizado!"); }
      setModalDesp(null);
    } catch(e) { showToast(e.message,"error"); }
  };

  const delDesp = async (id) => {
    try { await api.deleteDespesa(id); setDespesas(p=>p.filter(d=>d.id!==id)); showToast("Excluído"); }
    catch(e) { showToast(e.message,"error"); }
  };

  // Repasse handlers
  const calcRepasse = (imovelId) => {
    const im = imoveis.find(i=>i.id===+imovelId);
    if (!im) return null;
    const bruto = Number(im.aluguel);
    const taxa = (bruto * Number(im.taxaAdm)) / 100;
    return { valorBruto:bruto, taxaAdm:taxa, valorLiquido:bruto-taxa };
  };

  const onImovelRepasse = (imovelId) => {
    const c = calcRepasse(imovelId);
    if (c && !repasseEditado) setFormRepasse(p=>({...p,imovelId,valorBruto:c.valorBruto,taxaAdm:c.taxaAdm,valorLiquido:c.valorLiquido}));
    else setFormRepasse(p=>({...p,imovelId}));
  };

  const saveRepasse = async () => {
    if (!formRepasse.imovelId||!formRepasse.mes||!formRepasse.data) return;
    const vb = +formRepasse.valorBruto, ta = +formRepasse.taxaAdm;
    const vl = +formRepasse.valorLiquido || (vb - ta);
    try {
      const novo = await api.createRepasse({...formRepasse,imovelId:+formRepasse.imovelId,valorBruto:vb,taxaAdm:ta,valorLiquido:vl});
      setRepasses(p=>[novo,...p]);
      showToast("Repasse registrado!");
      setModalRepasse(null); setRepasseEditado(false);
    } catch(e) { showToast(e.message,"error"); }
  };

  // Relatório
  const locadoresUnicos = [...new Set(imoveis.map(i=>i.locador))].sort();
  const dadosRelatorio = useMemo(() => {
    if (!relLocador) return null;
    const imoveisLoc = imoveis.filter(i=>i.locador===relLocador);
    const filtrar = (data) => {
      if (!relMesInicio&&!relMesFim) return true;
      const d=(data+"").slice(0,7);
      if (relMesInicio&&d<relMesInicio) return false;
      if (relMesFim&&d>relMesFim) return false;
      return true;
    };
    return imoveisLoc.map(im=>({
      im,
      recebsImovel: recebimentos.filter(r=>r.imovelId===im.id&&filtrar(r.data)),
      despesasImovel: despesas.filter(d=>d.imovelId===im.id&&filtrar(d.data)),
      repassesImovel: repasses.filter(r=>r.imovelId===im.id&&filtrar(r.data)),
    })).map(x=>({...x,
      totalRecebido: x.recebsImovel.filter(r=>r.status==="Pago").reduce((s,r)=>s+Number(r.valor),0),
      totalDespesas: x.despesasImovel.reduce((s,d)=>s+Number(d.valor),0),
      totalTaxaAdm: x.repassesImovel.reduce((s,r)=>s+Number(r.taxaAdm),0),
      totalRepassado: x.repassesImovel.reduce((s,r)=>s+Number(r.valorLiquido),0),
    }));
  },[relLocador,relMesInicio,relMesFim,imoveis,recebimentos,despesas,repasses]);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("","_blank");
    win.document.write(`<html><head><title>Relatório — ${relLocador}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;color:#1a202c;background:#fff;padding:32px}table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px}th{background:#f1f5f9;padding:7px 10px;text-align:left;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase}td{padding:8px 10px;border-bottom:1px solid #e2e8f0}.header{border-bottom:3px solid #6366f1;padding-bottom:20px;margin-bottom:28px}.block{margin-bottom:24px;page-break-inside:avoid}.mono{font-family:monospace}.green{color:#16a34a}.amber{color:#d97706}.purple{color:#7c3aed}</style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(()=>win.print(),500);
  };

  const s = {
    app:{ minHeight:"100vh",background:"#0a0e1a",fontFamily:"'DM Sans',sans-serif",color:"#e2e8f0" },
    sidebar:{ position:"fixed",top:0,left:0,bottom:0,width:220,background:"#0f1623",borderRight:"1px solid #1e2940",display:"flex",flexDirection:"column",padding:"24px 0",zIndex:100 },
    main:{ marginLeft:220,padding:28,minHeight:"100vh" },
    card:{ background:"#131929",border:"1px solid #1e2940",borderRadius:14,padding:20,marginBottom:16 },
    btn:(c="#6366f1")=>({ background:c,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"inherit" }),
    btnGhost:{ background:"transparent",color:"#94a3b8",border:"1px solid #2d3748",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:500,fontSize:13,fontFamily:"inherit" },
    th:{ textAlign:"left",padding:"10px 14px",color:"#64748b",fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1 },
    td:{ padding:"12px 14px",fontSize:14,borderTop:"1px solid #1e2940",color:"#cbd5e1" },
    statCard:{ background:"#131929",border:"1px solid #1e2940",borderRadius:14,padding:"20px 24px",flex:1,minWidth:140 },
  };

  const navItems = [
    {id:"dashboard",icon:"◈",label:"Dashboard"},
    {id:"imoveis",icon:"⌂",label:"Imóveis"},
    {id:"recebimentos",icon:"↓",label:"Recebimentos"},
    {id:"despesas",icon:"↑",label:"Despesas"},
    {id:"repasses",icon:"⇌",label:"Repasses"},
    {id:"relatorio",icon:"≡",label:"Relatório"},
    ...(isAdmin?[{id:"usuarios",icon:"◎",label:"Usuários"}]:[]),
  ];

  if (loading) return (
    <div style={{...s.app,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{width:40,height:40,border:"3px solid #6366f1",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
      <span style={{color:"#64748b"}}>Carregando...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={s.app}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');*{box-sizing:border-box}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#0a0e1a}::-webkit-scrollbar-thumb{background:#2d3748;border-radius:3px}table{width:100%;border-collapse:collapse}input,select,textarea{font-family:'DM Sans',sans-serif}select option{background:#1a1f2e}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media(max-width:768px){.sidebar-hide{display:none!important}.main-full{margin-left:0!important;padding:16px!important}}`}</style>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}

      {/* SIDEBAR */}
      <div style={s.sidebar} className="sidebar-hide">
        <div style={{padding:"0 20px 24px",borderBottom:"1px solid #1e2940"}}>
          <div style={{fontSize:11,color:"#6366f1",fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Imobiliária</div>
          <div style={{fontSize:17,fontWeight:800,color:"#e2e8f0",marginTop:2}}>Gestão de Aluguel</div>
        </div>
        <nav style={{marginTop:16,flex:1}}>
          {navItems.map(n=>(
            <button key={n.id} onClick={()=>setTab(n.id)} style={{ display:"flex",alignItems:"center",gap:10,width:"100%",padding:"11px 20px",background:tab===n.id?"#6366f120":"none",border:"none",borderLeft:`3px solid ${tab===n.id?"#6366f1":"transparent"}`,color:tab===n.id?"#818cf8":"#64748b",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:14,textAlign:"left" }}>
              <span style={{fontSize:16}}>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div style={{padding:"16px 20px",borderTop:"1px solid #1e2940"}}>
          <div style={{fontSize:13,color:"#94a3b8",fontWeight:500,marginBottom:2}}>{user?.nome}</div>
          <div style={{fontSize:11,color:"#475569",marginBottom:10}}>{isAdmin?"Administrador":"Usuário"} · {imoveis.filter(i=>i.status==="Ativo").length} imóveis</div>
          <button onClick={()=>{localStorage.clear();window.location.reload();}} style={{...s.btnGhost,fontSize:12,padding:"5px 12px",color:"#ef4444",borderColor:"#ef444430",width:"100%"}}>Sair</button>
        </div>
      </div>

      {/* MAIN */}
      <div style={s.main} className="main-full">

        {/* DASHBOARD */}
        {tab==="dashboard"&&(
          <div>
            <h2 style={{fontWeight:800,fontSize:24,marginBottom:6}}>Dashboard</h2>
            <p style={{color:"#475569",marginBottom:24,fontSize:14}}>Visão geral da carteira</p>
            <div style={{display:"flex",gap:14,marginBottom:20,flexWrap:"wrap"}}>
              {[
                {label:"Imóveis Ativos",value:dashboard?.imoveisAtivos||imoveis.filter(i=>i.status==="Ativo").length,color:"#6366f1",icon:"⌂",fmt:false},
                {label:"Carteira Mensal",value:dashboard?.carteiraMensal||0,color:"#818cf8",icon:"$",fmt:true},
                {label:"Recebido (mês)",value:dashboard?.recebidoMes||0,color:"#22c55e",icon:"↓",fmt:true},
                {label:"Despesas (mês)",value:dashboard?.despesasMes||0,color:"#f59e0b",icon:"↑",fmt:true},
                {label:"Repassado (mês)",value:dashboard?.repassadoMes||0,color:"#06b6d4",icon:"⇌",fmt:true},
              ].map(m=>(
                <div key={m.label} style={s.statCard}>
                  <div style={{color:m.color,fontSize:22,marginBottom:6}}>{m.icon}</div>
                  <div style={{fontSize:12,color:"#64748b",fontWeight:600,marginBottom:4}}>{m.label}</div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:20,fontWeight:700}}>{m.fmt?fmt(m.value):m.value}</div>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div style={s.card}>
                <h3 style={{margin:"0 0 16px",fontSize:15,fontWeight:700}}>Recebimentos por mês</h3>
                <BarChart data={dashboard?.recPorMes}/>
              </div>
              <div style={s.card}>
                <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:700}}>Últimos recebimentos</h3>
                <table><thead><tr><th style={s.th}>Imóvel</th><th style={s.th}>Data</th><th style={s.th}>Valor</th><th style={s.th}>Status</th></tr></thead>
                  <tbody>{recebimentos.slice(0,6).map(r=><tr key={r.id}><td style={s.td}><span style={{fontFamily:"monospace",color:"#818cf8"}}>{imovelNome(r.imovelId)}</span></td><td style={s.td}>{fmtDate(r.data)}</td><td style={s.td}>{fmt(r.valor)}</td><td style={s.td}><Badge label={r.status}/></td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* IMÓVEIS */}
        {tab==="imoveis"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
              <div><h2 style={{fontWeight:800,fontSize:24,margin:0}}>Imóveis</h2><p style={{color:"#475569",fontSize:14,marginTop:4}}>Carteira de imóveis locados</p></div>
              {isAdmin&&<button style={s.btn()} onClick={()=>{setFormImovel(emptyImovel);setContratoFile(null);setModalImovel("new")}}>+ Novo Imóvel</button>}
            </div>
            <div style={s.card}>
              <table><thead><tr><th style={s.th}>Código</th><th style={s.th}>Endereço</th><th style={s.th}>Locatário</th><th style={s.th}>Locador</th><th style={s.th}>Aluguel</th><th style={s.th}>Venc.</th><th style={s.th}>Fim</th><th style={s.th}>Status</th><th style={s.th}></th></tr></thead>
                <tbody>{imoveis.map(im=><tr key={im.id}>
                  <td style={s.td}><span style={{fontFamily:"monospace",color:"#818cf8",fontWeight:600}}>{im.codigo}</span></td>
                  <td style={{...s.td,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{im.endereco}</td>
                  <td style={s.td}>{im.locatario}</td>
                  <td style={s.td}>{im.locador}</td>
                  <td style={{...s.td,fontFamily:"monospace"}}>{fmt(im.aluguel)}</td>
                  <td style={s.td}>Dia {im.vencimento}</td>
                  <td style={{...s.td,fontSize:12,color:im.fim&&new Date(im.fim)<new Date()?"#ef4444":"#64748b"}}>{fmtDate(im.fim)}</td>
                  <td style={s.td}><Badge label={im.status}/></td>
                  <td style={s.td}>
                    <div style={{display:"flex",gap:6}}>
                      <button style={s.btnGhost} onClick={()=>setDetalheImovel(im)}>Ver</button>
                      {isAdmin&&<><button style={s.btnGhost} onClick={()=>{setFormImovel({...im,aluguel:String(im.aluguel),condominio:String(im.condominio||0),iptu:String(im.iptu||0),vencimento:String(im.vencimento),taxaAdm:String(im.taxaAdm),duracaoMeses:String(im.duracaoMeses||"")});setContratoFile(null);setModalImovel(im.id);}}>✎</button>
                      <button style={{...s.btnGhost,color:"#ef4444",borderColor:"#ef444440"}} onClick={()=>delImovel(im.id)}>✕</button></>}
                    </div>
                  </td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* RECEBIMENTOS */}
        {tab==="recebimentos"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
              <div><h2 style={{fontWeight:800,fontSize:24,margin:0}}>Recebimentos</h2><p style={{color:"#475569",fontSize:14,marginTop:4}}>Controle de aluguéis recebidos</p></div>
              <button style={s.btn("#22c55e")} onClick={()=>{setFormReceb(emptyReceb);setModalReceb("new")}}>+ Registrar</button>
            </div>
            <div style={s.card}>
              <table><thead><tr><th style={s.th}>Imóvel</th><th style={s.th}>Data</th><th style={s.th}>Tipo</th><th style={s.th}>Valor</th><th style={s.th}>Status</th><th style={s.th}>Obs</th><th style={s.th}></th></tr></thead>
                <tbody>{recebimentos.map(r=><tr key={r.id}>
                  <td style={s.td}><span style={{fontFamily:"monospace",color:"#818cf8"}}>{imovelNome(r.imovelId)}</span></td>
                  <td style={s.td}>{fmtDate(r.data)}</td><td style={s.td}>{r.tipo}</td>
                  <td style={{...s.td,fontFamily:"monospace"}}>{fmt(r.valor)}</td>
                  <td style={s.td}><Badge label={r.status}/></td>
                  <td style={{...s.td,color:"#64748b"}}>{r.obs||"—"}</td>
                  <td style={s.td}><button style={s.btnGhost} onClick={()=>{setFormReceb({...r,imovelId:String(r.imovelId)});setModalReceb(r.id);}}>✎</button></td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* DESPESAS */}
        {tab==="despesas"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
              <div><h2 style={{fontWeight:800,fontSize:24,margin:0}}>Despesas</h2><p style={{color:"#475569",fontSize:14,marginTop:4}}>Custos e manutenções</p></div>
              <button style={s.btn("#f59e0b")} onClick={()=>{setFormDesp(emptyDesp);setModalDesp("new")}}>+ Registrar</button>
            </div>
            <div style={s.card}>
              <table><thead><tr><th style={s.th}>Imóvel</th><th style={s.th}>Data</th><th style={s.th}>Tipo</th><th style={s.th}>Descrição</th><th style={s.th}>Valor</th><th style={s.th}>Status</th><th style={s.th}></th></tr></thead>
                <tbody>{despesas.map(d=><tr key={d.id}>
                  <td style={s.td}><span style={{fontFamily:"monospace",color:"#818cf8"}}>{imovelNome(d.imovelId)}</span></td>
                  <td style={s.td}>{fmtDate(d.data)}</td><td style={s.td}>{d.tipo}</td><td style={s.td}>{d.descricao}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:"#f59e0b"}}>{fmt(d.valor)}</td>
                  <td style={s.td}><Badge label={d.status}/></td>
                  <td style={s.td}><div style={{display:"flex",gap:6}}>
                    <button style={s.btnGhost} onClick={()=>{setFormDesp({...d,imovelId:String(d.imovelId)});setModalDesp(d.id);}}>✎</button>
                    {isAdmin&&<button style={{...s.btnGhost,color:"#ef4444",borderColor:"#ef444440"}} onClick={()=>delDesp(d.id)}>✕</button>}
                  </div></td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPASSES */}
        {tab==="repasses"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
              <div><h2 style={{fontWeight:800,fontSize:24,margin:0}}>Repasses</h2><p style={{color:"#475569",fontSize:14,marginTop:4}}>Repasse líquido aos locadores</p></div>
              {isAdmin&&<button style={s.btn("#06b6d4")} onClick={()=>{setFormRepasse(emptyRepasse);setRepasseEditado(false);setModalRepasse("new")}}>+ Gerar Repasse</button>}
            </div>
            <div style={s.card}>
              <table><thead><tr><th style={s.th}>Imóvel</th><th style={s.th}>Mês</th><th style={s.th}>Data</th><th style={s.th}>Bruto</th><th style={s.th}>Taxa</th><th style={s.th}>Líquido</th><th style={s.th}>Pagamento</th><th style={s.th}>Status</th></tr></thead>
                <tbody>{repasses.map(r=><tr key={r.id}>
                  <td style={s.td}><span style={{fontFamily:"monospace",color:"#818cf8"}}>{imovelNome(r.imovelId)}</span></td>
                  <td style={s.td}>{r.mes}</td><td style={s.td}>{fmtDate(r.data)}</td>
                  <td style={{...s.td,fontFamily:"monospace"}}>{fmt(r.valorBruto)}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:"#f59e0b"}}>{fmt(r.taxaAdm)}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:"#22c55e",fontWeight:700}}>{fmt(r.valorLiquido)}</td>
                  <td style={s.td}>{r.formaPagamento||"—"}</td>
                  <td style={s.td}><Badge label={r.status}/></td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* RELATÓRIO */}
        {tab==="relatorio"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
              <div><h2 style={{fontWeight:800,fontSize:24,margin:0}}>Relatório Financeiro</h2><p style={{color:"#475569",fontSize:14,marginTop:4}}>Demonstrativo por locador</p></div>
              {relGerado&&dadosRelatorio?.length>0&&<button style={s.btn()} onClick={handlePrint}>⎙ Imprimir</button>}
            </div>
            <div style={{...s.card,display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap"}}>
              <div style={{flex:2,minWidth:180}}><label style={lStyle}>Locador *</label>
                <select style={iStyle} value={relLocador} onChange={e=>{setRelLocador(e.target.value);setRelGerado(false);}}>
                  <option value="">Selecione...</option>{locadoresUnicos.map(l=><option key={l}>{l}</option>)}
                </select></div>
              <div style={{flex:1,minWidth:140}}><label style={lStyle}>De</label><input style={iStyle} type="month" value={relMesInicio} onChange={e=>{setRelMesInicio(e.target.value);setRelGerado(false);}}/></div>
              <div style={{flex:1,minWidth:140}}><label style={lStyle}>Até</label><input style={iStyle} type="month" value={relMesFim} onChange={e=>{setRelMesFim(e.target.value);setRelGerado(false);}}/></div>
              <button style={{...s.btn(),opacity:relLocador?1:0.4}} disabled={!relLocador} onClick={()=>setRelGerado(true)}>Gerar</button>
            </div>
            {relGerado&&dadosRelatorio&&(
              dadosRelatorio.length===0?<div style={{...s.card,textAlign:"center",color:"#64748b",padding:40}}>Nenhum dado encontrado.</div>:
              <div ref={printRef}>
                <div style={{...s.card,borderLeft:"4px solid #6366f1"}}>
                  <div style={{fontSize:11,color:"#6366f1",fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Relatório Financeiro</div>
                  <div style={{fontSize:22,fontWeight:800}}>{relLocador}</div>
                  <div style={{fontSize:13,color:"#64748b",marginTop:2}}>{relMesInicio||relMesFim?`${relMesInicio||"início"} até ${relMesFim||"fim"}`:"Todos os registros"}</div>
                </div>
                {dadosRelatorio.map(({im,recebsImovel,despesasImovel,repassesImovel,totalRecebido,totalDespesas,totalTaxaAdm,totalRepassado})=>(
                  <div key={im.id} style={s.card}>
                    <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:12}}>
                      <span style={{fontFamily:"monospace",color:"#818cf8",background:"#6366f115",border:"1px solid #6366f133",borderRadius:20,padding:"2px 12px",fontSize:13,fontWeight:700}}>{im.codigo}</span>
                      <span style={{fontWeight:700}}>{im.endereco}</span>
                    </div>
                    {[
                      {label:"↓ Recebimentos",color:"#22c55e",rows:recebsImovel,cols:["Data","Tipo","Valor","Status"],render:r=>[fmtDate(r.data),r.tipo,fmt(r.valor),<Badge label={r.status}/>]},
                      {label:"↑ Despesas",color:"#f59e0b",rows:despesasImovel,cols:["Data","Tipo","Descrição","Valor"],render:d=>[fmtDate(d.data),d.tipo,d.descricao,fmt(d.valor)]},
                      {label:"⇌ Repasses",color:"#6366f1",rows:repassesImovel,cols:["Mês","Data","Bruto","Taxa","Líquido","Pagamento"],render:r=>[r.mes,fmtDate(r.data),fmt(r.valorBruto),fmt(r.taxaAdm),fmt(r.valorLiquido),r.formaPagamento||"—"]},
                    ].map(sec=>(
                      <div key={sec.label} style={{marginBottom:16}}>
                        <div style={{fontSize:12,fontWeight:700,color:sec.color,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>{sec.label}</div>
                        {sec.rows.length===0?<div style={{color:"#475569",fontSize:13}}>Nenhum registro</div>:
                        <table><thead><tr>{sec.cols.map(c=><th key={c} style={s.th}>{c}</th>)}</tr></thead>
                          <tbody>{sec.rows.map((row,i)=><tr key={i}>{sec.render(row).map((cell,j)=><td key={j} style={s.td}>{cell}</td>)}</tr>)}</tbody>
                        </table>}
                      </div>
                    ))}
                    <div style={{background:"#0f1623",borderRadius:10,padding:16,border:"1px solid #2d3748"}}>
                      {[["Total recebido",fmt(totalRecebido),"#22c55e"],["Total despesas",fmt(totalDespesas),"#f59e0b"],["Taxa adm",fmt(totalTaxaAdm),"#f59e0b"],["Total repassado",fmt(totalRepassado),"#818cf8"]].map(([k,v,c])=>(
                        <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #1e2940"}}>
                          <span style={{color:"#94a3b8",fontSize:13}}>{k}</span>
                          <span style={{fontFamily:"monospace",color:c,fontWeight:600}}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* USUÁRIOS */}
        {tab==="usuarios"&&isAdmin&&(
          <div>
            <h2 style={{fontWeight:800,fontSize:24,marginBottom:24}}>Usuários</h2>
            {usuarios.filter(u=>!u.aprovado).length>0&&(
              <div style={{background:"#f59e0b15",border:"1px solid #f59e0b40",borderRadius:14,padding:16,marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:700,color:"#f59e0b",marginBottom:12}}>⏳ Aguardando aprovação ({usuarios.filter(u=>!u.aprovado).length})</div>
                {usuarios.filter(u=>!u.aprovado).map(u=>(
                  <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #1e2940"}}>
                    <div><div style={{fontSize:14,fontWeight:600}}>{u.nome}</div><div style={{fontSize:12,color:"#64748b"}}>{u.email}</div></div>
                    <div style={{display:"flex",gap:8}}>
                      <button style={s.btn("#22c55e")} onClick={async()=>{try{const up=await api.updateUsuario(u.id,{nome:u.nome,role:u.role,ativo:true,aprovado:true});setUsuarios(p=>p.map(x=>x.id===u.id?up:x));showToast(`${u.nome} aprovado!`);}catch(e){showToast(e.message,"error");}}}>✓ Aprovar</button>
                      <button style={s.btn("#ef4444")} onClick={async()=>{if(!confirm(`Rejeitar ${u.nome}?`))return;try{await api.deleteUsuario(u.id);setUsuarios(p=>p.filter(x=>x.id!==u.id));showToast("Rejeitado");}catch(e){showToast(e.message,"error");}}}>✕ Rejeitar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={s.card}>
              <table><thead><tr><th style={s.th}>Nome</th><th style={s.th}>Email</th><th style={s.th}>Perfil</th><th style={s.th}>Status</th><th style={s.th}></th></tr></thead>
                <tbody>{usuarios.filter(u=>u.aprovado).map(u=>(
                  <tr key={u.id}>
                    <td style={s.td}>{u.nome}</td><td style={{...s.td,color:"#64748b"}}>{u.email}</td>
                    <td style={s.td}><span style={{background:u.role==="admin"?"#6366f120":"#1e2940",color:u.role==="admin"?"#818cf8":"#64748b",border:`1px solid ${u.role==="admin"?"#6366f140":"#2d3748"}`,padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:600}}>{u.role==="admin"?"Admin":"Usuário"}</span></td>
                    <td style={s.td}><Badge label={u.ativo?"Ativo":"Inativo"}/></td>
                    <td style={s.td}>{u.id!==user.id?<div style={{display:"flex",gap:6}}>
                      <button style={s.btnGhost} onClick={async()=>{try{const up=await api.updateUsuario(u.id,{nome:u.nome,role:u.role==="admin"?"usuario":"admin",ativo:u.ativo,aprovado:u.aprovado});setUsuarios(p=>p.map(x=>x.id===u.id?up:x));showToast("Perfil alterado!");}catch(e){showToast(e.message,"error");}}}>
                        {u.role==="admin"?"→ Usuário":"→ Admin"}
                      </button>
                      <button style={s.btnGhost} onClick={async()=>{try{const up=await api.updateUsuario(u.id,{nome:u.nome,role:u.role,ativo:!u.ativo,aprovado:u.aprovado});setUsuarios(p=>p.map(x=>x.id===u.id?up:x));showToast(u.ativo?"Desativado":"Ativado");}catch(e){showToast(e.message,"error");}}}>
                        {u.ativo?"Desativar":"Ativar"}
                      </button>
                    </div>:<span style={{fontSize:12,color:"#475569"}}>Você</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL IMÓVEL */}
      {modalImovel&&(
        <Modal title={modalImovel==="new"?"Novo Imóvel":"Editar Imóvel"} onClose={()=>setModalImovel(null)} wide>
          <SectionTitle>Identificação</SectionTitle>
          <Row>
            <Field label="Código *" half><input style={iStyle} value={formImovel.codigo} onChange={e=>setFormImovel(p=>({...p,codigo:e.target.value}))} placeholder="AP-001"/></Field>
            <Field label="Tipo" half><select style={iStyle} value={formImovel.tipo} onChange={e=>setFormImovel(p=>({...p,tipo:e.target.value}))}>{["Apartamento","Casa","Comercial","Sala","Galpão"].map(t=><option key={t}>{t}</option>)}</select></Field>
          </Row>
          <Field label="Endereço *"><input style={iStyle} value={formImovel.endereco} onChange={e=>setFormImovel(p=>({...p,endereco:e.target.value}))}/></Field>
          <Field label="Bairro"><input style={iStyle} value={formImovel.bairro} onChange={e=>setFormImovel(p=>({...p,bairro:e.target.value}))}/></Field>

          <SectionTitle>Partes</SectionTitle>
          <Row>
            <Field label="Locatário *" half><input style={iStyle} value={formImovel.locatario} onChange={e=>setFormImovel(p=>({...p,locatario:e.target.value}))}/></Field>
            <Field label="Tel. Locatário" half><input style={iStyle} value={formImovel.telefoneLocatario} onChange={e=>setFormImovel(p=>({...p,telefoneLocatario:e.target.value}))}/></Field>
            <Field label="Locador *" half><input style={iStyle} value={formImovel.locador} onChange={e=>setFormImovel(p=>({...p,locador:e.target.value}))}/></Field>
            <Field label="Tel. Locador" half><input style={iStyle} value={formImovel.telefoneLocador} onChange={e=>setFormImovel(p=>({...p,telefoneLocador:e.target.value}))}/></Field>
          </Row>

          <SectionTitle>Valores e Responsabilidades</SectionTitle>
          <Row>
            <PagaField label="Aluguel (R$)" valorKey="aluguel" pagaKey="aluguelPagaPor" form={formImovel} setForm={setFormImovel}/>
            <PagaField label="Condomínio (R$)" valorKey="condominio" pagaKey="condominioPagaPor" form={formImovel} setForm={setFormImovel}/>
            <PagaField label="IPTU (R$)" valorKey="iptu" pagaKey="iptuPagaPor" form={formImovel} setForm={setFormImovel}/>
            <Field label="Taxa Adm (%)" half><input style={iStyle} type="number" value={formImovel.taxaAdm} onChange={e=>setFormImovel(p=>({...p,taxaAdm:e.target.value}))}/></Field>
            <Field label="Dia de Vencimento" half><input style={iStyle} type="number" min="1" max="31" value={formImovel.vencimento} onChange={e=>setFormImovel(p=>({...p,vencimento:e.target.value}))}/></Field>
            <Field label="Forma de Pagamento" half><select style={iStyle} value={formImovel.formaPagamento} onChange={e=>setFormImovel(p=>({...p,formaPagamento:e.target.value}))}>{fpOpts.map(o=><option key={o}>{o}</option>)}</select></Field>
          </Row>

          <SectionTitle>Prazo do Contrato</SectionTitle>
          <Row>
            <Field label="Início" half><input style={iStyle} type="date" value={formImovel.inicio} onChange={e=>setFormImovel(p=>({...p,inicio:e.target.value}))}/></Field>
            <Field label="Duração (meses)" half><input style={iStyle} type="number" value={formImovel.duracaoMeses} onChange={e=>setFormImovel(p=>({...p,duracaoMeses:e.target.value}))} placeholder="Ex: 30"/></Field>
            {formImovel.inicio&&formImovel.duracaoMeses&&<Field label="Término previsto" half>
              <input style={{...iStyle,color:"#94a3b8"}} readOnly value={(() => { const d=new Date(formImovel.inicio); d.setMonth(d.getMonth()+ +formImovel.duracaoMeses); return d.toLocaleDateString("pt-BR"); })()}/>
            </Field>}
            <Field label="Status" half><select style={iStyle} value={formImovel.status} onChange={e=>setFormImovel(p=>({...p,status:e.target.value}))}>{["Ativo","Inativo"].map(t=><option key={t}>{t}</option>)}</select></Field>
          </Row>

          <SectionTitle>Penalidades e Honorários</SectionTitle>
          <Row>
            <Field label="Multa rescisão (%)" half><input style={iStyle} type="number" value={formImovel.multaRescisao} onChange={e=>setFormImovel(p=>({...p,multaRescisao:e.target.value}))}/></Field>
            <Field label="Multa atraso (%)" half><input style={iStyle} type="number" value={formImovel.multaAtraso} onChange={e=>setFormImovel(p=>({...p,multaAtraso:e.target.value}))}/></Field>
            <Field label="Juros atraso (% a.m.)" half><input style={iStyle} type="number" value={formImovel.jurosAtraso} onChange={e=>setFormImovel(p=>({...p,jurosAtraso:e.target.value}))}/></Field>
          </Row>
          <Row>
            <Field label="Honorários cobrança (%)" half><input style={iStyle} type="number" value={formImovel.honorariosPct} onChange={e=>setFormImovel(p=>({...p,honorariosPct:e.target.value}))}/></Field>
            <Field label="Após quantos dias" half><input style={iStyle} type="number" value={formImovel.honorariosDias} onChange={e=>setFormImovel(p=>({...p,honorariosDias:e.target.value}))}/></Field>
            <Field label="Honorários advogado (%)" half><input style={iStyle} type="number" value={formImovel.honorariosAdvPct} onChange={e=>setFormImovel(p=>({...p,honorariosAdvPct:e.target.value}))}/></Field>
            <Field label="Após quantos dias" half><input style={iStyle} type="number" value={formImovel.honorariosAdvDias} onChange={e=>setFormImovel(p=>({...p,honorariosAdvDias:e.target.value}))}/></Field>
          </Row>

          <SectionTitle>Contrato PDF</SectionTitle>
          <Field label="Upload do contrato (PDF)">
            <input style={iStyle} type="file" accept=".pdf" onChange={e=>setContratoFile(e.target.files[0])}/>
            {modalImovel!=="new"&&imoveis.find(i=>i.id===modalImovel)?.contratoPdfNome&&(
              <div style={{fontSize:12,color:"#64748b",marginTop:6}}>
                Atual: {imoveis.find(i=>i.id===modalImovel)?.contratoPdfNome}
                <button style={{...s.btnGhost,marginLeft:8,fontSize:11,padding:"2px 10px"}} onClick={async()=>{try{const {url}=await api.getContratoUrl(modalImovel);window.open(url,"_blank");}catch(e){showToast(e.message,"error");}}}>Visualizar</button>
              </div>
            )}
          </Field>

          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <button style={s.btnGhost} onClick={()=>setModalImovel(null)}>Cancelar</button>
            <button style={s.btn()} onClick={saveImovel}>Salvar</button>
          </div>
        </Modal>
      )}

      {/* MODAL RECEBIMENTO */}
      {modalReceb&&(
        <Modal title={modalReceb==="new"?"Registrar Recebimento":"Editar Recebimento"} onClose={()=>setModalReceb(null)}>
          <Field label="Imóvel *"><select style={iStyle} value={formReceb.imovelId} onChange={e=>setFormReceb(p=>({...p,imovelId:e.target.value}))}><option value="">Selecione...</option>{imoveis.map(im=><option key={im.id} value={im.id}>{im.codigo} — {im.locatario}</option>)}</select></Field>
          <Row>
            <Field label="Data *" half><input style={iStyle} type="date" value={formReceb.data} onChange={e=>setFormReceb(p=>({...p,data:e.target.value}))}/></Field>
            <Field label="Valor (R$) *" half><input style={iStyle} type="number" value={formReceb.valor} onChange={e=>setFormReceb(p=>({...p,valor:e.target.value}))}/></Field>
            <Field label="Tipo" half><select style={iStyle} value={formReceb.tipo} onChange={e=>setFormReceb(p=>({...p,tipo:e.target.value}))}>{["Aluguel","Condomínio","IPTU","Multa","Outros"].map(t=><option key={t}>{t}</option>)}</select></Field>
            <Field label="Status" half><select style={iStyle} value={formReceb.status} onChange={e=>setFormReceb(p=>({...p,status:e.target.value}))}>{["Pago","Pendente","Atrasado"].map(t=><option key={t}>{t}</option>)}</select></Field>
          </Row>
          <Field label="Observação"><input style={iStyle} value={formReceb.obs} onChange={e=>setFormReceb(p=>({...p,obs:e.target.value}))}/></Field>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <button style={s.btnGhost} onClick={()=>setModalReceb(null)}>Cancelar</button>
            <button style={s.btn("#22c55e")} onClick={saveReceb}>Salvar</button>
          </div>
        </Modal>
      )}

      {/* MODAL DESPESA */}
      {modalDesp&&(
        <Modal title={modalDesp==="new"?"Registrar Despesa":"Editar Despesa"} onClose={()=>setModalDesp(null)}>
          <Field label="Imóvel *"><select style={iStyle} value={formDesp.imovelId} onChange={e=>setFormDesp(p=>({...p,imovelId:e.target.value}))}><option value="">Selecione...</option>{imoveis.map(im=><option key={im.id} value={im.id}>{im.codigo} — {im.locatario}</option>)}</select></Field>
          <Row>
            <Field label="Data *" half><input style={iStyle} type="date" value={formDesp.data} onChange={e=>setFormDesp(p=>({...p,data:e.target.value}))}/></Field>
            <Field label="Valor (R$) *" half><input style={iStyle} type="number" value={formDesp.valor} onChange={e=>setFormDesp(p=>({...p,valor:e.target.value}))}/></Field>
            <Field label="Tipo" half><select style={iStyle} value={formDesp.tipo} onChange={e=>setFormDesp(p=>({...p,tipo:e.target.value}))}>{["Manutenção","Condomínio","IPTU","Seguro","Pintura","Elétrica","Hidráulica","Outros"].map(t=><option key={t}>{t}</option>)}</select></Field>
            <Field label="Status" half><select style={iStyle} value={formDesp.status} onChange={e=>setFormDesp(p=>({...p,status:e.target.value}))}>{["Pago","Pendente"].map(t=><option key={t}>{t}</option>)}</select></Field>
          </Row>
          <Field label="Descrição"><input style={iStyle} value={formDesp.descricao} onChange={e=>setFormDesp(p=>({...p,descricao:e.target.value}))}/></Field>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <button style={s.btnGhost} onClick={()=>setModalDesp(null)}>Cancelar</button>
            <button style={s.btn("#f59e0b")} onClick={saveDesp}>Salvar</button>
          </div>
        </Modal>
      )}

      {/* MODAL REPASSE */}
      {modalRepasse&&(
        <Modal title="Gerar Repasse ao Locador" onClose={()=>setModalRepasse(null)}>
          <Field label="Imóvel *"><select style={iStyle} value={formRepasse.imovelId} onChange={e=>{setRepasseEditado(false);onImovelRepasse(e.target.value);}}>
            <option value="">Selecione...</option>{imoveis.map(im=><option key={im.id} value={im.id}>{im.codigo} — {im.locador} ({im.taxaAdm}% adm)</option>)}
          </select></Field>
          <Row>
            <Field label="Mês referência *" half><input style={iStyle} value={formRepasse.mes} onChange={e=>setFormRepasse(p=>({...p,mes:e.target.value}))} placeholder="Ex: Maio/2025"/></Field>
            <Field label="Data do repasse *" half><input style={iStyle} type="date" value={formRepasse.data} onChange={e=>setFormRepasse(p=>({...p,data:e.target.value}))}/></Field>
            <Field label="Forma de Pagamento" half><select style={iStyle} value={formRepasse.formaPagamento} onChange={e=>setFormRepasse(p=>({...p,formaPagamento:e.target.value}))}>{fpOpts.map(o=><option key={o}>{o}</option>)}</select></Field>
          </Row>
          {formRepasse.imovelId&&(
            <div style={{background:"#0f1623",borderRadius:10,padding:16,marginBottom:14,border:"1px solid #2d3748"}}>
              <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>Valores — edite se necessário</div>
              <Row>
                <Field label="Valor Bruto (R$)" half><input style={iStyle} type="number" value={formRepasse.valorBruto} onChange={e=>{setRepasseEditado(true);setFormRepasse(p=>({...p,valorBruto:e.target.value,valorLiquido:e.target.value-p.taxaAdm}));}}/></Field>
                <Field label="Taxa Adm (R$)" half><input style={iStyle} type="number" value={formRepasse.taxaAdm} onChange={e=>{setRepasseEditado(true);setFormRepasse(p=>({...p,taxaAdm:e.target.value,valorLiquido:p.valorBruto-e.target.value}));}}/></Field>
                <Field label="Valor Líquido (R$)" half><input style={iStyle} type="number" value={formRepasse.valorLiquido} onChange={e=>{setRepasseEditado(true);setFormRepasse(p=>({...p,valorLiquido:e.target.value}));}}/></Field>
              </Row>
            </div>
          )}
          <Field label="Status"><select style={iStyle} value={formRepasse.status} onChange={e=>setFormRepasse(p=>({...p,status:e.target.value}))}>{["Repassado","Pendente"].map(t=><option key={t}>{t}</option>)}</select></Field>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <button style={s.btnGhost} onClick={()=>setModalRepasse(null)}>Cancelar</button>
            <button style={s.btn("#06b6d4")} onClick={saveRepasse}>Confirmar</button>
          </div>
        </Modal>
      )}

      {/* MODAL DETALHE IMÓVEL */}
      {detalheImovel&&(
        <Modal title={`Imóvel ${detalheImovel.codigo}`} onClose={()=>setDetalheImovel(null)} wide>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 24px"}}>
            {[
              ["Endereço",detalheImovel.endereco],["Bairro",detalheImovel.bairro],["Tipo",detalheImovel.tipo],
              ["Locatário",detalheImovel.locatario],["Tel. Locatário",detalheImovel.telefoneLocatario],
              ["Locador",detalheImovel.locador],["Tel. Locador",detalheImovel.telefoneLocador],
              ["Aluguel",`${fmt(detalheImovel.aluguel)} (paga: ${detalheImovel.aluguelPagaPor||"—"})`],
              ["Condomínio",`${fmt(detalheImovel.condominio)} (paga: ${detalheImovel.condominioPagaPor||"—"})`],
              ["IPTU",`${fmt(detalheImovel.iptu)} (paga: ${detalheImovel.iptuPagaPor||"—"})`],
              ["Taxa Adm",`${detalheImovel.taxaAdm}%`],["Vencimento",`Dia ${detalheImovel.vencimento}`],
              ["Forma Pagamento",detalheImovel.formaPagamento],
              ["Início",fmtDate(detalheImovel.inicio)],["Duração",detalheImovel.duracaoMeses?`${detalheImovel.duracaoMeses} meses`:"—"],
              ["Término",fmtDate(detalheImovel.fim)],["Status",detalheImovel.status],
              ["Multa rescisão",`${detalheImovel.multaRescisao||0}%`],["Multa atraso",`${detalheImovel.multaAtraso||0}%`],
              ["Juros atraso",`${detalheImovel.jurosAtraso||0}% a.m.`],
              ["Hon. cobrança",`${detalheImovel.honorariosPct||0}% após ${detalheImovel.honorariosDias||0} dias`],
              ["Hon. advogado",`${detalheImovel.honorariosAdvPct||0}% após ${detalheImovel.honorariosAdvDias||0} dias`],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #1e2940"}}>
                <span style={{color:"#64748b",fontSize:13}}>{k}</span>
                <span style={{fontSize:14,fontWeight:500,textAlign:"right",maxWidth:"60%"}}>{v||"—"}</span>
              </div>
            ))}
          </div>
          {detalheImovel.contratoPdfNome&&(
            <div style={{marginTop:16,padding:12,background:"#0f1623",borderRadius:8,border:"1px solid #2d3748",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,color:"#94a3b8"}}>📄 {detalheImovel.contratoPdfNome}</span>
              <button style={s.btn()} onClick={async()=>{try{const {url}=await api.getContratoUrl(detalheImovel.id);window.open(url,"_blank");}catch(e){showToast(e.message,"error");}}}>Visualizar PDF</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
