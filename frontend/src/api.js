const BASE = import.meta.env.VITE_API_URL || "";

const req = async (method, path, body, isFormData = false) => {
  const token = localStorage.getItem("token");
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (!isFormData) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method, headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { localStorage.clear(); window.location.reload(); return; }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
    throw new Error(err.error || `Erro ${res.status}`);
  }
  return res.json();
};

const fd = (file, field, extra) => {
  const f = new FormData();
  f.append(field, file);
  if (extra) Object.entries(extra).forEach(([k,v]) => f.append(k, v));
  return f;
};

export const api = {
  login: (d) => req("POST", "/api/auth/login", d),
  register: (d) => req("POST", "/api/auth/register", d),
  getDashboard: () => req("GET", "/api/dashboard"),
  getDre: (inicio, fim) => req("GET", `/api/dre${inicio&&fim?`?inicio=${inicio}&fim=${fim}`:""}`),
  getInadimplencia: () => req("GET", "/api/inadimplencia"),
  getUsuarios: () => req("GET", "/api/usuarios"),
  updateUsuario: (id, d) => req("PUT", `/api/usuarios/${id}`, d),
  deleteUsuario: (id) => req("DELETE", `/api/usuarios/${id}`),
  getLocadores: () => req("GET", "/api/locadores"),
  createLocador: (d) => req("POST", "/api/locadores", d),
  updateLocador: (id, d) => req("PUT", `/api/locadores/${id}`, d),
  deleteLocador: (id) => req("DELETE", `/api/locadores/${id}`),
  getLocatarios: () => req("GET", "/api/locatarios"),
  createLocatario: (d) => req("POST", "/api/locatarios", d),
  updateLocatario: (id, d) => req("PUT", `/api/locatarios/${id}`, d),
  deleteLocatario: (id) => req("DELETE", `/api/locatarios/${id}`),
  getDocsPessoa: (tipo, id) => req("GET", `/api/documentos-pessoa/${tipo}/${id}`),
  uploadDocPessoa: (tipo, id, docTipo, file) => req("POST", `/api/documentos-pessoa/${tipo}/${id}`, fd(file, "arquivo", { tipo: docTipo }), true),
  deleteDocPessoa: (id) => req("DELETE", `/api/documentos-pessoa/${id}`),
  getDocUrl: (id) => req("GET", `/api/documentos/${id}/url`),
  getImoveis: () => req("GET", "/api/imoveis"),
  createImovel: (d) => req("POST", "/api/imoveis", d),
  updateImovel: (id, d) => req("PUT", `/api/imoveis/${id}`, d),
  deleteImovel: (id) => req("DELETE", `/api/imoveis/${id}`),
  getDocsImovel: (id) => req("GET", `/api/imoveis/${id}/documentos`),
  uploadDocImovel: (id, tipo, file) => req("POST", `/api/imoveis/${id}/documentos`, fd(file, "arquivo", { tipo }), true),
  getDocImovelUrl: (id) => req("GET", `/api/imoveis-doc/${id}/url`),
  deleteDocImovel: (id) => req("DELETE", `/api/imoveis-doc/${id}`),
  getVistorias: (id) => req("GET", `/api/imoveis/${id}/vistorias`),
  createVistoria: (id, d) => req("POST", `/api/imoveis/${id}/vistorias`, d),
  getFotoVistoriaUrl: (id) => req("GET", `/api/vistoria-foto/${id}/url`),
  getHistorico: (id) => req("GET", `/api/imoveis/${id}/historico`),
  addHistorico: (id, d) => req("POST", `/api/imoveis/${id}/historico`, d),
  getContratos: (imovelId) => req("GET", `/api/contratos${imovelId?`?imovelId=${imovelId}`:""}`),
  createContrato: (d) => req("POST", "/api/contratos", d),
  updateContrato: (id, d) => req("PUT", `/api/contratos/${id}`, d),
  deleteContrato: (id) => req("DELETE", `/api/contratos/${id}`),
  uploadContratoPdf: (id, file) => req("POST", `/api/contratos/${id}/pdf`, fd(file, "contrato"), true),
  getContratoPdfUrl: (id) => req("GET", `/api/contratos/${id}/pdf/url`),
  getReajustes: (id) => req("GET", `/api/contratos/${id}/reajustes`),
  createReajuste: (id, d) => req("POST", `/api/contratos/${id}/reajustes`, d),
  getParcelas: (id) => req("GET", `/api/contratos/${id}/parcelas`),
  updateParcela: (id, d) => req("PUT", `/api/parcelas/${id}`, d),
  getDespesas: () => req("GET", "/api/despesas"),
  createDespesa: (d) => req("POST", "/api/despesas", d),
  updateDespesa: (id, d) => req("PUT", `/api/despesas/${id}`, d),
  deleteDespesa: (id) => req("DELETE", `/api/despesas/${id}`),
  getRepasses: () => req("GET", "/api/repasses"),
  createRepasse: (d) => req("POST", "/api/repasses", d),
  updateRepasse: (id, d) => req("PUT", `/api/repasses/${id}`, d),
  uploadComprovante: (id, file) => req("POST", `/api/repasses/${id}/comprovante`, fd(file, "comprovante"), true),
  getComprovanteUrl: (id) => req("GET", `/api/repasses/${id}/comprovante/url`),
  getDocsRepasse: (id) => req("GET", `/api/repasses/${id}/documentos`),
  uploadDocRepasse: (id, file) => req("POST", `/api/repasses/${id}/documentos`, fd(file, "arquivo"), true),
  getDocRepasseUrl: (id) => req("GET", `/api/repasse-doc/${id}/url`),
  getAcertoFinal: () => req("GET", "/api/acerto-final"),
  getAcertoFinalContrato: (id) => req("GET", `/api/contratos/${id}/acerto-final`),
  createAcertoFinal: (d) => req("POST", "/api/acerto-final", d),
  updateAcertoFinal: (id, d) => req("PUT", `/api/acerto-final/${id}`, d),
  deleteAcertoFinal: (id) => req("DELETE", `/api/acerto-final/${id}`),
};
