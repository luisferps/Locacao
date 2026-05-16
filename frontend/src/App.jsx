import { useState, useEffect, useMemo, useRef } from "react";
import { api } from "./api.js";
import Auth from "./Auth.jsx";

const fmt = (v) => Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const fmtDate = (d) => d ? new Date(d+"T12:00:00").toLocaleDateString("pt-BR") : "-";
const pagaOpts = ["Locatário","Locador","ADM"];
const fpOpts = ["Pix","Boleto bancário","Transferência"];
const indiceOpts = ["IGPM","IPCA","INPC","IPC-A","Manual"];

const statusColors = {
  Ativo:"#22c55e",Inativo:"#94a3b8",Encerrado:"#64748b",
  Pago:"#22c55e",Pendente:"#f59e0b",Atrasado:"#ef4444",
  Repassado:"#6366f1",Aguardando:"#f59e0b"
};
const Badge = ({label}) => <span style={{background:(statusColors[label]||"#64748b")+"22",color:statusColors[label]||"#64748b",border:`1px solid ${(statusColors[label]||"#64748b")}44`,padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:600}}>{label}</span>;

function Modal({title,onClose,children,wide}){
  return(
    <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:20,overflowY:"auto"}}>
      <div style={{background:"#1a1f2e",borderRadius:16,padding:28,width:"100%",maxWidth:wide?800:580,border:"1px solid #2d3748",boxShadow:"0 25px 60px #000a",margin:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{color:"#e2e8f0",fontWeight:700,fontSize:18,margin:0}}>{title}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#94a3b8",fontSize:22,cursor:"pointer"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const IS = {width:"100%",background:"#0f1623",border:"1px solid #2d3748",borderRadius:8,color:"#e2e8f0",padding:"8px 12px",fontSize:14,boxSizing:"border-box",outline:"none",fontFamily:"inherit"};
const LS = {color:"#94a3b8",fontSize:12,fontWeight:600,display:"block",marginBottom:4};
const F = ({label,children,h})=><div style={{marginBottom:14,flex:h?"1 1 45%":"1 1 100%"}}><label style={LS}>{label}</label>{children}</div>;
const R = ({children})=><div style={{display:"flex",gap:16,flexWrap:"wrap"}}>{children}</div>;
const ST = ({children})=><div style={{fontSize:11,fontWeight:700,color:"#6366f1",textTransform:"uppercase",letterSpacing:2,margin:"18px 0 10px",paddingBottom:6,borderBottom:"1px solid #1e2940"}}>{children}</div>;

function PF({label,vk,pk,form,set}){
  return(
    <div style={{marginBottom:14,flex:"1 1 45%"}}>
      <label style={LS}>{label}</label>
      <div style={{display:"flex",gap:6}}>
        <input style={{...IS,flex:1}} type="number" placeholder="R$" value={form[vk]||""} onChange={e=>set(p=>({...p,[vk]:e.target.value}))}/>
        <select style={{...IS,width:130}} value={form[pk]||"Locatário"} onChange={e=>set(p=>({...p,[pk]:e.target.value}))}>
          {pagaOpts.map(o=><option key={o}>{o}</option>)}
        </select>
      </div>
    </div>
  );
}

function Toast({msg,type}){return<div style={{position:"fixed",bottom:24,right:24,zIndex:9999,background:type==="error"?"#ef4444":"#22c55e",color:"#fff",padding:"12px 20px",borderRadius:10,fontWeight:600,fontSize:14,boxShadow:"0 8px 24px #0008",animation:"fadeIn .2s"}}>{msg}</div>;}

function BarChart({data}){
  if(!data?.length) return <div style={{color:"#475569",fontSize:13,textAlign:"center",padding:32}}>Sem dados ainda</div>;
  const max=Math.max(...data.map(d=>+d.recebido),1);
  return(
    <div style={{display:"flex",alignItems:"flex-end",gap:6,height:120}}>
      {data.map(d=>(
        <div key={d.mes} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          <div style={{fontSize:9,color:"#64748b"}}>{fmt(d.recebido).replace("R$","").trim()}</div>
          <div style={{width:"100%",background:"#6366f1",borderRadius:"3px 3px 0 0",height:`${(+d.recebido/max)*80}px`,minHeight:3}}/>
          <div style={{fontSize:9,color:"#475569"}}>{d.mes?.slice(5)}/{d.mes?.slice(2,4)}</div>
        </div>
      ))}
    </div>
  );
}

export default function App(){
  const [tab,setTab]=useState("dashboard");
  const [user,setUser]=useState(()=>{try{return JSON.parse(localStorage.getItem("user"));}catch{return null;}});
  const isAdmin=user?.role==="admin";
  const [imoveis,setImoveis]=useState([]);
  const [contratos,setContratos]=useState([]);
  const [despesas,setDespesas]=useState([]);
  const [repasses,setRepasses]=useState([]);
  const [usuarios,setUsuarios]=useState([]);
  const [dashboard,setDashboard]=useState(null);
  const [loading,setLoading]=useState(true);
  const [toast,setToast]=useState(null);
  const showToast=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};

  // Modais
  const [modalImovel,setModalImovel]=useState(null);
  const [modalContrato,setModalContrato]=useState(null);
  const [modalParcelas,setModalParcelas]=useState(null); // contratoId
  const [modalReajuste,setModalReajuste]=useState(null); // contratoId
  const [modalRepasse,setModalRepasse]=useState(null);
  const [modalDespesa,setModalDespesa]=useState(null);
  const [detalheContrato,setDetalheContrato]=useState(null);

  // Dados de detalhe
  const [parcelas,setParcelas]=useState([]);
  const [reajustes,setReajustes]=useState([]);
  const [parcelaEdit,setParcelaEdit]=useState(null);
  const [contratoFile,setContratoFile]=useState(null);
  const [comprovanteFile,setComprovanteFile]=useState(null);
  const [repasseId,setRepasseId]=useState(null);

  // Forms
  const emptyImovel={codigo:"",endereco:"",bairro:"",tipo:"Apartamento",area:""};
  const [formImovel,setFormImovel]=useState(emptyImovel);

  const emptyContrato={imovelId:"",locatario:"",telefoneLocatario:"",locador:"",telefoneLocador:"",aluguelInicial:"",aluguelPagaPor:"Locatário",condominio:"",condominioPagaPor:"Locatário",iptu:"",iptuPagaPor:"Locatário",taxaAdmPct:10,vencimento:"",formaPagamento:"Pix",inicio:"",duracaoMeses:"",status:"Ativo",multaRescisaoPct:"",multaAtrasoPct:"",jurosAtrasoPct:"",honorariosPct:"",honorariosDias:"",honorariosAdvPct:"",honorariosAdvDias:""};
  const [formContrato,setFormContrato]=useState(emptyContrato);

  const emptyReajuste={dataReajuste:"",indice:"IGPM",periodoInicio:"",periodoFim:"",valorAnterior:"",percentual:"",valorNovo:"",obs:""};
  const [formReajuste,setFormReajuste]=useState(emptyReajuste);

  const emptyRepasse={contratoId:"",competencia:"",dataRepasse:"",valorRecebido:"",totalDespesas:"",taxaAdm:"",valorLiquido:"",formaPagamento:"Pix",status:"Pendente",obs:""};
  const [formRepasse,setFormRepasse]=useState(emptyRepasse);

  const emptyDespesa={contratoId:"",data:"",valor:"",tipo:"Manutenção",descricao:"",status:"Pago"};
  const [formDespesa,setFormDespesa]=useState(emptyDespesa);

  // Relatório
  const [relLocador,setRelLocador]=useState("");
  const [relMesInicio,setRelMesInicio]=useState("");
  const [relMesFim,setRelMesFim]=useState("");
  const [relGerado,setRelGerado]=useState(false);
  const printRef=useRef(null);

  useEffect(()=>{
    if(!user) return;
    const loads=[api.getImoveis(),api.getContratos(),api.getDespesas(),api.getRepasses(),api.getDashboard()];
    if(isAdmin) loads.push(api.getUsuarios());
    Promise.all(loads)
      .then(([im,con,dep,rep,dash,usu])=>{
        setImoveis(im);setContratos(con);setDespesas(dep);setRepasses(rep);setDashboard(dash);
        if(usu) setUsuarios(usu);
      })
      .catch(()=>showToast("Erro ao carregar dados","error"))
      .finally(()=>setLoading(false));
  },[user]);

  if(!user) return <Auth onLogin={()=>window.location.reload()}/>;

  const imovelNome=(id)=>imoveis.find(i=>i.id===+id)?.codigo||"—";
  const contratoNome=(id)=>{const c=contratos.find(c=>c.id===+id);return c?`${c.codigo} — ${c.locatario}`:"—";};

  // Cálculos automáticos
  const calcMulRescisao=(c)=>{
    if(!c?.aluguelAtual||!c?.duracaoMeses||!c?.inicio) return 0;
    const inicio=new Date(c.inicio);
    const fim=new Date(c.fim||inicio);
    const hoje=new Date();
    const totalMeses=+c.duracaoMeses;
    const mesesDecorridos=Math.max(0,(hoje.getFullYear()-inicio.getFullYear())*12+(hoje.getMonth()-inicio.getMonth()));
    const mesesRestantes=Math.max(0,totalMeses-mesesDecorridos);
    return 3*Number(c.aluguelAtual)*(mesesRestantes/totalMeses);
  };

  const calcRepasseAuto=(contratoId)=>{
    const c=contratos.find(x=>x.id===+contratoId);
    if(!c) return {};
    const mesAtual=new Date().toISOString().slice(0,7);
    const recMes=parcelas.filter(p=>p.contratoId===+contratoId&&p.status==="Pago"&&p.dataRecebimento?.slice(0,7)===mesAtual).reduce((s,p)=>s+Number(p.valorRecebido||0),0);
    const despMes=despesas.filter(d=>d.contratoId===+contratoId&&d.data?.slice(0,7)===mesAtual).reduce((s,d)=>s+Number(d.valor),0);
    const taxa=(recMes*Number(c.taxaAdmPct))/100;
    const liq=recMes-despMes-taxa;
    return{valorRecebido:recMes.toFixed(2),totalDespesas:despMes.toFixed(2),taxaAdm:taxa.toFixed(2),valorLiquido:liq.toFixed(2)};
  };

  // IMÓVEL handlers
  const saveImovel=async()=>{
    if(!formImovel.codigo||!formImovel.endereco) return showToast("Preencha código e endereço","error");
    try{
      if(modalImovel==="new"){const n=await api.createImovel(formImovel);setImoveis(p=>[...p,n]);showToast("Imóvel cadastrado!");}
      else{const n=await api.updateImovel(modalImovel,formImovel);setImoveis(p=>p.map(i=>i.id===modalImovel?n:i));showToast("Imóvel atualizado!");}
      setModalImovel(null);
    }catch(e){showToast(e.message,"error");}
  };

  // CONTRATO handlers
  const saveContrato=async()=>{
    if(!formContrato.imovelId||!formContrato.locatario||!formContrato.aluguelInicial) return showToast("Preencha os campos obrigatórios","error");
    const payload={...formContrato,aluguelInicial:+formContrato.aluguelInicial,aluguelAtual:+formContrato.aluguelInicial,condominio:+formContrato.condominio||0,iptu:+formContrato.iptu||0,taxaAdmPct:+formContrato.taxaAdmPct,vencimento:+formContrato.vencimento,duracaoMeses:+formContrato.duracaoMeses||null};
    try{
      if(modalContrato==="new"){
        const n=await api.createContrato(payload);
        if(contratoFile) await api.uploadContratoPdf(n.id,contratoFile);
        setContratos(p=>[n,...p]);
        showToast("Contrato criado com parcelas geradas!");
      }else{
        const n=await api.updateContrato(modalContrato,payload);
        if(contratoFile) await api.uploadContratoPdf(modalContrato,contratoFile);
        setContratos(p=>p.map(c=>c.id===modalContrato?n:c));
        showToast("Contrato atualizado!");
      }
      setModalContrato(null);setContratoFile(null);
    }catch(e){showToast(e.message,"error");}
  };

  // PARCELA handlers
  const openParcelas=async(contratoId)=>{
    try{
      const [p,r]=await Promise.all([api.getParcelas(contratoId),api.getReajustes(contratoId)]);
      setParcelas(p);setReajustes(r);setModalParcelas(contratoId);
    }catch(e){showToast(e.message,"error");}
  };

  const saveParcela=async()=>{
    try{
      const n=await api.updateParcela(parcelaEdit.id,parcelaEdit);
      setParcelas(p=>p.map(x=>x.id===parcelaEdit.id?n:x));
      setParcelaEdit(null);showToast("Parcela atualizada!");
    }catch(e){showToast(e.message,"error");}
  };

  // REAJUSTE handlers
  const saveReajuste=async()=>{
    if(!formReajuste.dataReajuste||!formReajuste.valorNovo) return showToast("Preencha data e valor novo","error");
    try{
      const n=await api.createReajuste(modalReajuste,{...formReajuste,valorAnterior:+formReajuste.valorAnterior,percentual:+formReajuste.percentual,valorNovo:+formReajuste.valorNovo});
      setReajustes(p=>[n,...p]);
      setContratos(p=>p.map(c=>c.id===+modalReajuste?{...c,aluguelAtual:+formReajuste.valorNovo}:c));
      showToast("Reajuste registrado!");setFormReajuste(emptyReajuste);
    }catch(e){showToast(e.message,"error");}
  };

  // DESPESA handlers
  const saveDespesa=async()=>{
    if(!formDespesa.contratoId||!formDespesa.data||!formDespesa.valor) return;
    try{
      if(modalDespesa==="new"){const n=await api.createDespesa({...formDespesa,valor:+formDespesa.valor,contratoId:+formDespesa.contratoId});setDespesas(p=>[n,...p]);showToast("Despesa registrada!");}
      else{const n=await api.updateDespesa(modalDespesa,{...formDespesa,valor:+formDespesa.valor,contratoId:+formDespesa.contratoId});setDespesas(p=>p.map(d=>d.id===modalDespesa?n:d));showToast("Atualizado!");}
      setModalDespesa(null);
    }catch(e){showToast(e.message,"error");}
  };

  // REPASSE handlers
  const onContratoRepasse=(contratoId)=>{
    const calc=calcRepasseAuto(contratoId);
    setFormRepasse(p=>({...p,contratoId,...calc}));
  };

  const saveRepasse=async()=>{
    if(!formRepasse.contratoId||!formRepasse.competencia) return;
    try{
      const n=await api.createRepasse({...formRepasse,contratoId:+formRepasse.contratoId,valorRecebido:+formRepasse.valorRecebido,totalDespesas:+formRepasse.totalDespesas,taxaAdm:+formRepasse.taxaAdm,valorLiquido:+formRepasse.valorLiquido});
      setRepasses(p=>[n,...p]);
      if(comprovanteFile&&n.id){await api.uploadComprovante(n.id,comprovanteFile);}
      showToast("Repasse gerado!");setModalRepasse(null);setComprovanteFile(null);
    }catch(e){showToast(e.message,"error");}
  };

  const uploadComprovante=async(id)=>{
    if(!comprovanteFile) return;
    try{
      await api.uploadComprovante(id,comprovanteFile);
      setRepasses(p=>p.map(r=>r.id===id?{...r,status:"Repassado",comprovanteNome:comprovanteFile.name}:r));
      setComprovanteFile(null);setRepasseId(null);showToast("Comprovante anexado!");
    }catch(e){showToast(e.message,"error");}
  };

  // Relatório
  const locadoresUnicos=[...new Set(contratos.map(c=>c.locador))].sort();
  const dadosRelatorio=useMemo(()=>{
    if(!relLocador) return null;
    const meusCon=contratos.filter(c=>c.locador===relLocador);
    const filtrar=(data)=>{
      if(!relMesInicio&&!relMesFim) return true;
      const d=(data+"").slice(0,7);
      if(relMesInicio&&d<relMesInicio) return false;
      if(relMesFim&&d>relMesFim) return false;
      return true;
    };
    return meusCon.map(c=>({
      c,
      parcs:parcelas.filter(p=>p.contratoId===c.id&&filtrar(p.dataRecebimento)),
      desps:despesas.filter(d=>d.contratoId===c.id&&filtrar(d.data)),
      reps:repasses.filter(r=>r.contratoId===c.id&&filtrar(r.dataRepasse)),
    })).map(x=>({...x,
      totalRec:x.parcs.filter(p=>p.status==="Pago").reduce((s,p)=>s+Number(p.valorRecebido||0),0),
      totalDesp:x.desps.reduce((s,d)=>s+Number(d.valor),0),
      totalRep:x.reps.reduce((s,r)=>s+Number(r.valorLiquido),0),
    }));
  },[relLocador,relMesInicio,relMesFim,contratos,parcelas,despesas,repasses]);

  const s={
    app:{minHeight:"100vh",background:"#0a0e1a",fontFamily:"'DM Sans',sans-serif",color:"#e2e8f0"},
    sidebar:{position:"fixed",top:0,left:0,bottom:0,width:220,background:"#0f1623",borderRight:"1px solid #1e2940",display:"flex",flexDirection:"column",padding:"24px 0",zIndex:100},
    main:{marginLeft:220,padding:28,minHeight:"100vh"},
    card:{background:"#131929",border:"1px solid #1e2940",borderRadius:14,padding:20,marginBottom:16},
    btn:(c="#6366f1")=>({background:c,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"inherit"}),
    btnGhost:{background:"transparent",color:"#94a3b8",border:"1px solid #2d3748",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:500,fontSize:13,fontFamily:"inherit"},
    th:{textAlign:"left",padding:"10px 14px",color:"#64748b",fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1},
    td:{padding:"11px 14px",fontSize:13,borderTop:"1px solid #1e2940",color:"#cbd5e1"},
    statCard:{background:"#131929",border:"1px solid #1e2940",borderRadius:14,padding:"18px 20px",flex:1,minWidth:130},
  };

  const navItems=[
    {id:"dashboard",icon:"◈",label:"Dashboard"},
    {id:"imoveis",icon:"⌂",label:"Imóveis"},
    {id:"contratos",icon:"📋",label:"Contratos"},
    {id:"despesas",icon:"↑",label:"Despesas"},
    {id:"repasses",icon:"⇌",label:"Repasses"},
    {id:"relatorio",icon:"≡",label:"Relatório"},
    ...(isAdmin?[{id:"usuarios",icon:"◎",label:"Usuários"}]:[]),
  ];

  if(loading) return(
    <div style={{...s.app,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{width:40,height:40,border:"3px solid #6366f1",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
      <span style={{color:"#64748b"}}>Carregando...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return(
    <div style={s.app}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');*{box-sizing:border-box}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#0a0e1a}::-webkit-scrollbar-thumb{background:#2d3748;border-radius:3px}table{width:100%;border-collapse:collapse}input,select,textarea{font-family:'DM Sans',sans-serif}select option{background:#1a1f2e}@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}

      {/* SIDEBAR */}
      <div style={s.sidebar}>
        <div style={{padding:"0 20px 20px",borderBottom:"1px solid #1e2940"}}>
          <div style={{fontSize:11,color:"#6366f1",fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Imobiliária</div>
          <div style={{fontSize:17,fontWeight:800,color:"#e2e8f0",marginTop:2}}>Gestão de Aluguel</div>
        </div>
        <nav style={{marginTop:12,flex:1}}>
          {navItems.map(n=>(
            <button key={n.id} onClick={()=>setTab(n.id)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 20px",background:tab===n.id?"#6366f120":"none",border:"none",borderLeft:`3px solid ${tab===n.id?"#6366f1":"transparent"}`,color:tab===n.id?"#818cf8":"#64748b",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:14,textAlign:"left"}}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div style={{padding:"14px 20px",borderTop:"1px solid #1e2940"}}>
          <div style={{fontSize:13,color:"#94a3b8",fontWeight:500,marginBottom:2}}>{user?.nome}</div>
          <div style={{fontSize:11,color:"#475569",marginBottom:8}}>{isAdmin?"Administrador":"Usuário"}</div>
          <button onClick={()=>{localStorage.clear();window.location.reload();}} style={{...s.btnGhost,fontSize:12,padding:"5px 12px",color:"#ef4444",borderColor:"#ef444430",width:"100%"}}>Sair</button>
        </div>
      </div>

      {/* MAIN */}
      <div style={s.main}>

        {/* DASHBOARD */}
        {tab==="dashboard"&&(
          <div>
            <h2 style={{fontWeight:800,fontSize:24,marginBottom:6}}>Dashboard</h2>
            <p style={{color:"#475569",marginBottom:20,fontSize:14}}>Visão geral da carteira</p>
            <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
              {[
                {label:"Contratos Ativos",value:dashboard?.contratosAtivos||0,color:"#6366f1",fmt:false},
                {label:"Carteira Mensal",value:dashboard?.carteiraMensal||0,color:"#818cf8",fmt:true},
                {label:"Recebido (mês)",value:dashboard?.recebidoMes||0,color:"#22c55e",fmt:true},
                {label:"Despesas (mês)",value:dashboard?.despesasMes||0,color:"#f59e0b",fmt:true},
                {label:"Repassado (mês)",value:dashboard?.repassadoMes||0,color:"#06b6d4",fmt:true},
              ].map(m=>(
                <div key={m.label} style={s.statCard}>
                  <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>{m.label}</div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:18,fontWeight:700,color:m.color}}>{m.fmt?fmt(m.value):m.value}</div>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:16}}>
              <div style={s.card}>
                <h3 style={{margin:"0 0 14px",fontSize:14,fontWeight:700}}>Recebimentos por mês</h3>
                <BarChart data={dashboard?.recPorMes}/>
              </div>
              <div style={s.card}>
                <h3 style={{margin:"0 0 12px",fontSize:14,fontWeight:700}}>⚠️ Vencendo em 7 dias</h3>
                {(dashboard?.vencendo||[]).length===0?<div style={{color:"#475569",fontSize:13}}>Nenhuma parcela vencendo</div>:
                (dashboard?.vencendo||[]).map(p=>(
                  <div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #1e2940"}}>
                    <div><div style={{fontSize:13,fontWeight:600}}>{p.codigo}</div><div style={{fontSize:11,color:"#64748b"}}>{p.competencia}</div></div>
                    <div style={{textAlign:"right"}}><div style={{fontSize:12,fontFamily:"monospace",color:"#f59e0b"}}>{fmt(p.valor)}</div><div style={{fontSize:11,color:"#64748b"}}>{fmtDate(p.vencimento)}</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* IMÓVEIS */}
        {tab==="imoveis"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div><h2 style={{fontWeight:800,fontSize:24,margin:0}}>Imóveis</h2><p style={{color:"#475569",fontSize:14,marginTop:4}}>Cadastro dos imóveis</p></div>
              {isAdmin&&<button style={s.btn()} onClick={()=>{setFormImovel(emptyImovel);setModalImovel("new");}}>+ Novo Imóvel</button>}
            </div>
            <div style={s.card}>
              <table><thead><tr><th style={s.th}>Código</th><th style={s.th}>Endereço</th><th style={s.th}>Bairro</th><th style={s.th}>Tipo</th><th style={s.th}>Área</th><th style={s.th}>Contratos</th><th style={s.th}>Status</th><th style={s.th}></th></tr></thead>
                <tbody>{imoveis.map(im=><tr key={im.id}>
                  <td style={s.td}><span style={{fontFamily:"monospace",color:"#818cf8",fontWeight:700}}>{im.codigo}</span></td>
                  <td style={{...s.td,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{im.endereco}</td>
                  <td style={s.td}>{im.bairro}</td>
                  <td style={s.td}>{im.tipo}</td>
                  <td style={s.td}>{im.area?`${im.area}m²`:"—"}</td>
                  <td style={s.td}>{im.totalContratos||0}</td>
                  <td style={s.td}><Badge label={im.statusAtual||"Sem contrato"}/></td>
                  <td style={s.td}><div style={{display:"flex",gap:6}}>
                    <button style={s.btnGhost} onClick={()=>{setTab("contratos");}}>Contratos</button>
                    {isAdmin&&<><button style={s.btnGhost} onClick={()=>{setFormImovel({...im,area:String(im.area||"")});setModalImovel(im.id);}}>✎</button>
                    <button style={{...s.btnGhost,color:"#ef4444",borderColor:"#ef444430"}} onClick={async()=>{if(!confirm("Excluir?"))return;await api.deleteImovel(im.id);setImoveis(p=>p.filter(i=>i.id!==im.id));}}>✕</button></>}
                  </div></td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* CONTRATOS */}
        {tab==="contratos"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div><h2 style={{fontWeight:800,fontSize:24,margin:0}}>Contratos</h2><p style={{color:"#475569",fontSize:14,marginTop:4}}>Histórico de contratos por imóvel</p></div>
              {isAdmin&&<button style={s.btn()} onClick={()=>{setFormContrato(emptyContrato);setContratoFile(null);setModalContrato("new");}}>+ Novo Contrato</button>}
            </div>
            <div style={s.card}>
              <table><thead><tr><th style={s.th}>Imóvel</th><th style={s.th}>Locatário</th><th style={s.th}>Locador</th><th style={s.th}>Al. Inicial</th><th style={s.th}>Al. Atual</th><th style={s.th}>Início</th><th style={s.th}>Fim</th><th style={s.th}>Status</th><th style={s.th}></th></tr></thead>
                <tbody>{contratos.map(c=><tr key={c.id}>
                  <td style={s.td}><span style={{fontFamily:"monospace",color:"#818cf8",fontWeight:700}}>{c.codigo}</span></td>
                  <td style={s.td}>{c.locatario}</td>
                  <td style={s.td}>{c.locador}</td>
                  <td style={{...s.td,fontFamily:"monospace"}}>{fmt(c.aluguelInicial)}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:Number(c.aluguelAtual)>Number(c.aluguelInicial)?"#22c55e":"#e2e8f0"}}>{fmt(c.aluguelAtual)}</td>
                  <td style={s.td}>{fmtDate(c.inicio)}</td>
                  <td style={{...s.td,color:c.fim&&new Date(c.fim)<new Date()?"#ef4444":"#64748b",fontSize:12}}>{fmtDate(c.fim)}</td>
                  <td style={s.td}><Badge label={c.status}/></td>
                  <td style={s.td}><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    <button style={s.btnGhost} onClick={()=>setDetalheContrato(c)}>Ver</button>
                    <button style={{...s.btnGhost,color:"#818cf8",borderColor:"#6366f130"}} onClick={()=>openParcelas(c.id)}>Parcelas</button>
                    <button style={{...s.btnGhost,color:"#f59e0b",borderColor:"#f59e0b30"}} onClick={()=>{setFormReajuste({...emptyReajuste,valorAnterior:c.aluguelAtual});setModalReajuste(c.id);}}>Reajuste</button>
                    {isAdmin&&<button style={s.btnGhost} onClick={()=>{setFormContrato({...c,aluguelInicial:String(c.aluguelInicial),aluguelAtual:String(c.aluguelAtual),condominio:String(c.condominio||0),iptu:String(c.iptu||0),taxaAdmPct:String(c.taxaAdmPct),vencimento:String(c.vencimento),duracaoMeses:String(c.duracaoMeses||""),imovelId:String(c.imovelId)});setContratoFile(null);setModalContrato(c.id);}}>✎</button>}
                  </div></td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* DESPESAS */}
        {tab==="despesas"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div><h2 style={{fontWeight:800,fontSize:24,margin:0}}>Despesas</h2></div>
              <button style={s.btn("#f59e0b")} onClick={()=>{setFormDespesa(emptyDespesa);setModalDespesa("new");}}>+ Registrar</button>
            </div>
            <div style={s.card}>
              <table><thead><tr><th style={s.th}>Contrato</th><th style={s.th}>Data</th><th style={s.th}>Tipo</th><th style={s.th}>Descrição</th><th style={s.th}>Valor</th><th style={s.th}>Status</th><th style={s.th}></th></tr></thead>
                <tbody>{despesas.map(d=><tr key={d.id}>
                  <td style={s.td}><span style={{fontFamily:"monospace",color:"#818cf8"}}>{d.codigo}</span><span style={{color:"#64748b",marginLeft:6,fontSize:12}}>{d.locatario}</span></td>
                  <td style={s.td}>{fmtDate(d.data)}</td><td style={s.td}>{d.tipo}</td><td style={s.td}>{d.descricao}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:"#f59e0b"}}>{fmt(d.valor)}</td>
                  <td style={s.td}><Badge label={d.status}/></td>
                  <td style={s.td}><div style={{display:"flex",gap:6}}>
                    <button style={s.btnGhost} onClick={()=>{setFormDespesa({...d,contratoId:String(d.contratoId),valor:String(d.valor)});setModalDespesa(d.id);}}>✎</button>
                    {isAdmin&&<button style={{...s.btnGhost,color:"#ef4444",borderColor:"#ef444430"}} onClick={async()=>{await api.deleteDespesa(d.id);setDespesas(p=>p.filter(x=>x.id!==d.id));}}>✕</button>}
                  </div></td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPASSES */}
        {tab==="repasses"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div><h2 style={{fontWeight:800,fontSize:24,margin:0}}>Repasses</h2></div>
              {isAdmin&&<button style={s.btn("#06b6d4")} onClick={()=>{setFormRepasse(emptyRepasse);setModalRepasse("new");}}>+ Gerar Repasse</button>}
            </div>
            <div style={s.card}>
              <table><thead><tr><th style={s.th}>Contrato</th><th style={s.th}>Competência</th><th style={s.th}>Recebido</th><th style={s.th}>Despesas</th><th style={s.th}>Taxa</th><th style={s.th}>Líquido</th><th style={s.th}>Pagamento</th><th style={s.th}>Status</th><th style={s.th}></th></tr></thead>
                <tbody>{repasses.map(r=><tr key={r.id}>
                  <td style={s.td}><span style={{fontFamily:"monospace",color:"#818cf8"}}>{r.codigo}</span></td>
                  <td style={s.td}>{r.competencia}</td>
                  <td style={{...s.td,fontFamily:"monospace"}}>{fmt(r.valorRecebido)}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:"#f59e0b"}}>{fmt(r.totalDespesas)}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:"#f59e0b"}}>{fmt(r.taxaAdm)}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:"#22c55e",fontWeight:700}}>{fmt(r.valorLiquido)}</td>
                  <td style={s.td}>{r.formaPagamento}</td>
                  <td style={s.td}><Badge label={r.status}/></td>
                  <td style={s.td}><div style={{display:"flex",gap:6}}>
                    {r.status!=="Repassado"&&isAdmin&&(
                      <button style={s.btn("#22c55e")} onClick={()=>{setRepasseId(r.id);setComprovanteFile(null);}}>Marcar Repassado</button>
                    )}
                    {r.comprovanteNome&&<button style={s.btnGhost} onClick={async()=>{try{const{url}=await api.getComprovanteUrl(r.id);window.open(url,"_blank");}catch(e){showToast(e.message,"error");}}}>Comprovante</button>}
                  </div></td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* RELATÓRIO */}
        {tab==="relatorio"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
              <div><h2 style={{fontWeight:800,fontSize:24,margin:0}}>Relatório Financeiro</h2></div>
              {relGerado&&dadosRelatorio?.length>0&&<button style={s.btn()} onClick={()=>{const w=window.open("","_blank");w.document.write(`<html><head><title>Relatório</title><style>body{font-family:sans-serif;padding:32px;color:#1a202c}table{width:100%;border-collapse:collapse;font-size:13px;margin:12px 0}th{background:#f1f5f9;padding:7px 10px;text-align:left}td{padding:7px 10px;border-bottom:1px solid #e2e8f0}</style></head><body>${printRef.current?.innerHTML||""}</body></html>`);w.document.close();setTimeout(()=>w.print(),400);}}>⎙ Imprimir</button>}
            </div>
            <div style={{...s.card,display:"flex",gap:14,alignItems:"flex-end",flexWrap:"wrap"}}>
              <div style={{flex:2,minWidth:160}}><label style={LS}>Locador *</label>
                <select style={IS} value={relLocador} onChange={e=>{setRelLocador(e.target.value);setRelGerado(false);}}>
                  <option value="">Selecione...</option>{locadoresUnicos.map(l=><option key={l}>{l}</option>)}
                </select></div>
              <div style={{flex:1,minWidth:130}}><label style={LS}>De</label><input style={IS} type="month" value={relMesInicio} onChange={e=>{setRelMesInicio(e.target.value);setRelGerado(false);}}/></div>
              <div style={{flex:1,minWidth:130}}><label style={LS}>Até</label><input style={IS} type="month" value={relMesFim} onChange={e=>{setRelMesFim(e.target.value);setRelGerado(false);}}/></div>
              <button style={{...s.btn(),opacity:relLocador?1:0.4}} disabled={!relLocador} onClick={()=>setRelGerado(true)}>Gerar</button>
            </div>
            {relGerado&&dadosRelatorio&&(
              dadosRelatorio.length===0?<div style={{...s.card,textAlign:"center",color:"#64748b",padding:40}}>Nenhum dado encontrado.</div>:
              <div ref={printRef}>
                <div style={{...s.card,borderLeft:"4px solid #6366f1"}}>
                  <div style={{fontSize:11,color:"#6366f1",fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Relatório Financeiro ao Locador</div>
                  <div style={{fontSize:20,fontWeight:800,marginTop:4}}>{relLocador}</div>
                  <div style={{fontSize:13,color:"#64748b",marginTop:2}}>{relMesInicio||relMesFim?`${relMesInicio||"início"} até ${relMesFim||"fim"}`:"Todos os registros"} · Emitido em {new Date().toLocaleDateString("pt-BR")}</div>
                </div>
                {dadosRelatorio.map(({c,parcs,desps,reps,totalRec,totalDesp,totalRep})=>(
                  <div key={c.id} style={s.card}>
                    <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>{c.codigo} — {c.endereco}</div>
                    <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>Locatário: {c.locatario} · Aluguel atual: {fmt(c.aluguelAtual)}</div>
                    {[
                      {label:"Parcelas",rows:parcs,cols:["Competência","Vencimento","Valor","Recebido","Status"],render:p=>[p.competencia,fmtDate(p.vencimento),fmt(p.valor),fmt(p.valorRecebido),<Badge label={p.status}/>]},
                      {label:"Despesas",rows:desps,cols:["Data","Tipo","Descrição","Valor"],render:d=>[fmtDate(d.data),d.tipo,d.descricao,fmt(d.valor)]},
                      {label:"Repasses",rows:reps,cols:["Competência","Recebido","Despesas","Taxa","Líquido","Pagamento"],render:r=>[r.competencia,fmt(r.valorRecebido),fmt(r.totalDespesas),fmt(r.taxaAdm),fmt(r.valorLiquido),r.formaPagamento]},
                    ].map(sec=>(
                      <div key={sec.label} style={{marginBottom:14}}>
                        <div style={{fontSize:11,fontWeight:700,color:"#6366f1",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{sec.label}</div>
                        {sec.rows.length===0?<div style={{color:"#475569",fontSize:13}}>Nenhum registro</div>:
                        <table><thead><tr>{sec.cols.map(col=><th key={col} style={s.th}>{col}</th>)}</tr></thead>
                          <tbody>{sec.rows.map((row,i)=><tr key={i}>{sec.render(row).map((cell,j)=><td key={j} style={s.td}>{cell}</td>)}</tr>)}</tbody>
                        </table>}
                      </div>
                    ))}
                    <div style={{background:"#0f1623",borderRadius:8,padding:14,border:"1px solid #2d3748",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                      {[["Total recebido",fmt(totalRec),"#22c55e"],["Total despesas",fmt(totalDesp),"#f59e0b"],["Total repassado",fmt(totalRep),"#818cf8"]].map(([k,v,c])=>(
                        <div key={k}><div style={{fontSize:11,color:"#64748b"}}>{k}</div><div style={{fontFamily:"monospace",color:c,fontWeight:700,fontSize:15}}>{v}</div></div>
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
            <h2 style={{fontWeight:800,fontSize:24,marginBottom:20}}>Usuários</h2>
            {usuarios.filter(u=>!u.aprovado).length>0&&(
              <div style={{background:"#f59e0b15",border:"1px solid #f59e0b40",borderRadius:14,padding:16,marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:700,color:"#f59e0b",marginBottom:12}}>⏳ Aguardando aprovação ({usuarios.filter(u=>!u.aprovado).length})</div>
                {usuarios.filter(u=>!u.aprovado).map(u=>(
                  <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #1e2940"}}>
                    <div><div style={{fontSize:14,fontWeight:600}}>{u.nome}</div><div style={{fontSize:12,color:"#64748b"}}>{u.email}</div></div>
                    <div style={{display:"flex",gap:8}}>
                      <button style={s.btn("#22c55e")} onClick={async()=>{const up=await api.updateUsuario(u.id,{nome:u.nome,role:u.role,ativo:true,aprovado:true});setUsuarios(p=>p.map(x=>x.id===u.id?up:x));showToast("Aprovado!");}}>✓ Aprovar</button>
                      <button style={s.btn("#ef4444")} onClick={async()=>{if(!confirm("Rejeitar?"))return;await api.deleteUsuario(u.id);setUsuarios(p=>p.filter(x=>x.id!==u.id));showToast("Rejeitado");}}>✕ Rejeitar</button>
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
                    <td style={s.td}>{u.id!==user.id&&<div style={{display:"flex",gap:6}}>
                      <button style={s.btnGhost} onClick={async()=>{const up=await api.updateUsuario(u.id,{nome:u.nome,role:u.role==="admin"?"usuario":"admin",ativo:u.ativo,aprovado:u.aprovado});setUsuarios(p=>p.map(x=>x.id===u.id?up:x));}}>
                        {u.role==="admin"?"→ Usuário":"→ Admin"}
                      </button>
                      <button style={s.btnGhost} onClick={async()=>{const up=await api.updateUsuario(u.id,{nome:u.nome,role:u.role,ativo:!u.ativo,aprovado:u.aprovado});setUsuarios(p=>p.map(x=>x.id===u.id?up:x));}}>{u.ativo?"Desativar":"Ativar"}</button>
                    </div>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL IMÓVEL */}
      {modalImovel&&(
        <Modal title={modalImovel==="new"?"Novo Imóvel":"Editar Imóvel"} onClose={()=>setModalImovel(null)}>
          <R><F label="Código *" h><input style={IS} value={formImovel.codigo} onChange={e=>setFormImovel(p=>({...p,codigo:e.target.value}))} placeholder="AP-001"/></F>
          <F label="Tipo" h><select style={IS} value={formImovel.tipo} onChange={e=>setFormImovel(p=>({...p,tipo:e.target.value}))}>{["Apartamento","Casa","Comercial","Sala","Galpão","Terreno"].map(t=><option key={t}>{t}</option>)}</select></F></R>
          <F label="Endereço *"><input style={IS} value={formImovel.endereco} onChange={e=>setFormImovel(p=>({...p,endereco:e.target.value}))}/></F>
          <R><F label="Bairro" h><input style={IS} value={formImovel.bairro} onChange={e=>setFormImovel(p=>({...p,bairro:e.target.value}))}/></F>
          <F label="Área (m²)" h><input style={IS} type="number" value={formImovel.area} onChange={e=>setFormImovel(p=>({...p,area:e.target.value}))}/></F></R>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <button style={s.btnGhost} onClick={()=>setModalImovel(null)}>Cancelar</button>
            <button style={s.btn()} onClick={saveImovel}>Salvar</button>
          </div>
        </Modal>
      )}

      {/* MODAL CONTRATO */}
      {modalContrato&&(
        <Modal title={modalContrato==="new"?"Novo Contrato":"Editar Contrato"} onClose={()=>setModalContrato(null)} wide>
          <ST>Imóvel</ST>
          <F label="Imóvel *"><select style={IS} value={formContrato.imovelId} onChange={e=>setFormContrato(p=>({...p,imovelId:e.target.value}))}>
            <option value="">Selecione...</option>{imoveis.map(im=><option key={im.id} value={im.id}>{im.codigo} — {im.endereco}</option>)}
          </select></F>

          <ST>Partes</ST>
          <R>
            <F label="Locatário *" h><input style={IS} value={formContrato.locatario} onChange={e=>setFormContrato(p=>({...p,locatario:e.target.value}))}/></F>
            <F label="Tel. Locatário" h><input style={IS} value={formContrato.telefoneLocatario} onChange={e=>setFormContrato(p=>({...p,telefoneLocatario:e.target.value}))}/></F>
            <F label="Locador *" h><input style={IS} value={formContrato.locador} onChange={e=>setFormContrato(p=>({...p,locador:e.target.value}))}/></F>
            <F label="Tel. Locador" h><input style={IS} value={formContrato.telefoneLocador} onChange={e=>setFormContrato(p=>({...p,telefoneLocador:e.target.value}))}/></F>
          </R>

          <ST>Valores e Responsabilidades</ST>
          <R>
            <PF label="Aluguel Inicial (R$) *" vk="aluguelInicial" pk="aluguelPagaPor" form={formContrato} set={setFormContrato}/>
            <PF label="Condomínio (R$)" vk="condominio" pk="condominioPagaPor" form={formContrato} set={setFormContrato}/>
            <PF label="IPTU (R$)" vk="iptu" pk="iptuPagaPor" form={formContrato} set={setFormContrato}/>
          </R>
          <R>
            <F label="Taxa Adm (%)" h>
              <input style={IS} type="number" value={formContrato.taxaAdmPct} onChange={e=>setFormContrato(p=>({...p,taxaAdmPct:e.target.value}))}/>
              {formContrato.aluguelInicial&&<div style={{fontSize:11,color:"#6366f1",marginTop:3}}>= {fmt((+formContrato.aluguelInicial*+formContrato.taxaAdmPct)/100)} / mês</div>}
            </F>
            <F label="Dia Vencimento" h><input style={IS} type="number" min="1" max="31" value={formContrato.vencimento} onChange={e=>setFormContrato(p=>({...p,vencimento:e.target.value}))}/></F>
            <F label="Forma de Pagamento" h><select style={IS} value={formContrato.formaPagamento} onChange={e=>setFormContrato(p=>({...p,formaPagamento:e.target.value}))}>{fpOpts.map(o=><option key={o}>{o}</option>)}</select></F>
          </R>

          <ST>Prazo do Contrato</ST>
          <R>
            <F label="Início *" h><input style={IS} type="date" value={formContrato.inicio} onChange={e=>setFormContrato(p=>({...p,inicio:e.target.value}))}/></F>
            <F label="Duração (meses) *" h><input style={IS} type="number" value={formContrato.duracaoMeses} onChange={e=>setFormContrato(p=>({...p,duracaoMeses:e.target.value}))} placeholder="Ex: 30"/></F>
            {formContrato.inicio&&formContrato.duracaoMeses&&(
              <F label="Término previsto" h>
                <input style={{...IS,color:"#94a3b8"}} readOnly value={()=>{const d=new Date(formContrato.inicio);d.setMonth(d.getMonth()+ +formContrato.duracaoMeses);return d.toLocaleDateString("pt-BR");}()}/>
              </F>
            )}
            <F label="Status" h><select style={IS} value={formContrato.status} onChange={e=>setFormContrato(p=>({...p,status:e.target.value}))}>{["Ativo","Encerrado","Inativo"].map(t=><option key={t}>{t}</option>)}</select></F>
          </R>

          <ST>Penalidades e Honorários</ST>
          <R>
            <F label="Multa rescisão (3 alu. prop.)" h>
              <input style={{...IS,color:"#94a3b8"}} readOnly value={fmt(calcMulRescisao({...formContrato,aluguelAtual:formContrato.aluguelInicial}))}/>
              <div style={{fontSize:11,color:"#475569",marginTop:3}}>Calculada automaticamente</div>
            </F>
            <F label="Multa atraso (%)" h><input style={IS} type="number" value={formContrato.multaAtrasoPct} onChange={e=>setFormContrato(p=>({...p,multaAtrasoPct:e.target.value}))}/></F>
            <F label="Juros atraso (% a.m.)" h><input style={IS} type="number" value={formContrato.jurosAtrasoPct} onChange={e=>setFormContrato(p=>({...p,jurosAtrasoPct:e.target.value}))}/></F>
            <F label="Honorários cobrança (%)" h><input style={IS} type="number" value={formContrato.honorariosPct} onChange={e=>setFormContrato(p=>({...p,honorariosPct:e.target.value}))}/></F>
            <F label="Após quantos dias" h><input style={IS} type="number" value={formContrato.honorariosDias} onChange={e=>setFormContrato(p=>({...p,honorariosDias:e.target.value}))}/></F>
            <F label="Honorários advogado (%)" h><input style={IS} type="number" value={formContrato.honorariosAdvPct} onChange={e=>setFormContrato(p=>({...p,honorariosAdvPct:e.target.value}))}/></F>
            <F label="Após quantos dias" h><input style={IS} type="number" value={formContrato.honorariosAdvDias} onChange={e=>setFormContrato(p=>({...p,honorariosAdvDias:e.target.value}))}/></F>
          </R>

          <ST>Contrato PDF</ST>
          <F label="Upload do contrato">
            <input style={IS} type="file" accept=".pdf" onChange={e=>setContratoFile(e.target.files[0])}/>
          </F>

          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:12}}>
            <button style={s.btnGhost} onClick={()=>setModalContrato(null)}>Cancelar</button>
            <button style={s.btn()} onClick={saveContrato}>Salvar e Gerar Parcelas</button>
          </div>
        </Modal>
      )}

      {/* MODAL PARCELAS */}
      {modalParcelas&&(
        <Modal title="Parcelas do Contrato" onClose={()=>{setModalParcelas(null);setParcelas([]);setParcelaEdit(null);}} wide>
          <div style={{marginBottom:14,display:"flex",gap:8,justifyContent:"flex-end"}}>
            {[{label:"Todas",v:null},{label:"Pendentes",v:"Pendente"},{label:"Pagas",v:"Pago"},{label:"Atrasadas",v:"Atrasado"}].map(f=>(
              <button key={f.label} style={s.btnGhost} onClick={()=>{}}>{f.label}</button>
            ))}
          </div>
          <div style={{maxHeight:400,overflowY:"auto"}}>
            <table><thead><tr><th style={s.th}>Competência</th><th style={s.th}>Vencimento</th><th style={s.th}>Valor</th><th style={s.th}>Recebido</th><th style={s.th}>Data Rec.</th><th style={s.th}>Status</th><th style={s.th}></th></tr></thead>
              <tbody>{parcelas.map(p=>(
                <tr key={p.id} style={{background:parcelaEdit?.id===p.id?"#6366f108":"transparent"}}>
                  <td style={s.td}>{p.competencia}</td>
                  <td style={{...s.td,color:p.status==="Atrasado"?"#ef4444":"#cbd5e1"}}>{fmtDate(p.vencimento)}</td>
                  <td style={{...s.td,fontFamily:"monospace"}}>
                    {parcelaEdit?.id===p.id?<input style={{...IS,width:100}} type="number" value={parcelaEdit.valor} onChange={e=>setParcelaEdit(x=>({...x,valor:e.target.value}))}/>:fmt(p.valor)}
                  </td>
                  <td style={{...s.td,fontFamily:"monospace",color:"#22c55e"}}>
                    {parcelaEdit?.id===p.id?<input style={{...IS,width:100}} type="number" value={parcelaEdit.valorRecebido||""} onChange={e=>setParcelaEdit(x=>({...x,valorRecebido:e.target.value}))} placeholder="0"/>:fmt(p.valorRecebido||0)}
                  </td>
                  <td style={s.td}>
                    {parcelaEdit?.id===p.id?<input style={{...IS,width:130}} type="date" value={parcelaEdit.dataRecebimento||""} onChange={e=>setParcelaEdit(x=>({...x,dataRecebimento:e.target.value}))}/>:fmtDate(p.dataRecebimento)}
                  </td>
                  <td style={s.td}>
                    {parcelaEdit?.id===p.id?<select style={{...IS,width:110}} value={parcelaEdit.status} onChange={e=>setParcelaEdit(x=>({...x,status:e.target.value}))}>{["Pendente","Pago","Atrasado"].map(st=><option key={st}>{st}</option>)}</select>:<Badge label={p.status}/>}
                  </td>
                  <td style={s.td}>
                    {parcelaEdit?.id===p.id?(
                      <div style={{display:"flex",gap:4}}>
                        <button style={s.btn("#22c55e")} onClick={saveParcela}>✓</button>
                        <button style={s.btnGhost} onClick={()=>setParcelaEdit(null)}>✕</button>
                      </div>
                    ):<button style={s.btnGhost} onClick={()=>setParcelaEdit({...p,valor:String(p.valor),valorRecebido:String(p.valorRecebido||""),dataRecebimento:p.dataRecebimento?.slice(0,10)||""})}>✎</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          {/* Reajustes */}
          <ST>Histórico de Reajustes</ST>
          {reajustes.length===0?<div style={{color:"#475569",fontSize:13,marginBottom:12}}>Nenhum reajuste registrado</div>:
          <table><thead><tr><th style={s.th}>Data</th><th style={s.th}>Índice</th><th style={s.th}>Período</th><th style={s.th}>Valor Anterior</th><th style={s.th}>%</th><th style={s.th}>Valor Novo</th></tr></thead>
            <tbody>{reajustes.map(r=><tr key={r.id}>
              <td style={s.td}>{fmtDate(r.dataReajuste)}</td><td style={s.td}>{r.indice}</td>
              <td style={s.td}>{fmtDate(r.periodoInicio)} a {fmtDate(r.periodoFim)}</td>
              <td style={{...s.td,fontFamily:"monospace"}}>{fmt(r.valorAnterior)}</td>
              <td style={{...s.td,color:"#22c55e"}}>{r.percentual}%</td>
              <td style={{...s.td,fontFamily:"monospace",fontWeight:700}}>{fmt(r.valorNovo)}</td>
            </tr>)}</tbody>
          </table>}
        </Modal>
      )}

      {/* MODAL REAJUSTE */}
      {modalReajuste&&(
        <Modal title="Registrar Reajuste Anual" onClose={()=>setModalReajuste(null)}>
          <R>
            <F label="Data do reajuste *" h><input style={IS} type="date" value={formReajuste.dataReajuste} onChange={e=>setFormReajuste(p=>({...p,dataReajuste:e.target.value}))}/></F>
            <F label="Índice" h><select style={IS} value={formReajuste.indice} onChange={e=>setFormReajuste(p=>({...p,indice:e.target.value}))}>{indiceOpts.map(o=><option key={o}>{o}</option>)}</select></F>
            <F label="Período de apuração — De" h><input style={IS} type="date" value={formReajuste.periodoInicio} onChange={e=>setFormReajuste(p=>({...p,periodoInicio:e.target.value}))}/></F>
            <F label="Período de apuração — Até" h><input style={IS} type="date" value={formReajuste.periodoFim} onChange={e=>setFormReajuste(p=>({...p,periodoFim:e.target.value}))}/></F>
            <F label="Valor anterior (R$)" h>
              <input style={IS} type="number" value={formReajuste.valorAnterior} onChange={e=>{const va=+e.target.value;const vn=va+(va*+formReajuste.percentual/100);setFormReajuste(p=>({...p,valorAnterior:e.target.value,valorNovo:vn.toFixed(2)}))}}/></F>
            <F label="Percentual do índice (%)" h>
              <input style={IS} type="number" value={formReajuste.percentual} onChange={e=>{const pct=+e.target.value;const vn=+formReajuste.valorAnterior+(+formReajuste.valorAnterior*pct/100);setFormReajuste(p=>({...p,percentual:e.target.value,valorNovo:vn.toFixed(2)}))}}/></F>
            <F label="Valor novo (R$) *" h>
              <input style={IS} type="number" value={formReajuste.valorNovo} onChange={e=>setFormReajuste(p=>({...p,valorNovo:e.target.value}))}/>
              {formReajuste.valorAnterior&&formReajuste.valorNovo&&<div style={{fontSize:11,color:"#22c55e",marginTop:3}}>Diferença: {fmt(+formReajuste.valorNovo - +formReajuste.valorAnterior)}/mês</div>}
            </F>
          </R>
          <F label="Observação"><input style={IS} value={formReajuste.obs} onChange={e=>setFormReajuste(p=>({...p,obs:e.target.value}))}/></F>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <button style={s.btnGhost} onClick={()=>setModalReajuste(null)}>Cancelar</button>
            <button style={s.btn("#22c55e")} onClick={saveReajuste}>Salvar Reajuste</button>
          </div>
        </Modal>
      )}

      {/* MODAL REPASSE */}
      {modalRepasse&&(
        <Modal title="Gerar Repasse ao Locador" onClose={()=>setModalRepasse(null)}>
          <F label="Contrato *"><select style={IS} value={formRepasse.contratoId} onChange={e=>{setFormRepasse(p=>({...p,contratoId:e.target.value}));onContratoRepasse(e.target.value);}}>
            <option value="">Selecione...</option>{contratos.filter(c=>c.status==="Ativo").map(c=><option key={c.id} value={c.id}>{c.codigo} — {c.locador}</option>)}
          </select></F>
          <R>
            <F label="Competência *" h><input style={IS} value={formRepasse.competencia} onChange={e=>setFormRepasse(p=>({...p,competencia:e.target.value}))} placeholder="Ex: Maio/2025"/></F>
            <F label="Data do repasse" h><input style={IS} type="date" value={formRepasse.dataRepasse} onChange={e=>setFormRepasse(p=>({...p,dataRepasse:e.target.value}))}/></F>
          </R>
          {formRepasse.contratoId&&(
            <div style={{background:"#0f1623",borderRadius:10,padding:16,marginBottom:14,border:"1px solid #2d3748"}}>
              <div style={{fontSize:12,color:"#6366f1",fontWeight:700,marginBottom:10}}>ACERTO DO MÊS — edite se necessário</div>
              <R>
                <F label="Valor recebido (R$)" h><input style={IS} type="number" value={formRepasse.valorRecebido} onChange={e=>setFormRepasse(p=>({...p,valorRecebido:e.target.value,valorLiquido:(+e.target.value - +p.totalDespesas - +p.taxaAdm).toFixed(2)}))}/></F>
                <F label="Total despesas (R$)" h><input style={IS} type="number" value={formRepasse.totalDespesas} onChange={e=>setFormRepasse(p=>({...p,totalDespesas:e.target.value,valorLiquido:(+p.valorRecebido - +e.target.value - +p.taxaAdm).toFixed(2)}))}/></F>
                <F label="Taxa adm (R$)" h><input style={IS} type="number" value={formRepasse.taxaAdm} onChange={e=>setFormRepasse(p=>({...p,taxaAdm:e.target.value,valorLiquido:(+p.valorRecebido - +p.totalDespesas - +e.target.value).toFixed(2)}))}/></F>
                <F label="Valor líquido (R$)" h>
                  <input style={{...IS,color:"#22c55e",fontWeight:700}} type="number" value={formRepasse.valorLiquido} onChange={e=>setFormRepasse(p=>({...p,valorLiquido:e.target.value}))}/>
                </F>
              </R>
            </div>
          )}
          <R>
            <F label="Forma de pagamento" h><select style={IS} value={formRepasse.formaPagamento} onChange={e=>setFormRepasse(p=>({...p,formaPagamento:e.target.value}))}>{fpOpts.map(o=><option key={o}>{o}</option>)}</select></F>
            <F label="Status" h><select style={IS} value={formRepasse.status} onChange={e=>setFormRepasse(p=>({...p,status:e.target.value}))}>{["Pendente","Repassado"].map(t=><option key={t}>{t}</option>)}</select></F>
          </R>
          <F label="Comprovante (PDF/imagem)"><input style={IS} type="file" accept=".pdf,image/*" onChange={e=>setComprovanteFile(e.target.files[0])}/></F>
          <F label="Observação"><input style={IS} value={formRepasse.obs} onChange={e=>setFormRepasse(p=>({...p,obs:e.target.value}))}/></F>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <button style={s.btnGhost} onClick={()=>setModalRepasse(null)}>Cancelar</button>
            <button style={s.btn("#06b6d4")} onClick={saveRepasse}>Confirmar Repasse</button>
          </div>
        </Modal>
      )}

      {/* MODAL DESPESA */}
      {modalDespesa&&(
        <Modal title={modalDespesa==="new"?"Registrar Despesa":"Editar Despesa"} onClose={()=>setModalDespesa(null)}>
          <F label="Contrato *"><select style={IS} value={formDespesa.contratoId} onChange={e=>setFormDespesa(p=>({...p,contratoId:e.target.value}))}>
            <option value="">Selecione...</option>{contratos.map(c=><option key={c.id} value={c.id}>{c.codigo} — {c.locatario}</option>)}
          </select></F>
          <R>
            <F label="Data *" h><input style={IS} type="date" value={formDespesa.data} onChange={e=>setFormDespesa(p=>({...p,data:e.target.value}))}/></F>
            <F label="Valor (R$) *" h><input style={IS} type="number" value={formDespesa.valor} onChange={e=>setFormDespesa(p=>({...p,valor:e.target.value}))}/></F>
            <F label="Tipo" h><select style={IS} value={formDespesa.tipo} onChange={e=>setFormDespesa(p=>({...p,tipo:e.target.value}))}>{["Manutenção","Condomínio","IPTU","Seguro","Pintura","Elétrica","Hidráulica","Outros"].map(t=><option key={t}>{t}</option>)}</select></F>
            <F label="Status" h><select style={IS} value={formDespesa.status} onChange={e=>setFormDespesa(p=>({...p,status:e.target.value}))}>{["Pago","Pendente"].map(t=><option key={t}>{t}</option>)}</select></F>
          </R>
          <F label="Descrição"><input style={IS} value={formDespesa.descricao} onChange={e=>setFormDespesa(p=>({...p,descricao:e.target.value}))}/></F>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <button style={s.btnGhost} onClick={()=>setModalDespesa(null)}>Cancelar</button>
            <button style={s.btn("#f59e0b")} onClick={saveDespesa}>Salvar</button>
          </div>
        </Modal>
      )}

      {/* MODAL COMPROVANTE */}
      {repasseId&&(
        <Modal title="Anexar Comprovante e Marcar Repassado" onClose={()=>setRepasseId(null)}>
          <F label="Comprovante (PDF ou imagem)">
            <input style={IS} type="file" accept=".pdf,image/*" onChange={e=>setComprovanteFile(e.target.files[0])}/>
          </F>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <button style={s.btnGhost} onClick={()=>setRepasseId(null)}>Cancelar</button>
            <button style={s.btn("#22c55e")} onClick={()=>uploadComprovante(repasseId)}>Confirmar Repasse</button>
          </div>
        </Modal>
      )}

      {/* DETALHE CONTRATO */}
      {detalheContrato&&(
        <Modal title={`Contrato — ${detalheContrato.codigo}`} onClose={()=>setDetalheContrato(null)} wide>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 24px"}}>
            {[
              ["Imóvel",`${detalheContrato.codigo} — ${detalheContrato.endereco}`],
              ["Locatário",detalheContrato.locatario],["Tel. Locatário",detalheContrato.telefoneLocatario],
              ["Locador",detalheContrato.locador],["Tel. Locador",detalheContrato.telefoneLocador],
              ["Aluguel Inicial",fmt(detalheContrato.aluguelInicial)],
              ["Aluguel Atual",fmt(detalheContrato.aluguelAtual)],
              ["Pago por",detalheContrato.aluguelPagaPor],
              ["Condomínio",`${fmt(detalheContrato.condominio)} (${detalheContrato.condominioPagaPor})`],
              ["IPTU",`${fmt(detalheContrato.iptu)} (${detalheContrato.iptuPagaPor})`],
              ["Taxa Adm",`${detalheContrato.taxaAdmPct}% = ${fmt((Number(detalheContrato.aluguelAtual)*Number(detalheContrato.taxaAdmPct))/100)}/mês`],
              ["Vencimento",`Dia ${detalheContrato.vencimento}`],
              ["Forma Pagamento",detalheContrato.formaPagamento],
              ["Início",fmtDate(detalheContrato.inicio)],
              ["Duração",`${detalheContrato.duracaoMeses} meses`],
              ["Término",fmtDate(detalheContrato.fim)],
              ["Status",detalheContrato.status],
              ["Multa rescisão",fmt(calcMulRescisao(detalheContrato))+" (proporcional)"],
              ["Multa atraso",`${detalheContrato.multaAtrasoPct||0}%`],
              ["Juros atraso",`${detalheContrato.jurosAtrasoPct||0}% a.m.`],
              ["Hon. cobrança",`${detalheContrato.honorariosPct||0}% após ${detalheContrato.honorariosDias||0} dias`],
              ["Hon. advogado",`${detalheContrato.honorariosAdvPct||0}% após ${detalheContrato.honorariosAdvDias||0} dias`],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #1e2940"}}>
                <span style={{color:"#64748b",fontSize:13}}>{k}</span>
                <span style={{fontSize:13,fontWeight:500,textAlign:"right",maxWidth:"55%"}}>{v||"—"}</span>
              </div>
            ))}
          </div>
          {detalheContrato.contratoPdfNome&&(
            <div style={{marginTop:14,padding:12,background:"#0f1623",borderRadius:8,border:"1px solid #2d3748",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,color:"#94a3b8"}}>📄 {detalheContrato.contratoPdfNome}</span>
              <button style={s.btn()} onClick={async()=>{try{const{url}=await api.getContratoPdfUrl(detalheContrato.id);window.open(url,"_blank");}catch(e){showToast(e.message,"error");}}}>Visualizar PDF</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
