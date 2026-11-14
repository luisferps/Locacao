/* Administração de Aluguel (Inerente) — servidor próprio, separado do Beira Rio.
   Entrada pelo Portal Inerente (SSO) ou por e-mail e senha. Banco próprio (Postgres do Railway). */
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { criaLocacao } from './locacao-lib.mjs';

pg.types.setTypeParser(1082, v => v);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 5,
});

let ATOR = null;
async function q(sql, params = []) {
  if (ATOR && /^\s*(insert|update|delete)/i.test(sql)) {
    const c = await pool.connect();
    try { await c.query('begin'); await c.query(`select set_config('app.ator', $1, true)`, [ATOR]); const r = await c.query(sql, params); await c.query('commit'); return r.rows; }
    catch (e) { await c.query('rollback').catch(() => null); throw e; } finally { c.release(); }
  }
  return (await pool.query(sql, params)).rows;
}

async function prepara() {
  await q(`create schema if not exists locacao`);
  await q(`create table if not exists locacao.config(chave text primary key, valor text)`);
  await q(`create table if not exists locacao.historico(id bigserial primary key, em timestamptz default now(), quem text, acao text, detalhe jsonb)`);
  await q(`create table if not exists locacao.arquivos(chave text primary key, dados bytea not null, em timestamptz default now())`);
  await q(`create table if not exists locacao.login_falhas(id bigserial primary key, ip text not null, em timestamptz default now())`);
  /* usuários: aproveita a tabela que já existe neste banco (mesmos logins de antes) */
  await q(`create table if not exists usuarios(id serial primary key, nome text not null, email text unique not null, senha text not null, role text default 'usuario',
    ativo boolean default true, aprovado boolean default false, tipo_acesso text default 'interno', ref_id int, created_at timestamptz default now())`);
}
/* chave dos logins: nunca um valor fixo no código; se a variável não existir, cria uma aleatória e guarda no banco */
async function chaveLogin() {
  const env = (process.env.JWT_SECRET || '').trim();
  if (env && env !== 'imobiliaria_secret_key_2025') return env;
  const [r] = await q(`select valor from locacao.config where chave='jwt'`);
  if (r) return r.valor;
  const v = crypto.randomBytes(48).toString('hex');
  await q(`insert into locacao.config(chave, valor) values ('jwt',$1) on conflict do nothing`, [v]);
  return (await q(`select valor from locacao.config where chave='jwt'`))[0].valor;
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
const log = (quem, acao, detalhe) => q(`insert into locacao.historico(quem, acao, detalhe) values ($1,$2,$3)`, [quem, acao, detalhe || {}]).catch(() => null);
const arquivos = {
  set: (chave, buf) => q(`insert into locacao.arquivos(chave, dados) values ($1,$2) on conflict (chave) do update set dados=excluded.dados`, [chave, buf]),
  get: async chave => { const [r] = await q(`select dados from locacao.arquivos where chave=$1`, [chave]); return r?.dados || null; },
  del: chave => q(`delete from locacao.arquivos where chave=$1`, [chave]),
};
const rotas = criaLocacao({ q, json, log, arquivos });

const app = express();
const ORIGENS = (process.env.FRONT_URLS || 'https://aluguel.up.railway.app').split(',').map(s => s.trim());
app.use(cors({ origin: (o, cb) => cb(null, !o || ORIGENS.includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o)) }));
app.use(express.json({ limit: '8mb' }));

let SEGREDO = null;
const ipDe = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim() || 'desconhecido';
async function bloqueado(ip) { const [r] = await q(`select count(*)::int n from locacao.login_falhas where ip=$1 and em > now() - interval '15 minutes'`, [ip]); return r.n >= 10; }
async function falhou(ip) { await q(`insert into locacao.login_falhas(ip) values ($1)`, [ip]); await q(`delete from locacao.login_falhas where em < now() - interval '2 days'`); }
const assina = u => jwt.sign({ id: u.id, nome: u.nome, email: u.email, role: u.role }, SEGREDO, { expiresIn: '7d' });

/* se ainda não existe nenhum administrador, o primeiro que entrar vira administrador */
async function garanteAdmin(u) {
  const [a] = await q(`select count(*)::int n from usuarios where role='admin' and ativo`);
  if (!a.n) { const [r] = await q(`update usuarios set role='admin', aprovado=true where id=$1 returning *`, [u.id]); await log(u.email, 'primeiro_administrador', { id: u.id }); return r; }
  return u;
}

app.get('/api/diag', async (req, res) => { let banco = 'ok'; try { await q('select 1'); } catch { banco = 'falhou'; } res.json({ banco, versao: 'locacao-2' }); });

app.post('/api/auth/sso', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ erro: 'Token ausente' });
    const BASE = process.env.SSO_BACKEND || 'https://agentes-de-whatsapp-production.up.railway.app';
    const r = await fetch(BASE + '/painel/sso-resgatar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, sistema: 'locacao' }) });
    const j = await r.json().catch(() => ({}));
    if (!j?.ok || !j.usuario) return res.status(401).json({ erro: 'Entrada pelo Portal expirada. Volte ao Portal e clique de novo.' });
    const email = String(j.usuario).toLowerCase();
    let [u] = await q(`select * from usuarios where lower(email)=$1`, [email]);
    if (!u) [u] = await q(`insert into usuarios(nome, email, senha, role, ativo, aprovado) values ($1,$2,$3,'usuario',true,true) returning *`, [j.nome || email, email, await bcrypt.hash('sso_' + crypto.randomUUID(), 10)]);
    if (!u.ativo) return res.status(403).json({ erro: 'Acesso bloqueado. Fale com o administrador.' });
    u = await garanteAdmin(u);
    await log(u.email, 'entrada_portal', {});
    res.json({ token: assina(u), nome: u.nome, admin: u.role === 'admin' });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const ip = ipDe(req);
    if (await bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas de senha erradas. Aguarde 15 minutos e tente de novo.' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    let [u] = await q(`select * from usuarios where lower(email)=$1 and ativo`, [email]);
    if (!u || !(await bcrypt.compare(String(req.body?.senha || ''), u.senha))) { await falhou(ip); return res.status(401).json({ erro: 'E-mail ou senha incorretos.' }); }
    u = await garanteAdmin(u);
    if (!u.aprovado && u.role !== 'admin') return res.status(403).json({ erro: 'Acesso aguardando liberação do administrador.' });
    await log(u.email, 'login', {});
    res.json({ token: assina(u), nome: u.nome, admin: u.role === 'admin' });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

/* todas as outras rotas exigem login; o módulo de locação é do administrador */
app.use('/api', async (req, res) => {
  let user;
  try { user = jwt.verify(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), SEGREDO); }
  catch { return res.status(401).json({ erro: 'Entre de novo.' }); }
  const [u] = await q(`select id, nome, email, role, ativo from usuarios where id=$1`, [user.id]);
  if (!u?.ativo) return res.status(401).json({ erro: 'Acesso bloqueado.' });
  const p = req.path.split('/').filter(Boolean);
  if (p[0] === 'eu') return res.json({ nome: u.nome, email: u.email, admin: u.role === 'admin' });
  const real = u.role === 'admin' ? 'luis' : 'usuario';
  ATOR = u.email;
  try {
    const url = new URL(req.originalUrl, 'http://x');
    const r = await rotas(['loc', ...p.slice(p[0] === 'loc' ? 1 : 0)], req.method, req.body || {}, real, url);
    if (!r) return res.status(404).json({ erro: 'Rota não encontrada' });
    res.status(r.status);
    r.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(500).json({ erro: e.message }); }
  finally { ATOR = null; }
});

const PORT = process.env.PORT || 3001;
prepara().then(chaveLogin).then(s => { SEGREDO = s; app.listen(PORT, () => console.log('Administração de Aluguel no ar, porta', PORT)); })
  .catch(e => { console.error('Falha ao preparar o banco:', e); process.exit(1); });
