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
  getUsuarios: () => req("GET", "/api/usuarios"),
  updateUsuario: (id, d) => req("PUT", `/api/usuarios/${id}`, d),
  deleteUsuario: (id) => req("DELETE", `/api/usuarios/${id}`),
  getProprietarios: () => req("GET", "/api/proprietarios"),
  createProprietario: (d) => req("POST", "/api/proprietarios", d),
  updateProprietario: (id, d) => req("PUT", `/api/proprietarios/${id}`, d),
  deleteProprietario: (id) => req("DELETE", `/api/proprietarios/${id}`),
  getImoveis: () => req("GET", "/api/imoveis"),
  createImovel: (d) => req("POST", "/api/imoveis", d),
  updateImovel: (id, d) => req("PUT", `/api/imoveis/${id}`, d),
  deleteImovel: (id) => req("DELETE", `/api/imoveis/${id}`),
  getDocumentos: (imovelId) => req("GET", `/api/imoveis/${imovelId}/documentos`),
  uploadDocumento: (imovelId, tipo, file) => req("POST", `/api/imoveis/${imovelId}/documentos`, fd(file, "arquivo", { tipo }), true),
  getDocumentoUrl: (id) => req("GET", `/api/documentos/${id}/url`),
  deleteDocumento: (id) => req("DELETE", `/api/documentos/${id}`),
  getContratos: (imovelId) => req("GET", `/api/contratos${imovelId ? `?imovelId=${imovelId}` : ""}`),
  createContrato: (d) => req("POST", "/api/contratos", d),
  updateContrato: (id, d) => req("PUT", `/api/contratos/${id}`, d),
  deleteContrato: (id) => req("DELETE", `/api/contratos/${id}`),
  uploadContratoPdf: (id, file) => req("POST", `/api/contratos/${id}/pdf`, fd(file, "contrato"), true),
  getContratoPdfUrl: (id) => req("GET", `/api/contratos/${id}/pdf/url`),
  getReajustes: (contratoId) => req("GET", `/api/contratos/${contratoId}/reajustes`),
  createReajuste: (contratoId, d) => req("POST", `/api/contratos/${contratoId}/reajustes`, d),
  deleteReajuste: (id) => req("DELETE", `/api/reajustes/${id}`),
  getParcelas: (contratoId) => req("GET", `/api/contratos/${contratoId}/parcelas`),
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
};
