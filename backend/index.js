const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const JWT_SECRET = process.env.JWT_SECRET || "imobiliaria_secret_key_2025";

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      role TEXT DEFAULT 'usuario',
      ativo BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS imoveis (
      id SERIAL PRIMARY KEY,
      codigo TEXT, endereco TEXT, bairro TEXT, tipo TEXT,
      locatario TEXT, locador TEXT, aluguel NUMERIC, vencimento INT,
      status TEXT DEFAULT 'Ativo', inicio DATE,
      telefone_locatario TEXT, telefone_locador TEXT, taxa_adm NUMERIC DEFAULT 10,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
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
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
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
    const { nome, email, senha, role } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ error: "Preencha todos os campos" });
    const existing = await pool.query("SELECT id FROM usuarios WHERE email=$1", [email]);
    if (existing.rows.length) return res.status(400).json({ error: "Email já cadastrado" });
    const hash = await bcrypt.hash(senha, 10);
    const userRole = role === "admin" ? "admin" : "usuario";
    const { rows } = await pool.query(
      "INSERT INTO usuarios (nome,email,senha,role) VALUES ($1,$2,$3,$4) RETURNING id,nome,email,role",
      [nome, email, hash, userRole]
    );
    const user = rows[0];
    const token = jwt.sign({ id: user.id, nome: user.nome, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    const { rows } = await pool.query("SELECT * FROM usuarios WHERE email=$1 AND ativo=true", [email]);
    if (!rows.length) return res.status(401).json({ error: "Email ou senha incorretos" });
    const valid = await bcrypt.compare(senha, rows[0].senha);
    if (!valid) return res.status(401).json({ error: "Email ou senha incorretos" });
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
  const { rows } = await pool.query("SELECT id,nome,email,role,ativo,created_at FROM usuarios ORDER BY created_at DESC");
  res.json(rows.map(camelize));
});

app.put("/api/usuarios/:id", auth, admin, async (req, res) => {
  const { nome, role, ativo } = req.body;
  const { rows } = await pool.query(
    "UPDATE usuarios SET nome=$1,role=$2,ativo=$3 WHERE id=$4 RETURNING id,nome,email,role,ativo",
    [nome, role, ativo, req.params.id]
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
  const { codigo, endereco, bairro, tipo, locatario, locador, aluguel, vencimento, status, inicio, telefoneLocatario, telefoneLocador, taxaAdm } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO imoveis (codigo,endereco,bairro,tipo,locatario,locador,aluguel,vencimento,status,inicio,telefone_locatario,telefone_locador,taxa_adm)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [codigo, endereco, bairro, tipo, locatario, locador, aluguel, vencimento, status, inicio || null, telefoneLocatario, telefoneLocador, taxaAdm]
  );
  res.json(camelize(rows[0]));
});
app.put("/api/imoveis/:id", auth, admin, async (req, res) => {
  const { codigo, endereco, bairro, tipo, locatario, locador, aluguel, vencimento, status, inicio, telefoneLocatario, telefoneLocador, taxaAdm } = req.body;
  const { rows } = await pool.query(
    `UPDATE imoveis SET codigo=$1,endereco=$2,bairro=$3,tipo=$4,locatario=$5,locador=$6,aluguel=$7,vencimento=$8,status=$9,inicio=$10,telefone_locatario=$11,telefone_locador=$12,taxa_adm=$13 WHERE id=$14 RETURNING *`,
    [codigo, endereco, bairro, tipo, locatario, locador, aluguel, vencimento, status, inicio || null, telefoneLocatario, telefoneLocador, taxaAdm, req.params.id]
  );
  res.json(camelize(rows[0]));
});
app.delete("/api/imoveis/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM imoveis WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// RECEBIMENTOS
app.get("/api/recebimentos", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM recebimentos ORDER BY data DESC");
  res.json(rows.map(camelize));
});
app.post("/api/recebimentos", auth, async (req, res) => {
  const { imovelId, data, valor, tipo, status, obs } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO recebimentos (imovel_id,data,valor,tipo,status,obs) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [imovelId, data, valor, tipo, status, obs]
  );
  res.json(camelize(rows[0]));
});
app.put("/api/recebimentos/:id", auth, async (req, res) => {
  const { imovelId, data, valor, tipo, status, obs } = req.body;
  const { rows } = await pool.query(
    `UPDATE recebimentos SET imovel_id=$1,data=$2,valor=$3,tipo=$4,status=$5,obs=$6 WHERE id=$7 RETURNING *`,
    [imovelId, data, valor, tipo, status, obs, req.params.id]
  );
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
  const { rows } = await pool.query(
    `INSERT INTO despesas (imovel_id,data,valor,tipo,descricao,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [imovelId, data, valor, tipo, descricao, status]
  );
  res.json(camelize(rows[0]));
});
app.put("/api/despesas/:id", auth, async (req, res) => {
  const { imovelId, data, valor, tipo, descricao, status } = req.body;
  const { rows } = await pool.query(
    `UPDATE despesas SET imovel_id=$1,data=$2,valor=$3,tipo=$4,descricao=$5,status=$6 WHERE id=$7 RETURNING *`,
    [imovelId, data, valor, tipo, descricao, status, req.params.id]
  );
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
  const { imovelId, data, mes, valorBruto, taxaAdm, valorLiquido, status } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO repasses (imovel_id,data,mes,valor_bruto,taxa_adm,valor_liquido,status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [imovelId, data, mes, valorBruto, taxaAdm, valorLiquido, status]
  );
  res.json(camelize(rows[0]));
});
app.delete("/api/repasses/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM repasses WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
initDb().then(() => {
  app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
}).catch(err => { console.error(err); process.exit(1); });
