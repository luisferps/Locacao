// v11
import { useState, useEffect, useMemo, useRef } from "react";
import { api } from "./api.js";
import Auth from "./Auth.jsx";

function fmt(v){ return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
function fmtDate(d){ return d ? new Date(d+"T12:00:00").toLocaleDateString("pt-BR") : "-"; }

const pagaOpts=["Locatário","Locador","ADM"];
const fpOpts=["Pix","Boleto bancário","Transferência"];
const indiceOpts=["IGPM","IPCA","INPC","IPC-A","Manual"];
const tiposDocImovel=[["contrato_adm","Contrato ADM"],["energia","Energia"],["agua","Água"],["gas","Gás"],["condominio","Condomínio"],["iptu","IPTU"],["outros","Outros"]];
const tiposDocPessoa=[["rg","RG"],["cpf","CPF"],["comprovante_renda","Comp. Renda"],["comprovante_endereco","Comp. Endereço"],["outros","Outros"]];
const statusColors={Ativo:"#22c55e",Inativo:"#94a3b8",Encerrado:"#64748b",Pago:"#22c55e",Pendente:"#f59e0b",Atrasado:"#ef4444",Repassado:"#6366f1"};
const IS={width:"100%",background:"#0f1623",border:"1px solid #2d3748",borderRadius:8,color:"#e2e8f0",padding:"8px 12px",fontSize:14,boxSizing:"border-box",outline:"none",fontFamily:"inherit"};
const LS={color:"#94a3b8",fontSize:12,fontWeight:600,display:"block",marginBottom:4};

function Badge({label}){
  return <span style={{background:(statusColors[label]||"#64748b")+"22",color:statusColors[label]||"#64748b",border:`1px solid ${(statusColors[label]||"#64748b")}44`,padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:600}}>{label}</span>;
}

function Modal({title,onClose,children,wide,zIdx}){
  return(
    <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:zIdx||1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:20,overflowY:"auto"}}>
      <div style={{background:"#1a1f2e",borderRadius:16,padding:28,width:"100%",maxWidth:wide?860:580,border:"1px solid #2d3748",boxShadow:"0 25px 60px #000a",margin:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{color:"#e2e8f0",fontWeight:700,fontSize:18,margin:0}}>{title}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#94a3b8",fontSize:22,cursor:"pointer"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function F({label,children,h}){return <div style={{marginBottom:14,flex:h?"1 1 45%":"1 1 100%"}}><label style={LS}>{label}</label>{children}</div>;}
function R({children}){return <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>{children}</div>;}
function ST({children}){return <div style={{fontSize:11,fontWeight:700,color:"#6366f1",textTransform:"uppercase",letterSpacing:2,margin:"18px 0 10px",paddingBottom:6,borderBottom:"1px solid #1e2940"}}>{children}</div>;}

function PF({label,vk,pk,form,set}){
  return(
    <div style={{marginBottom:14,flex:"1 1 45%"}}>
      <label style={LS}>{label}</label>
      <div style={{display:"flex",gap:6}}>
        <input style={{...IS,flex:1}} type="number" placeholder="R$" value={form[vk]||""} onChange={e=>set(p=>({...p,[vk]:e.target.value}))}/>
        <select style={{...IS,width:130}} value={form[pk]||"Locatário"} onChange={e=>set(p=>({...p,[pk]:e.target.value}))}>{pagaOpts.map(o=><option key={o}>{o}</option>)}</select>
      </div>
    </div>
  );
}

function QSelect({label,value,onChange,options,onAdd,h,getLabel}){
  return(
    <div style={{marginBottom:14,flex:h?"1 1 45%":"1 1 100%"}}>
      <label style={LS}>{label}</label>
      <div style={{display:"flex",gap:6}}>
        <select style={{...IS,flex:1}} value={value||""} onChange={e=>onChange(e.target.value)}>
          <option value="">Selecione...</option>
          {options.map(o=><option key={o.id} value={o.id}>{getLabel?getLabel(o):o.nome||o.codigo}</option>)}
        </select>
        {onAdd&&<button onClick={onAdd} style={{background:"#6366f120",border:"1px solid #6366f140",color:"#818cf8",borderRadius:8,padding:"0 14px",cursor:"pointer",fontSize:20,fontWeight:700,flexShrink:0}} title="Cadastrar novo">+</button>}
      </div>
    </div>
  );
}

function Toast({msg,type}){return <div style={{position:"fixed",bottom:24,right:24,zIndex:9999,background:type==="error"?"#ef4444":"#22c55e",color:"#fff",padding:"12px 20px",borderRadius:10,fontWeight:600,fontSize:14,boxShadow:"0 8px 24px #0008"}}>{msg}</div>;}

function BarChart({data}){
  if(!data?.length) return <div style={{color:"#475569",fontSize:13,textAlign:"center",padding:24}}>Sem dados ainda</div>;
  const max=Math.max(...data.map(d=>+d.recebido),1);
  return(
    <div style={{display:"flex",alignItems:"flex-end",gap:6,height:100}}>
      {data.map(d=>(
        <div key={d.mes} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          <div style={{fontSize:8,color:"#64748b"}}>{Number(d.recebido).toLocaleString("pt-BR",{notation:"compact"})}</div>
          <div style={{width:"100%",background:"#6366f1",borderRadius:"3px 3px 0 0",height:`${(+d.recebido/max)*70}px`,minHeight:3}}/>
          <div style={{fontSize:8,color:"#475569"}}>{d.mes?.slice(5)}/{d.mes?.slice(2,4)}</div>
        </div>
      ))}
    </div>
  );
}

function DocUploader({docs,onUpload,onView,onDelete,tipos,isAdmin}){
  const [tipo,setTipo]=useState(tipos[0][0]);
  const [file,setFile]=useState(null);
  return(
    <div>
      {isAdmin&&(
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div style={{flex:1,minWidth:150}}><label style={LS}>Tipo</label><select style={IS} value={tipo} onChange={e=>setTipo(e.target.value)}>{tipos.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
          <div style={{flex:2,minWidth:200}}><label style={LS}>Arquivo</label><input style={IS} type="file" accept=".pdf,image/*" onChange={e=>setFile(e.target.files[0])}/></div>
          <button style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:13}} onClick={()=>{if(file)onUpload(tipo,file,()=>setFile(null));}}>Enviar</button>
        </div>
      )}
      {docs.length===0?<div style={{color:"#475569",fontSize:13}}>Nenhum documento</div>:
      <div>{tipos.map(([t,l])=>{const ds=docs.filter(d=>d.tipo===t);if(!ds.length)return null;return(<div key={t}><div style={{fontSize:11,color:"#6366f1",fontWeight:700,textTransform:"uppercase",marginBottom:4,marginTop:8}}>{l}</div>{ds.map(doc=>(<div key={doc.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 12px",background:"#0f1623",borderRadius:8,border:"1px solid #2d3748",marginBottom:4}}><span style={{fontSize:12,color:"#94a3b8"}}>📄 {doc.nome}</span><div style={{display:"flex",gap:6}}><button style={{background:"transparent",color:"#94a3b8",border:"1px solid #2d3748",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}} onClick={()=>onView(doc.id)}>Ver</button>{isAdmin&&<button style={{background:"transparent",color:"#ef4444",border:"1px solid #ef444430",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}} onClick={()=>onDelete(doc.id)}>✕</button>}</div></div>))}</div>);})}</div>}
    </div>
  );
}

// ── Quick Add Modals ───────────────────────────────────────────────────────────
function QuickAddLocador({onSave,onClose}){
  const [f,setF]=useState({nome:"",cpfCnpj:"",telefone:"",email:"",pix:""});
  const u=p=>setF(x=>({...x,...p}));
  return(
    <Modal title="Novo Locador (rápido)" onClose={onClose} zIdx={1100}>
      <F label="Nome *"><input style={IS} value={f.nome} onChange={e=>u({nome:e.target.value})}/></F>
      <R>
        <F label="CPF/CNPJ" h><input style={IS} value={f.cpfCnpj||""} onChange={e=>u({cpfCnpj:e.target.value})}/></F>
        <F label="Telefone" h><input style={IS} value={f.telefone||""} onChange={e=>u({telefone:e.target.value})}/></F>
        <F label="Email" h><input style={IS} value={f.email||""} onChange={e=>u({email:e.target.value})}/></F>
        <F label="PIX" h><input style={IS} value={f.pix||""} onChange={e=>u({pix:e.target.value})}/></F>
      </R>
      <div style={{fontSize:12,color:"#475569",marginBottom:14}}>Complete os demais dados depois em Locadores.</div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <button style={{background:"transparent",color:"#94a3b8",border:"1px solid #2d3748",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontFamily:"inherit",fontWeight:500,fontSize:13}} onClick={onClose}>Cancelar</button>
        <button style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"inherit"}} onClick={()=>f.nome&&onSave(f)}>Salvar</button>
      </div>
    </Modal>
  );
}

function QuickAddLocatario({onSave,onClose}){
  const [f,setF]=useState({nome:"",cpf:"",telefone:"",email:"",profissao:""});
  const u=p=>setF(x=>({...x,...p}));
  return(
    <Modal title="Novo Locatário (rápido)" onClose={onClose} zIdx={1100}>
      <F label="Nome *"><input style={IS} value={f.nome} onChange={e=>u({nome:e.target.value})}/></F>
      <R>
        <F label="CPF" h><input style={IS} value={f.cpf||""} onChange={e=>u({cpf:e.target.value})}/></F>
        <F label="Telefone" h><input style={IS} value={f.telefone||""} onChange={e=>u({telefone:e.target.value})}/></F>
        <F label="Email" h><input style={IS} value={f.email||""} onChange={e=>u({email:e.target.value})}/></F>
        <F label="Profissão" h><input style={IS} value={f.profissao||""} onChange={e=>u({profissao:e.target.value})}/></F>
      </R>
      <div style={{fontSize:12,color:"#475569",marginBottom:14}}>Complete os demais dados depois em Locatários.</div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <button style={{background:"transparent",color:"#94a3b8",border:"1px solid #2d3748",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontFamily:"inherit",fontWeight:500,fontSize:13}} onClick={onClose}>Cancelar</button>
        <button style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"inherit"}} onClick={()=>f.nome&&onSave(f)}>Salvar</button>
      </div>
    </Modal>
  );
}

function QuickAddImovel({locadores,onSave,onClose,onAddLocador}){
  const [f,setF]=useState({codigo:"",endereco:"",bairro:"",cidade:"Goiânia",estado:"GO",tipo:"Apartamento",locadorId:""});
  const u=p=>setF(x=>({...x,...p}));
  return(
    <Modal title="Novo Imóvel (rápido)" onClose={onClose} zIdx={1100}>
      <R>
        <F label="Código *" h><input style={IS} value={f.codigo} onChange={e=>u({codigo:e.target.value})} placeholder="AP-001"/></F>
        <F label="Tipo" h><select style={IS} value={f.tipo} onChange={e=>u({tipo:e.target.value})}>{["Apartamento","Casa","Comercial","Sala","Galpão"].map(t=><option key={t}>{t}</option>)}</select></F>
      </R>
      <F label="Endereço *"><input style={IS} value={f.endereco} onChange={e=>u({endereco:e.target.value})}/></F>
      <R>
        <F label="Bairro" h><input style={IS} value={f.bairro||""} onChange={e=>u({bairro:e.target.value})}/></F>
        <F label="Cidade" h><input style={IS} value={f.cidade||""} onChange={e=>u({cidade:e.target.value})}/></F>
      </R>
      <QSelect label="Locador" value={f.locadorId} onChange={v=>u({locadorId:v})} options={locadores} getLabel={o=>o.nome} onAdd={onAddLocador}/>
      <div style={{fontSize:12,color:"#475569",marginBottom:14}}>Complete os demais dados depois em Imóveis.</div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <button style={{background:"transparent",color:"#94a3b8",border:"1px solid #2d3748",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontFamily:"inherit",fontWeight:500,fontSize:13}} onClick={onClose}>Cancelar</button>
        <button style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"inherit"}} onClick={()=>(f.codigo&&f.endereco)&&onSave(f)}>Salvar</button>
      </div>
    </Modal>
  );
}

// ── Detalhe Modal ──────────────────────────────────────────────────────────────
function DetalheModal({tipo,data,onClose,isAdmin,showToast}){
  const [docs,setDocs]=useState([]);
  const [vistorias,setVistorias]=useState([]);
  const [historico,setHistorico]=useState([]);
  const [activeTab,setActiveTab]=useState("dados");
  const [novaV,setNovaV]=useState({tipo:"Entrada",data:"",responsavel:"",observacoes:""});
  const [novoH,setNovoH]=useState({tipo:"Ocorrência",descricao:"",data:""});

  useEffect(()=>{
    if(tipo==="locador") api.getDocsPessoa("locador",data.id).then(setDocs).catch(()=>{});
    if(tipo==="locatario") api.getDocsPessoa("locatario",data.id).then(setDocs).catch(()=>{});
    if(tipo==="imovel"){
      api.getDocsImovel(data.id).then(setDocs).catch(()=>{});
      api.getVistorias(data.id).then(setVistorias).catch(()=>{});
      api.getHistorico(data.id).then(setHistorico).catch(()=>{});
    }
  },[tipo,data.id]);

  const campos={
    locador:[["Nome",data.nome],["CPF/CNPJ",data.cpfCnpj],["Nacionalidade",data.nacionalidade],["Estado Civil",data.estadoCivil],["Profissão",data.profissao],["RG",`${data.rg||""} ${data.rgOrgao||""}`],["Telefone",data.telefone],["Email",data.email],["Endereço",data.endereco],["Cidade/Estado",`${data.cidade||""} - ${data.estado||""}`],["CEP",data.cep],["Procurador",data.procuradorNome],["CPF Proc.",data.procuradorCpf],["Banco",data.banco],["Ag/Conta",`${data.agencia||""} / ${data.conta||""}`],["PIX",data.pix],["Obs",data.obs]],
    locatario:[["Nome",data.nome],["CPF",data.cpf],["Nacionalidade",data.nacionalidade],["Estado Civil",data.estadoCivil],["Profissão",data.profissao],["RG",`${data.rg||""} ${data.rgOrgao||""}`],["CNH",data.cnh],["Telefone",data.telefone],["Email",data.email],["Renda",data.renda?fmt(data.renda):"—"],["Endereço",data.endereco],["Cidade/Estado",`${data.cidade||""} - ${data.estado||""}`],["Fiador",data.fiadorNome],["CPF Fiador",data.fiadorCpf],["Obs",data.obs]],
    imovel:[["Código",data.codigo],["Endereço",data.endereco],["Bairro",data.bairro],["Cidade/Estado",`${data.cidade||""} - ${data.estado||""}`],["Tipo",data.tipo],["Área",data.area?`${data.area}m²`:"—"],["Condomínio",data.nomeCondominio],["Bloco/Apto",`${data.bloco||""} / ${data.apartamento||""}`],["Quartos",data.quartos],["Mobiliado",data.mobiliado],["Valor Ideal",data.valorIdeal?fmt(data.valorIdeal):"—"],["Locador",data.locadorNome],["Locatário Atual",data.locatarioAtual||"Vago"],["Aluguel Atual",data.aluguelAtual?fmt(data.aluguelAtual):"—"],["Vencimento",data.vencimentoAtual?`Dia ${data.vencimentoAtual}`:"—"],["Tel. Portaria",data.telPortaria],["Tel. Síndico",data.telSindico]],
  }[tipo]||[];

  const tabs=[{id:"dados",label:"Dados"},{id:"docs",label:"Documentos"},...(tipo==="imovel"?[{id:"vistorias",label:"Vistorias"},{id:"historico",label:"Histórico"}]:[])];
  const tiposDoc=tipo==="imovel"?tiposDocImovel:tiposDocPessoa;

  async function handleUpload(dt,file,cb){
    try{
      const doc=tipo==="imovel"?await api.uploadDocImovel(data.id,dt,file):await api.uploadDocPessoa(tipo,data.id,dt,file);
      setDocs(p=>[...p,doc]);showToast("Enviado!");if(cb)cb();
    }catch(e){showToast(e.message,"error");}
  }
  async function handleView(id){
    try{const r=tipo==="imovel"?await api.getDocImovelUrl(id):await api.getDocUrl(id);window.open(r.url,"_blank");}
    catch(e){showToast(e.message,"error");}
  }
  async function handleDelete(id){
    try{tipo==="imovel"?await api.deleteDocImovel(id):await api.deleteDocPessoa(id);setDocs(p=>p.filter(x=>x.id!==id));showToast("Excluído");}
    catch(e){showToast(e.message,"error");}
  }

  return(
    <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:20,overflowY:"auto"}}>
      <div style={{background:"#1a1f2e",borderRadius:16,padding:28,width:"100%",maxWidth:720,border:"1px solid #2d3748",boxShadow:"0 25px 60px #000a",margin:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{color:"#e2e8f0",fontWeight:700,fontSize:18,margin:0}}>{tipo==="locador"?"Locador":tipo==="locatario"?"Locatário":"Imóvel"} — {data.nome||data.codigo}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#94a3b8",fontSize:22,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:"1px solid #1e2940",paddingBottom:8}}>
          {tabs.map(t=><button key={t.id} onClick={()=>setActiveTab(t.id)} style={{background:activeTab===t.id?"#6366f120":"none",border:"none",borderBottom:activeTab===t.id?"2px solid #6366f1":"2px solid transparent",color:activeTab===t.id?"#818cf8":"#64748b",padding:"6px 14px",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:13,borderRadius:"6px 6px 0 0"}}>{t.label}</button>)}
        </div>

        {activeTab==="dados"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 24px"}}>
            {campos.map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #1e2940"}}>
                <span style={{color:"#64748b",fontSize:13}}>{k}</span>
                <span style={{fontSize:13,fontWeight:500,textAlign:"right",maxWidth:"55%"}}>{v||"—"}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab==="docs"&&(
          <DocUploader docs={docs} onUpload={handleUpload} onView={handleView} onDelete={handleDelete} tipos={tiposDoc} isAdmin={isAdmin}/>
        )}

        {activeTab==="vistorias"&&tipo==="imovel"&&(
          <div>
            {isAdmin&&(
              <div style={{background:"#0f1623",borderRadius:10,padding:14,marginBottom:14,border:"1px solid #2d3748"}}>
                <div style={{fontSize:12,color:"#6366f1",fontWeight:700,marginBottom:10}}>Nova Vistoria</div>
                <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:120}}><label style={LS}>Tipo</label><select style={IS} value={novaV.tipo} onChange={e=>setNovaV(p=>({...p,tipo:e.target.value}))}>{["Entrada","Saída","Periódica"].map(t=><option key={t}>{t}</option>)}</select></div>
                  <div style={{flex:1,minWidth:130}}><label style={LS}>Data</label><input style={IS} type="date" value={novaV.data} onChange={e=>setNovaV(p=>({...p,data:e.target.value}))}/></div>
                  <div style={{flex:2,minWidth:150}}><label style={LS}>Responsável</label><input style={IS} value={novaV.responsavel} onChange={e=>setNovaV(p=>({...p,responsavel:e.target.value}))}/></div>
                </div>
                <div style={{marginTop:10}}><label style={LS}>Observações</label><textarea style={{...IS,minHeight:60}} value={novaV.observacoes} onChange={e=>setNovaV(p=>({...p,observacoes:e.target.value}))}/></div>
                <div style={{marginTop:10}}><label style={LS}>Arquivo da Vistoria (PDF ou imagem)</label><input style={IS} type="file" accept=".pdf,image/*" onChange={e=>setNovaV(p=>({...p,arquivo:e.target.files[0]}))}/></div>
                <button style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:13,marginTop:8}} onClick={async()=>{
                  if(!novaV.data||!novaV.responsavel)return showToast("Preencha data e responsável","error");
                  try{
                    const v=await api.createVistoria(data.id,novaV);
                    if(novaV.arquivo){await api.uploadFotoVistoria(v.id,novaV.arquivo);}
                    setVistorias(p=>[v,...p]);
                    setNovaV({tipo:"Entrada",data:"",responsavel:"",observacoes:"",arquivo:null});
                    showToast("Vistoria registrada!");
                  }catch(e){showToast(e.message,"error");}
                }}>Registrar</button>
              </div>
            )}

            {/* Vistoria de Entrada */}
            {["Entrada","Saída","Periódica"].map(tipoV=>{
              const vs=vistorias.filter(v=>v.tipo===tipoV);
              if(!vs.length&&tipoV==="Periódica") return null;
              return(
                <div key={tipoV} style={{marginBottom:16}}>
                  <div style={{fontSize:11,color:tipoV==="Entrada"?"#22c55e":tipoV==="Saída"?"#ef4444":"#6366f1",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>{tipoV}</div>
                  {vs.length===0?<div style={{color:"#475569",fontSize:13,padding:"8px 0"}}>Nenhuma vistoria de {tipoV.toLowerCase()} registrada</div>:
                  vs.map(v=>(
                    <div key={v.id} style={{background:"#0f1623",borderRadius:10,padding:14,marginBottom:8,border:`1px solid ${tipoV==="Entrada"?"#22c55e30":tipoV==="Saída"?"#ef444430":"#6366f130"}`}}>
                      <div style={{fontWeight:700,color:"#e2e8f0"}}>{v.tipo} <span style={{color:"#64748b",fontSize:12,fontWeight:400}}>· {fmtDate(v.data)} · {v.responsavel}</span></div>
                      {v.observacoes&&<div style={{fontSize:13,color:"#94a3b8",marginTop:6}}>{v.observacoes}</div>}
                      {v.fotos&&v.fotos.filter(f=>f.id).length>0&&(
                        <div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap"}}>
                          {v.fotos.filter(f=>f.id).map(f=>(
                            <button key={f.id} style={{background:"#1a1f2e",border:"1px solid #2d3748",borderRadius:6,padding:"4px 10px",color:"#94a3b8",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}
                              onClick={async()=>{try{const r=await api.getFotoVistoriaUrl(f.id);window.open(r.url,"_blank");}catch(e){showToast(e.message,"error");}}}>
                              📄 {f.nome||"Arquivo"}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {activeTab==="historico"&&tipo==="imovel"&&(
          <div>
            {isAdmin&&(
              <div style={{background:"#0f1623",borderRadius:10,padding:14,marginBottom:14,border:"1px solid #2d3748"}}>
                <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
                  <div style={{flex:1,minWidth:120}}><label style={LS}>Tipo</label><select style={IS} value={novoH.tipo} onChange={e=>setNovoH(p=>({...p,tipo:e.target.value}))}>{["Ocorrência","Manutenção","Reclamação","Visita","Outros"].map(t=><option key={t}>{t}</option>)}</select></div>
                  <div style={{flex:1,minWidth:130}}><label style={LS}>Data</label><input style={IS} type="date" value={novoH.data} onChange={e=>setNovoH(p=>({...p,data:e.target.value}))}/></div>
                  <div style={{flex:3,minWidth:200}}><label style={LS}>Descrição</label><input style={IS} value={novoH.descricao} onChange={e=>setNovoH(p=>({...p,descricao:e.target.value}))}/></div>
                  <button style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:13}} onClick={async()=>{
                    if(!novoH.descricao||!novoH.data)return showToast("Preencha descrição e data","error");
                    try{const h=await api.addHistorico(data.id,novoH);setHistorico(p=>[h,...p]);setNovoH({tipo:"Ocorrência",descricao:"",data:""});showToast("Registrado!");}
                    catch(e){showToast(e.message,"error");}
                  }}>Adicionar</button>
                </div>
              </div>
            )}
            {historico.length===0?<div style={{color:"#475569",fontSize:13}}>Nenhum histórico</div>:
            historico.map(h=>(
              <div key={h.id} style={{display:"flex",gap:12,padding:"8px 0",borderBottom:"1px solid #1e2940"}}>
                <div style={{minWidth:80,fontSize:11,color:"#64748b"}}>{fmtDate(h.data)}</div>
                <div style={{flex:1}}><span style={{fontSize:11,background:"#6366f120",color:"#818cf8",padding:"1px 8px",borderRadius:10,marginRight:6}}>{h.tipo}</span><span style={{fontSize:13}}>{h.descricao}</span></div>
                <div style={{fontSize:11,color:"#475569"}}>{h.usuarioNome}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App(){
  const [tab,setTab]=useState("dashboard");
  const [user,setUser]=useState(()=>{try{return JSON.parse(localStorage.getItem("user"));}catch{return null;}});
  // ── SSO: se veio ?sso=token do Portal, troca pelo JWT da Locação antes de tudo ──
  const [ssoLoading,setSsoLoading]=useState(()=>new URLSearchParams(window.location.search).has("sso"));
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const ssoToken=params.get("sso");
    if(!ssoToken) return;
    // limpa o token da URL na hora
    try{ window.history.replaceState(null,"",window.location.pathname); }catch{}
    (async()=>{
      try{
        const res=await api.sso({ token: ssoToken });
        if(res && res.token){
          localStorage.setItem("token",res.token);
          localStorage.setItem("user",JSON.stringify(res.user));
          window.location.reload();
          return;
        }
      }catch(e){ /* cai no login normal */ }
      setSsoLoading(false);
    })();
  },[]);
  const isAdmin=user?.role==="admin";
  const isInterno=!user?.tipoAcesso||user?.tipoAcesso==="interno";

  const [imoveis,setImoveis]=useState([]);
  const [contratos,setContratos]=useState([]);
  const [locadores,setLocadores]=useState([]);
  const [locatarios,setLocatarios]=useState([]);
  const [despesas,setDespesas]=useState([]);
  const [repasses,setRepasses]=useState([]);
  const [usuarios,setUsuarios]=useState([]);
  const [dashboard,setDashboard]=useState(null);
  const [inadimplencia,setInadimplencia]=useState([]);
  const [acertos,setAcertos]=useState([]);
  const [modalAcerto,setModalAcerto]=useState(null);
  const [loading,setLoading]=useState(true);
  const [toast,setToast]=useState(null);
  const [dreData,setDreData]=useState(null);
  const [dreInicio,setDreInicio]=useState("");
  const [dreFim,setDreFim]=useState("");
  const [relLocador,setRelLocador]=useState("");
  const [relMesInicio,setRelMesInicio]=useState("");
  const [relMesFim,setRelMesFim]=useState("");
  const [relGerado,setRelGerado]=useState(false);
  const printRef=useRef(null);

  // Quick-add: valor = callback a executar após salvar
  const [quickLocador,setQuickLocador]=useState(null);
  const [quickLocadorForImovel,setQuickLocadorForImovel]=useState(false);
  const [quickLocatario,setQuickLocatario]=useState(null);
  const [quickImovel,setQuickImovel]=useState(null);

  const [modalLocador,setModalLocador]=useState(null);
  const [modalLocatario,setModalLocatario]=useState(null);
  const [modalImovel,setModalImovel]=useState(null);
  const [modalContrato,setModalContrato]=useState(null);
  const [modalParcelas,setModalParcelas]=useState(null);
  const [modalReajuste,setModalReajuste]=useState(null);
  const [modalRepasse,setModalRepasse]=useState(null);
  const [modalDespesa,setModalDespesa]=useState(null);
  const [modalDetalhe,setModalDetalhe]=useState(null);
  const [repasseId,setRepasseId]=useState(null);
  const [comprovanteFile,setComprovanteFile]=useState(null);
  const [parcelas,setParcelas]=useState([]);
  const [reajustes,setReajustes]=useState([]);
  const [parcelaEdit,setParcelaEdit]=useState(null);
  const [contratoFile,setContratoFile]=useState(null);

  const emptyLocador={nome:"",cpfCnpj:"",email:"",telefone:"",estadoCivil:"",profissao:"",nacionalidade:"brasileiro(a)",rg:"",rgOrgao:"",endereco:"",bairro:"",cidade:"",estado:"GO",cep:"",procuradorNome:"",procuradorCpf:"",procuradorRg:"",procuradorEndereco:"",banco:"",agencia:"",conta:"",tipoConta:"Corrente",pix:"",obs:""};
  const [formLocador,setFormLocador]=useState(emptyLocador);
  const emptyLocatario={nome:"",cpf:"",email:"",telefone:"",estadoCivil:"",profissao:"",nacionalidade:"brasileiro(a)",rg:"",rgOrgao:"",cnh:"",endereco:"",bairro:"",cidade:"",estado:"GO",cep:"",renda:"",fiadorNome:"",fiadorCpf:"",fiadorTelefone:"",obs:""};
  const [formLocatario,setFormLocatario]=useState(emptyLocatario);
  const emptyImovel={codigo:"",endereco:"",bairro:"",cidade:"Goiânia",estado:"GO",cep:"",tipo:"Apartamento",area:"",nomeCondominio:"",bloco:"",apartamento:"",quartos:"",mobiliado:"Sem móveis",valorIdeal:"",telPortaria:"",telContabilidade:"",telCobranca:"",telSindico:"",locadorId:""};
  const [formImovel,setFormImovel]=useState(emptyImovel);
  const emptyContrato={imovelId:"",locatarioId:"",locadorId:"",locatario:"",telefoneLocatario:"",locador:"",telefoneLocador:"",aluguelInicial:"",aluguelPagaPor:"Locatário",condominio:"",condominioPagaPor:"Locatário",iptu:"",iptuPagaPor:"Locatário",caucao:"",garantia:"",taxaAdmPct:10,vencimento:"",formaPagamento:"Pix",inicio:"",duracaoMeses:"",status:"Ativo",multaAtrasoPct:10,jurosAtrasoPct:1,honorariosPct:10,honorariosDias:10,honorariosAdvPct:20,honorariosAdvDias:20,indiceReajuste:"IGPM"};
  const [formContrato,setFormContrato]=useState(emptyContrato);
  const emptyReajuste={dataReajuste:"",indice:"IGPM",periodoInicio:"",periodoFim:"",valorAnterior:"",percentual:"",valorNovo:"",obs:""};
  const [formReajuste,setFormReajuste]=useState(emptyReajuste);
  const defaultGarantias=["Depósito Caução","Seguro Fiança","Fiadores","Título de Capitalização"];
  const [garantiaOpts,setGarantiaOpts]=useState(()=>{try{const s=localStorage.getItem("garantiaOpts");return s?JSON.parse(s):defaultGarantias;}catch{return defaultGarantias;}});
  const [novaGarantia,setNovaGarantia]=useState("");
  const [editGarantia,setEditGarantia]=useState(null);
  function saveGarantiaOpts(opts){setGarantiaOpts(opts);localStorage.setItem("garantiaOpts",JSON.stringify(opts));}
  const emptyRepasse={contratoId:"",competencia:"",dataRepasse:"",valorRecebido:"",totalDespesas:"",taxaAdm:"",valorLiquido:"",formaPagamento:"Pix",status:"Pendente",obs:""};
  const [formRepasse,setFormRepasse]=useState(emptyRepasse);
  const emptyDespesa={contratoId:"",imovelInfo:"",data:"",valor:"",tipo:"Manutenção",descricao:"",status:"Pago"};
  const [formDespesa,setFormDespesa]=useState(emptyDespesa);

  const emptyAcerto={contratoId:"",dataAcerto:"",status:"Pendente",energia:0,agua:0,gas:0,condominio:0,iptu:0,limpezaEstofados:0,limpezaArCondicionado:0,faxina:0,pintura:0,reparosHidraulicos:0,reparosEletricos:0,vidrosJanelas:0,chavesFechaduras:0,multaRescisao:0,caucaoDevolvido:0,outrosDescricao:"",outrosValor:0,obs:""};
  const [formAcerto,setFormAcerto]=useState(emptyAcerto);

  function showToast(msg,type="ok"){setToast({msg,type});setTimeout(()=>setToast(null),3500);}

  useEffect(()=>{
    if(!user) return;
    const loads=[api.getImoveis(),api.getContratos(),api.getDespesas(),api.getRepasses(),api.getDashboard(),api.getLocadores(),api.getLocatarios(),api.getAcertoFinal()];
    if(isAdmin) loads.push(api.getUsuarios());
    if(isInterno) loads.push(api.getInadimplencia());
    Promise.all(loads).then(([im,con,dep,rep,dash,loc,locat,ace,...rest])=>{
      setImoveis(im);setContratos(con);setDespesas(dep);setRepasses(rep);setDashboard(dash);setLocadores(loc);setLocatarios(locat);setAcertos(ace||[]);
      let i=0;if(isAdmin)setUsuarios(rest[i++]);if(isInterno)setInadimplencia(rest[i++]||[]);
    }).catch(()=>showToast("Erro ao carregar","error")).finally(()=>setLoading(false));
  },[user]);

  if(ssoLoading) return <div style={{minHeight:"100vh",background:"#0a0e1a",display:"flex",alignItems:"center",justifyContent:"center",color:"#94a3b8",fontFamily:"'DM Sans',sans-serif",fontSize:15}}>Entrando pelo Portal…</div>;
  if(!user) return <Auth onLogin={()=>window.location.reload()}/>;

  // Quick-add handlers
  async function doQuickLocador(form,cb){
    try{const n=await api.createLocador(form);setLocadores(p=>[...p,n]);showToast("Locador cadastrado!");if(cb)cb(n);}
    catch(e){showToast(e.message,"error");}
  }
  async function doQuickLocatario(form,cb){
    try{const n=await api.createLocatario(form);setLocatarios(p=>[...p,n]);showToast("Locatário cadastrado!");if(cb)cb(n);}
    catch(e){showToast(e.message,"error");}
  }
  async function doQuickImovel(form,cb){
    try{const n=await api.createImovel(form);setImoveis(p=>[...p,n]);showToast("Imóvel cadastrado!");if(cb)cb(n);}
    catch(e){showToast(e.message,"error");}
  }

  // CRUD handlers
  async function saveLocador(){
    if(!formLocador.nome)return showToast("Nome obrigatório","error");
    try{
      if(modalLocador==="new"){const n=await api.createLocador(formLocador);setLocadores(p=>[...p,n]);showToast("Cadastrado!");}
      else{const n=await api.updateLocador(modalLocador,formLocador);setLocadores(p=>p.map(x=>x.id===modalLocador?n:x));showToast("Atualizado!");}
      setModalLocador(null);
    }catch(e){showToast(e.message,"error");}
  }
  async function saveLocatario(){
    if(!formLocatario.nome)return showToast("Nome obrigatório","error");
    try{
      if(modalLocatario==="new"){const n=await api.createLocatario(formLocatario);setLocatarios(p=>[...p,n]);showToast("Cadastrado!");}
      else{const n=await api.updateLocatario(modalLocatario,formLocatario);setLocatarios(p=>p.map(x=>x.id===modalLocatario?n:x));showToast("Atualizado!");}
      setModalLocatario(null);
    }catch(e){showToast(e.message,"error");}
  }
  async function saveImovel(){
    if(!formImovel.codigo||!formImovel.endereco)return showToast("Código e endereço obrigatórios","error");
    try{
      if(modalImovel==="new"){const n=await api.createImovel(formImovel);setImoveis(p=>[...p,n]);showToast("Cadastrado!");}
      else{const n=await api.updateImovel(modalImovel,formImovel);setImoveis(p=>p.map(x=>x.id===modalImovel?n:x));showToast("Atualizado!");}
      setModalImovel(null);
    }catch(e){showToast(e.message,"error");}
  }
  async function saveContrato(){
    if(!formContrato.imovelId||!formContrato.aluguelInicial)return showToast("Imóvel e aluguel obrigatórios","error");
    const payload={...formContrato,aluguelInicial:+formContrato.aluguelInicial,condominio:+formContrato.condominio||0,iptu:+formContrato.iptu||0,caucao:+formContrato.caucao||0,taxaAdmPct:+formContrato.taxaAdmPct,vencimento:+formContrato.vencimento,duracaoMeses:+formContrato.duracaoMeses||null};
    if(formContrato.locatarioId){const l=locatarios.find(x=>x.id===+formContrato.locatarioId);if(l){payload.locatario=l.nome;payload.telefoneLocatario=l.telefone||payload.telefoneLocatario;}}
    if(formContrato.locadorId){const l=locadores.find(x=>x.id===+formContrato.locadorId);if(l){payload.locador=l.nome;payload.telefoneLocador=l.telefone||payload.telefoneLocador;}}
    try{
      if(modalContrato==="new"){const n=await api.createContrato(payload);if(contratoFile)await api.uploadContratoPdf(n.id,contratoFile);setContratos(p=>[n,...p]);showToast("Contrato criado com parcelas!");}
      else{const n=await api.updateContrato(modalContrato,payload);if(contratoFile)await api.uploadContratoPdf(modalContrato,contratoFile);setContratos(p=>p.map(x=>x.id===modalContrato?n:x));showToast("Atualizado!");}
      setModalContrato(null);setContratoFile(null);
    }catch(e){showToast(e.message,"error");}
  }
  async function openParcelas(id){
    try{const[p,r]=await Promise.all([api.getParcelas(id),api.getReajustes(id)]);setParcelas(p);setReajustes(r);setModalParcelas(id);}
    catch(e){showToast(e.message,"error");}
  }
  async function saveParcela(){
    try{const n=await api.updateParcela(parcelaEdit.id,parcelaEdit);setParcelas(p=>p.map(x=>x.id===parcelaEdit.id?n:x));setParcelaEdit(null);showToast("Atualizado!");}
    catch(e){showToast(e.message,"error");}
  }
  async function saveReajuste(){
    if(!formReajuste.dataReajuste||!formReajuste.valorNovo)return showToast("Preencha data e valor","error");
    try{
      const n=await api.createReajuste(modalReajuste,{...formReajuste,valorAnterior:+formReajuste.valorAnterior,percentual:+formReajuste.percentual,valorNovo:+formReajuste.valorNovo});
      setReajustes(p=>[n,...p]);setContratos(p=>p.map(c=>c.id===+modalReajuste?{...c,aluguelAtual:+formReajuste.valorNovo}:c));
      showToast("Reajuste registrado!");setFormReajuste(emptyReajuste);
    }catch(e){showToast(e.message,"error");}
  }
  async function saveDespesa(){
    if(!formDespesa.contratoId||!formDespesa.data||!formDespesa.valor)return;
    try{
      if(modalDespesa==="new"){const n=await api.createDespesa({...formDespesa,valor:+formDespesa.valor,contratoId:+formDespesa.contratoId});setDespesas(p=>[n,...p]);showToast("Registrado!");}
      else{const n=await api.updateDespesa(modalDespesa,{...formDespesa,valor:+formDespesa.valor,contratoId:+formDespesa.contratoId});setDespesas(p=>p.map(x=>x.id===modalDespesa?n:x));showToast("Atualizado!");}
      setModalDespesa(null);
    }catch(e){showToast(e.message,"error");}
  }
  function calcRepasse(contratoId){
    const c=contratos.find(x=>x.id===+contratoId);
    if(!c)return{};
    const vb=Number(c.aluguelAtual);
    const ta=(vb*Number(c.taxaAdmPct))/100;
    const td=despesas.filter(d=>d.contratoId===+contratoId).reduce((s,d)=>s+Number(d.valor),0);
    return{valorRecebido:vb.toFixed(2),totalDespesas:td.toFixed(2),taxaAdm:ta.toFixed(2),valorLiquido:(vb-td-ta).toFixed(2)};
  }
  async function saveRepasse(){
    if(!formRepasse.contratoId||!formRepasse.competencia)return;
    try{
      const n=await api.createRepasse({...formRepasse,contratoId:+formRepasse.contratoId,valorRecebido:+formRepasse.valorRecebido,totalDespesas:+formRepasse.totalDespesas,taxaAdm:+formRepasse.taxaAdm,valorLiquido:+formRepasse.valorLiquido});
      if(comprovanteFile)await api.uploadComprovante(n.id,comprovanteFile);
      setRepasses(p=>[n,...p]);showToast("Repasse gerado!");setModalRepasse(null);setComprovanteFile(null);
    }catch(e){showToast(e.message,"error");}
  }
  async function marcarRepassado(id){
    if(!comprovanteFile)return showToast("Selecione o comprovante","error");
    try{
      await api.uploadComprovante(id,comprovanteFile);
      setRepasses(p=>p.map(r=>r.id===id?{...r,status:"Repassado"}:r));
      setComprovanteFile(null);setRepasseId(null);showToast("Repassado!");
    }catch(e){showToast(e.message,"error");}
  }

  const locadoresUnicos=[...new Set(contratos.map(c=>c.locador))].sort();
  const dadosRelatorio=useMemo(()=>{
    if(!relLocador)return null;
    return contratos.filter(c=>c.locador===relLocador).map(c=>({c,
      desps:despesas.filter(d=>d.contratoId===c.id&&((!relMesInicio||(d.data||"").slice(0,7)>=relMesInicio)&&(!relMesFim||(d.data||"").slice(0,7)<=relMesFim))),
      reps:repasses.filter(r=>r.contratoId===c.id&&((!relMesInicio||(r.dataRepasse||"").slice(0,7)>=relMesInicio)&&(!relMesFim||(r.dataRepasse||"").slice(0,7)<=relMesFim))),
    })).map(x=>({...x,totalDesp:x.desps.reduce((s,d)=>s+Number(d.valor),0),totalRep:x.reps.reduce((s,r)=>s+Number(r.valorLiquido),0)}));
  },[relLocador,relMesInicio,relMesFim,contratos,despesas,repasses]);

  const s={
    app:{minHeight:"100vh",background:"#0a0e1a",fontFamily:"'DM Sans',sans-serif",color:"#e2e8f0"},
    sidebar:{position:"fixed",top:0,left:0,bottom:0,width:220,background:"#0f1623",borderRight:"1px solid #1e2940",display:"flex",flexDirection:"column",padding:"24px 0",zIndex:100},
    main:{marginLeft:220,padding:28,minHeight:"100vh"},
    card:{background:"#131929",border:"1px solid #1e2940",borderRadius:14,padding:20,marginBottom:16},
    btn:(c="#6366f1")=>({background:c,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"inherit"}),
    btnG:{background:"transparent",color:"#94a3b8",border:"1px solid #2d3748",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:500,fontSize:13,fontFamily:"inherit"},
    th:{textAlign:"left",padding:"9px 12px",color:"#64748b",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1},
    td:{padding:"10px 12px",fontSize:13,borderTop:"1px solid #1e2940",color:"#cbd5e1"},
    sc:{background:"#131929",border:"1px solid #1e2940",borderRadius:14,padding:"16px 20px",flex:1,minWidth:120},
  };

  const navItems=[
    {id:"dashboard",icon:"◈",label:"Dashboard"},
    ...(isInterno?[{id:"inadimplencia",icon:"⚠",label:"Inadimplência"}]:[]),
    ...(isInterno?[{id:"locadores",icon:"👤",label:"Locadores"}]:[]),
    ...(isInterno?[{id:"locatarios",icon:"🏠",label:"Locatários"}]:[]),
    ...(isInterno?[{id:"imoveis",icon:"⌂",label:"Imóveis"}]:[]),
    {id:"contratos",icon:"📋",label:"Contratos"},
    ...(isInterno?[{id:"despesas",icon:"↑",label:"Despesas"}]:[]),
    {id:"repasses",icon:"⇌",label:"Repasses"},
    ...(isInterno?[{id:"acerto",icon:"✓",label:"Acerto Final"}]:[]),
    ...(isInterno?[{id:"dre",icon:"$",label:"DRE / Previsão"}]:[]),
    ...(isInterno?[{id:"relatorio",icon:"≡",label:"Relatório"}]:[]),
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
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');*{box-sizing:border-box}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#0a0e1a}::-webkit-scrollbar-thumb{background:#2d3748;border-radius:3px}table{width:100%;border-collapse:collapse}input,select,textarea{font-family:'DM Sans',sans-serif}select option{background:#1a1f2e}`}</style>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}

      {/* Quick-add overlays - ficam por cima de tudo */}
      {quickLocador&&<QuickAddLocador onSave={form=>doQuickLocador(form,n=>{if(typeof quickLocador==="function")quickLocador(n);setQuickLocador(null);})} onClose={()=>setQuickLocador(null)}/>}
      {quickLocadorForImovel&&<QuickAddLocador onSave={form=>doQuickLocador(form,n=>{setFormImovel(p=>({...p,locadorId:String(n.id)}));setQuickLocadorForImovel(false);})} onClose={()=>setQuickLocadorForImovel(false)}/>}
      {quickLocatario&&<QuickAddLocatario onSave={form=>doQuickLocatario(form,n=>{if(typeof quickLocatario==="function")quickLocatario(n);setQuickLocatario(null);})} onClose={()=>setQuickLocatario(null)}/>}
      {quickImovel&&<QuickAddImovel locadores={locadores} onSave={form=>doQuickImovel(form,n=>{if(typeof quickImovel==="function")quickImovel(n);setQuickImovel(null);})} onClose={()=>setQuickImovel(null)} onAddLocador={()=>setQuickLocadorForImovel(true)}/>}

      {/* SIDEBAR */}
      <div style={s.sidebar}>
        <div style={{padding:"0 20px 20px",borderBottom:"1px solid #1e2940"}}>
          <div style={{fontSize:11,color:"#6366f1",fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Imobiliária</div>
          <div style={{fontSize:16,fontWeight:800,color:"#e2e8f0",marginTop:2}}>Gestão de Aluguel</div>
        </div>
        <nav style={{marginTop:12,flex:1,overflowY:"auto"}}>
          {navItems.map(n=>(
            <button key={n.id} onClick={()=>setTab(n.id)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 20px",background:tab===n.id?"#6366f120":"none",border:"none",borderLeft:`3px solid ${tab===n.id?"#6366f1":"transparent"}`,color:tab===n.id?"#818cf8":"#64748b",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:13,textAlign:"left"}}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div style={{padding:"12px 20px",borderTop:"1px solid #1e2940"}}>
          <div style={{fontSize:12,color:"#94a3b8",fontWeight:500,marginBottom:2}}>{user?.nome}</div>
          <div style={{fontSize:11,color:"#475569",marginBottom:8}}>{isAdmin?"Admin":user?.tipoAcesso==="locador"?"Locador":"Locatário"}</div>
          <button onClick={()=>{localStorage.clear();window.location.reload();}} style={{...s.btnG,fontSize:12,padding:"5px 12px",color:"#ef4444",borderColor:"#ef444430",width:"100%"}}>Sair</button>
        </div>
      </div>

      <div style={s.main}>

        {/* DASHBOARD */}
        {tab==="dashboard"&&(
          <div>
            <h2 style={{fontWeight:800,fontSize:22,marginBottom:14}}>Dashboard</h2>
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
              {[{l:"Contratos Ativos",v:dashboard?.contratosAtivos||0,c:"#6366f1",f:false},{l:"Carteira Mensal",v:dashboard?.carteiraMensal||0,c:"#818cf8",f:true},{l:"Recebido (mês)",v:dashboard?.recebidoMes||0,c:"#22c55e",f:true},{l:"Despesas (mês)",v:dashboard?.despesasMes||0,c:"#f59e0b",f:true},{l:"Repassado (mês)",v:dashboard?.repassadoMes||0,c:"#06b6d4",f:true},{l:"Inadimplentes",v:dashboard?.inadimplentesQtd||0,c:"#ef4444",f:false,sub:fmt(dashboard?.inadimplentesValor||0)}].map(m=>(
                <div key={m.l} style={s.sc}><div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>{m.l}</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:17,fontWeight:700,color:m.c}}>{m.f?fmt(m.v):m.v}</div>{m.sub&&<div style={{fontSize:11,color:"#64748b",marginTop:2}}>{m.sub}</div>}</div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:14}}>
              <div style={s.card}><h3 style={{margin:"0 0 12px",fontSize:14,fontWeight:700}}>Recebimentos por mês</h3><BarChart data={dashboard?.recPorMes}/></div>
              <div style={s.card}><h3 style={{margin:"0 0 10px",fontSize:14,fontWeight:700}}>⚠️ Vencendo em 7 dias</h3>
                {(dashboard?.vencendo||[]).length===0?<div style={{color:"#475569",fontSize:13}}>Nenhuma parcela</div>:(dashboard?.vencendo||[]).map(p=>(
                  <div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #1e2940"}}>
                    <div><div style={{fontSize:12,fontWeight:600}}>{p.codigo}</div><div style={{fontSize:11,color:"#64748b"}}>{p.locatario} · {p.competencia}</div></div>
                    <div style={{fontFamily:"monospace",fontSize:12,color:"#f59e0b"}}>{fmt(p.valor)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* INADIMPLÊNCIA */}
        {tab==="inadimplencia"&&isInterno&&(
          <div>
            <h2 style={{fontWeight:800,fontSize:22,marginBottom:16}}>Controle de Inadimplência</h2>
            <div style={s.card}>
              {inadimplencia.length===0?<div style={{color:"#475569",textAlign:"center",padding:32}}>Nenhuma parcela em atraso! 🎉</div>:
              <table><thead><tr><th style={s.th}>Imóvel</th><th style={s.th}>Locatário</th><th style={s.th}>Competência</th><th style={s.th}>Vencimento</th><th style={s.th}>Dias</th><th style={s.th}>Valor</th><th style={s.th}>Multa</th><th style={s.th}>Juros</th><th style={s.th}>Total</th></tr></thead>
              <tbody>{inadimplencia.map(p=>(
                <tr key={p.id}>
                  <td style={s.td}><span style={{fontFamily:"monospace",color:"#818cf8"}}>{p.codigo}</span></td>
                  <td style={s.td}>{p.locatario}</td>
                  <td style={s.td}>{p.competencia}</td>
                  <td style={{...s.td,color:"#ef4444"}}>{fmtDate(p.vencimento)}</td>
                  <td style={{...s.td,color:"#ef4444",fontWeight:700}}>{p.diasAtrasaCalc||0} dias</td>
                  <td style={{...s.td,fontFamily:"monospace"}}>{fmt(p.valor)}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:"#f59e0b"}}>{fmt(p.valorMulta)}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:"#f59e0b"}}>{fmt(p.valorJuros)}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:"#ef4444",fontWeight:700}}>{fmt(p.totalDevido)}</td>
                </tr>
              ))}</tbody></table>}
            </div>
          </div>
        )}

        {/* LOCADORES */}
        {tab==="locadores"&&isInterno&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={{fontWeight:800,fontSize:22,margin:0}}>Locadores</h2>
              {isAdmin&&<button style={s.btn()} onClick={()=>{setFormLocador(emptyLocador);setModalLocador("new");}}>+ Novo Locador</button>}
            </div>
            <div style={s.card}>
              <table><thead><tr><th style={s.th}>Nome</th><th style={s.th}>CPF/CNPJ</th><th style={s.th}>Telefone</th><th style={s.th}>Email</th><th style={s.th}>PIX</th><th style={s.th}></th></tr></thead>
                <tbody>{locadores.map(l=>(
                  <tr key={l.id}>
                    <td style={s.td}><span style={{fontWeight:600}}>{l.nome}</span></td>
                    <td style={{...s.td,fontFamily:"monospace",fontSize:12}}>{l.cpfCnpj||"—"}</td>
                    <td style={s.td}>{l.telefone||"—"}</td>
                    <td style={{...s.td,color:"#64748b"}}>{l.email||"—"}</td>
                    <td style={s.td}>{l.pix||"—"}</td>
                    <td style={s.td}><div style={{display:"flex",gap:6}}>
                      <button style={s.btnG} onClick={()=>setModalDetalhe({tipo:"locador",data:l})}>Ver</button>
                      {isAdmin&&<><button style={s.btnG} onClick={()=>{setFormLocador({...l});setModalLocador(l.id);}}>✎</button>
                      <button style={{...s.btnG,color:"#ef4444",borderColor:"#ef444430"}} onClick={async()=>{if(!confirm("Excluir?"))return;await api.deleteLocador(l.id);setLocadores(p=>p.filter(x=>x.id!==l.id));}}>✕</button></>}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* LOCATÁRIOS */}
        {tab==="locatarios"&&isInterno&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={{fontWeight:800,fontSize:22,margin:0}}>Locatários</h2>
              {isAdmin&&<button style={s.btn()} onClick={()=>{setFormLocatario(emptyLocatario);setModalLocatario("new");}}>+ Novo Locatário</button>}
            </div>
            <div style={s.card}>
              <table><thead><tr><th style={s.th}>Nome</th><th style={s.th}>CPF</th><th style={s.th}>Telefone</th><th style={s.th}>Email</th><th style={s.th}>Imóvel Atual</th><th style={s.th}></th></tr></thead>
                <tbody>{locatarios.map(l=>{
                  const ca=contratos.find(c=>c.locatarioId===l.id&&c.status==="Ativo");
                  const im=ca?imoveis.find(x=>x.id===ca.imovelId):null;
                  return(
                    <tr key={l.id}>
                      <td style={s.td}><span style={{fontWeight:600}}>{l.nome}</span></td>
                      <td style={{...s.td,fontFamily:"monospace",fontSize:12}}>{l.cpf||"—"}</td>
                      <td style={s.td}>{l.telefone||"—"}</td>
                      <td style={{...s.td,color:"#64748b"}}>{l.email||"—"}</td>
                      <td style={s.td}>{im?<span style={{fontFamily:"monospace",color:"#818cf8"}}>{im.codigo}</span>:<span style={{color:"#475569"}}>—</span>}</td>
                      <td style={s.td}><div style={{display:"flex",gap:6}}>
                        <button style={s.btnG} onClick={()=>setModalDetalhe({tipo:"locatario",data:l})}>Ver</button>
                        {isAdmin&&<><button style={s.btnG} onClick={()=>{setFormLocatario({...l,renda:String(l.renda||"")});setModalLocatario(l.id);}}>✎</button>
                        <button style={{...s.btnG,color:"#ef4444",borderColor:"#ef444430"}} onClick={async()=>{if(!confirm("Excluir?"))return;await api.deleteLocatario(l.id);setLocatarios(p=>p.filter(x=>x.id!==l.id));}}>✕</button></>}
                      </div></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* IMÓVEIS */}
        {tab==="imoveis"&&isInterno&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={{fontWeight:800,fontSize:22,margin:0}}>Imóveis</h2>
              {isAdmin&&<button style={s.btn()} onClick={()=>{setFormImovel(emptyImovel);setModalImovel("new");}}>+ Novo Imóvel</button>}
            </div>
            <div style={s.card}>
              <table><thead><tr>
                <th style={s.th}>Código</th><th style={s.th}>Endereço</th><th style={s.th}>Locador</th>
                <th style={s.th}>Locatário Atual</th><th style={s.th}>Aluguel</th><th style={s.th}>Cond.</th>
                <th style={s.th}>Venc.</th><th style={s.th}>Status</th><th style={s.th}></th>
              </tr></thead>
                <tbody>{imoveis.map(im=>(
                  <tr key={im.id}>
                    <td style={s.td}><span style={{fontFamily:"monospace",color:"#818cf8",fontWeight:700}}>{im.codigo}</span></td>
                    <td style={{...s.td,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{im.endereco}</td>
                    <td style={s.td}>{im.locadorNome||"—"}</td>
                    <td style={s.td}>{im.locatarioAtual||<span style={{color:"#475569"}}>Vago</span>}</td>
                    <td style={{...s.td,fontFamily:"monospace",color:"#22c55e",fontSize:12}}>{im.aluguelAtual?fmt(im.aluguelAtual):"—"}</td>
                    <td style={{...s.td,fontFamily:"monospace",fontSize:12}}>{im.condominioAtual?fmt(im.condominioAtual):"—"}</td>
                    <td style={s.td}>{im.vencimentoAtual?`Dia ${im.vencimentoAtual}`:"—"}</td>
                    <td style={s.td}><Badge label={im.statusAtual||"Vago"}/></td>
                    <td style={s.td}><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      <button style={s.btnG} onClick={()=>setModalDetalhe({tipo:"imovel",data:im})}>Ver</button>
                      {isAdmin&&<><button style={s.btnG} onClick={()=>{setFormImovel({...im,area:String(im.area||""),quartos:String(im.quartos||""),valorIdeal:String(im.valorIdeal||""),locadorId:String(im.locadorId||"")});setModalImovel(im.id);}}>✎</button>
                      <button style={{...s.btnG,color:"#ef4444",borderColor:"#ef444430"}} onClick={async()=>{if(!confirm("Excluir?"))return;await api.deleteImovel(im.id);setImoveis(p=>p.filter(x=>x.id!==im.id));}}>✕</button></>}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* CONTRATOS */}
        {tab==="contratos"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={{fontWeight:800,fontSize:22,margin:0}}>Contratos</h2>
              {isAdmin&&<button style={s.btn()} onClick={()=>{setFormContrato(emptyContrato);setContratoFile(null);setModalContrato("new");}}>+ Novo Contrato</button>}
            </div>
            <div style={s.card}>
              <table><thead><tr>
                <th style={s.th}>Imóvel</th><th style={s.th}>Locatário</th><th style={s.th}>Locador</th>
                <th style={s.th}>Al. Inicial</th><th style={s.th}>Al. Atual</th>
                <th style={s.th}>Início</th><th style={s.th}>Fim</th><th style={s.th}>Status</th><th style={s.th}></th>
              </tr></thead>
                <tbody>{contratos.map(c=>(
                  <tr key={c.id}>
                    <td style={s.td}><span style={{fontFamily:"monospace",color:"#818cf8",fontWeight:700}}>{c.codigo}</span></td>
                    <td style={s.td}>{c.locatarioNomeFull||c.locatario}</td>
                    <td style={s.td}>{c.locadorNomeFull||c.locador}</td>
                    <td style={{...s.td,fontFamily:"monospace",fontSize:12}}>{fmt(c.aluguelInicial)}</td>
                    <td style={{...s.td,fontFamily:"monospace",fontSize:12,color:Number(c.aluguelAtual)>Number(c.aluguelInicial)?"#22c55e":"#e2e8f0"}}>{fmt(c.aluguelAtual)}</td>
                    <td style={s.td}>{fmtDate(c.inicio)}</td>
                    <td style={{...s.td,fontSize:12,color:c.fim&&new Date(c.fim)<new Date()?"#ef4444":"#64748b"}}>{fmtDate(c.fim)}</td>
                    <td style={s.td}><Badge label={c.status}/></td>
                    <td style={s.td}><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      <button style={s.btnG} onClick={()=>setModalDetalhe({tipo:"contrato",data:c})}>Ver</button>
                      <button style={{...s.btnG,color:"#818cf8",borderColor:"#6366f130"}} onClick={()=>openParcelas(c.id)}>Parcelas</button>
                      {isAdmin&&<><button style={{...s.btnG,color:"#f59e0b",borderColor:"#f59e0b30"}} onClick={()=>{setFormReajuste({...emptyReajuste,valorAnterior:c.aluguelAtual});setModalReajuste(c.id);}}>Reajuste</button>
                      <button style={s.btnG} onClick={()=>{setFormContrato({...c,aluguelInicial:String(c.aluguelInicial),aluguelAtual:String(c.aluguelAtual||c.aluguelInicial),condominio:String(c.condominio||0),iptu:String(c.iptu||0),caucao:String(c.caucao||0),taxaAdmPct:String(c.taxaAdmPct),vencimento:String(c.vencimento),duracaoMeses:String(c.duracaoMeses||""),imovelId:String(c.imovelId),locatarioId:String(c.locatarioId||""),locadorId:String(c.locadorId||"")});setContratoFile(null);setModalContrato(c.id);}}>✎</button></>}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* DESPESAS */}
        {tab==="despesas"&&isInterno&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={{fontWeight:800,fontSize:22,margin:0}}>Despesas</h2>
              <button style={s.btn("#f59e0b")} onClick={()=>{setFormDespesa(emptyDespesa);setModalDespesa("new");}}>+ Registrar</button>
            </div>
            <div style={s.card}>
              <table><thead><tr><th style={s.th}>Imóvel</th><th style={s.th}>Contrato</th><th style={s.th}>Data</th><th style={s.th}>Tipo</th><th style={s.th}>Descrição</th><th style={s.th}>Valor</th><th style={s.th}>Status</th><th style={s.th}></th></tr></thead>
                <tbody>{despesas.map(d=>{
                  const c=contratos.find(x=>x.id===d.contratoId);
                  const im=c?imoveis.find(x=>x.id===c.imovelId):null;
                  return(
                    <tr key={d.id}>
                      <td style={s.td}>{im?<span style={{fontFamily:"monospace",color:"#818cf8"}}>{im.codigo}</span>:"—"}</td>
                      <td style={{...s.td,color:"#64748b",fontSize:12}}>{d.locatario||"—"}</td>
                      <td style={s.td}>{fmtDate(d.data)}</td>
                      <td style={s.td}>{d.tipo}</td>
                      <td style={s.td}>{d.descricao}</td>
                      <td style={{...s.td,fontFamily:"monospace",color:"#f59e0b"}}>{fmt(d.valor)}</td>
                      <td style={s.td}><Badge label={d.status}/></td>
                      <td style={s.td}><div style={{display:"flex",gap:6}}>
                        <button style={s.btnG} onClick={()=>{const c=contratos.find(x=>x.id===d.contratoId);const im=c?imoveis.find(x=>x.id===c.imovelId):null;setFormDespesa({...d,contratoId:String(d.contratoId),valor:String(d.valor),imovelInfo:im?`${im.codigo} — ${im.endereco}`:""});setModalDespesa(d.id);}}>✎</button>
                        {isAdmin&&<button style={{...s.btnG,color:"#ef4444",borderColor:"#ef444430"}} onClick={async()=>{await api.deleteDespesa(d.id);setDespesas(p=>p.filter(x=>x.id!==d.id));}}>✕</button>}
                      </div></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPASSES */}
        {tab==="repasses"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={{fontWeight:800,fontSize:22,margin:0}}>Repasses</h2>
              {isAdmin&&<button style={s.btn("#06b6d4")} onClick={()=>{setFormRepasse(emptyRepasse);setComprovanteFile(null);setModalRepasse("new");}}>+ Gerar Repasse</button>}
            </div>
            <div style={s.card}>
              <table><thead><tr>
                <th style={s.th}>Imóvel</th><th style={s.th}>Locador</th><th style={s.th}>Competência</th>
                <th style={s.th}>Recebido</th><th style={s.th}>Desp.</th><th style={s.th}>Taxa</th>
                <th style={s.th}>Líquido</th><th style={s.th}>Status</th><th style={s.th}></th>
              </tr></thead>
                <tbody>{repasses.map(r=>(
                  <tr key={r.id}>
                    <td style={s.td}><span style={{fontFamily:"monospace",color:"#818cf8"}}>{r.codigo}</span></td>
                    <td style={s.td}>{r.locador||"—"}</td>
                    <td style={s.td}>{r.competencia}</td>
                    <td style={{...s.td,fontFamily:"monospace",fontSize:12}}>{fmt(r.valorRecebido)}</td>
                    <td style={{...s.td,fontFamily:"monospace",fontSize:12,color:"#f59e0b"}}>{fmt(r.totalDespesas)}</td>
                    <td style={{...s.td,fontFamily:"monospace",fontSize:12,color:"#f59e0b"}}>{fmt(r.taxaAdm)}</td>
                    <td style={{...s.td,fontFamily:"monospace",fontWeight:700,color:"#22c55e"}}>{fmt(r.valorLiquido)}</td>
                    <td style={s.td}><Badge label={r.status}/></td>
                    <td style={s.td}><div style={{display:"flex",gap:6}}>
                      {r.status!=="Repassado"&&isAdmin&&<button style={s.btn("#22c55e")} onClick={()=>{setRepasseId(r.id);setComprovanteFile(null);}}>✓</button>}
                      {r.comprovanteNome&&<button style={s.btnG} onClick={async()=>{try{const{url}=await api.getComprovanteUrl(r.id);window.open(url,"_blank");}catch(e){showToast(e.message,"error");}}}>Comp.</button>}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* DRE */}
        {tab==="dre"&&isInterno&&(
          <div>
            <h2 style={{fontWeight:800,fontSize:22,marginBottom:16}}>DRE e Previsão de Recebimentos</h2>
            <div style={{...s.card,display:"flex",gap:14,alignItems:"flex-end",flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:140}}><label style={LS}>De</label><input style={IS} type="date" value={dreInicio} onChange={e=>setDreInicio(e.target.value)}/></div>
              <div style={{flex:1,minWidth:140}}><label style={LS}>Até</label><input style={IS} type="date" value={dreFim} onChange={e=>setDreFim(e.target.value)}/></div>
              <button style={s.btn()} onClick={async()=>{try{const d=await api.getDre(dreInicio,dreFim);setDreData(d);}catch(e){showToast(e.message,"error");}}}>Gerar DRE</button>
            </div>
            {dreData&&(
              <div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                  <div style={s.card}><h3 style={{margin:"0 0 12px",fontSize:14,fontWeight:700,color:"#22c55e"}}>Receitas por mês</h3>
                    <table><thead><tr><th style={s.th}>Mês</th><th style={s.th}>Total</th></tr></thead>
                      <tbody>{dreData.receitas.map(r=><tr key={r.mes}><td style={s.td}>{r.mes}</td><td style={{...s.td,fontFamily:"monospace",color:"#22c55e"}}>{fmt(r.total)}</td></tr>)}</tbody>
                    </table>
                  </div>
                  <div style={s.card}><h3 style={{margin:"0 0 12px",fontSize:14,fontWeight:700,color:"#f59e0b"}}>Despesas por tipo</h3>
                    <table><thead><tr><th style={s.th}>Mês</th><th style={s.th}>Tipo</th><th style={s.th}>Total</th></tr></thead>
                      <tbody>{dreData.despesas.map((d,i)=><tr key={i}><td style={s.td}>{d.mes}</td><td style={s.td}>{d.tipo}</td><td style={{...s.td,fontFamily:"monospace",color:"#f59e0b"}}>{fmt(d.total)}</td></tr>)}</tbody>
                    </table>
                  </div>
                </div>
                <div style={s.card}><h3 style={{margin:"0 0 12px",fontSize:14,fontWeight:700,color:"#06b6d4"}}>Previsão de Recebimentos</h3>
                  <table><thead><tr><th style={s.th}>Imóvel</th><th style={s.th}>Locatário</th><th style={s.th}>Competência</th><th style={s.th}>Vencimento</th><th style={s.th}>Valor</th><th style={s.th}>Status</th></tr></thead>
                    <tbody>{dreData.previsao.map(p=><tr key={p.id}><td style={s.td}><span style={{fontFamily:"monospace",color:"#818cf8"}}>{p.codigo}</span></td><td style={s.td}>{p.locatario}</td><td style={s.td}>{p.competencia}</td><td style={s.td}>{fmtDate(p.vencimento)}</td><td style={{...s.td,fontFamily:"monospace",color:"#06b6d4"}}>{fmt(p.valor)}</td><td style={s.td}><Badge label={p.status}/></td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RELATÓRIO */}
        {tab==="relatorio"&&isInterno&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <h2 style={{fontWeight:800,fontSize:22,margin:0}}>Relatório ao Locador</h2>
              {relGerado&&dadosRelatorio?.length>0&&<button style={s.btn()} onClick={()=>{const w=window.open("","_blank");w.document.write(`<html><head><title>Relatório</title><style>body{font-family:sans-serif;padding:32px;color:#1a202c}table{width:100%;border-collapse:collapse;font-size:13px;margin:10px 0}th{background:#f1f5f9;padding:7px 10px;text-align:left;font-size:11px}td{padding:7px 10px;border-bottom:1px solid #e2e8f0}</style></head><body>${printRef.current?.innerHTML||""}</body></html>`);w.document.close();setTimeout(()=>w.print(),400);}}>⎙ Imprimir</button>}
            </div>
            <div style={{...s.card,display:"flex",gap:14,alignItems:"flex-end",flexWrap:"wrap"}}>
              <div style={{flex:2,minWidth:160}}><label style={LS}>Locador</label><select style={IS} value={relLocador} onChange={e=>{setRelLocador(e.target.value);setRelGerado(false);}}><option value="">Selecione...</option>{locadoresUnicos.map(l=><option key={l}>{l}</option>)}</select></div>
              <div style={{flex:1,minWidth:130}}><label style={LS}>De</label><input style={IS} type="month" value={relMesInicio} onChange={e=>setRelMesInicio(e.target.value)}/></div>
              <div style={{flex:1,minWidth:130}}><label style={LS}>Até</label><input style={IS} type="month" value={relMesFim} onChange={e=>setRelMesFim(e.target.value)}/></div>
              <button style={{...s.btn(),opacity:relLocador?1:0.4}} disabled={!relLocador} onClick={()=>setRelGerado(true)}>Gerar</button>
            </div>
            {relGerado&&dadosRelatorio&&(
              <div ref={printRef}>
                <div style={{...s.card,borderLeft:"4px solid #6366f1"}}><div style={{fontSize:11,color:"#6366f1",fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Relatório Financeiro ao Locador</div><div style={{fontSize:20,fontWeight:800,marginTop:4}}>{relLocador}</div><div style={{fontSize:12,color:"#64748b",marginTop:2}}>{relMesInicio||relMesFim?`${relMesInicio||"início"} até ${relMesFim||"fim"}`:"Todos os registros"} · {new Date().toLocaleDateString("pt-BR")}</div></div>
                {dadosRelatorio.map(({c,desps,reps,totalDesp,totalRep})=>(
                  <div key={c.id} style={s.card}>
                    <div style={{fontWeight:700,marginBottom:4}}>{c.codigo} — {c.endereco}</div>
                    <div style={{fontSize:12,color:"#64748b",marginBottom:10}}>Locatário: {c.locatarioNomeFull||c.locatario} · Aluguel: {fmt(c.aluguelAtual)}</div>
                    {desps.length>0&&<><div style={{fontSize:11,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Despesas</div><table><thead><tr><th style={s.th}>Data</th><th style={s.th}>Tipo</th><th style={s.th}>Descrição</th><th style={s.th}>Valor</th></tr></thead><tbody>{desps.map(d=><tr key={d.id}><td style={s.td}>{fmtDate(d.data)}</td><td style={s.td}>{d.tipo}</td><td style={s.td}>{d.descricao}</td><td style={{...s.td,fontFamily:"monospace"}}>{fmt(d.valor)}</td></tr>)}</tbody></table></>}
                    {reps.length>0&&<><div style={{fontSize:11,fontWeight:700,color:"#6366f1",textTransform:"uppercase",letterSpacing:1,margin:"10px 0 6px"}}>Repasses</div><table><thead><tr><th style={s.th}>Competência</th><th style={s.th}>Recebido</th><th style={s.th}>Despesas</th><th style={s.th}>Taxa</th><th style={s.th}>Líquido</th></tr></thead><tbody>{reps.map(r=><tr key={r.id}><td style={s.td}>{r.competencia}</td><td style={{...s.td,fontFamily:"monospace"}}>{fmt(r.valorRecebido)}</td><td style={{...s.td,fontFamily:"monospace"}}>{fmt(r.totalDespesas)}</td><td style={{...s.td,fontFamily:"monospace"}}>{fmt(r.taxaAdm)}</td><td style={{...s.td,fontFamily:"monospace",fontWeight:700,color:"#22c55e"}}>{fmt(r.valorLiquido)}</td></tr>)}</tbody></table></>}
                    <div style={{background:"#0f1623",borderRadius:8,padding:12,marginTop:8,display:"flex",gap:24}}><div><div style={{fontSize:11,color:"#64748b"}}>Total despesas</div><div style={{fontFamily:"monospace",color:"#f59e0b",fontWeight:700}}>{fmt(totalDesp)}</div></div><div><div style={{fontSize:11,color:"#64748b"}}>Total repassado</div><div style={{fontFamily:"monospace",color:"#22c55e",fontWeight:700,fontSize:16}}>{fmt(totalRep)}</div></div></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* USUÁRIOS */}
        {tab==="usuarios"&&isAdmin&&(
          <div>
            <h2 style={{fontWeight:800,fontSize:22,marginBottom:16}}>Usuários</h2>
            {usuarios.filter(u=>!u.aprovado).length>0&&(
              <div style={{background:"#f59e0b15",border:"1px solid #f59e0b40",borderRadius:14,padding:16,marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:700,color:"#f59e0b",marginBottom:10}}>⏳ Aguardando aprovação ({usuarios.filter(u=>!u.aprovado).length})</div>
                {usuarios.filter(u=>!u.aprovado).map(u=>(
                  <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #1e2940"}}>
                    <div><div style={{fontSize:14,fontWeight:600}}>{u.nome}</div><div style={{fontSize:12,color:"#64748b"}}>{u.email} · {u.tipoAcesso}</div></div>
                    <div style={{display:"flex",gap:8}}>
                      <button style={s.btn("#22c55e")} onClick={async()=>{const up=await api.updateUsuario(u.id,{nome:u.nome,role:u.role,ativo:true,aprovado:true});setUsuarios(p=>p.map(x=>x.id===u.id?up:x));showToast("Aprovado!");}}>✓ Aprovar</button>
                      <button style={s.btn("#ef4444")} onClick={async()=>{if(!confirm("Rejeitar?"))return;await api.deleteUsuario(u.id);setUsuarios(p=>p.filter(x=>x.id!==u.id));}}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={s.card}>
              <table><thead><tr><th style={s.th}>Nome</th><th style={s.th}>Email</th><th style={s.th}>Tipo</th><th style={s.th}>Perfil</th><th style={s.th}></th></tr></thead>
                <tbody>{usuarios.filter(u=>u.aprovado).map(u=>(
                  <tr key={u.id}>
                    <td style={s.td}>{u.nome}</td><td style={{...s.td,color:"#64748b"}}>{u.email}</td>
                    <td style={s.td}><span style={{fontSize:12,color:"#94a3b8"}}>{u.tipoAcesso}</span></td>
                    <td style={s.td}><span style={{background:u.role==="admin"?"#6366f120":"#1e2940",color:u.role==="admin"?"#818cf8":"#64748b",border:`1px solid ${u.role==="admin"?"#6366f140":"#2d3748"}`,padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:600}}>{u.role==="admin"?"Admin":"Usuário"}</span></td>
                    <td style={s.td}>{u.id!==user.id&&<div style={{display:"flex",gap:6}}>
                      <button style={s.btnG} onClick={async()=>{const up=await api.updateUsuario(u.id,{nome:u.nome,role:u.role==="admin"?"usuario":"admin",ativo:u.ativo,aprovado:u.aprovado});setUsuarios(p=>p.map(x=>x.id===u.id?up:x));}}>{u.role==="admin"?"→ Usuário":"→ Admin"}</button>
                      <button style={s.btnG} onClick={async()=>{const up=await api.updateUsuario(u.id,{nome:u.nome,role:u.role,ativo:!u.ativo,aprovado:u.aprovado});setUsuarios(p=>p.map(x=>x.id===u.id?up:x));}}>{u.ativo?"Desativar":"Ativar"}</button>
                    </div>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* ACERTO FINAL */}
        {tab==="acerto"&&isInterno&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div><h2 style={{fontWeight:800,fontSize:22,margin:0}}>Acerto Final</h2><p style={{color:"#475569",fontSize:13,marginTop:4}}>Encerramento de contrato com prestação de contas</p></div>
              {isAdmin&&<button style={s.btn("#ef4444")} onClick={()=>{setFormAcerto(emptyAcerto);setModalAcerto("new");}}>+ Novo Acerto</button>}
            </div>
            <div style={s.card}>
              {acertos.length===0?<div style={{color:"#475569",textAlign:"center",padding:32}}>Nenhum acerto final registrado</div>:
              <table><thead><tr>
                <th style={s.th}>Imóvel</th><th style={s.th}>Contrato</th><th style={s.th}>Locatário</th>
                <th style={s.th}>Data</th><th style={s.th}>Total Débitos</th><th style={s.th}>Caução Dev.</th>
                <th style={s.th}>Saldo</th><th style={s.th}>Status</th><th style={s.th}></th>
              </tr></thead>
              <tbody>{acertos.map(a=>(
                <tr key={a.id}>
                  <td style={s.td}><span style={{fontFamily:"monospace",color:"#818cf8"}}>{a.codigo}</span></td>
                  <td style={{...s.td,color:"#64748b",fontSize:12}}>{a.endereco}</td>
                  <td style={s.td}>{a.locatario}</td>
                  <td style={s.td}>{fmtDate(a.dataAcerto)}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:"#ef4444"}}>{fmt(a.totalDebitos)}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:"#22c55e"}}>{fmt(a.caucaoDevolvido)}</td>
                  <td style={{...s.td,fontFamily:"monospace",fontWeight:700,color:Number(a.saldoFinal)>=0?"#22c55e":"#ef4444"}}>{fmt(a.saldoFinal)}</td>
                  <td style={s.td}><Badge label={a.status}/></td>
                  <td style={s.td}><div style={{display:"flex",gap:6}}>
                    {isAdmin&&<><button style={s.btnG} onClick={()=>{setFormAcerto({...a,contratoId:String(a.contratoId)});setModalAcerto(a.id);}}>✎</button>
                    <button style={{...s.btnG,color:"#ef4444",borderColor:"#ef444430"}} onClick={async()=>{if(!confirm("Excluir?"))return;await api.deleteAcertoFinal(a.id);setAcertos(p=>p.filter(x=>x.id!==a.id));}}>✕</button></>}
                  </div></td>
                </tr>
              ))}</tbody></table>}
            </div>
          </div>
        )}

      </div>{/* fim main */}

      {/* ── MODAIS ── */}

      {/* MODAL LOCADOR */}
      {modalLocador&&(
        <Modal title={modalLocador==="new"?"Novo Locador":"Editar Locador"} onClose={()=>setModalLocador(null)} wide>
          <ST>Dados Pessoais</ST>
          <R>
            <F label="Nome *" h><input style={IS} value={formLocador.nome} onChange={e=>setFormLocador(p=>({...p,nome:e.target.value}))}/></F>
            <F label="CPF/CNPJ" h><input style={IS} value={formLocador.cpfCnpj||""} onChange={e=>setFormLocador(p=>({...p,cpfCnpj:e.target.value}))}/></F>
            <F label="Nacionalidade" h><input style={IS} value={formLocador.nacionalidade||""} onChange={e=>setFormLocador(p=>({...p,nacionalidade:e.target.value}))}/></F>
            <F label="Estado Civil" h><select style={IS} value={formLocador.estadoCivil||""} onChange={e=>setFormLocador(p=>({...p,estadoCivil:e.target.value}))}><option value="">Selecione</option>{["Solteiro(a)","Casado(a)","Divorciado(a)","Viúvo(a)","União Estável"].map(o=><option key={o}>{o}</option>)}</select></F>
            <F label="Profissão" h><input style={IS} value={formLocador.profissao||""} onChange={e=>setFormLocador(p=>({...p,profissao:e.target.value}))}/></F>
            <F label="RG" h><input style={IS} value={formLocador.rg||""} onChange={e=>setFormLocador(p=>({...p,rg:e.target.value}))}/></F>
            <F label="Órgão" h><input style={IS} value={formLocador.rgOrgao||""} onChange={e=>setFormLocador(p=>({...p,rgOrgao:e.target.value}))}/></F>
            <F label="Telefone" h><input style={IS} value={formLocador.telefone||""} onChange={e=>setFormLocador(p=>({...p,telefone:e.target.value}))}/></F>
            <F label="Email" h><input style={IS} type="email" value={formLocador.email||""} onChange={e=>setFormLocador(p=>({...p,email:e.target.value}))}/></F>
          </R>
          <ST>Endereço</ST>
          <F label="Endereço"><input style={IS} value={formLocador.endereco||""} onChange={e=>setFormLocador(p=>({...p,endereco:e.target.value}))}/></F>
          <R>
            <F label="Bairro" h><input style={IS} value={formLocador.bairro||""} onChange={e=>setFormLocador(p=>({...p,bairro:e.target.value}))}/></F>
            <F label="Cidade" h><input style={IS} value={formLocador.cidade||""} onChange={e=>setFormLocador(p=>({...p,cidade:e.target.value}))}/></F>
            <F label="Estado" h><input style={IS} value={formLocador.estado||""} onChange={e=>setFormLocador(p=>({...p,estado:e.target.value}))}/></F>
            <F label="CEP" h><input style={IS} value={formLocador.cep||""} onChange={e=>setFormLocador(p=>({...p,cep:e.target.value}))}/></F>
          </R>
          <ST>Procurador</ST>
          <R>
            <F label="Nome" h><input style={IS} value={formLocador.procuradorNome||""} onChange={e=>setFormLocador(p=>({...p,procuradorNome:e.target.value}))}/></F>
            <F label="CPF" h><input style={IS} value={formLocador.procuradorCpf||""} onChange={e=>setFormLocador(p=>({...p,procuradorCpf:e.target.value}))}/></F>
            <F label="RG" h><input style={IS} value={formLocador.procuradorRg||""} onChange={e=>setFormLocador(p=>({...p,procuradorRg:e.target.value}))}/></F>
            <F label="Endereço" h><input style={IS} value={formLocador.procuradorEndereco||""} onChange={e=>setFormLocador(p=>({...p,procuradorEndereco:e.target.value}))}/></F>
          </R>
          <ST>Dados Bancários</ST>
          <R>
            <F label="Banco" h><input style={IS} value={formLocador.banco||""} onChange={e=>setFormLocador(p=>({...p,banco:e.target.value}))}/></F>
            <F label="Agência" h><input style={IS} value={formLocador.agencia||""} onChange={e=>setFormLocador(p=>({...p,agencia:e.target.value}))}/></F>
            <F label="Conta" h><input style={IS} value={formLocador.conta||""} onChange={e=>setFormLocador(p=>({...p,conta:e.target.value}))}/></F>
            <F label="Tipo" h><select style={IS} value={formLocador.tipoConta||"Corrente"} onChange={e=>setFormLocador(p=>({...p,tipoConta:e.target.value}))}>{["Corrente","Poupança"].map(o=><option key={o}>{o}</option>)}</select></F>
            <F label="PIX" h><input style={IS} value={formLocador.pix||""} onChange={e=>setFormLocador(p=>({...p,pix:e.target.value}))}/></F>
          </R>
          <F label="Obs"><textarea style={{...IS,minHeight:50}} value={formLocador.obs||""} onChange={e=>setFormLocador(p=>({...p,obs:e.target.value}))}/></F>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:12}}>
            <button style={s.btnG} onClick={()=>setModalLocador(null)}>Cancelar</button>
            <button style={s.btn()} onClick={saveLocador}>Salvar</button>
          </div>
        </Modal>
      )}

      {/* MODAL LOCATÁRIO */}
      {modalLocatario&&(
        <Modal title={modalLocatario==="new"?"Novo Locatário":"Editar Locatário"} onClose={()=>setModalLocatario(null)} wide>
          <ST>Dados Pessoais</ST>
          <R>
            <F label="Nome *" h><input style={IS} value={formLocatario.nome} onChange={e=>setFormLocatario(p=>({...p,nome:e.target.value}))}/></F>
            <F label="CPF" h><input style={IS} value={formLocatario.cpf||""} onChange={e=>setFormLocatario(p=>({...p,cpf:e.target.value}))}/></F>
            <F label="Nacionalidade" h><input style={IS} value={formLocatario.nacionalidade||""} onChange={e=>setFormLocatario(p=>({...p,nacionalidade:e.target.value}))}/></F>
            <F label="Estado Civil" h><select style={IS} value={formLocatario.estadoCivil||""} onChange={e=>setFormLocatario(p=>({...p,estadoCivil:e.target.value}))}><option value="">Selecione</option>{["Solteiro(a)","Casado(a)","Divorciado(a)","Viúvo(a)","União Estável"].map(o=><option key={o}>{o}</option>)}</select></F>
            <F label="Profissão" h><input style={IS} value={formLocatario.profissao||""} onChange={e=>setFormLocatario(p=>({...p,profissao:e.target.value}))}/></F>
            <F label="RG" h><input style={IS} value={formLocatario.rg||""} onChange={e=>setFormLocatario(p=>({...p,rg:e.target.value}))}/></F>
            <F label="Órgão" h><input style={IS} value={formLocatario.rgOrgao||""} onChange={e=>setFormLocatario(p=>({...p,rgOrgao:e.target.value}))}/></F>
            <F label="CNH" h><input style={IS} value={formLocatario.cnh||""} onChange={e=>setFormLocatario(p=>({...p,cnh:e.target.value}))}/></F>
            <F label="Telefone" h><input style={IS} value={formLocatario.telefone||""} onChange={e=>setFormLocatario(p=>({...p,telefone:e.target.value}))}/></F>
            <F label="Email" h><input style={IS} type="email" value={formLocatario.email||""} onChange={e=>setFormLocatario(p=>({...p,email:e.target.value}))}/></F>
            <F label="Renda (R$)" h><input style={IS} type="number" value={formLocatario.renda||""} onChange={e=>setFormLocatario(p=>({...p,renda:e.target.value}))}/></F>
          </R>
          <ST>Endereço</ST>
          <F label="Endereço"><input style={IS} value={formLocatario.endereco||""} onChange={e=>setFormLocatario(p=>({...p,endereco:e.target.value}))}/></F>
          <R>
            <F label="Bairro" h><input style={IS} value={formLocatario.bairro||""} onChange={e=>setFormLocatario(p=>({...p,bairro:e.target.value}))}/></F>
            <F label="Cidade" h><input style={IS} value={formLocatario.cidade||""} onChange={e=>setFormLocatario(p=>({...p,cidade:e.target.value}))}/></F>
            <F label="Estado" h><input style={IS} value={formLocatario.estado||""} onChange={e=>setFormLocatario(p=>({...p,estado:e.target.value}))}/></F>
            <F label="CEP" h><input style={IS} value={formLocatario.cep||""} onChange={e=>setFormLocatario(p=>({...p,cep:e.target.value}))}/></F>
          </R>
          <ST>Fiador</ST>
          <R>
            <F label="Nome" h><input style={IS} value={formLocatario.fiadorNome||""} onChange={e=>setFormLocatario(p=>({...p,fiadorNome:e.target.value}))}/></F>
            <F label="CPF" h><input style={IS} value={formLocatario.fiadorCpf||""} onChange={e=>setFormLocatario(p=>({...p,fiadorCpf:e.target.value}))}/></F>
            <F label="Telefone" h><input style={IS} value={formLocatario.fiadorTelefone||""} onChange={e=>setFormLocatario(p=>({...p,fiadorTelefone:e.target.value}))}/></F>
          </R>
          <F label="Obs"><textarea style={{...IS,minHeight:50}} value={formLocatario.obs||""} onChange={e=>setFormLocatario(p=>({...p,obs:e.target.value}))}/></F>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:12}}>
            <button style={s.btnG} onClick={()=>setModalLocatario(null)}>Cancelar</button>
            <button style={s.btn()} onClick={saveLocatario}>Salvar</button>
          </div>
        </Modal>
      )}

      {/* MODAL IMÓVEL */}
      {modalImovel&&(
        <Modal title={modalImovel==="new"?"Novo Imóvel":"Editar Imóvel"} onClose={()=>setModalImovel(null)} wide>
          <ST>Locador</ST>
          <QSelect label="Locador do imóvel" value={formImovel.locadorId||""} onChange={v=>setFormImovel(p=>({...p,locadorId:v}))} options={locadores} getLabel={o=>o.nome} onAdd={()=>setQuickLocadorForImovel(true)}/>
          <ST>Identificação</ST>
          <R>
            <F label="Código *" h><input style={IS} value={formImovel.codigo} onChange={e=>setFormImovel(p=>({...p,codigo:e.target.value}))} placeholder="AP-001"/></F>
            <F label="Tipo" h><select style={IS} value={formImovel.tipo} onChange={e=>setFormImovel(p=>({...p,tipo:e.target.value}))}>{["Apartamento","Casa","Comercial","Sala","Galpão","Terreno"].map(t=><option key={t}>{t}</option>)}</select></F>
          </R>
          <F label="Endereço *"><input style={IS} value={formImovel.endereco} onChange={e=>setFormImovel(p=>({...p,endereco:e.target.value}))}/></F>
          <R>
            <F label="Bairro" h><input style={IS} value={formImovel.bairro||""} onChange={e=>setFormImovel(p=>({...p,bairro:e.target.value}))}/></F>
            <F label="Cidade" h><input style={IS} value={formImovel.cidade||""} onChange={e=>setFormImovel(p=>({...p,cidade:e.target.value}))}/></F>
            <F label="Estado" h><input style={IS} value={formImovel.estado||""} onChange={e=>setFormImovel(p=>({...p,estado:e.target.value}))}/></F>
            <F label="CEP" h><input style={IS} value={formImovel.cep||""} onChange={e=>setFormImovel(p=>({...p,cep:e.target.value}))}/></F>
            <F label="Área (m²)" h><input style={IS} type="number" value={formImovel.area||""} onChange={e=>setFormImovel(p=>({...p,area:e.target.value}))}/></F>
          </R>
          <ST>Detalhes</ST>
          <R>
            <F label="Nome do Condomínio" h><input style={IS} value={formImovel.nomeCondominio||""} onChange={e=>setFormImovel(p=>({...p,nomeCondominio:e.target.value}))}/></F>
            <F label="Bloco/Torre" h><input style={IS} value={formImovel.bloco||""} onChange={e=>setFormImovel(p=>({...p,bloco:e.target.value}))}/></F>
            <F label="Apto/Unidade" h><input style={IS} value={formImovel.apartamento||""} onChange={e=>setFormImovel(p=>({...p,apartamento:e.target.value}))}/></F>
            <F label="Quartos" h><input style={IS} type="number" value={formImovel.quartos||""} onChange={e=>setFormImovel(p=>({...p,quartos:e.target.value}))}/></F>
            <F label="Mobiliado" h><select style={IS} value={formImovel.mobiliado||"Sem móveis"} onChange={e=>setFormImovel(p=>({...p,mobiliado:e.target.value}))}>{["Mobiliado","Semi-mobiliado","Sem móveis"].map(o=><option key={o}>{o}</option>)}</select></F>
            <F label="Valor Ideal (R$)" h><input style={IS} type="number" value={formImovel.valorIdeal||""} onChange={e=>setFormImovel(p=>({...p,valorIdeal:e.target.value}))}/></F>
          </R>
          <ST>Contatos</ST>
          <R>
            <F label="Tel. Portaria" h><input style={IS} value={formImovel.telPortaria||""} onChange={e=>setFormImovel(p=>({...p,telPortaria:e.target.value}))}/></F>
            <F label="Tel. Síndico" h><input style={IS} value={formImovel.telSindico||""} onChange={e=>setFormImovel(p=>({...p,telSindico:e.target.value}))}/></F>
            <F label="Tel. Contabilidade" h><input style={IS} value={formImovel.telContabilidade||""} onChange={e=>setFormImovel(p=>({...p,telContabilidade:e.target.value}))}/></F>
            <F label="Tel. Cobrança" h><input style={IS} value={formImovel.telCobranca||""} onChange={e=>setFormImovel(p=>({...p,telCobranca:e.target.value}))}/></F>
          </R>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:12}}>
            <button style={s.btnG} onClick={()=>setModalImovel(null)}>Cancelar</button>
            <button style={s.btn()} onClick={saveImovel}>Salvar</button>
          </div>
        </Modal>
      )}

      {/* MODAL CONTRATO */}
      {modalContrato&&(
        <Modal title={modalContrato==="new"?"Novo Contrato":"Editar Contrato"} onClose={()=>setModalContrato(null)} wide>
          <ST>Imóvel</ST>
          <QSelect label="Imóvel *" value={formContrato.imovelId} onChange={v=>{
            const im=imoveis.find(x=>x.id===+v);
            const locadorId=im?.locadorId?+im.locadorId:null;
            const loc=locadorId?locadores.find(l=>l.id===locadorId):null;
            setFormContrato(p=>({...p,
              imovelId:v,
              locadorId:loc?String(loc.id):(p.locadorId||""),
              locador:loc?.nome||im?.locadorNome||"",
              telefoneLocador:loc?.telefone||im?.locadorTel||"",
            }));
          }} options={imoveis} getLabel={o=>`${o.codigo} — ${o.endereco}`} onAdd={()=>setQuickImovel(n=>setFormContrato(p=>({...p,imovelId:String(n.id)})))}/>
          <ST>Partes</ST>
          <R>
            <QSelect label="Locatário *" value={formContrato.locatarioId||""} onChange={v=>{const l=locatarios.find(x=>x.id===+v);setFormContrato(p=>({...p,locatarioId:v,locatario:l?.nome||"",telefoneLocatario:l?.telefone||""}));}} options={locatarios} getLabel={o=>o.nome} onAdd={()=>setQuickLocatario(n=>{setFormContrato(p=>({...p,locatarioId:String(n.id),locatario:n.nome,telefoneLocatario:n.telefone||""}));})} h/>
            <QSelect label="Locador *" value={formContrato.locadorId||""} onChange={v=>{const l=locadores.find(x=>x.id===+v);setFormContrato(p=>({...p,locadorId:v,locador:l?.nome||"",telefoneLocador:l?.telefone||""}));}} options={locadores} getLabel={o=>o.nome} onAdd={()=>setQuickLocador(n=>{setFormContrato(p=>({...p,locadorId:String(n.id),locador:n.nome,telefoneLocador:n.telefone||""}));})} h/>
            <F label="Tel. Locatário" h><input style={IS} value={formContrato.telefoneLocatario||""} onChange={e=>setFormContrato(p=>({...p,telefoneLocatario:e.target.value}))}/></F>
            <F label="Tel. Locador" h><input style={IS} value={formContrato.telefoneLocador||""} onChange={e=>setFormContrato(p=>({...p,telefoneLocador:e.target.value}))}/></F>
          </R>
          <ST>Valores</ST>
          <R>
            <PF label="Aluguel (R$) *" vk="aluguelInicial" pk="aluguelPagaPor" form={formContrato} set={setFormContrato}/>
            <PF label="Condomínio (R$)" vk="condominio" pk="condominioPagaPor" form={formContrato} set={setFormContrato}/>
            <PF label="IPTU (R$)" vk="iptu" pk="iptuPagaPor" form={formContrato} set={setFormContrato}/>
            <F label="Caução (R$)" h><input style={IS} type="number" value={formContrato.caucao||""} onChange={e=>setFormContrato(p=>({...p,caucao:e.target.value}))}/></F>
            <F label="Garantia" h>
              <select style={IS} value={formContrato.garantia||""} onChange={e=>setFormContrato(p=>({...p,garantia:e.target.value}))}>
                <option value="">Selecione...</option>
                {garantiaOpts.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </F>
            <F label="Gerenciar opções de garantia">
              <div style={{background:"#0f1623",borderRadius:8,padding:12,border:"1px solid #2d3748"}}>
                <div style={{display:"flex",gap:6,marginBottom:8}}>
                  <input style={{...IS,flex:1}} placeholder="Nova opção..." value={novaGarantia} onChange={e=>setNovaGarantia(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&novaGarantia.trim()){saveGarantiaOpts([...garantiaOpts,novaGarantia.trim()]);setNovaGarantia("");}}}/>
                  <button style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"0 14px",cursor:"pointer",fontWeight:700,fontSize:16,fontFamily:"inherit"}} onClick={()=>{if(novaGarantia.trim()){saveGarantiaOpts([...garantiaOpts,novaGarantia.trim()]);setNovaGarantia("");}}}>+</button>
                </div>
                {garantiaOpts.map((o,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    {editGarantia===i
                      ? <input style={{...IS,flex:1}} value={o} onChange={e=>{const n=[...garantiaOpts];n[i]=e.target.value;saveGarantiaOpts(n);}} onBlur={()=>setEditGarantia(null)} autoFocus/>
                      : <span style={{flex:1,fontSize:13,color:"#cbd5e1"}}>{o}</span>
                    }
                    <button style={{background:"transparent",border:"1px solid #2d3748",borderRadius:6,color:"#94a3b8",padding:"2px 8px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}} onClick={()=>setEditGarantia(i)}>✎</button>
                    <button style={{background:"transparent",border:"1px solid #ef444430",borderRadius:6,color:"#ef4444",padding:"2px 8px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}} onClick={()=>{const n=garantiaOpts.filter((_,j)=>j!==i);saveGarantiaOpts(n);if(formContrato.garantia===o)setFormContrato(p=>({...p,garantia:""}));}}>✕</button>
                  </div>
                ))}
              </div>
            </F>
            <F label="Taxa Adm (%)" h>
              <input style={IS} type="number" value={formContrato.taxaAdmPct} onChange={e=>setFormContrato(p=>({...p,taxaAdmPct:e.target.value}))}/>
              {formContrato.aluguelInicial&&<div style={{fontSize:11,color:"#6366f1",marginTop:3}}>= {fmt((+formContrato.aluguelInicial*+formContrato.taxaAdmPct)/100)}/mês</div>}
            </F>
            <F label="Dia Vencimento" h><input style={IS} type="number" min="1" max="31" value={formContrato.vencimento||""} onChange={e=>setFormContrato(p=>({...p,vencimento:e.target.value}))}/></F>
            <F label="Forma Pagamento" h><select style={IS} value={formContrato.formaPagamento} onChange={e=>setFormContrato(p=>({...p,formaPagamento:e.target.value}))}>{fpOpts.map(o=><option key={o}>{o}</option>)}</select></F>
            <F label="Índice Reajuste" h><select style={IS} value={formContrato.indiceReajuste||"IGPM"} onChange={e=>setFormContrato(p=>({...p,indiceReajuste:e.target.value}))}>{indiceOpts.map(o=><option key={o}>{o}</option>)}</select></F>
          </R>
          <ST>Prazo</ST>
          <R>
            <F label="Início *" h><input style={IS} type="date" value={formContrato.inicio||""} onChange={e=>setFormContrato(p=>({...p,inicio:e.target.value}))}/></F>
            <F label="Duração (meses)" h><input style={IS} type="number" value={formContrato.duracaoMeses||""} onChange={e=>setFormContrato(p=>({...p,duracaoMeses:e.target.value}))}/></F>
            {formContrato.inicio&&formContrato.duracaoMeses&&(
              <F label="Término" h><input style={{...IS,color:"#94a3b8"}} readOnly value={(() => { const d=new Date(formContrato.inicio); d.setMonth(d.getMonth()+ +formContrato.duracaoMeses); return d.toLocaleDateString("pt-BR"); })()}/></F>
            )}
            <F label="Status" h><select style={IS} value={formContrato.status} onChange={e=>setFormContrato(p=>({...p,status:e.target.value}))}>{["Ativo","Encerrado","Inativo"].map(t=><option key={t}>{t}</option>)}</select></F>
          </R>
          <ST>Penalidades</ST>
          <R>
            <F label="Multa atraso (%)" h><input style={IS} type="number" value={formContrato.multaAtrasoPct||""} onChange={e=>setFormContrato(p=>({...p,multaAtrasoPct:e.target.value}))}/></F>
            <F label="Juros (% a.m.)" h><input style={IS} type="number" value={formContrato.jurosAtrasoPct||""} onChange={e=>setFormContrato(p=>({...p,jurosAtrasoPct:e.target.value}))}/></F>
            <F label="Hon. cobrança (%)" h><input style={IS} type="number" value={formContrato.honorariosPct||""} onChange={e=>setFormContrato(p=>({...p,honorariosPct:e.target.value}))}/></F>
            <F label="Após dias" h><input style={IS} type="number" value={formContrato.honorariosDias||""} onChange={e=>setFormContrato(p=>({...p,honorariosDias:e.target.value}))}/></F>
            <F label="Hon. advogado (%)" h><input style={IS} type="number" value={formContrato.honorariosAdvPct||""} onChange={e=>setFormContrato(p=>({...p,honorariosAdvPct:e.target.value}))}/></F>
            <F label="Após dias" h><input style={IS} type="number" value={formContrato.honorariosAdvDias||""} onChange={e=>setFormContrato(p=>({...p,honorariosAdvDias:e.target.value}))}/></F>
          </R>
          <ST>Contrato PDF</ST>
          <F label="Upload"><input style={IS} type="file" accept=".pdf" onChange={e=>setContratoFile(e.target.files[0])}/></F>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:12}}>
            <button style={s.btnG} onClick={()=>setModalContrato(null)}>Cancelar</button>
            <button style={s.btn()} onClick={saveContrato}>Salvar e Gerar Parcelas</button>
          </div>
        </Modal>
      )}

      {/* MODAL PARCELAS */}
      {modalParcelas&&(
        <Modal title="Parcelas do Contrato" onClose={()=>{setModalParcelas(null);setParcelas([]);setParcelaEdit(null);setReajustes([]);}} wide>
          <div style={{maxHeight:360,overflowY:"auto",marginBottom:16}}>
            <table><thead><tr>
              <th style={s.th}>Competência</th><th style={s.th}>Vencimento</th><th style={s.th}>Valor</th>
              <th style={s.th}>Recebido</th><th style={s.th}>Data Rec.</th><th style={s.th}>Status</th><th style={s.th}></th>
            </tr></thead>
              <tbody>{parcelas.map(p=>(
                <tr key={p.id} style={{background:parcelaEdit?.id===p.id?"#6366f108":"transparent"}}>
                  <td style={s.td}>{p.competencia}</td>
                  <td style={{...s.td,color:p.status!=="Pago"&&new Date(p.vencimento+"T12:00:00")<new Date()?"#ef4444":"#cbd5e1"}}>{fmtDate(p.vencimento)}</td>
                  <td style={{...s.td,fontFamily:"monospace"}}>{parcelaEdit?.id===p.id?<input style={{...IS,width:100}} type="number" value={parcelaEdit.valor} onChange={e=>setParcelaEdit(x=>({...x,valor:e.target.value}))}/>:fmt(p.valor)}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:"#22c55e"}}>{parcelaEdit?.id===p.id?<input style={{...IS,width:100}} type="number" value={parcelaEdit.valorRecebido||""} onChange={e=>setParcelaEdit(x=>({...x,valorRecebido:e.target.value}))} placeholder="0"/>:fmt(p.valorRecebido||0)}</td>
                  <td style={s.td}>{parcelaEdit?.id===p.id?<input style={{...IS,width:130}} type="date" value={parcelaEdit.dataRecebimento||""} onChange={e=>setParcelaEdit(x=>({...x,dataRecebimento:e.target.value}))}/>:fmtDate(p.dataRecebimento)}</td>
                  <td style={s.td}>{parcelaEdit?.id===p.id?<select style={{...IS,width:110}} value={parcelaEdit.status} onChange={e=>setParcelaEdit(x=>({...x,status:e.target.value}))}>{["Pendente","Pago","Atrasado"].map(st=><option key={st}>{st}</option>)}</select>:<Badge label={p.status}/>}</td>
                  <td style={s.td}>{parcelaEdit?.id===p.id?<div style={{display:"flex",gap:4}}><button style={s.btn("#22c55e")} onClick={saveParcela}>✓</button><button style={s.btnG} onClick={()=>setParcelaEdit(null)}>✕</button></div>:<button style={s.btnG} onClick={()=>setParcelaEdit({...p,valor:String(p.valor),valorRecebido:String(p.valorRecebido||""),dataRecebimento:p.dataRecebimento?.slice(0,10)||""})}>✎</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <ST>Histórico de Reajustes</ST>
          {reajustes.length===0?<div style={{color:"#475569",fontSize:13}}>Nenhum reajuste</div>:
          <table><thead><tr><th style={s.th}>Data</th><th style={s.th}>Índice</th><th style={s.th}>Período</th><th style={s.th}>Anterior</th><th style={s.th}>%</th><th style={s.th}>Novo</th></tr></thead>
            <tbody>{reajustes.map(r=><tr key={r.id}><td style={s.td}>{fmtDate(r.dataReajuste)}</td><td style={s.td}>{r.indice}</td><td style={s.td}>{fmtDate(r.periodoInicio)} a {fmtDate(r.periodoFim)}</td><td style={{...s.td,fontFamily:"monospace"}}>{fmt(r.valorAnterior)}</td><td style={{...s.td,color:"#22c55e"}}>{r.percentual}%</td><td style={{...s.td,fontFamily:"monospace",fontWeight:700}}>{fmt(r.valorNovo)}</td></tr>)}</tbody>
          </table>}
        </Modal>
      )}

      {/* MODAL REAJUSTE */}
      {modalReajuste&&(
        <Modal title="Registrar Reajuste Anual" onClose={()=>setModalReajuste(null)}>
          <R>
            <F label="Data *" h><input style={IS} type="date" value={formReajuste.dataReajuste} onChange={e=>setFormReajuste(p=>({...p,dataReajuste:e.target.value}))}/></F>
            <F label="Índice" h><select style={IS} value={formReajuste.indice} onChange={e=>setFormReajuste(p=>({...p,indice:e.target.value}))}>{indiceOpts.map(o=><option key={o}>{o}</option>)}</select></F>
            <F label="Período De" h><input style={IS} type="date" value={formReajuste.periodoInicio||""} onChange={e=>setFormReajuste(p=>({...p,periodoInicio:e.target.value}))}/></F>
            <F label="Período Até" h><input style={IS} type="date" value={formReajuste.periodoFim||""} onChange={e=>setFormReajuste(p=>({...p,periodoFim:e.target.value}))}/></F>
            <F label="Valor anterior (R$)" h><input style={IS} type="number" value={formReajuste.valorAnterior||""} onChange={e=>{const va=+e.target.value;setFormReajuste(p=>({...p,valorAnterior:e.target.value,valorNovo:(va*(1+(+p.percentual/100))).toFixed(2)}));}}/></F>
            <F label="Percentual (%)" h><input style={IS} type="number" value={formReajuste.percentual||""} onChange={e=>{const pct=+e.target.value;setFormReajuste(p=>({...p,percentual:e.target.value,valorNovo:(+p.valorAnterior*(1+pct/100)).toFixed(2)}));}}/></F>
            <F label="Valor novo (R$) *" h>
              <input style={IS} type="number" value={formReajuste.valorNovo||""} onChange={e=>setFormReajuste(p=>({...p,valorNovo:e.target.value}))}/>
              {formReajuste.valorAnterior&&formReajuste.valorNovo&&<div style={{fontSize:11,color:"#22c55e",marginTop:3}}>+{fmt(+formReajuste.valorNovo-+formReajuste.valorAnterior)}/mês</div>}
            </F>
          </R>
          <F label="Observação"><input style={IS} value={formReajuste.obs||""} onChange={e=>setFormReajuste(p=>({...p,obs:e.target.value}))}/></F>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <button style={s.btnG} onClick={()=>setModalReajuste(null)}>Cancelar</button>
            <button style={s.btn("#22c55e")} onClick={saveReajuste}>Salvar</button>
          </div>
        </Modal>
      )}

      {/* MODAL REPASSE */}
      {modalRepasse&&(
        <Modal title="Gerar Repasse ao Locador" onClose={()=>setModalRepasse(null)}>
          <F label="Contrato *">
            <select style={IS} value={formRepasse.contratoId} onChange={e=>{const c=calcRepasse(e.target.value);setFormRepasse(p=>({...p,contratoId:e.target.value,...c}));}}>
              <option value="">Selecione...</option>
              {contratos.filter(c=>c.status==="Ativo").map(c=><option key={c.id} value={c.id}>{c.codigo} — {c.locadorNomeFull||c.locador}</option>)}
            </select>
          </F>
          {formRepasse.contratoId&&(()=>{
            const c=contratos.find(x=>x.id===+formRepasse.contratoId);
            return c&&<div style={{background:"#6366f108",border:"1px solid #6366f130",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:13,color:"#818cf8"}}>
              Locador: <strong>{c.locadorNomeFull||c.locador}</strong> · {c.formaPagamento||"Pix"}
            </div>;
          })()}
          <R>
            <F label="Competência *" h><input style={IS} value={formRepasse.competencia||""} onChange={e=>setFormRepasse(p=>({...p,competencia:e.target.value}))} placeholder="Ex: Maio/2025"/></F>
            <F label="Data" h><input style={IS} type="date" value={formRepasse.dataRepasse||""} onChange={e=>setFormRepasse(p=>({...p,dataRepasse:e.target.value}))}/></F>
          </R>
          {formRepasse.contratoId&&(
            <div style={{background:"#0f1623",borderRadius:10,padding:14,marginBottom:14,border:"1px solid #2d3748"}}>
              <div style={{fontSize:11,color:"#6366f1",fontWeight:700,marginBottom:10}}>ACERTO — edite se necessário</div>
              <R>
                <F label="Valor recebido (R$)" h><input style={IS} type="number" value={formRepasse.valorRecebido||""} onChange={e=>setFormRepasse(p=>({...p,valorRecebido:e.target.value,valorLiquido:(+e.target.value-+p.totalDespesas-+p.taxaAdm).toFixed(2)}))}/></F>
                <F label="Total despesas (R$)" h><input style={IS} type="number" value={formRepasse.totalDespesas||""} onChange={e=>setFormRepasse(p=>({...p,totalDespesas:e.target.value,valorLiquido:(+p.valorRecebido-+e.target.value-+p.taxaAdm).toFixed(2)}))}/></F>
                <F label="Taxa adm (R$)" h><input style={IS} type="number" value={formRepasse.taxaAdm||""} onChange={e=>setFormRepasse(p=>({...p,taxaAdm:e.target.value,valorLiquido:(+p.valorRecebido-+p.totalDespesas-+e.target.value).toFixed(2)}))}/></F>
                <F label="Valor líquido (R$)" h><input style={{...IS,color:"#22c55e",fontWeight:700}} type="number" value={formRepasse.valorLiquido||""} onChange={e=>setFormRepasse(p=>({...p,valorLiquido:e.target.value}))}/></F>
              </R>
            </div>
          )}
          <R>
            <F label="Forma pagamento" h><select style={IS} value={formRepasse.formaPagamento} onChange={e=>setFormRepasse(p=>({...p,formaPagamento:e.target.value}))}>{fpOpts.map(o=><option key={o}>{o}</option>)}</select></F>
            <F label="Status" h><select style={IS} value={formRepasse.status} onChange={e=>setFormRepasse(p=>({...p,status:e.target.value}))}>{["Pendente","Repassado"].map(t=><option key={t}>{t}</option>)}</select></F>
          </R>
          <F label="Comprovante"><input style={IS} type="file" accept=".pdf,image/*" onChange={e=>setComprovanteFile(e.target.files[0])}/></F>
          <F label="Observação"><input style={IS} value={formRepasse.obs||""} onChange={e=>setFormRepasse(p=>({...p,obs:e.target.value}))}/></F>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <button style={s.btnG} onClick={()=>setModalRepasse(null)}>Cancelar</button>
            <button style={s.btn("#06b6d4")} onClick={saveRepasse}>Confirmar</button>
          </div>
        </Modal>
      )}

      {/* MODAL DESPESA */}
      {modalDespesa&&(
        <Modal title={modalDespesa==="new"?"Registrar Despesa":"Editar Despesa"} onClose={()=>setModalDespesa(null)}>
          <F label="Contrato *">
            <select style={IS} value={formDespesa.contratoId} onChange={e=>{
              const c=contratos.find(x=>x.id===+e.target.value);
              const im=c?imoveis.find(x=>x.id===c.imovelId):null;
              setFormDespesa(p=>({...p,contratoId:e.target.value,imovelInfo:im?`${im.codigo} — ${im.endereco}`:""}));
            }}>
              <option value="">Selecione...</option>
              {contratos.map(c=><option key={c.id} value={c.id}>{c.codigo} — {c.locatario}</option>)}
            </select>
          </F>
          {formDespesa.imovelInfo&&(
            <div style={{background:"#6366f108",border:"1px solid #6366f130",borderRadius:8,padding:"7px 12px",marginBottom:12,fontSize:13,color:"#818cf8"}}>
              Imóvel: {formDespesa.imovelInfo}
            </div>
          )}
          <R>
            <F label="Data *" h><input style={IS} type="date" value={formDespesa.data||""} onChange={e=>setFormDespesa(p=>({...p,data:e.target.value}))}/></F>
            <F label="Valor (R$) *" h><input style={IS} type="number" value={formDespesa.valor||""} onChange={e=>setFormDespesa(p=>({...p,valor:e.target.value}))}/></F>
            <F label="Tipo" h><select style={IS} value={formDespesa.tipo} onChange={e=>setFormDespesa(p=>({...p,tipo:e.target.value}))}>{["Manutenção","Condomínio","IPTU","Seguro","Pintura","Elétrica","Hidráulica","Outros"].map(t=><option key={t}>{t}</option>)}</select></F>
            <F label="Status" h><select style={IS} value={formDespesa.status} onChange={e=>setFormDespesa(p=>({...p,status:e.target.value}))}>{["Pago","Pendente"].map(t=><option key={t}>{t}</option>)}</select></F>
          </R>
          <F label="Descrição"><input style={IS} value={formDespesa.descricao||""} onChange={e=>setFormDespesa(p=>({...p,descricao:e.target.value}))}/></F>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <button style={s.btnG} onClick={()=>setModalDespesa(null)}>Cancelar</button>
            <button style={s.btn("#f59e0b")} onClick={saveDespesa}>Salvar</button>
          </div>
        </Modal>
      )}

      {/* MODAL COMPROVANTE */}
      {repasseId&&(
        <Modal title="Confirmar Repasse" onClose={()=>setRepasseId(null)}>
          <F label="Comprovante (PDF ou imagem)"><input style={IS} type="file" accept=".pdf,image/*" onChange={e=>setComprovanteFile(e.target.files[0])}/></F>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <button style={s.btnG} onClick={()=>setRepasseId(null)}>Cancelar</button>
            <button style={s.btn("#22c55e")} onClick={()=>marcarRepassado(repasseId)}>Confirmar</button>
          </div>
        </Modal>
      )}

      {/* MODAL ACERTO FINAL */}
      {modalAcerto&&(
        <Modal title={modalAcerto==="new"?"Novo Acerto Final":"Editar Acerto Final"} onClose={()=>setModalAcerto(null)} wide>
          <ST>Contrato</ST>
          <F label="Contrato *">
            <select style={IS} value={formAcerto.contratoId||""} onChange={e=>{
              const c=contratos.find(x=>x.id===+e.target.value);
              setFormAcerto(p=>({...p,contratoId:e.target.value,multaRescisao:c?Number(c.caucao)||0:0,caucaoDevolvido:c?Number(c.caucao)||0:0}));
            }}>
              <option value="">Selecione...</option>
              {contratos.map(c=><option key={c.id} value={c.id}>{c.codigo} — {c.locatario} ({c.status})</option>)}
            </select>
          </F>
          <R>
            <F label="Data do Acerto" h><input style={IS} type="date" value={formAcerto.dataAcerto||""} onChange={e=>setFormAcerto(p=>({...p,dataAcerto:e.target.value}))}/></F>
            <F label="Status" h><select style={IS} value={formAcerto.status} onChange={e=>setFormAcerto(p=>({...p,status:e.target.value}))}>{["Pendente","Concluído"].map(t=><option key={t}>{t}</option>)}</select></F>
          </R>

          <ST>Contas e Débitos do Locatário</ST>
          {[
            ["energia","Energia Elétrica"],["agua","Água"],["gas","Gás"],
            ["condominio","Condomínio"],["iptu","IPTU"],
          ].map(([k,l])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #1e2940"}}>
              <span style={{fontSize:13,color:"#cbd5e1"}}>{l}</span>
              <input style={{...IS,width:150,textAlign:"right"}} type="number" placeholder="0,00" value={formAcerto[k]||0} onChange={e=>setFormAcerto(p=>({...p,[k]:e.target.value}))}/>
            </div>
          ))}

          <ST>Serviços de Limpeza e Conservação</ST>
          {[
            ["limpezaEstofados","Limpeza de Estofados"],["limpezaArCondicionado","Limpeza de Ar Condicionado"],
            ["faxina","Faxina Geral"],["pintura","Pintura"],
            ["reparosHidraulicos","Reparos Hidráulicos"],["reparosEletricos","Reparos Elétricos"],
            ["vidrosJanelas","Vidros e Janelas"],["chavesFechaduras","Chaves e Fechaduras"],
          ].map(([k,l])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #1e2940"}}>
              <span style={{fontSize:13,color:"#cbd5e1"}}>{l}</span>
              <input style={{...IS,width:150,textAlign:"right"}} type="number" placeholder="0,00" value={formAcerto[k]||0} onChange={e=>setFormAcerto(p=>({...p,[k]:e.target.value}))}/>
            </div>
          ))}

          <ST>Penalidades</ST>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #1e2940"}}>
            <span style={{fontSize:13,color:"#cbd5e1"}}>Multa de Rescisão</span>
            <input style={{...IS,width:150,textAlign:"right"}} type="number" placeholder="0,00" value={formAcerto.multaRescisao||0} onChange={e=>setFormAcerto(p=>({...p,multaRescisao:e.target.value}))}/>
          </div>

          <ST>Outros</ST>
          <R>
            <F label="Descrição" h><input style={IS} placeholder="Ex: Antena, portão..." value={formAcerto.outrosDescricao||""} onChange={e=>setFormAcerto(p=>({...p,outrosDescricao:e.target.value}))}/></F>
            <F label="Valor (R$)" h><input style={IS} type="number" placeholder="0,00" value={formAcerto.outrosValor||0} onChange={e=>setFormAcerto(p=>({...p,outrosValor:e.target.value}))}/></F>
          </R>

          <ST>Caução e Saldo Final</ST>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #1e2940"}}>
            <span style={{fontSize:13,color:"#cbd5e1"}}>Caução a Devolver (R$)</span>
            <input style={{...IS,width:150,textAlign:"right"}} type="number" value={formAcerto.caucaoDevolvido||0} onChange={e=>setFormAcerto(p=>({...p,caucaoDevolvido:e.target.value}))}/>
          </div>

          {/* Preview do saldo */}
          {(()=>{
            const debitos=[formAcerto.energia,formAcerto.agua,formAcerto.gas,formAcerto.condominio,formAcerto.iptu,formAcerto.limpezaEstofados,formAcerto.limpezaArCondicionado,formAcerto.faxina,formAcerto.pintura,formAcerto.reparosHidraulicos,formAcerto.reparosEletricos,formAcerto.vidrosJanelas,formAcerto.chavesFechaduras,formAcerto.multaRescisao,formAcerto.outrosValor].reduce((s,v)=>s+Number(v||0),0);
            const saldo=Number(formAcerto.caucaoDevolvido||0)-debitos;
            return(
              <div style={{background:"#0f1623",borderRadius:10,padding:16,marginTop:14,border:"1px solid #2d3748"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{color:"#64748b",fontSize:13}}>Total de Débitos</span>
                  <span style={{fontFamily:"monospace",color:"#ef4444",fontWeight:700}}>{fmt(debitos)}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{color:"#64748b",fontSize:13}}>Caução</span>
                  <span style={{fontFamily:"monospace",color:"#22c55e"}}>{fmt(formAcerto.caucaoDevolvido||0)}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",paddingTop:8,borderTop:"1px solid #2d3748"}}>
                  <span style={{fontWeight:700,fontSize:14}}>Saldo Final</span>
                  <span style={{fontFamily:"monospace",fontWeight:800,fontSize:16,color:saldo>=0?"#22c55e":"#ef4444"}}>{fmt(saldo)}</span>
                </div>
                <div style={{fontSize:11,color:"#475569",marginTop:6}}>{saldo>=0?"✓ Locatário recebe de volta":"✗ Locatário deve pagar a diferença"}</div>
              </div>
            );
          })()}

          <F label="Observações"><textarea style={{...IS,minHeight:60,marginTop:14}} value={formAcerto.obs||""} onChange={e=>setFormAcerto(p=>({...p,obs:e.target.value}))}/></F>

          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:12}}>
            <button style={s.btnG} onClick={()=>setModalAcerto(null)}>Cancelar</button>
            <button style={s.btn("#ef4444")} onClick={async()=>{
              if(!formAcerto.contratoId)return showToast("Selecione o contrato","error");
              try{
                if(modalAcerto==="new"){const n=await api.createAcertoFinal({...formAcerto,contratoId:+formAcerto.contratoId});setAcertos(p=>[n,...p]);showToast("Acerto registrado!");}
                else{const n=await api.updateAcertoFinal(modalAcerto,formAcerto);setAcertos(p=>p.map(x=>x.id===modalAcerto?n:x));showToast("Atualizado!");}
                setModalAcerto(null);
              }catch(e){showToast(e.message,"error");}
            }}>Salvar Acerto</button>
          </div>
        </Modal>
      )}

      {/* DETALHE */}
      {modalDetalhe&&(
        <DetalheModal tipo={modalDetalhe.tipo} data={modalDetalhe.data} onClose={()=>setModalDetalhe(null)} isAdmin={isAdmin} showToast={showToast}/>
      )}
    </div>
  );
}
