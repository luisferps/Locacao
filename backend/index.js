const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
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

// R2 Client
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CF_ACCESS_KEY_ID,
    secretAccessKey: process.env.CF_SECRET_ACCESS_KEY,
  },
});
const R2_BUCKET = process.env.CF_BUCKET_NAME || "imobiliaria-contratos";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      role TEXT DEFAULT 'usuario',
      ativo BOOLEAN DEFAULT true,
      aprovado BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aprovado BOOLEAN DEFAULT false;

    CREATE TABLE IF NOT EXISTS imoveis (
      id SERIAL PRIMARY KEY,
      codigo TEXT, endereco TEXT, bairro TEXT, tipo TEXT,
      locatario TEXT, locador TEXT,
      aluguel NUMERIC, aluguel_paga_por TEXT DEFAULT 'Locatário',
      condominio NUMERIC DEFAULT 0, condominio_paga_por TEXT DEFAULT 'Locatário',
      iptu NUMERIC DEFAULT 0, iptu_paga_por TEXT DEFAULT 'Locatário',
      vencimento INT,
      status TEXT DEFAULT 'Ativo',
      inicio DATE, duracao_meses INT, fim DATE,
      telefone_locatario TEXT, telefone_locador TEXT,
      taxa_adm NUMERIC DEFAULT 10,
      multa_rescisao NUMERIC DEFAULT 0,
      multa_atraso NUMERIC DEFAULT 0,
      juros_atraso NUMERIC DEFAULT 0,
      honorarios_pct NUMERIC DEFAULT 0, honorarios_dias INT DEFAULT 0,
      honorarios_adv_pct NUMERIC DEFAULT 0, honorarios_adv_dias INT DEFAULT 0,
      forma_pagamento TEXT DEFAULT 'Todos',
      contrato_pdf_key TEXT,
      contrato_pdf_nome TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS condominio NUMERIC DEFAULT 0;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS condominio_paga_por TEXT DEFAULT 'Locatário';
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS iptu NUMERIC DEFAULT 0;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS iptu_paga_por TEXT DEFAULT 'Locatário';
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS aluguel_paga_por TEXT DEFAULT 'Locatário';
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS duracao_meses INT;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS fim DATE;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS multa_rescisao NUMERIC DEFAULT 0;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS multa_atraso NUMERIC DEFAULT 0;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS juros_atraso NUMERIC DEFAULT 0;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS honorarios_pct NUMERIC DEFAULT 0;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS honorarios_dias INT DEFAULT 0;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS honorarios_adv_pct NUMERIC DEFAULT 0;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS honorarios_adv_dias INT DEFAULT 0;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS forma_pagamento TEXT DEFAULT 'Todos';
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS contrato_pdf_key TEXT;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS contrato_pdf_nome TEXT;

    CREATE TABLE IF NOT EXISTS recebimentos (
      id SERIAL PRIMARY KEY,
      imovel_id INT REFERENCES imoveis(id) ON DELETE CASCADE,
      data DATE, valor NUMERIC, tipo TEXT, status TEXT, obs TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS despesas (
      id SERIAL PRIMARY KEY,
      imovel_id INT REFERENCES imoveis(id) ON DELETE CASCADE,
      data DATE, valor NUMERIC, tipo TEXT, descricao TEXT, status TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS repasses (
      id SERIAL PRIMARY KEY,
      imovel_id INT REFERENCES imoveis(id) ON DELETE CASCADE,
      data DATE, mes TEXT, valor_bruto NUMERIC,
      taxa_adm NUMERIC, valor_liquido NUMERIC, status TEXT,
      forma_pagamento TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query("UPDATE usuarios SET aprovado=true WHERE role='admin' AND aprovado=false");
  console.log("Banco inicializado.");
}

const camelize = (row) => {
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
  if (req.user.role !== "admin") return res.status(403).json({ error: "Acesso restrito a administradores" });
  next();
};

// AUTH
app.post("/api/auth/register", async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ error: "Preencha todos os campos" });
    const existing = await pool.query("SELECT id FROM usuarios WHERE email=$1", [email]);
    if (existing.rows.length) return res.status(400).json({ error: "Email já cadastrado" });
    const hash = await bcrypt.hash(senha, 10);
    await pool.query("INSERT INTO usuarios (nome,email,senha,role,aprovado) VALUES ($1,$2,$3,'usuario',false)", [nome, email, hash]);
    res.json({ ok: true, message: "Cadastro realizado! Aguarde a aprovação do administrador." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    const { rows } = await pool.query("SELECT * FROM usuarios WHERE email=$1 AND ativo=true", [email]);
    if (!rows.length) return res.status(401).json({ error: "Email ou senha incorretos" });
    const valid = await bcrypt.compare(senha, rows[0].senha);
    if (!valid) return res.status(401).json({ error: "Email ou senha incorretos" });
    if (!rows[0].aprovado) return res.status(403).json({ error: "Sua conta ainda não foi aprovada pelo administrador." });
    const user = rows[0];
    const token = jwt.sign({ id: user.id, nome: user.nome, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/auth/me", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT id,nome,email,role FROM usuarios WHERE id=$1", [req.user.id]);
  res.json(camelize(rows[0]));
});

// USUÁRIOS
app.get("/api/usuarios", auth, admin, async (req, res) => {
  const { rows } = await pool.query("SELECT id,nome,email,role,ativo,aprovado,created_at FROM usuarios ORDER BY aprovado ASC, created_at DESC");
  res.json(rows.map(camelize));
});
app.put("/api/usuarios/:id", auth, admin, async (req, res) => {
  const { nome, role, ativo, aprovado } = req.body;
  const { rows } = await pool.query(
    "UPDATE usuarios SET nome=$1,role=$2,ativo=$3,aprovado=$4 WHERE id=$5 RETURNING id,nome,email,role,ativo,aprovado",
    [nome, role, ativo, aprovado, req.params.id]
  );
  res.json(camelize(rows[0]));
});
app.delete("/api/usuarios/:id", auth, admin, async (req, res) => {
  if (req.user.id === +req.params.id) return res.status(400).json({ error: "Não pode excluir sua própria conta" });
  await pool.query("DELETE FROM usuarios WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// IMÓVEIS
app.get("/api/imoveis", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM imoveis ORDER BY id");
  res.json(rows.map(camelize));
});

app.post("/api/imoveis", auth, admin, async (req, res) => {
  const f = req.body;
  const fim = f.inicio && f.duracaoMeses ? (() => {
    const d = new Date(f.inicio); d.setMonth(d.getMonth() + +f.duracaoMeses); return d.toISOString().split("T")[0];
  })() : null;
  const { rows } = await pool.query(
    `INSERT INTO imoveis (codigo,endereco,bairro,tipo,locatario,locador,aluguel,aluguel_paga_por,condominio,condominio_paga_por,iptu,iptu_paga_por,vencimento,status,inicio,duracao_meses,fim,telefone_locatario,telefone_locador,taxa_adm,multa_rescisao,multa_atraso,juros_atraso,honorarios_pct,honorarios_dias,honorarios_adv_pct,honorarios_adv_dias,forma_pagamento)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28) RETURNING *`,
    [f.codigo,f.endereco,f.bairro,f.tipo,f.locatario,f.locador,f.aluguel,f.aluguelPagaPor||'Locatário',f.condominio||0,f.condominioPagaPor||'Locatário',f.iptu||0,f.iptuPagaPor||'Locatário',f.vencimento,f.status,f.inicio||null,f.duracaoMeses||null,fim,f.telefoneLocatario,f.telefoneLocador,f.taxaAdm,f.multaRescisao||0,f.multaAtraso||0,f.jurosAtraso||0,f.honorariosPct||0,f.honorariosDias||0,f.honorariosAdvPct||0,f.honorariosAdvDias||0,f.formaPagamento||'Todos']
  );
  res.json(camelize(rows[0]));
});

app.put("/api/imoveis/:id", auth, admin, async (req, res) => {
  const f = req.body;
  const fim = f.inicio && f.duracaoMeses ? (() => {
    const d = new Date(f.inicio); d.setMonth(d.getMonth() + +f.duracaoMeses); return d.toISOString().split("T")[0];
  })() : null;
  const { rows } = await pool.query(
    `UPDATE imoveis SET codigo=$1,endereco=$2,bairro=$3,tipo=$4,locatario=$5,locador=$6,aluguel=$7,aluguel_paga_por=$8,condominio=$9,condominio_paga_por=$10,iptu=$11,iptu_paga_por=$12,vencimento=$13,status=$14,inicio=$15,duracao_meses=$16,fim=$17,telefone_locatario=$18,telefone_locador=$19,taxa_adm=$20,multa_rescisao=$21,multa_atraso=$22,juros_atraso=$23,honorarios_pct=$24,honorarios_dias=$25,honorarios_adv_pct=$26,honorarios_adv_dias=$27,forma_pagamento=$28 WHERE id=$29 RETURNING *`,
    [f.codigo,f.endereco,f.bairro,f.tipo,f.locatario,f.locador,f.aluguel,f.aluguelPagaPor||'Locatário',f.condominio||0,f.condominioPagaPor||'Locatário',f.iptu||0,f.iptuPagaPor||'Locatário',f.vencimento,f.status,f.inicio||null,f.duracaoMeses||null,fim,f.telefoneLocatario,f.telefoneLocador,f.taxaAdm,f.multaRescisao||0,f.multaAtraso||0,f.jurosAtraso||0,f.honorariosPct||0,f.honorariosDias||0,f.honorariosAdvPct||0,f.honorariosAdvDias||0,f.formaPagamento||'Todos',req.params.id]
  );
  res.json(camelize(rows[0]));
});

app.delete("/api/imoveis/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM imoveis WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// UPLOAD CONTRATO PDF
app.post("/api/imoveis/:id/contrato", auth, admin, upload.single("contrato"), async (req, res) => {
  try {
    const key = `contratos/${req.params.id}-${uuidv4()}.pdf`;
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET, Key: key,
      Body: req.file.buffer, ContentType: "application/pdf",
    }));
    await pool.query("UPDATE imoveis SET contrato_pdf_key=$1, contrato_pdf_nome=$2 WHERE id=$3", [key, req.file.originalname, req.params.id]);
    res.json({ ok: true, key, nome: req.file.originalname });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/imoveis/:id/contrato/url", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT contrato_pdf_key FROM imoveis WHERE id=$1", [req.params.id]);
    if (!rows[0]?.contrato_pdf_key) return res.status(404).json({ error: "Nenhum contrato" });
    const url = await getSignedUrl(r2, new GetObjectCommand({ Bucket: R2_BUCKET, Key: rows[0].contrato_pdf_key }), { expiresIn: 3600 });
    res.json({ url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// RECEBIMENTOS
app.get("/api/recebimentos", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM recebimentos ORDER BY data DESC");
  res.json(rows.map(camelize));
});
app.post("/api/recebimentos", auth, async (req, res) => {
  const { imovelId, data, valor, tipo, status, obs } = req.body;
  const { rows } = await pool.query(`INSERT INTO recebimentos (imovel_id,data,valor,tipo,status,obs) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [imovelId, data, valor, tipo, status, obs]);
  res.json(camelize(rows[0]));
});
app.put("/api/recebimentos/:id", auth, async (req, res) => {
  const { imovelId, data, valor, tipo, status, obs } = req.body;
  const { rows } = await pool.query(`UPDATE recebimentos SET imovel_id=$1,data=$2,valor=$3,tipo=$4,status=$5,obs=$6 WHERE id=$7 RETURNING *`, [imovelId, data, valor, tipo, status, obs, req.params.id]);
  res.json(camelize(rows[0]));
});
app.delete("/api/recebimentos/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM recebimentos WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// DESPESAS
app.get("/api/despesas", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM despesas ORDER BY data DESC");
  res.json(rows.map(camelize));
});
app.post("/api/despesas", auth, async (req, res) => {
  const { imovelId, data, valor, tipo, descricao, status } = req.body;
  const { rows } = await pool.query(`INSERT INTO despesas (imovel_id,data,valor,tipo,descricao,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [imovelId, data, valor, tipo, descricao, status]);
  res.json(camelize(rows[0]));
});
app.put("/api/despesas/:id", auth, async (req, res) => {
  const { imovelId, data, valor, tipo, descricao, status } = req.body;
  const { rows } = await pool.query(`UPDATE despesas SET imovel_id=$1,data=$2,valor=$3,tipo=$4,descricao=$5,status=$6 WHERE id=$7 RETURNING *`, [imovelId, data, valor, tipo, descricao, status, req.params.id]);
  res.json(camelize(rows[0]));
});
app.delete("/api/despesas/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM despesas WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// REPASSES
app.get("/api/repasses", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM repasses ORDER BY data DESC");
  res.json(rows.map(camelize));
});
app.post("/api/repasses", auth, admin, async (req, res) => {
  const { imovelId, data, mes, valorBruto, taxaAdm, valorLiquido, status, formaPagamento } = req.body;
  const { rows } = await pool.query(`INSERT INTO repasses (imovel_id,data,mes,valor_bruto,taxa_adm,valor_liquido,status,forma_pagamento) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [imovelId, data, mes, valorBruto, taxaAdm, valorLiquido, status, formaPagamento]);
  res.json(camelize(rows[0]));
});
app.delete("/api/repasses/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM repasses WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// DASHBOARD STATS
app.get("/api/dashboard", auth, async (req, res) => {
  const [imoveis, recMes, repMes, despMes, recPorMes] = await Promise.all([
    pool.query("SELECT COUNT(*) as total, SUM(aluguel) as carteira FROM imoveis WHERE status='Ativo'"),
    pool.query("SELECT COALESCE(SUM(valor),0) as total FROM recebimentos WHERE status='Pago' AND data >= date_trunc('month', CURRENT_DATE)"),
    pool.query("SELECT COALESCE(SUM(valor_liquido),0) as total FROM repasses WHERE data >= date_trunc('month', CURRENT_DATE)"),
    pool.query("SELECT COALESCE(SUM(valor),0) as total FROM despesas WHERE data >= date_trunc('month', CURRENT_DATE)"),
    pool.query(`SELECT to_char(data,'YYYY-MM') as mes, COALESCE(SUM(valor),0) as recebido, COUNT(*) as qtd FROM recebimentos WHERE status='Pago' AND data >= CURRENT_DATE - INTERVAL '12 months' GROUP BY mes ORDER BY mes`),
  ]);
  res.json({
    imoveisAtivos: +imoveis.rows[0].total,
    carteiraMensal: +imoveis.rows[0].carteira || 0,
    recebidoMes: +recMes.rows[0].total,
    repassadoMes: +repMes.rows[0].total,
    despesasMes: +despMes.rows[0].total,
    recPorMes: recPorMes.rows,
  });
});

const PORT = process.env.PORT || 3001;
initDb().then(() => {
  app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
}).catch(err => { console.error(err); process.exit(1); });
