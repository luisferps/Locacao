const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const JWT_SECRET = process.env.JWT_SECRET || "imobiliaria_secret_key_2025";
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.CF_ACCESS_KEY_ID, secretAccessKey: process.env.CF_SECRET_ACCESS_KEY },
});
const R2_BUCKET = process.env.CF_BUCKET_NAME || "imobiliaria-contratos";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL, role TEXT DEFAULT 'usuario', ativo BOOLEAN DEFAULT true,
      aprovado BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aprovado BOOLEAN DEFAULT false;

    CREATE TABLE IF NOT EXISTS proprietarios (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL, cpf_cnpj TEXT, email TEXT, telefone TEXT,
      banco TEXT, agencia TEXT, conta TEXT, tipo_conta TEXT DEFAULT 'Corrente',
      pix TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS imoveis (
      id SERIAL PRIMARY KEY,
      codigo TEXT UNIQUE, endereco TEXT, bairro TEXT, tipo TEXT, area NUMERIC,
      nome_condominio TEXT, bloco TEXT, apartamento TEXT,
      quartos INT, mobiliado TEXT DEFAULT 'Sem móveis',
      valor_ideal NUMERIC,
      tel_portaria TEXT, tel_contabilidade TEXT, tel_cobranca TEXT, tel_sindico TEXT,
      proprietario_id INT REFERENCES proprietarios(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS nome_condominio TEXT;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS bloco TEXT;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS apartamento TEXT;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS quartos INT;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS mobiliado TEXT DEFAULT 'Sem móveis';
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS valor_ideal NUMERIC;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS tel_portaria TEXT;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS tel_contabilidade TEXT;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS tel_cobranca TEXT;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS tel_sindico TEXT;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS proprietario_id INT REFERENCES proprietarios(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS documentos_imovel (
      id SERIAL PRIMARY KEY,
      imovel_id INT REFERENCES imoveis(id) ON DELETE CASCADE,
      tipo TEXT, nome TEXT, key TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contratos (
      id SERIAL PRIMARY KEY,
      imovel_id INT REFERENCES imoveis(id) ON DELETE CASCADE,
      locatario TEXT, telefone_locatario TEXT,
      locador TEXT, telefone_locador TEXT,
      aluguel_inicial NUMERIC, aluguel_atual NUMERIC,
      aluguel_paga_por TEXT DEFAULT 'Locatário',
      condominio NUMERIC DEFAULT 0, condominio_paga_por TEXT DEFAULT 'Locatário',
      iptu NUMERIC DEFAULT 0, iptu_paga_por TEXT DEFAULT 'Locatário',
      taxa_adm_pct NUMERIC DEFAULT 10,
      vencimento INT, forma_pagamento TEXT DEFAULT 'Pix',
      inicio DATE, duracao_meses INT, fim DATE,
      status TEXT DEFAULT 'Ativo',
      multa_rescisao_pct NUMERIC DEFAULT 0,
      multa_atraso_pct NUMERIC DEFAULT 0,
      juros_atraso_pct NUMERIC DEFAULT 0,
      honorarios_pct NUMERIC DEFAULT 0, honorarios_dias INT DEFAULT 0,
      honorarios_adv_pct NUMERIC DEFAULT 0, honorarios_adv_dias INT DEFAULT 0,
      contrato_pdf_key TEXT, contrato_pdf_nome TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reajustes (
      id SERIAL PRIMARY KEY,
      contrato_id INT REFERENCES contratos(id) ON DELETE CASCADE,
      data_reajuste DATE, indice TEXT, periodo_inicio DATE, periodo_fim DATE,
      valor_anterior NUMERIC, percentual NUMERIC, valor_novo NUMERIC,
      obs TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS parcelas (
      id SERIAL PRIMARY KEY,
      contrato_id INT REFERENCES contratos(id) ON DELETE CASCADE,
      competencia TEXT, vencimento DATE, valor NUMERIC,
      valor_recebido NUMERIC, data_recebimento DATE,
      status TEXT DEFAULT 'Pendente', obs TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS despesas (
      id SERIAL PRIMARY KEY,
      contrato_id INT REFERENCES contratos(id) ON DELETE CASCADE,
      data DATE, valor NUMERIC, tipo TEXT, descricao TEXT, status TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS repasses (
      id SERIAL PRIMARY KEY,
      contrato_id INT REFERENCES contratos(id) ON DELETE CASCADE,
      competencia TEXT, data_repasse DATE,
      valor_recebido NUMERIC, total_despesas NUMERIC,
      taxa_adm NUMERIC, valor_liquido NUMERIC,
      forma_pagamento TEXT, status TEXT DEFAULT 'Pendente',
      comprovante_key TEXT, comprovante_nome TEXT,
      obs TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query("UPDATE usuarios SET aprovado=true WHERE role='admin' AND aprovado=false");
  console.log("Banco inicializado.");
}

const camelize = (row) => {
  if (!row) return null;
  const result = {};
  for (const key in row) {
    const camel = key.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
    result[camel] = row[key];
  }
  return result;
};

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Não autenticado" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Token inválido" }); }
};

const admin = (req, res, next) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Acesso restrito" });
  next();
};

const uploadR2 = async (buffer, key, contentType) => {
  await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
  return key;
};
const getR2Url = async (key) => getSignedUrl(r2, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn: 3600 });

// AUTH
app.post("/api/auth/register", async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ error: "Preencha todos os campos" });
    const existing = await pool.query("SELECT id FROM usuarios WHERE email=$1", [email]);
    if (existing.rows.length) return res.status(400).json({ error: "Email já cadastrado" });
    const hash = await bcrypt.hash(senha, 10);
    await pool.query("INSERT INTO usuarios (nome,email,senha,role,aprovado) VALUES ($1,$2,$3,'usuario',false)", [nome, email, hash]);
    res.json({ ok: true, message: "Cadastro realizado! Aguarde a aprovação." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    const { rows } = await pool.query("SELECT * FROM usuarios WHERE email=$1 AND ativo=true", [email]);
    if (!rows.length) return res.status(401).json({ error: "Email ou senha incorretos" });
    const valid = await bcrypt.compare(senha, rows[0].senha);
    if (!valid) return res.status(401).json({ error: "Email ou senha incorretos" });
    if (!rows[0].aprovado) return res.status(403).json({ error: "Conta não aprovada pelo administrador." });
    const user = rows[0];
    const token = jwt.sign({ id: user.id, nome: user.nome, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// USUÁRIOS
app.get("/api/usuarios", auth, admin, async (req, res) => {
  const { rows } = await pool.query("SELECT id,nome,email,role,ativo,aprovado,created_at FROM usuarios ORDER BY aprovado ASC, created_at DESC");
  res.json(rows.map(camelize));
});
app.put("/api/usuarios/:id", auth, admin, async (req, res) => {
  const { nome, role, ativo, aprovado } = req.body;
  const { rows } = await pool.query("UPDATE usuarios SET nome=$1,role=$2,ativo=$3,aprovado=$4 WHERE id=$5 RETURNING id,nome,email,role,ativo,aprovado", [nome, role, ativo, aprovado, req.params.id]);
  res.json(camelize(rows[0]));
});
app.delete("/api/usuarios/:id", auth, admin, async (req, res) => {
  if (req.user.id === +req.params.id) return res.status(400).json({ error: "Não pode excluir sua própria conta" });
  await pool.query("DELETE FROM usuarios WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// PROPRIETÁRIOS
app.get("/api/proprietarios", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM proprietarios ORDER BY nome");
  res.json(rows.map(camelize));
});
app.post("/api/proprietarios", auth, admin, async (req, res) => {
  const { nome, cpfCnpj, email, telefone, banco, agencia, conta, tipoConta, pix } = req.body;
  const { rows } = await pool.query(
    "INSERT INTO proprietarios (nome,cpf_cnpj,email,telefone,banco,agencia,conta,tipo_conta,pix) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
    [nome, cpfCnpj, email, telefone, banco, agencia, conta, tipoConta||'Corrente', pix]
  );
  res.json(camelize(rows[0]));
});
app.put("/api/proprietarios/:id", auth, admin, async (req, res) => {
  const { nome, cpfCnpj, email, telefone, banco, agencia, conta, tipoConta, pix } = req.body;
  const { rows } = await pool.query(
    "UPDATE proprietarios SET nome=$1,cpf_cnpj=$2,email=$3,telefone=$4,banco=$5,agencia=$6,conta=$7,tipo_conta=$8,pix=$9 WHERE id=$10 RETURNING *",
    [nome, cpfCnpj, email, telefone, banco, agencia, conta, tipoConta||'Corrente', pix, req.params.id]
  );
  res.json(camelize(rows[0]));
});
app.delete("/api/proprietarios/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM proprietarios WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// IMÓVEIS
app.get("/api/imoveis", auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT i.*, p.nome as proprietario_nome, p.telefone as proprietario_tel,
      COUNT(c.id) as total_contratos,
      (SELECT c2.status FROM contratos c2 WHERE c2.imovel_id=i.id ORDER BY c2.created_at DESC LIMIT 1) as status_atual,
      (SELECT c2.locatario FROM contratos c2 WHERE c2.imovel_id=i.id AND c2.status='Ativo' ORDER BY c2.created_at DESC LIMIT 1) as locatario_atual,
      (SELECT c2.aluguel_atual FROM contratos c2 WHERE c2.imovel_id=i.id AND c2.status='Ativo' ORDER BY c2.created_at DESC LIMIT 1) as aluguel_atual,
      (SELECT c2.condominio FROM contratos c2 WHERE c2.imovel_id=i.id AND c2.status='Ativo' ORDER BY c2.created_at DESC LIMIT 1) as condominio_atual,
      (SELECT c2.iptu FROM contratos c2 WHERE c2.imovel_id=i.id AND c2.status='Ativo' ORDER BY c2.created_at DESC LIMIT 1) as iptu_atual,
      (SELECT c2.vencimento FROM contratos c2 WHERE c2.imovel_id=i.id AND c2.status='Ativo' ORDER BY c2.created_at DESC LIMIT 1) as vencimento_atual
    FROM imoveis i
    LEFT JOIN proprietarios p ON p.id=i.proprietario_id
    LEFT JOIN contratos c ON c.imovel_id=i.id
    GROUP BY i.id, p.nome, p.telefone ORDER BY i.id
  `);
  res.json(rows.map(camelize));
});

app.post("/api/imoveis", auth, admin, async (req, res) => {
  const f = req.body;
  const { rows } = await pool.query(
    `INSERT INTO imoveis (codigo,endereco,bairro,tipo,area,nome_condominio,bloco,apartamento,quartos,mobiliado,valor_ideal,tel_portaria,tel_contabilidade,tel_cobranca,tel_sindico,proprietario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [f.codigo,f.endereco,f.bairro,f.tipo,f.area||null,f.nomeCondominio,f.bloco,f.apartamento,f.quartos||null,f.mobiliado||'Sem móveis',f.valorIdeal||null,f.telPortaria,f.telContabilidade,f.telCobranca,f.telSindico,f.proprietarioId||null]
  );
  res.json(camelize(rows[0]));
});

app.put("/api/imoveis/:id", auth, admin, async (req, res) => {
  const f = req.body;
  const { rows } = await pool.query(
    `UPDATE imoveis SET codigo=$1,endereco=$2,bairro=$3,tipo=$4,area=$5,nome_condominio=$6,bloco=$7,apartamento=$8,quartos=$9,mobiliado=$10,valor_ideal=$11,tel_portaria=$12,tel_contabilidade=$13,tel_cobranca=$14,tel_sindico=$15,proprietario_id=$16 WHERE id=$17 RETURNING *`,
    [f.codigo,f.endereco,f.bairro,f.tipo,f.area||null,f.nomeCondominio,f.bloco,f.apartamento,f.quartos||null,f.mobiliado||'Sem móveis',f.valorIdeal||null,f.telPortaria,f.telContabilidade,f.telCobranca,f.telSindico,f.proprietarioId||null,req.params.id]
  );
  res.json(camelize(rows[0]));
});

app.delete("/api/imoveis/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM imoveis WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// DOCUMENTOS
app.get("/api/imoveis/:id/documentos", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM documentos_imovel WHERE imovel_id=$1 ORDER BY tipo,created_at DESC", [req.params.id]);
  res.json(rows.map(camelize));
});
app.post("/api/imoveis/:id/documentos", auth, admin, upload.single("arquivo"), async (req, res) => {
  try {
    const { tipo } = req.body;
    const key = `documentos/${req.params.id}/${tipo}-${uuidv4()}`;
    await uploadR2(req.file.buffer, key, req.file.mimetype);
    const { rows } = await pool.query("INSERT INTO documentos_imovel (imovel_id,tipo,nome,key) VALUES ($1,$2,$3,$4) RETURNING *", [req.params.id, tipo, req.file.originalname, key]);
    res.json(camelize(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get("/api/documentos/:id/url", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT key FROM documentos_imovel WHERE id=$1", [req.params.id]);
    if (!rows[0]?.key) return res.status(404).json({ error: "Não encontrado" });
    res.json({ url: await getR2Url(rows[0].key) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete("/api/documentos/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM documentos_imovel WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// CONTRATOS
app.get("/api/contratos", auth, async (req, res) => {
  const imovelId = req.query.imovelId;
  const q = imovelId
    ? "SELECT c.*,i.codigo,i.endereco,i.bairro,i.tipo FROM contratos c JOIN imoveis i ON i.id=c.imovel_id WHERE c.imovel_id=$1 ORDER BY c.created_at DESC"
    : "SELECT c.*,i.codigo,i.endereco,i.bairro,i.tipo FROM contratos c JOIN imoveis i ON i.id=c.imovel_id ORDER BY c.created_at DESC";
  const { rows } = await pool.query(q, imovelId ? [imovelId] : []);
  res.json(rows.map(camelize));
});

app.post("/api/contratos", auth, admin, async (req, res) => {
  try {
    const f = req.body;
    const fim = f.inicio && f.duracaoMeses ? (() => { const d = new Date(f.inicio); d.setMonth(d.getMonth() + +f.duracaoMeses); return d.toISOString().split("T")[0]; })() : null;
    const { rows } = await pool.query(
      `INSERT INTO contratos (imovel_id,locatario,telefone_locatario,locador,telefone_locador,aluguel_inicial,aluguel_atual,aluguel_paga_por,condominio,condominio_paga_por,iptu,iptu_paga_por,taxa_adm_pct,vencimento,forma_pagamento,inicio,duracao_meses,fim,status,multa_rescisao_pct,multa_atraso_pct,juros_atraso_pct,honorarios_pct,honorarios_dias,honorarios_adv_pct,honorarios_adv_dias)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *`,
      [f.imovelId,f.locatario,f.telefoneLocatario,f.locador,f.telefoneLocador,+f.aluguelInicial,f.aluguelPagaPor||'Locatário',+f.condominio||0,f.condominioPagaPor||'Locatário',+f.iptu||0,f.iptuPagaPor||'Locatário',+f.taxaAdmPct||10,+f.vencimento,f.formaPagamento||'Pix',f.inicio||null,+f.duracaoMeses||null,fim,f.status||'Ativo',+f.multaRescisaoPct||0,+f.multaAtrasoPct||0,+f.jurosAtrasoPct||0,+f.honorariosPct||0,+f.honorariosDias||0,+f.honorariosAdvPct||0,+f.honorariosAdvDias||0]
    );
    const contrato = rows[0];
    if (f.inicio && f.duracaoMeses && f.vencimento) {
      for (let i = 0; i < +f.duracaoMeses; i++) {
        const dataVenc = new Date(f.inicio);
        dataVenc.setMonth(dataVenc.getMonth() + i);
        dataVenc.setDate(+f.vencimento);
        const comp = `${String(dataVenc.getMonth()+1).padStart(2,'0')}/${dataVenc.getFullYear()}`;
        await pool.query("INSERT INTO parcelas (contrato_id,competencia,vencimento,valor,status) VALUES ($1,$2,$3,$4,'Pendente')", [contrato.id, comp, dataVenc.toISOString().split('T')[0], +f.aluguelInicial]);
      }
    }
    res.json(camelize(contrato));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/contratos/:id", auth, admin, async (req, res) => {
  const f = req.body;
  const fim = f.inicio && f.duracaoMeses ? (() => { const d = new Date(f.inicio); d.setMonth(d.getMonth() + +f.duracaoMeses); return d.toISOString().split("T")[0]; })() : null;
  const { rows } = await pool.query(
    `UPDATE contratos SET locatario=$1,telefone_locatario=$2,locador=$3,telefone_locador=$4,aluguel_atual=$5,aluguel_paga_por=$6,condominio=$7,condominio_paga_por=$8,iptu=$9,iptu_paga_por=$10,taxa_adm_pct=$11,vencimento=$12,forma_pagamento=$13,inicio=$14,duracao_meses=$15,fim=$16,status=$17,multa_rescisao_pct=$18,multa_atraso_pct=$19,juros_atraso_pct=$20,honorarios_pct=$21,honorarios_dias=$22,honorarios_adv_pct=$23,honorarios_adv_dias=$24 WHERE id=$25 RETURNING *`,
    [f.locatario,f.telefoneLocatario,f.locador,f.telefoneLocador,+f.aluguelAtual,f.aluguelPagaPor||'Locatário',+f.condominio||0,f.condominioPagaPor||'Locatário',+f.iptu||0,f.iptuPagaPor||'Locatário',+f.taxaAdmPct||10,+f.vencimento,f.formaPagamento||'Pix',f.inicio||null,+f.duracaoMeses||null,fim,f.status||'Ativo',+f.multaRescisaoPct||0,+f.multaAtrasoPct||0,+f.jurosAtrasoPct||0,+f.honorariosPct||0,+f.honorariosDias||0,+f.honorariosAdvPct||0,+f.honorariosAdvDias||0,req.params.id]
  );
  res.json(camelize(rows[0]));
});

app.delete("/api/contratos/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM contratos WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

app.post("/api/contratos/:id/pdf", auth, admin, upload.single("contrato"), async (req, res) => {
  try {
    const key = `contratos/${req.params.id}-${uuidv4()}.pdf`;
    await uploadR2(req.file.buffer, key, "application/pdf");
    await pool.query("UPDATE contratos SET contrato_pdf_key=$1,contrato_pdf_nome=$2 WHERE id=$3", [key, req.file.originalname, req.params.id]);
    res.json({ ok: true, key, nome: req.file.originalname });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/contratos/:id/pdf/url", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT contrato_pdf_key FROM contratos WHERE id=$1", [req.params.id]);
    if (!rows[0]?.contrato_pdf_key) return res.status(404).json({ error: "Nenhum PDF" });
    res.json({ url: await getR2Url(rows[0].contrato_pdf_key) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// REAJUSTES
app.get("/api/contratos/:id/reajustes", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM reajustes WHERE contrato_id=$1 ORDER BY data_reajuste DESC", [req.params.id]);
  res.json(rows.map(camelize));
});
app.post("/api/contratos/:id/reajustes", auth, admin, async (req, res) => {
  const { dataReajuste, indice, periodoInicio, periodoFim, valorAnterior, percentual, valorNovo, obs } = req.body;
  const { rows } = await pool.query(
    "INSERT INTO reajustes (contrato_id,data_reajuste,indice,periodo_inicio,periodo_fim,valor_anterior,percentual,valor_novo,obs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
    [req.params.id, dataReajuste, indice, periodoInicio, periodoFim, +valorAnterior, +percentual, +valorNovo, obs]
  );
  await pool.query("UPDATE contratos SET aluguel_atual=$1 WHERE id=$2", [+valorNovo, req.params.id]);
  res.json(camelize(rows[0]));
});
app.delete("/api/reajustes/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM reajustes WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// PARCELAS
app.get("/api/contratos/:id/parcelas", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM parcelas WHERE contrato_id=$1 ORDER BY vencimento ASC", [req.params.id]);
  res.json(rows.map(camelize));
});
app.put("/api/parcelas/:id", auth, async (req, res) => {
  const { valor, valorRecebido, dataRecebimento, status, obs } = req.body;
  const { rows } = await pool.query(
    "UPDATE parcelas SET valor=$1,valor_recebido=$2,data_recebimento=$3,status=$4,obs=$5 WHERE id=$6 RETURNING *",
    [valor, valorRecebido||null, dataRecebimento||null, status, obs, req.params.id]
  );
  res.json(camelize(rows[0]));
});

// DESPESAS
app.get("/api/despesas", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT d.*,c.locatario,i.codigo FROM despesas d JOIN contratos c ON c.id=d.contrato_id JOIN imoveis i ON i.id=c.imovel_id ORDER BY d.data DESC");
  res.json(rows.map(camelize));
});
app.post("/api/despesas", auth, async (req, res) => {
  const { contratoId, data, valor, tipo, descricao, status } = req.body;
  const { rows } = await pool.query("INSERT INTO despesas (contrato_id,data,valor,tipo,descricao,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [contratoId, data, +valor, tipo, descricao, status]);
  res.json(camelize(rows[0]));
});
app.put("/api/despesas/:id", auth, async (req, res) => {
  const { contratoId, data, valor, tipo, descricao, status } = req.body;
  const { rows } = await pool.query("UPDATE despesas SET contrato_id=$1,data=$2,valor=$3,tipo=$4,descricao=$5,status=$6 WHERE id=$7 RETURNING *", [contratoId, data, +valor, tipo, descricao, status, req.params.id]);
  res.json(camelize(rows[0]));
});
app.delete("/api/despesas/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM despesas WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// REPASSES
app.get("/api/repasses", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT r.*,c.locador,i.codigo FROM repasses r JOIN contratos c ON c.id=r.contrato_id JOIN imoveis i ON i.id=c.imovel_id ORDER BY r.created_at DESC");
  res.json(rows.map(camelize));
});
app.post("/api/repasses", auth, admin, async (req, res) => {
  const { contratoId, competencia, dataRepasse, valorRecebido, totalDespesas, taxaAdm, valorLiquido, formaPagamento, status, obs } = req.body;
  const { rows } = await pool.query(
    "INSERT INTO repasses (contrato_id,competencia,data_repasse,valor_recebido,total_despesas,taxa_adm,valor_liquido,forma_pagamento,status,obs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
    [contratoId, competencia, dataRepasse, +valorRecebido, +totalDespesas, +taxaAdm, +valorLiquido, formaPagamento, status, obs]
  );
  res.json(camelize(rows[0]));
});
app.put("/api/repasses/:id", auth, admin, async (req, res) => {
  const { status, dataRepasse, obs } = req.body;
  const { rows } = await pool.query("UPDATE repasses SET status=$1,data_repasse=$2,obs=$3 WHERE id=$4 RETURNING *", [status, dataRepasse, obs, req.params.id]);
  res.json(camelize(rows[0]));
});
app.post("/api/repasses/:id/comprovante", auth, admin, upload.single("comprovante"), async (req, res) => {
  try {
    const key = `comprovantes/${req.params.id}-${uuidv4()}`;
    await uploadR2(req.file.buffer, key, req.file.mimetype);
    await pool.query("UPDATE repasses SET comprovante_key=$1,comprovante_nome=$2,status='Repassado' WHERE id=$3", [key, req.file.originalname, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get("/api/repasses/:id/comprovante/url", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT comprovante_key FROM repasses WHERE id=$1", [req.params.id]);
    if (!rows[0]?.comprovante_key) return res.status(404).json({ error: "Sem comprovante" });
    res.json({ url: await getR2Url(rows[0].comprovante_key) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DASHBOARD
app.get("/api/dashboard", auth, async (req, res) => {
  const [contratos, recMes, repMes, despMes, recPorMes, vencendo] = await Promise.all([
    pool.query("SELECT COUNT(*) as total, COALESCE(SUM(aluguel_atual),0) as carteira FROM contratos WHERE status='Ativo'"),
    pool.query("SELECT COALESCE(SUM(valor_recebido),0) as total FROM parcelas WHERE status='Pago' AND data_recebimento >= date_trunc('month', CURRENT_DATE)"),
    pool.query("SELECT COALESCE(SUM(valor_liquido),0) as total FROM repasses WHERE data_repasse >= date_trunc('month', CURRENT_DATE)"),
    pool.query("SELECT COALESCE(SUM(valor),0) as total FROM despesas WHERE data >= date_trunc('month', CURRENT_DATE)"),
    pool.query("SELECT to_char(data_recebimento,'YYYY-MM') as mes, COALESCE(SUM(valor_recebido),0) as recebido FROM parcelas WHERE status='Pago' AND data_recebimento >= CURRENT_DATE - INTERVAL '12 months' GROUP BY mes ORDER BY mes"),
    pool.query("SELECT p.*,i.codigo,c.locatario FROM parcelas p JOIN contratos c ON c.id=p.contrato_id JOIN imoveis i ON i.id=c.imovel_id WHERE p.status='Pendente' AND p.vencimento <= CURRENT_DATE + INTERVAL '7 days' ORDER BY p.vencimento LIMIT 10"),
  ]);
  res.json({
    contratosAtivos: +contratos.rows[0].total,
    carteiraMensal: +contratos.rows[0].carteira,
    recebidoMes: +recMes.rows[0].total,
    repassadoMes: +repMes.rows[0].total,
    despesasMes: +despMes.rows[0].total,
    recPorMes: recPorMes.rows,
    vencendo: vencendo.rows.map(camelize),
  });
});

const PORT = process.env.PORT || 3001;
initDb().then(() => app.listen(PORT, () => console.log(`API na porta ${PORT}`))).catch(err => { console.error(err); process.exit(1); });
