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
      aprovado BOOLEAN DEFAULT false, tipo_acesso TEXT DEFAULT 'interno',
      ref_id INT, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aprovado BOOLEAN DEFAULT false;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipo_acesso TEXT DEFAULT 'interno';
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ref_id INT;

    CREATE TABLE IF NOT EXISTS locadores (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL, cpf_cnpj TEXT, email TEXT, telefone TEXT,
      estado_civil TEXT, profissao TEXT, nacionalidade TEXT DEFAULT 'brasileiro(a)',
      rg TEXT, rg_orgao TEXT,
      endereco TEXT, bairro TEXT, cidade TEXT, estado TEXT, cep TEXT,
      procurador_nome TEXT, procurador_cpf TEXT, procurador_rg TEXT, procurador_endereco TEXT,
      banco TEXT, agencia TEXT, conta TEXT, tipo_conta TEXT DEFAULT 'Corrente', pix TEXT,
      obs TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS locatarios (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL, cpf TEXT, email TEXT, telefone TEXT,
      estado_civil TEXT, profissao TEXT, nacionalidade TEXT DEFAULT 'brasileiro(a)',
      rg TEXT, rg_orgao TEXT, cnh TEXT,
      endereco TEXT, bairro TEXT, cidade TEXT, estado TEXT, cep TEXT,
      renda NUMERIC, fiador_nome TEXT, fiador_cpf TEXT, fiador_telefone TEXT,
      obs TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS documentos_pessoa (
      id SERIAL PRIMARY KEY,
      tipo_pessoa TEXT NOT NULL, pessoa_id INT NOT NULL,
      tipo TEXT, nome TEXT, key TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS imoveis (
      id SERIAL PRIMARY KEY,
      codigo TEXT UNIQUE, endereco TEXT, bairro TEXT, cidade TEXT, estado TEXT, cep TEXT,
      tipo TEXT, area NUMERIC,
      nome_condominio TEXT, bloco TEXT, apartamento TEXT,
      quartos INT, mobiliado TEXT DEFAULT 'Sem móveis',
      valor_ideal NUMERIC,
      tel_portaria TEXT, tel_contabilidade TEXT, tel_cobranca TEXT, tel_sindico TEXT,
      locador_id INT REFERENCES locadores(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS cidade TEXT;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS estado TEXT;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS cep TEXT;
    ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS locador_id INT REFERENCES locadores(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS documentos_imovel (
      id SERIAL PRIMARY KEY,
      imovel_id INT REFERENCES imoveis(id) ON DELETE CASCADE,
      tipo TEXT, nome TEXT, key TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vistorias (
      id SERIAL PRIMARY KEY,
      imovel_id INT REFERENCES imoveis(id) ON DELETE CASCADE,
      tipo TEXT DEFAULT 'Entrada', data DATE, responsavel TEXT,
      observacoes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS documentos_vistoria (
      id SERIAL PRIMARY KEY,
      vistoria_id INT REFERENCES vistorias(id) ON DELETE CASCADE,
      nome TEXT, key TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS historico_imovel (
      id SERIAL PRIMARY KEY,
      imovel_id INT REFERENCES imoveis(id) ON DELETE CASCADE,
      tipo TEXT, descricao TEXT, data DATE, usuario_nome TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contratos (
      id SERIAL PRIMARY KEY,
      imovel_id INT REFERENCES imoveis(id) ON DELETE CASCADE,
      locatario_id INT REFERENCES locatarios(id) ON DELETE SET NULL,
      locador_id INT REFERENCES locadores(id) ON DELETE SET NULL,
      locatario TEXT, telefone_locatario TEXT,
      locador TEXT, telefone_locador TEXT,
      aluguel_inicial NUMERIC, aluguel_atual NUMERIC,
      aluguel_paga_por TEXT DEFAULT 'Locatário',
      condominio NUMERIC DEFAULT 0, condominio_paga_por TEXT DEFAULT 'Locatário',
      iptu NUMERIC DEFAULT 0, iptu_paga_por TEXT DEFAULT 'Locatário',
      caucao NUMERIC DEFAULT 0,
      taxa_adm_pct NUMERIC DEFAULT 10,
      vencimento INT, forma_pagamento TEXT DEFAULT 'Pix',
      inicio DATE, duracao_meses INT, fim DATE,
      status TEXT DEFAULT 'Ativo',
      multa_rescisao_pct NUMERIC DEFAULT 0,
      multa_atraso_pct NUMERIC DEFAULT 10,
      juros_atraso_pct NUMERIC DEFAULT 1,
      honorarios_pct NUMERIC DEFAULT 10, honorarios_dias INT DEFAULT 10,
      honorarios_adv_pct NUMERIC DEFAULT 20, honorarios_adv_dias INT DEFAULT 20,
      indice_reajuste TEXT DEFAULT 'IGPM',
      contrato_pdf_key TEXT, contrato_pdf_nome TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE contratos ADD COLUMN IF NOT EXISTS locatario_id INT REFERENCES locatarios(id) ON DELETE SET NULL;
    ALTER TABLE contratos ADD COLUMN IF NOT EXISTS locador_id INT REFERENCES locadores(id) ON DELETE SET NULL;
    ALTER TABLE contratos ADD COLUMN IF NOT EXISTS caucao NUMERIC DEFAULT 0;
    ALTER TABLE contratos ADD COLUMN IF NOT EXISTS indice_reajuste TEXT DEFAULT 'IGPM';

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
      dias_atraso INT GENERATED ALWAYS AS (
        CASE WHEN status='Pendente' AND vencimento < CURRENT_DATE
          THEN CURRENT_DATE - vencimento ELSE 0 END
      ) STORED,
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

    CREATE TABLE IF NOT EXISTS acerto_final (
      id SERIAL PRIMARY KEY,
      contrato_id INT REFERENCES contratos(id) ON DELETE CASCADE,
      data_acerto DATE,
      status TEXT DEFAULT 'Pendente',
      energia NUMERIC DEFAULT 0,
      agua NUMERIC DEFAULT 0,
      gas NUMERIC DEFAULT 0,
      condominio NUMERIC DEFAULT 0,
      iptu NUMERIC DEFAULT 0,
      limpeza_estofados NUMERIC DEFAULT 0,
      limpeza_ar_condicionado NUMERIC DEFAULT 0,
      faxina NUMERIC DEFAULT 0,
      pintura NUMERIC DEFAULT 0,
      reparos_hidraulicos NUMERIC DEFAULT 0,
      reparos_eletricos NUMERIC DEFAULT 0,
      vidros_janelas NUMERIC DEFAULT 0,
      chaves_fechaduras NUMERIC DEFAULT 0,
      multa_rescisao NUMERIC DEFAULT 0,
      caucao_devolvido NUMERIC DEFAULT 0,
      outros_descricao TEXT,
      outros_valor NUMERIC DEFAULT 0,
      obs TEXT,
      total_debitos NUMERIC GENERATED ALWAYS AS (
        COALESCE(energia,0)+COALESCE(agua,0)+COALESCE(gas,0)+COALESCE(condominio,0)+COALESCE(iptu,0)+
        COALESCE(limpeza_estofados,0)+COALESCE(limpeza_ar_condicionado,0)+COALESCE(faxina,0)+
        COALESCE(pintura,0)+COALESCE(reparos_hidraulicos,0)+COALESCE(reparos_eletricos,0)+
        COALESCE(vidros_janelas,0)+COALESCE(chaves_fechaduras,0)+COALESCE(multa_rescisao,0)+
        COALESCE(outros_valor,0)
      ) STORED,
      saldo_final NUMERIC GENERATED ALWAYS AS (
        COALESCE(caucao_devolvido,0) - (
          COALESCE(energia,0)+COALESCE(agua,0)+COALESCE(gas,0)+COALESCE(condominio,0)+COALESCE(iptu,0)+
          COALESCE(limpeza_estofados,0)+COALESCE(limpeza_ar_condicionado,0)+COALESCE(faxina,0)+
          COALESCE(pintura,0)+COALESCE(reparos_hidraulicos,0)+COALESCE(reparos_eletricos,0)+
          COALESCE(vidros_janelas,0)+COALESCE(chaves_fechaduras,0)+COALESCE(multa_rescisao,0)+
          COALESCE(outros_valor,0)
        )
      ) STORED,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS documentos_repasse (
      id SERIAL PRIMARY KEY,
      repasse_id INT REFERENCES repasses(id) ON DELETE CASCADE,
      nome TEXT, key TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Migrations - adiciona colunas que podem não existir em bancos antigos
  const migrations = [
    "ALTER TABLE despesas ADD COLUMN IF NOT EXISTS contrato_id INT REFERENCES contratos(id) ON DELETE CASCADE",
    "ALTER TABLE repasses ADD COLUMN IF NOT EXISTS contrato_id INT REFERENCES contratos(id) ON DELETE CASCADE",
    "ALTER TABLE repasses ADD COLUMN IF NOT EXISTS data_repasse DATE",
    "ALTER TABLE repasses ADD COLUMN IF NOT EXISTS valor_recebido NUMERIC",
    "ALTER TABLE repasses ADD COLUMN IF NOT EXISTS total_despesas NUMERIC",
    "ALTER TABLE repasses ADD COLUMN IF NOT EXISTS taxa_adm NUMERIC",
    "ALTER TABLE repasses ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC",
    "ALTER TABLE repasses ADD COLUMN IF NOT EXISTS forma_pagamento TEXT",
    "ALTER TABLE repasses ADD COLUMN IF NOT EXISTS comprovante_key TEXT",
    "ALTER TABLE repasses ADD COLUMN IF NOT EXISTS comprovante_nome TEXT",
    "ALTER TABLE repasses ADD COLUMN IF NOT EXISTS obs TEXT",
    "ALTER TABLE contratos ADD COLUMN IF NOT EXISTS locatario_id INT REFERENCES locatarios(id) ON DELETE SET NULL",
    "ALTER TABLE contratos ADD COLUMN IF NOT EXISTS locador_id INT REFERENCES locadores(id) ON DELETE SET NULL",
    "ALTER TABLE contratos ADD COLUMN IF NOT EXISTS caucao NUMERIC DEFAULT 0",
    "ALTER TABLE contratos ADD COLUMN IF NOT EXISTS garantia TEXT",
    "ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS locador_id INT REFERENCES locadores(id) ON DELETE SET NULL",
    "ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS cidade TEXT",
    "ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS estado TEXT",
    "ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS cep TEXT",
  ];
  for (const m of migrations) {
    await pool.query(m).catch(e => console.log("Migration skip:", e.message));
  }
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

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  try {
    const { nome, email, senha, tipoAcesso, refId } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ error: "Preencha todos os campos" });
    const existing = await pool.query("SELECT id FROM usuarios WHERE email=$1", [email]);
    if (existing.rows.length) return res.status(400).json({ error: "Email já cadastrado" });
    const hash = await bcrypt.hash(senha, 10);
    await pool.query(
      "INSERT INTO usuarios (nome,email,senha,role,aprovado,tipo_acesso,ref_id) VALUES ($1,$2,$3,'usuario',false,$4,$5)",
      [nome, email, hash, tipoAcesso||'interno', refId||null]
    );
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
    const token = jwt.sign({ id: user.id, nome: user.nome, email: user.email, role: user.role, tipoAcesso: user.tipo_acesso, refId: user.ref_id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, role: user.role, tipoAcesso: user.tipo_acesso, refId: user.ref_id } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── USUÁRIOS ──────────────────────────────────────────────────────────────────
app.get("/api/usuarios", auth, admin, async (req, res) => {
  const { rows } = await pool.query("SELECT id,nome,email,role,ativo,aprovado,tipo_acesso,ref_id,created_at FROM usuarios ORDER BY aprovado ASC, created_at DESC");
  res.json(rows.map(camelize));
});
app.put("/api/usuarios/:id", auth, admin, async (req, res) => {
  const { nome, role, ativo, aprovado } = req.body;
  const { rows } = await pool.query("UPDATE usuarios SET nome=$1,role=$2,ativo=$3,aprovado=$4 WHERE id=$5 RETURNING id,nome,email,role,ativo,aprovado,tipo_acesso,ref_id", [nome, role, ativo, aprovado, req.params.id]);
  res.json(camelize(rows[0]));
});
app.delete("/api/usuarios/:id", auth, admin, async (req, res) => {
  if (req.user.id === +req.params.id) return res.status(400).json({ error: "Não pode excluir sua própria conta" });
  await pool.query("DELETE FROM usuarios WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// ── LOCADORES ─────────────────────────────────────────────────────────────────
app.get("/api/locadores", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM locadores ORDER BY nome");
  res.json(rows.map(camelize));
});
app.post("/api/locadores", auth, admin, async (req, res) => {
  const f = req.body;
  const { rows } = await pool.query(
    `INSERT INTO locadores (nome,cpf_cnpj,email,telefone,estado_civil,profissao,nacionalidade,rg,rg_orgao,endereco,bairro,cidade,estado,cep,procurador_nome,procurador_cpf,procurador_rg,procurador_endereco,banco,agencia,conta,tipo_conta,pix,obs)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING *`,
    [f.nome,f.cpfCnpj,f.email,f.telefone,f.estadoCivil,f.profissao,f.nacionalidade||'brasileiro(a)',f.rg,f.rgOrgao,f.endereco,f.bairro,f.cidade,f.estado,f.cep,f.procuradorNome,f.procuradorCpf,f.procuradorRg,f.procuradorEndereco,f.banco,f.agencia,f.conta,f.tipoConta||'Corrente',f.pix,f.obs]
  );
  res.json(camelize(rows[0]));
});
app.put("/api/locadores/:id", auth, admin, async (req, res) => {
  const f = req.body;
  const { rows } = await pool.query(
    `UPDATE locadores SET nome=$1,cpf_cnpj=$2,email=$3,telefone=$4,estado_civil=$5,profissao=$6,nacionalidade=$7,rg=$8,rg_orgao=$9,endereco=$10,bairro=$11,cidade=$12,estado=$13,cep=$14,procurador_nome=$15,procurador_cpf=$16,procurador_rg=$17,procurador_endereco=$18,banco=$19,agencia=$20,conta=$21,tipo_conta=$22,pix=$23,obs=$24 WHERE id=$25 RETURNING *`,
    [f.nome,f.cpfCnpj,f.email,f.telefone,f.estadoCivil,f.profissao,f.nacionalidade||'brasileiro(a)',f.rg,f.rgOrgao,f.endereco,f.bairro,f.cidade,f.estado,f.cep,f.procuradorNome,f.procuradorCpf,f.procuradorRg,f.procuradorEndereco,f.banco,f.agencia,f.conta,f.tipoConta||'Corrente',f.pix,f.obs,req.params.id]
  );
  res.json(camelize(rows[0]));
});
app.delete("/api/locadores/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM locadores WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// ── LOCATÁRIOS ────────────────────────────────────────────────────────────────
app.get("/api/locatarios", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM locatarios ORDER BY nome");
  res.json(rows.map(camelize));
});
app.post("/api/locatarios", auth, admin, async (req, res) => {
  const f = req.body;
  const { rows } = await pool.query(
    `INSERT INTO locatarios (nome,cpf,email,telefone,estado_civil,profissao,nacionalidade,rg,rg_orgao,cnh,endereco,bairro,cidade,estado,cep,renda,fiador_nome,fiador_cpf,fiador_telefone,obs)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
    [f.nome,f.cpf,f.email,f.telefone,f.estadoCivil,f.profissao,f.nacionalidade||'brasileiro(a)',f.rg,f.rgOrgao,f.cnh,f.endereco,f.bairro,f.cidade,f.estado,f.cep,f.renda||null,f.fiadorNome,f.fiadorCpf,f.fiadorTelefone,f.obs]
  );
  res.json(camelize(rows[0]));
});
app.put("/api/locatarios/:id", auth, admin, async (req, res) => {
  const f = req.body;
  const { rows } = await pool.query(
    `UPDATE locatarios SET nome=$1,cpf=$2,email=$3,telefone=$4,estado_civil=$5,profissao=$6,nacionalidade=$7,rg=$8,rg_orgao=$9,cnh=$10,endereco=$11,bairro=$12,cidade=$13,estado=$14,cep=$15,renda=$16,fiador_nome=$17,fiador_cpf=$18,fiador_telefone=$19,obs=$20 WHERE id=$21 RETURNING *`,
    [f.nome,f.cpf,f.email,f.telefone,f.estadoCivil,f.profissao,f.nacionalidade||'brasileiro(a)',f.rg,f.rgOrgao,f.cnh,f.endereco,f.bairro,f.cidade,f.estado,f.cep,f.renda||null,f.fiadorNome,f.fiadorCpf,f.fiadorTelefone,f.obs,req.params.id]
  );
  res.json(camelize(rows[0]));
});
app.delete("/api/locatarios/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM locatarios WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// ── DOCUMENTOS PESSOA ─────────────────────────────────────────────────────────
app.get("/api/documentos-pessoa/:tipo/:id", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM documentos_pessoa WHERE tipo_pessoa=$1 AND pessoa_id=$2 ORDER BY tipo,created_at DESC", [req.params.tipo, req.params.id]);
  res.json(rows.map(camelize));
});
app.post("/api/documentos-pessoa/:tipo/:id", auth, admin, upload.single("arquivo"), async (req, res) => {
  try {
    const { tipo } = req.body;
    const key = `pessoas/${req.params.tipo}/${req.params.id}/${tipo}-${uuidv4()}`;
    await uploadR2(req.file.buffer, key, req.file.mimetype);
    const { rows } = await pool.query(
      "INSERT INTO documentos_pessoa (tipo_pessoa,pessoa_id,tipo,nome,key) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [req.params.tipo, req.params.id, tipo, req.file.originalname, key]
    );
    res.json(camelize(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get("/api/documentos/:id/url", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT key FROM documentos_pessoa WHERE id=$1 UNION SELECT key FROM documentos_imovel WHERE id=$1 UNION SELECT key FROM documentos_repasse WHERE id=$1", [req.params.id]);
    if (!rows[0]?.key) return res.status(404).json({ error: "Não encontrado" });
    res.json({ url: await getR2Url(rows[0].key) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete("/api/documentos-pessoa/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM documentos_pessoa WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// ── IMÓVEIS ───────────────────────────────────────────────────────────────────
app.get("/api/imoveis", auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT i.*, l.nome as locador_nome, l.telefone as locador_tel,
      COUNT(c.id) as total_contratos,
      (SELECT c2.status FROM contratos c2 WHERE c2.imovel_id=i.id ORDER BY c2.created_at DESC LIMIT 1) as status_atual,
      (SELECT lt.nome FROM contratos c2 JOIN locatarios lt ON lt.id=c2.locatario_id WHERE c2.imovel_id=i.id AND c2.status='Ativo' ORDER BY c2.created_at DESC LIMIT 1) as locatario_atual,
      (SELECT c2.aluguel_atual FROM contratos c2 WHERE c2.imovel_id=i.id AND c2.status='Ativo' ORDER BY c2.created_at DESC LIMIT 1) as aluguel_atual,
      (SELECT c2.condominio FROM contratos c2 WHERE c2.imovel_id=i.id AND c2.status='Ativo' ORDER BY c2.created_at DESC LIMIT 1) as condominio_atual,
      (SELECT c2.iptu FROM contratos c2 WHERE c2.imovel_id=i.id AND c2.status='Ativo' ORDER BY c2.created_at DESC LIMIT 1) as iptu_atual,
      (SELECT c2.vencimento FROM contratos c2 WHERE c2.imovel_id=i.id AND c2.status='Ativo' ORDER BY c2.created_at DESC LIMIT 1) as vencimento_atual
    FROM imoveis i LEFT JOIN locadores l ON l.id=i.locador_id LEFT JOIN contratos c ON c.imovel_id=i.id
    GROUP BY i.id, l.nome, l.telefone ORDER BY i.id
  `);
  res.json(rows.map(camelize));
});
app.post("/api/imoveis", auth, admin, async (req, res) => {
  const f = req.body;
  const { rows } = await pool.query(
    `INSERT INTO imoveis (codigo,endereco,bairro,cidade,estado,cep,tipo,area,nome_condominio,bloco,apartamento,quartos,mobiliado,valor_ideal,tel_portaria,tel_contabilidade,tel_cobranca,tel_sindico,locador_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [f.codigo,f.endereco,f.bairro,f.cidade,f.estado,f.cep,f.tipo,f.area||null,f.nomeCondominio,f.bloco,f.apartamento,f.quartos||null,f.mobiliado||'Sem móveis',f.valorIdeal||null,f.telPortaria,f.telContabilidade,f.telCobranca,f.telSindico,f.locadorId||null]
  );
  res.json(camelize(rows[0]));
});
app.put("/api/imoveis/:id", auth, admin, async (req, res) => {
  const f = req.body;
  const { rows } = await pool.query(
    `UPDATE imoveis SET codigo=$1,endereco=$2,bairro=$3,cidade=$4,estado=$5,cep=$6,tipo=$7,area=$8,nome_condominio=$9,bloco=$10,apartamento=$11,quartos=$12,mobiliado=$13,valor_ideal=$14,tel_portaria=$15,tel_contabilidade=$16,tel_cobranca=$17,tel_sindico=$18,locador_id=$19 WHERE id=$20 RETURNING *`,
    [f.codigo,f.endereco,f.bairro,f.cidade,f.estado,f.cep,f.tipo,f.area||null,f.nomeCondominio,f.bloco,f.apartamento,f.quartos||null,f.mobiliado||'Sem móveis',f.valorIdeal||null,f.telPortaria,f.telContabilidade,f.telCobranca,f.telSindico,f.locadorId||null,req.params.id]
  );
  res.json(camelize(rows[0]));
});
app.delete("/api/imoveis/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM imoveis WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// DOCUMENTOS IMÓVEL
app.get("/api/imoveis/:id/documentos", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM documentos_imovel WHERE imovel_id=$1 ORDER BY tipo,created_at DESC", [req.params.id]);
  res.json(rows.map(camelize));
});
app.post("/api/imoveis/:id/documentos", auth, admin, upload.single("arquivo"), async (req, res) => {
  try {
    const { tipo } = req.body;
    const key = `imoveis/${req.params.id}/${tipo}-${uuidv4()}`;
    await uploadR2(req.file.buffer, key, req.file.mimetype);
    const { rows } = await pool.query("INSERT INTO documentos_imovel (imovel_id,tipo,nome,key) VALUES ($1,$2,$3,$4) RETURNING *", [req.params.id, tipo, req.file.originalname, key]);
    res.json(camelize(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get("/api/imoveis-doc/:id/url", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT key FROM documentos_imovel WHERE id=$1", [req.params.id]);
    if (!rows[0]?.key) return res.status(404).json({ error: "Não encontrado" });
    res.json({ url: await getR2Url(rows[0].key) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete("/api/imoveis-doc/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM documentos_imovel WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// VISTORIAS
app.get("/api/imoveis/:id/vistorias", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT v.*,array_agg(json_build_object('id',d.id,'nome',d.nome)) FILTER (WHERE d.id IS NOT NULL) as fotos FROM vistorias v LEFT JOIN documentos_vistoria d ON d.vistoria_id=v.id WHERE v.imovel_id=$1 GROUP BY v.id ORDER BY v.data DESC", [req.params.id]);
  res.json(rows.map(camelize));
});
app.post("/api/imoveis/:id/vistorias", auth, admin, async (req, res) => {
  const { tipo, data, responsavel, observacoes } = req.body;
  const { rows } = await pool.query("INSERT INTO vistorias (imovel_id,tipo,data,responsavel,observacoes) VALUES ($1,$2,$3,$4,$5) RETURNING *", [req.params.id, tipo, data, responsavel, observacoes]);
  await pool.query("INSERT INTO historico_imovel (imovel_id,tipo,descricao,data,usuario_nome) VALUES ($1,'Vistoria',$2,$3,$4)", [req.params.id, `Vistoria de ${tipo} realizada por ${responsavel}`, data, req.user.nome]);
  res.json(camelize(rows[0]));
});
app.post("/api/vistorias/:id/fotos", auth, admin, upload.single("foto"), async (req, res) => {
  try {
    const key = `vistorias/${req.params.id}/${uuidv4()}`;
    await uploadR2(req.file.buffer, key, req.file.mimetype);
    const { rows } = await pool.query("INSERT INTO documentos_vistoria (vistoria_id,nome,key) VALUES ($1,$2,$3) RETURNING *", [req.params.id, req.file.originalname, key]);
    res.json(camelize(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get("/api/vistoria-foto/:id/url", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT key FROM documentos_vistoria WHERE id=$1", [req.params.id]);
    if (!rows[0]?.key) return res.status(404).json({ error: "Não encontrado" });
    res.json({ url: await getR2Url(rows[0].key) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// HISTÓRICO
app.get("/api/imoveis/:id/historico", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM historico_imovel WHERE imovel_id=$1 ORDER BY created_at DESC", [req.params.id]);
  res.json(rows.map(camelize));
});
app.post("/api/imoveis/:id/historico", auth, async (req, res) => {
  const { tipo, descricao, data } = req.body;
  const { rows } = await pool.query("INSERT INTO historico_imovel (imovel_id,tipo,descricao,data,usuario_nome) VALUES ($1,$2,$3,$4,$5) RETURNING *", [req.params.id, tipo, descricao, data, req.user.nome]);
  res.json(camelize(rows[0]));
});

// ── CONTRATOS ─────────────────────────────────────────────────────────────────
app.get("/api/contratos", auth, async (req, res) => {
  const where = req.user.tipoAcesso === 'locador' ? `AND c.locador_id=${req.user.refId}` :
                req.user.tipoAcesso === 'locatario' ? `AND c.locatario_id=${req.user.refId}` : '';
  const imovelId = req.query.imovelId ? `AND c.imovel_id=${+req.query.imovelId}` : '';
  const { rows } = await pool.query(`
    SELECT c.*,i.codigo,i.endereco,i.bairro,i.tipo,
      lt.nome as locatario_nome_full, ld.nome as locador_nome_full
    FROM contratos c
    JOIN imoveis i ON i.id=c.imovel_id
    LEFT JOIN locatarios lt ON lt.id=c.locatario_id
    LEFT JOIN locadores ld ON ld.id=c.locador_id
    WHERE 1=1 ${where} ${imovelId}
    ORDER BY c.created_at DESC
  `);
  res.json(rows.map(camelize));
});

app.post("/api/contratos", auth, admin, async (req, res) => {
  try {
    const f = req.body;
    const fim = f.inicio && f.duracaoMeses ? (() => { const d = new Date(f.inicio); d.setMonth(d.getMonth() + +f.duracaoMeses); return d.toISOString().split("T")[0]; })() : null;
    const { rows } = await pool.query(
      `INSERT INTO contratos (imovel_id,locatario_id,locador_id,locatario,telefone_locatario,locador,telefone_locador,aluguel_inicial,aluguel_atual,aluguel_paga_por,condominio,condominio_paga_por,iptu,iptu_paga_por,caucao,taxa_adm_pct,vencimento,forma_pagamento,inicio,duracao_meses,fim,status,multa_rescisao_pct,multa_atraso_pct,juros_atraso_pct,honorarios_pct,honorarios_dias,honorarios_adv_pct,honorarios_adv_dias,indice_reajuste,garantia)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30) RETURNING *`,
      [f.imovelId,f.locatarioId||null,f.locadorId||null,f.locatario,f.telefoneLocatario,f.locador,f.telefoneLocador,+f.aluguelInicial,f.aluguelPagaPor||'Locatário',+f.condominio||0,f.condominioPagaPor||'Locatário',+f.iptu||0,f.iptuPagaPor||'Locatário',+f.caucao||0,+f.taxaAdmPct||10,+f.vencimento,f.formaPagamento||'Pix',f.inicio||null,+f.duracaoMeses||null,fim,f.status||'Ativo',+f.multaRescisaoPct||0,+f.multaAtrasoPct||10,+f.jurosAtrasoPct||1,+f.honorariosPct||10,+f.honorariosDias||10,+f.honorariosAdvPct||20,+f.honorariosAdvDias||20,f.indiceReajuste||'IGPM',f.garantia||null]
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
    await pool.query("INSERT INTO historico_imovel (imovel_id,tipo,descricao,data,usuario_nome) VALUES ($1,'Contrato',$2,CURRENT_DATE,$3)", [f.imovelId, `Contrato iniciado com ${f.locatario}`, req.user.nome]);
    res.json(camelize(contrato));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/contratos/:id", auth, admin, async (req, res) => {
  const f = req.body;
  const fim = f.inicio && f.duracaoMeses ? (() => { const d = new Date(f.inicio); d.setMonth(d.getMonth() + +f.duracaoMeses); return d.toISOString().split("T")[0]; })() : null;
  const { rows } = await pool.query(
    `UPDATE contratos SET locatario_id=$1,locador_id=$2,locatario=$3,telefone_locatario=$4,locador=$5,telefone_locador=$6,aluguel_atual=$7,aluguel_paga_por=$8,condominio=$9,condominio_paga_por=$10,iptu=$11,iptu_paga_por=$12,caucao=$13,taxa_adm_pct=$14,vencimento=$15,forma_pagamento=$16,inicio=$17,duracao_meses=$18,fim=$19,status=$20,multa_rescisao_pct=$21,multa_atraso_pct=$22,juros_atraso_pct=$23,honorarios_pct=$24,honorarios_dias=$25,honorarios_adv_pct=$26,honorarios_adv_dias=$27,indice_reajuste=$28,garantia=$29 WHERE id=$30 RETURNING *`,
    [f.locatarioId||null,f.locadorId||null,f.locatario,f.telefoneLocatario,f.locador,f.telefoneLocador,+f.aluguelAtual,f.aluguelPagaPor||'Locatário',+f.condominio||0,f.condominioPagaPor||'Locatário',+f.iptu||0,f.iptuPagaPor||'Locatário',+f.caucao||0,+f.taxaAdmPct||10,+f.vencimento,f.formaPagamento||'Pix',f.inicio||null,+f.duracaoMeses||null,fim,f.status||'Ativo',+f.multaRescisaoPct||0,+f.multaAtrasoPct||10,+f.jurosAtrasoPct||1,+f.honorariosPct||10,+f.honorariosDias||10,+f.honorariosAdvPct||20,+f.honorariosAdvDias||20,f.indiceReajuste||'IGPM',f.garantia||null,req.params.id]
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

// INADIMPLÊNCIA
app.get("/api/inadimplencia", auth, async (req, res) => {
  const where = req.user.tipoAcesso === 'locador' ? `AND c.locador_id=${req.user.refId}` : '';
  const { rows } = await pool.query(`
    SELECT p.*,c.locatario,c.locador,c.multa_atraso_pct,c.juros_atraso_pct,c.honorarios_pct,c.honorarios_dias,c.honorarios_adv_pct,c.honorarios_adv_dias,i.codigo,
      (CURRENT_DATE - p.vencimento) as dias_atraso_calc,
      p.valor * (c.multa_atraso_pct/100) as valor_multa,
      p.valor * (c.juros_atraso_pct/100) * (CURRENT_DATE - p.vencimento)/30.0 as valor_juros
    FROM parcelas p
    JOIN contratos c ON c.id=p.contrato_id
    JOIN imoveis i ON i.id=c.imovel_id
    WHERE p.status='Pendente' AND p.vencimento < CURRENT_DATE ${where}
    ORDER BY p.vencimento ASC
  `);
  res.json(rows.map(r => ({
    ...camelize(r),
    totalDevido: Number(r.valor) + Number(r.valor_multa||0) + Number(r.valor_juros||0)
  })));
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
  const where = req.user.tipoAcesso === 'locador' ? `AND c.locador_id=${req.user.refId}` : '';
  const { rows } = await pool.query(`SELECT r.*,c.locador,i.codigo FROM repasses r JOIN contratos c ON c.id=r.contrato_id JOIN imoveis i ON i.id=c.imovel_id WHERE 1=1 ${where} ORDER BY r.created_at DESC`);
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
    const { rows } = await pool.query("INSERT INTO documentos_repasse (repasse_id,nome,key) VALUES ($1,$2,$3) RETURNING *", [req.params.id, req.file.originalname, key]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get("/api/repasses/:id/comprovante/url", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT comprovante_key as key FROM repasses WHERE id=$1", [req.params.id]);
    if (!rows[0]?.key) return res.status(404).json({ error: "Sem comprovante" });
    res.json({ url: await getR2Url(rows[0].key) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get("/api/repasses/:id/documentos", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM documentos_repasse WHERE repasse_id=$1", [req.params.id]);
  res.json(rows.map(camelize));
});
app.post("/api/repasses/:id/documentos", auth, admin, upload.single("arquivo"), async (req, res) => {
  try {
    const key = `repasses/${req.params.id}/${uuidv4()}`;
    await uploadR2(req.file.buffer, key, req.file.mimetype);
    const { rows } = await pool.query("INSERT INTO documentos_repasse (repasse_id,nome,key) VALUES ($1,$2,$3) RETURNING *", [req.params.id, req.file.originalname, key]);
    res.json(camelize(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get("/api/repasse-doc/:id/url", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT key FROM documentos_repasse WHERE id=$1", [req.params.id]);
    if (!rows[0]?.key) return res.status(404).json({ error: "Não encontrado" });
    res.json({ url: await getR2Url(rows[0].key) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DRE + PREVISÃO
app.get("/api/dre", auth, async (req, res) => {
  const { inicio, fim } = req.query;
  const where = inicio && fim ? `AND data BETWEEN '${inicio}' AND '${fim}'` : '';
  const [receitas, despesas, repasses, previsao] = await Promise.all([
    pool.query(`SELECT to_char(data_recebimento,'YYYY-MM') as mes, COALESCE(SUM(valor_recebido),0) as total FROM parcelas WHERE status='Pago' ${inicio&&fim?`AND data_recebimento BETWEEN '${inicio}' AND '${fim}'`:''} GROUP BY mes ORDER BY mes`),
    pool.query(`SELECT to_char(data,'YYYY-MM') as mes, tipo, COALESCE(SUM(valor),0) as total FROM despesas WHERE 1=1 ${inicio&&fim?`AND data BETWEEN '${inicio}' AND '${fim}'`:''} GROUP BY mes,tipo ORDER BY mes`),
    pool.query(`SELECT to_char(data_repasse,'YYYY-MM') as mes, COALESCE(SUM(taxa_adm),0) as honorarios, COALESCE(SUM(valor_liquido),0) as repassado FROM repasses WHERE 1=1 ${inicio&&fim?`AND data_repasse BETWEEN '${inicio}' AND '${fim}'`:''} GROUP BY mes ORDER BY mes`),
    pool.query(`SELECT p.competencia, p.vencimento, p.valor, p.status, i.codigo, c.locatario FROM parcelas p JOIN contratos c ON c.id=p.contrato_id JOIN imoveis i ON i.id=c.imovel_id WHERE p.status='Pendente' AND c.status='Ativo' AND p.vencimento >= CURRENT_DATE ORDER BY p.vencimento ASC LIMIT 60`),
  ]);
  res.json({ receitas: receitas.rows, despesas: despesas.rows, repasses: repasses.rows, previsao: previsao.rows.map(camelize) });
});

// ACERTO FINAL
app.get("/api/acerto-final", auth, async (req, res) => {
  const { rows } = await pool.query(`SELECT a.*,c.locatario,c.locador,i.codigo,i.endereco FROM acerto_final a JOIN contratos c ON c.id=a.contrato_id JOIN imoveis i ON i.id=c.imovel_id ORDER BY a.created_at DESC`);
  res.json(rows.map(camelize));
});
app.get("/api/contratos/:id/acerto-final", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM acerto_final WHERE contrato_id=$1 ORDER BY created_at DESC", [req.params.id]);
  res.json(rows.map(camelize));
});
app.post("/api/acerto-final", auth, admin, async (req, res) => {
  const f = req.body;
  const { rows } = await pool.query(
    `INSERT INTO acerto_final (contrato_id,data_acerto,status,energia,agua,gas,condominio,iptu,limpeza_estofados,limpeza_ar_condicionado,faxina,pintura,reparos_hidraulicos,reparos_eletricos,vidros_janelas,chaves_fechaduras,multa_rescisao,caucao_devolvido,outros_descricao,outros_valor,obs)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
    [f.contratoId,f.dataAcerto,f.status||'Pendente',+f.energia||0,+f.agua||0,+f.gas||0,+f.condominio||0,+f.iptu||0,+f.limpezaEstofados||0,+f.limpezaArCondicionado||0,+f.faxina||0,+f.pintura||0,+f.reparosHidraulicos||0,+f.reparosEletricos||0,+f.vidrosJanelas||0,+f.chavesFechaduras||0,+f.multaRescisao||0,+f.caucaoDevolvido||0,f.outrosDescricao||null,+f.outrosValor||0,f.obs||null]
  );
  res.json(camelize(rows[0]));
});
app.put("/api/acerto-final/:id", auth, admin, async (req, res) => {
  const f = req.body;
  const { rows } = await pool.query(
    `UPDATE acerto_final SET data_acerto=$1,status=$2,energia=$3,agua=$4,gas=$5,condominio=$6,iptu=$7,limpeza_estofados=$8,limpeza_ar_condicionado=$9,faxina=$10,pintura=$11,reparos_hidraulicos=$12,reparos_eletricos=$13,vidros_janelas=$14,chaves_fechaduras=$15,multa_rescisao=$16,caucao_devolvido=$17,outros_descricao=$18,outros_valor=$19,obs=$20 WHERE id=$21 RETURNING *`,
    [f.dataAcerto,f.status||'Pendente',+f.energia||0,+f.agua||0,+f.gas||0,+f.condominio||0,+f.iptu||0,+f.limpezaEstofados||0,+f.limpezaArCondicionado||0,+f.faxina||0,+f.pintura||0,+f.reparosHidraulicos||0,+f.reparosEletricos||0,+f.vidrosJanelas||0,+f.chavesFechaduras||0,+f.multaRescisao||0,+f.caucaoDevolvido||0,f.outrosDescricao||null,+f.outrosValor||0,f.obs||null,req.params.id]
  );
  res.json(camelize(rows[0]));
});
app.delete("/api/acerto-final/:id", auth, admin, async (req, res) => {
  await pool.query("DELETE FROM acerto_final WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// DASHBOARD
app.get("/api/dashboard", auth, async (req, res) => {
  const where = req.user.tipoAcesso === 'locador' ? `AND c.locador_id=${req.user.refId}` :
                req.user.tipoAcesso === 'locatario' ? `AND c.locatario_id=${req.user.refId}` : '';
  const [contratos, recMes, repMes, despMes, recPorMes, vencendo, inadimplentes] = await Promise.all([
    pool.query(`SELECT COUNT(*) as total, COALESCE(SUM(aluguel_atual),0) as carteira FROM contratos c WHERE status='Ativo' ${where}`),
    pool.query("SELECT COALESCE(SUM(valor_recebido),0) as total FROM parcelas WHERE status='Pago' AND data_recebimento >= date_trunc('month', CURRENT_DATE)"),
    pool.query("SELECT COALESCE(SUM(valor_liquido),0) as total FROM repasses WHERE data_repasse >= date_trunc('month', CURRENT_DATE)"),
    pool.query("SELECT COALESCE(SUM(valor),0) as total FROM despesas WHERE data >= date_trunc('month', CURRENT_DATE)"),
    pool.query("SELECT to_char(data_recebimento,'YYYY-MM') as mes, COALESCE(SUM(valor_recebido),0) as recebido FROM parcelas WHERE status='Pago' AND data_recebimento >= CURRENT_DATE - INTERVAL '12 months' GROUP BY mes ORDER BY mes"),
    pool.query(`SELECT p.*,i.codigo,c.locatario FROM parcelas p JOIN contratos c ON c.id=p.contrato_id JOIN imoveis i ON i.id=c.imovel_id WHERE p.status='Pendente' AND p.vencimento <= CURRENT_DATE + INTERVAL '7 days' AND p.vencimento >= CURRENT_DATE ${where} ORDER BY p.vencimento LIMIT 10`),
    pool.query(`SELECT COUNT(*) as total, COALESCE(SUM(valor),0) as valor_total FROM parcelas p JOIN contratos c ON c.id=p.contrato_id WHERE p.status='Pendente' AND p.vencimento < CURRENT_DATE ${where}`),
  ]);
  res.json({
    contratosAtivos: +contratos.rows[0].total,
    carteiraMensal: +contratos.rows[0].carteira,
    recebidoMes: +recMes.rows[0].total,
    repassadoMes: +repMes.rows[0].total,
    despesasMes: +despMes.rows[0].total,
    inadimplentesQtd: +inadimplentes.rows[0].total,
    inadimplentesValor: +inadimplentes.rows[0].valor_total,
    recPorMes: recPorMes.rows,
    vencendo: vencendo.rows.map(camelize),
  });
});

const PORT = process.env.PORT || 3001;
initDb().then(() => app.listen(PORT, () => console.log(`API na porta ${PORT}`))).catch(err => { console.error(err); process.exit(1); });
