const BASE = import.meta.env.VITE_API_URL || "";

const req = async (method, path, body, isFormData = false) => {
  const token = localStorage.getItem("token");
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (!isFormData) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { localStorage.clear(); window.location.reload(); return; }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
    throw new Error(err.error || `Erro ${res.status}`);
  }
  return res.json();
};

export const api = {
  login: (data) => req("POST", "/api/auth/login", data),
  register: (data) => req("POST", "/api/auth/register", data),
  me: () => req("GET", "/api/auth/me"),
  getDashboard: () => req("GET", "/api/dashboard"),
  getUsuarios: () => req("GET", "/api/usuarios"),
  updateUsuario: (id, data) => req("PUT", `/api/usuarios/${id}`, data),
  deleteUsuario: (id) => req("DELETE", `/api/usuarios/${id}`),
  getImoveis: () => req("GET", "/api/imoveis"),
  createImovel: (data) => req("POST", "/api/imoveis", data),
  updateImovel: (id, data) => req("PUT", `/api/imoveis/${id}`, data),
  deleteImovel: (id) => req("DELETE", `/api/imoveis/${id}`),
  uploadContrato: (id, file) => {
    const fd = new FormData(); fd.append("contrato", file);
    return req("POST", `/api/imoveis/${id}/contrato`, fd, true);
  },
  getContratoUrl: (id) => req("GET", `/api/imoveis/${id}/contrato/url`),
  getRecebimentos: () => req("GET", "/api/recebimentos"),
  createRecebimento: (data) => req("POST", "/api/recebimentos", data),
  updateRecebimento: (id, data) => req("PUT", `/api/recebimentos/${id}`, data),
  deleteRecebimento: (id) => req("DELETE", `/api/recebimentos/${id}`),
  getDespesas: () => req("GET", "/api/despesas"),
  createDespesa: (data) => req("POST", "/api/despesas", data),
  updateDespesa: (id, data) => req("PUT", `/api/despesas/${id}`, data),
  deleteDespesa: (id) => req("DELETE", `/api/despesas/${id}`),
  getRepasses: () => req("GET", "/api/repasses"),
  createRepasse: (data) => req("POST", "/api/repasses", data),
  deleteRepasse: (id) => req("DELETE", `/api/repasses/${id}`),
};
