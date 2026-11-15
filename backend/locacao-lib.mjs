/* Módulo de LOCAÇÃO (Gestão de Ativos): proprietários, inquilinos, imóveis, contrato de administração,
   contrato de locação, cobranças do inquilino, conta corrente do proprietário (acerto mensal), repasses,
   calendário, reajuste pelo índice do Banco Central, inadimplência, documentos e importação das planilhas.
   Sistema próprio da frente "Administração de Aluguel" (separado do Beira Rio): banco próprio, esquema "locacao". */

const R2 = x => Math.round((+x || 0) * 100) / 100;
const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const ultimoDia = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate();
const compDe = d => String(d).slice(0, 7);
const somaMes = (comp, n) => { const [a, m] = comp.split('-').map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
/* vencimento no dia do contrato; se o mês não tem esse dia (ex.: 30 em fevereiro), a cobrança continua sendo
   daquele mês, mas vence nos primeiros dias do mês seguinte (30/fev → 02/mar), nunca antes do dia do contrato */
const vencDe = (comp, dia) => { const [a, m] = comp.split('-').map(Number); return new Date(Date.UTC(a, m - 1, +dia)).toISOString().slice(0, 10); };
const addMeses = (data, n) => { const [a, m, d] = String(data).slice(0, 10).split('-').map(Number); const c = somaMes(`${a}-${String(m).padStart(2, '0')}`, n); return vencDe(c, d); };
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
/* CPF/CNPJ com dígito verificador */
function docValido(d) {
  d = String(d || '').replace(/\D/g, '');
  if (d.length === 11) { if (/^(\d)\1+$/.test(d)) return false; const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; }; return dv(9) === +d[9] && dv(10) === +d[10]; }
  if (d.length === 14) { if (/^(\d)\1+$/.test(d)) return false; const dv = n => { const w = n === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]; let s = 0; for (let i = 0; i < n; i++) s += +d[i] * w[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; }; return dv(12) === +d[12] && dv(13) === +d[13]; }
  return false;
}
const SERIES = { 'IGP-M': 189, 'IPCA': 433, 'INPC': 188 };
const TIPOS = ['aluguel', 'rescisao', 'encargos', 'adm', 'intermediacao', 'condominio', 'fundo_reserva', 'retencao', 'iptu', 'agua', 'energia', 'gas', 'manutencao', 'caucao', 'repasse', 'outros'];

export function criaLocacao({ q, json, log, arquivos }) {
  let ok = false;
  async function garante() {
    if (ok) return;
    await q(`create schema if not exists locacao`);
    await q(`create table if not exists locacao.pessoas(id serial primary key, tipo text not null default 'pf', nome text not null, documento text, rg text,
      estado_civil text, profissao text, nascimento date, telefone text, telefones_antigos jsonb not null default '[]', email text, endereco text,
      pix text, banco text, obs text, criado_em timestamptz default now())`);
    await q(`create unique index if not exists pessoas_doc on locacao.pessoas(documento) where documento is not null and documento<>''`);
    await q(`create table if not exists locacao.imoveis(id serial primary key, apelido text not null, tipo text not null default 'apartamento', endereco text, unidade text,
      condominio text, administradora text, matricula text, inscricao_iptu text, area numeric, quartos int, vagas int, energia text, agua text, gas text,
      extras jsonb not null default '[]', proprietario_id int references locacao.pessoas(id), pasta text, obs text, ativo boolean not null default true, criado_em timestamptz default now())`);
    await q(`create table if not exists locacao.administracoes(id serial primary key, imovel_id int not null references locacao.imoveis(id), proprietario_id int references locacao.pessoas(id),
      inicio date, fim date, taxa_tipo text not null default 'percentual' check (taxa_tipo in ('percentual','fixo')), taxa_valor numeric not null default 10,
      intermediacao_tipo text not null default 'aluguel' check (intermediacao_tipo in ('aluguel','percentual','fixo','nenhuma')), intermediacao_valor numeric,
      taxa_sobre_encargos boolean not null default true, repasse_forma text default 'Pix', repasse_chave text, status text not null default 'ativo', obs text, criado_em timestamptz default now())`);
    await q(`create table if not exists locacao.locacoes(id serial primary key, imovel_id int not null references locacao.imoveis(id), administracao_id int references locacao.administracoes(id),
      locatario_id int not null references locacao.pessoas(id), fiadores jsonb not null default '[]', garantia text default 'caucao', garantia_info text,
      caucao_valor numeric, caucao_data date, inicio date not null, prazo_meses int default 30, dia_vencimento int not null check (dia_vencimento between 1 and 31),
      aluguel numeric not null, indice text not null default 'IGP-M', reajuste_fixo_pct numeric, ultimo_reajuste date,
      condominio_inquilino boolean not null default false, condominio_valor numeric, iptu_inquilino boolean not null default false, iptu_valor numeric, outros_valor numeric, outros_descricao text,
      multa_pct numeric not null default 10, juros_mes_pct numeric not null default 1, cobranca_pct numeric not null default 10, cobranca_dias int not null default 10,
      honorarios_pct numeric not null default 0, honorarios_dias int not null default 30,
      status text not null default 'ativa' check (status in ('ativa','encerrada')), encerrada_em date, motivo_fim text, obs text, criado_em timestamptz default now())`);
    await q(`create table if not exists locacao.mensalidades(id serial primary key, locacao_id int not null references locacao.locacoes(id), competencia text not null, vencimento date not null,
      itens jsonb not null default '[]', total numeric not null, situacao text not null default 'aberta' check (situacao in ('aberta','paga','cancelada')),
      pago_em date, valor_pago numeric, encargos_pagos numeric, desconto numeric, forma text, obs text, criado_em timestamptz default now(), unique(locacao_id, competencia))`);
    await q(`create table if not exists locacao.lancamentos(id bigserial primary key, imovel_id int not null references locacao.imoveis(id), competencia text not null, data date,
      tipo text not null, descricao text not null, valor numeric not null, parcela text, mensalidade_id int references locacao.mensalidades(id), documento_id int,
      origem text not null default 'manual', por text, criado_em timestamptz default now())`);
    await q(`create index if not exists lanc_imovel on locacao.lancamentos(imovel_id, competencia)`);
    await q(`create table if not exists locacao.reajustes(id serial primary key, locacao_id int not null references locacao.locacoes(id), data date not null, indice text,
      percentual numeric not null, valor_antes numeric, valor_depois numeric, memoria jsonb, por text, em timestamptz default now())`);
    await q(`create table if not exists locacao.documentos(id serial primary key, entidade text not null, entidade_id int not null, tipo text, nome text not null,
      chave text not null, bytes int, por text, em timestamptz default now())`);
    /* condomínio e IPTU: de quem é a responsabilidade (do inquilino: ele paga e a Inerente só confere; do proprietário: o aluguel é fixo e a Inerente paga, descontando do proprietário) */
    await q(`create unique index if not exists imoveis_apelido on locacao.imoveis(lower(trim(apelido)))`);
    await q(`alter table locacao.locacoes add column if not exists garantia_dados jsonb not null default '{}'`); /* seguradora, apólice, vigência, título, onde está a caução */
    await q(`alter table locacao.locacoes add column if not exists multa_rescisao numeric not null default 3`); /* em número de aluguéis, cobrada proporcional ao prazo que falta */
    await q(`alter table locacao.locacoes add column if not exists condominio_resp text not null default 'inquilino'`);
    await q(`alter table locacao.locacoes add column if not exists iptu_resp text not null default 'inquilino'`);
    await q(`create table if not exists locacao.obrigacoes(id serial primary key, locacao_id int not null references locacao.locacoes(id), imovel_id int not null references locacao.imoveis(id),
      competencia text not null, item text not null check (item in ('condominio','iptu')), responsavel text not null check (responsavel in ('inquilino','proprietario')),
      situacao text not null default 'pendente' check (situacao in ('pendente','pago','dispensado')), valor numeric, pago_em date, documento_id int, lancamento_id bigint, obs text,
      criado_em timestamptz default now(), unique(locacao_id, competencia, item))`);
    /* registro interno (sem tela): data e hora, quem fez, o que era antes e como ficou — inclusão, alteração e exclusão */
    await q(`create table if not exists locacao.auditoria(id bigserial primary key, em timestamptz default now(), tabela text, operacao text, registro text, ator text, antes jsonb, depois jsonb)`);
    await q(`create or replace function locacao.audita() returns trigger language plpgsql as $f$
      declare a jsonb; d jsonb; quem text := coalesce(nullif(current_setting('app.ator', true), ''), 'sistema');
      begin
        a := to_jsonb(OLD);
        if TG_OP = 'DELETE' then insert into locacao.auditoria(tabela, operacao, registro, ator, antes) values (TG_TABLE_NAME, 'exclusão', a->>'id', quem, a); return OLD; end if;
        d := to_jsonb(NEW);
        if TG_OP = 'INSERT' then insert into locacao.auditoria(tabela, operacao, registro, ator, depois) values (TG_TABLE_NAME, 'inclusão', d->>'id', quem, d); return NEW; end if;
        if a is distinct from d then insert into locacao.auditoria(tabela, operacao, registro, ator, antes, depois) values (TG_TABLE_NAME, 'alteração', d->>'id', quem, a, d); end if;
        return NEW;
      exception when others then return coalesce(NEW, OLD);
      end $f$`);
    for (const t of ['pessoas', 'imoveis', 'administracoes', 'locacoes', 'mensalidades', 'lancamentos', 'reajustes', 'documentos'])
      await q(`do $d$ begin
        if exists (select 1 from pg_trigger where tgname = 'audita_loc_${t}') then execute 'drop trigger audita_loc_${t} on locacao.${t}'; end if;
        if not exists (select 1 from pg_trigger where tgname = 'registro_loc_${t}') then
          execute 'create trigger registro_loc_${t} after insert or update or delete on locacao.${t} for each row execute function locacao.audita()';
        end if; end $d$`);
    ok = true;
  }

  const limpa = v => (v === '' || v === undefined ? null : v);
  /* aceita 1234.56, 1234,56 e 1.234,56 */
  const nb = v => {
    if (v === '' || v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    let s = String(v).replace(/[^\d,.\-]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s); return Number.isFinite(n) ? n : null;
  };
  async function upsert(tab, campos, b, id) {
    const cols = campos.filter(c => c in b);
    const vals = cols.map(c => (typeof b[c] === 'object' && b[c] !== null ? JSON.stringify(b[c]) : limpa(b[c])));
    if (id) {
      if (!cols.length) return { id };
      const [r] = await q(`update locacao.${tab} set ${cols.map((c, i) => `${c}=$${i + 2}`).join(',')} where id=$1 returning *`, [id, ...vals]);
      return r;
    }
    const [r] = await q(`insert into locacao.${tab}(${cols.join(',')}) values (${cols.map((_, i) => '$' + (i + 1)).join(',')}) returning *`, vals);
    return r;
  }
  const C_PESSOA = ['tipo', 'nome', 'documento', 'rg', 'estado_civil', 'profissao', 'nascimento', 'telefone', 'telefones_antigos', 'email', 'endereco', 'pix', 'banco', 'obs'];
  const C_IMOVEL = ['apelido', 'tipo', 'endereco', 'unidade', 'condominio', 'administradora', 'matricula', 'inscricao_iptu', 'area', 'quartos', 'vagas', 'energia', 'agua', 'gas', 'extras', 'proprietario_id', 'pasta', 'obs', 'ativo'];
  const C_ADM = ['imovel_id', 'proprietario_id', 'inicio', 'fim', 'taxa_tipo', 'taxa_valor', 'intermediacao_tipo', 'intermediacao_valor', 'taxa_sobre_encargos', 'repasse_forma', 'repasse_chave', 'status', 'obs'];
  const C_LOC = ['imovel_id', 'administracao_id', 'locatario_id', 'fiadores', 'garantia', 'garantia_info', 'caucao_valor', 'caucao_data', 'inicio', 'prazo_meses', 'dia_vencimento', 'aluguel', 'indice',
    'reajuste_fixo_pct', 'ultimo_reajuste', 'condominio_resp', 'iptu_resp', 'multa_rescisao', 'garantia_dados', 'outros_valor', 'outros_descricao', 'multa_pct', 'juros_mes_pct',
    'cobranca_pct', 'cobranca_dias', 'honorarios_pct', 'honorarios_dias', 'obs'];
  const NUMS = ['multa_rescisao', 'area', 'taxa_valor', 'intermediacao_valor', 'caucao_valor', 'aluguel', 'reajuste_fixo_pct', 'condominio_valor', 'iptu_valor', 'outros_valor', 'multa_pct', 'juros_mes_pct', 'cobranca_pct', 'honorarios_pct'];
  const normaliza = b => { const o = { ...b }; for (const k of NUMS) if (k in o) o[k] = nb(o[k]); if ('documento' in o) o.documento = String(o.documento || '').replace(/\D/g, '') || null; return o; };

  /* ---------- encargos de uma cobrança em atraso, pelas regras do contrato ---------- */
  function encargos(m, l, ate = hojeBR()) {
    const dias = Math.max(0, diasEntre(String(m.vencimento).slice(0, 10), ate));
    if (!dias) return { dias: 0, multa: 0, juros: 0, cobranca: 0, honorarios: 0, total: R2(m.total) };
    const base = +m.total;
    const multa = R2(base * (+l.multa_pct || 0) / 100);
    const juros = R2(base * (+l.juros_mes_pct || 0) / 100 * dias / 30);
    const cobranca = dias > (+l.cobranca_dias || 0) ? R2((base + multa + juros) * (+l.cobranca_pct || 0) / 100) : 0;
    const honorarios = (+l.honorarios_pct || 0) && dias > (+l.honorarios_dias || 0) ? R2((base + multa + juros) * (+l.honorarios_pct || 0) / 100) : 0;
    return { dias, multa, juros, cobranca, honorarios, total: R2(base + multa + juros + cobranca + honorarios) };
  }

  /* ---------- cobrança do inquilino no mês ---------- */
  function itensDoMes(l, comp) {
    const [a, mm] = comp.split('-').map(Number), dm = ultimoDia(a, mm);
    let alug = +l.aluguel, obs = '';
    const ini = String(l.inicio).slice(0, 10);
    if (compDe(ini) === comp && +ini.slice(8) > 1) { const dias = dm - +ini.slice(8) + 1; alug = R2(alug * dias / dm); obs = ` (proporcional ${dias} dias)`; }
    const it = [{ tipo: 'aluguel', descricao: 'Aluguel' + obs, valor: R2(alug) }];
    if (+l.outros_valor) it.push({ tipo: 'outros', descricao: l.outros_descricao || 'Outros', valor: R2(l.outros_valor) });
    return it;
  }
  async function geraMensalidades(comp, locacaoId) {
    const ini = comp + '-01', [a, m] = comp.split('-').map(Number), fim = `${comp}-${ultimoDia(a, m)}`;
    const L = await q(`select * from locacao.locacoes where inicio<=$2 and (status='ativa' or encerrada_em>=$1) ${locacaoId ? 'and id=$3' : ''}`, locacaoId ? [ini, fim, locacaoId] : [ini, fim]);
    let criadas = 0; const travadas = [];
    for (const l of L) {
      /* no máximo 12 cobranças por ano de contrato: do aniversário em diante só depois de aplicar o reajuste */
      if (l.indice !== 'sem') { const aniv = proximoAniversario(l); if (comp >= compDe(aniv)) { travadas.push({ id: l.id, aniversario: aniv }); continue; } }
      const it = itensDoMes(l, comp);
      const total = R2(it.reduce((s, x) => s + x.valor, 0));
      const r = await q(`insert into locacao.mensalidades(locacao_id, competencia, vencimento, itens, total) values ($1,$2,$3,$4,$5) on conflict (locacao_id, competencia) do nothing returning id`,
        [l.id, comp, vencDe(comp, l.dia_vencimento), JSON.stringify(it), total]);
      criadas += r.length;
      for (const [item, resp] of [['condominio', l.condominio_resp], ['iptu', l.iptu_resp]])
        if (resp === 'inquilino' || resp === 'proprietario')
          await q(`insert into locacao.obrigacoes(locacao_id, imovel_id, competencia, item, responsavel) values ($1,$2,$3,$4,$5) on conflict (locacao_id, competencia, item) do nothing`, [l.id, l.imovel_id, comp, item, resp]);
    }
    return { criadas, locacoes: L.length, travadas };
  }

  /* ---------- pagamento do inquilino → conta corrente do proprietário ---------- */
  async function lancaPagamento(m, real) {
    const [l] = await q(`select * from locacao.locacoes where id=$1`, [m.locacao_id]);
    const [ad] = l.administracao_id ? await q(`select * from locacao.administracoes where id=$1`, [l.administracao_id]) : await q(`select * from locacao.administracoes where imovel_id=$1 and status='ativo' order by id desc limit 1`, [l.imovel_id]);
    const itens = (m.itens || []).map(x => ({ ...x }));
    let desc = R2(m.desconto || 0);
    for (const x of itens) if (x.tipo === 'aluguel' && desc) { const d = Math.min(desc, +x.valor); x.valor = R2(x.valor - d); desc = R2(desc - d); }
    const ins = (tipo, descricao, valor) => q(`insert into locacao.lancamentos(imovel_id, competencia, data, tipo, descricao, valor, mensalidade_id, origem, por) values ($1,$2,$3,$4,$5,$6,$7,'pagamento',$8)`,
      [l.imovel_id, m.competencia, m.pago_em, tipo, descricao, R2(valor), m.id, real]);
    for (const x of itens) if (+x.valor) await ins(x.tipo || 'outros', x.descricao, +x.valor);
    if (+m.encargos_pagos) await ins('encargos', 'Juros e multa por atraso', +m.encargos_pagos);
    if (!ad) return;
    const aluguel = itens.filter(x => x.tipo === 'aluguel').reduce((s, x) => s + +x.valor, 0);
    const base = aluguel + (ad.taxa_sobre_encargos ? +m.encargos_pagos || 0 : 0);
    /* intermediação é serviço da imobiliária (corretagem): não é calculada aqui; só a taxa de administração do contrato */
    const adm = ad.taxa_tipo === 'fixo' ? +ad.taxa_valor : base * (+ad.taxa_valor || 0) / 100;
    if (adm) await ins('adm', 'Administração de locação', -adm);
  }

  async function extrato(imovelId, de, ate) {
    const L = await q(`select l.* from locacao.lancamentos l where imovel_id=$1 order by competencia, (tipo='repasse'), data nulls first, id`, [imovelId]);
    const meses = [...new Set(L.map(x => x.competencia))].sort();
    let saldo = 0; const out = [];
    for (const c of meses) {
      const ls = L.filter(x => x.competencia === c);
      const mov = ls.filter(x => x.tipo !== 'repasse'), rep = ls.filter(x => x.tipo === 'repasse');
      const anterior = R2(saldo), doMes = R2(mov.reduce((s, x) => s + +x.valor, 0)), aRepassar = R2(anterior + doMes);
      const repassado = R2(-rep.reduce((s, x) => s + +x.valor, 0));
      saldo = R2(aRepassar - repassado);
      if ((!de || c >= de) && (!ate || c <= ate)) out.push({ competencia: c, anterior, lancamentos: mov, doMes, aRepassar, repasses: rep, repassado, saldo });
    }
    return { meses: out, saldo: R2(saldo) };
  }
  const saldoImovel = async id => { const [r] = await q(`select coalesce(sum(valor),0) s from locacao.lancamentos where imovel_id=$1`, [id]); return R2(r.s); };

  /* ---------- reajuste ---------- */
  async function indiceAcumulado(indice, data) {
    const s = SERIES[indice]; if (!s) throw new Error('Índice sem série no Banco Central: ' + indice);
    const fimC = somaMes(compDe(data), -1), iniC = somaMes(fimC, -14);
    const br = c => `01/${c.slice(5)}/${c.slice(0, 4)}`;
    const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${s}/dados?formato=json&dataInicial=${br(iniC)}&dataFinal=${br(fimC)}`, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`Não consegui buscar o ${indice} no Banco Central (erro ${r.status})`);
    const L = (await r.json()).map(x => ({ mes: x.data.split('/').reverse().join('-').slice(0, 7), pct: +String(x.valor).replace(',', '.') })).filter(x => x.mes <= fimC).slice(-12);
    const fator = L.reduce((f, x) => f * (1 + x.pct / 100), 1);
    return { meses: L, percentual: Math.round((fator - 1) * 10000) / 100 };
  }
  function proximoAniversario(l) {
    const ini = String(l.inicio).slice(0, 10), ult = l.ultimo_reajuste ? String(l.ultimo_reajuste).slice(0, 10) : ini;
    let n = 1, d = addMeses(ini, 12);
    while (d <= ult) { n++; d = addMeses(ini, 12 * n); }
    return d;
  }

  /* seguro-fiança ou título de capitalização vencido ou vencendo em 30 dias */
  function alertaGarantia(l) {
    const g = l.garantia_dados || {}, fim = l.garantia === 'seguro_fianca' ? g.fim : l.garantia === 'titulo' ? g.titulo_fim : null;
    if (!fim || l.status !== 'ativa') return null;
    const d = diasEntre(hojeBR(), fim);
    return d < 0 ? { fim, situacao: 'vencida', dias: -d } : d <= 30 ? { fim, situacao: 'vencendo', dias: d } : null;
  }
  function calculaSaida(l, data) {
    const ini = String(l.inicio).slice(0, 10), fim = addMeses(ini, +l.prazo_meses || 30);
    const indeterminado = data >= fim;
    const comp = compDe(data), [a, mm] = comp.split('-').map(Number), dm = ultimoDia(a, mm);
    const dias_usados = +data.slice(8);
    const proporcional = R2(+l.aluguel * dias_usados / dm);
    const dias_prazo = Math.max(1, diasEntre(ini, fim)), dias_restantes = indeterminado ? 0 : Math.max(0, diasEntre(data, fim));
    const multa = indeterminado ? 0 : R2((+l.multa_rescisao || 0) * +l.aluguel * dias_restantes / dias_prazo);
    return { data, competencia: comp, fim_prazo: fim, indeterminado, dias_usados, dias_mes: dm, proporcional, dias_restantes, dias_prazo,
      multa_alugueis: +l.multa_rescisao || 0, multa, aluguel: +l.aluguel };
  }

  async function painel() {
    const ativas = await q(`select l.*, i.apelido from locacao.locacoes l join locacao.imoveis i on i.id=l.imovel_id where l.status='ativa'`);
    const adms = await q(`select * from locacao.administracoes where status='ativo'`);
    let admMes = 0;
    for (const l of ativas) { const a = adms.find(x => x.id === l.administracao_id) || adms.find(x => x.imovel_id === l.imovel_id); if (a) admMes += a.taxa_tipo === 'fixo' ? +a.taxa_valor : +l.aluguel * +a.taxa_valor / 100; }
    const atr = await q(`select m.*, l.multa_pct, l.juros_mes_pct, l.cobranca_pct, l.cobranca_dias, l.honorarios_pct, l.honorarios_dias from locacao.mensalidades m join locacao.locacoes l on l.id=m.locacao_id where m.situacao='aberta' and m.vencimento < $1`, [hojeBR()]);
    const saldos = await q(`select imovel_id, sum(valor) s from locacao.lancamentos group by imovel_id`);
    const reaj = ativas.filter(l => l.indice !== 'sem' && proximoAniversario(l) <= addMeses(hojeBR(), 1));
    const [cont] = await q(`select (select count(*) from locacao.imoveis where ativo)::int imoveis, (select count(*) from locacao.pessoas)::int pessoas,
      (select count(*) from locacao.obrigacoes where situacao='pendente' and competencia < to_char(now() - interval '3 hours','YYYY-MM'))::int obrigacoes_pendentes`);
    return {
      locacoes: ativas.length, aluguel_mes: R2(ativas.reduce((s, l) => s + +l.aluguel, 0)), adm_mes: R2(admMes),
      atrasadas: atr.length, atrasado_valor: R2(atr.reduce((s, m) => s + encargos(m, m).total, 0)),
      garantias: ativas.filter(l => alertaGarantia(l)).length,
      a_repassar: R2(saldos.filter(x => +x.s > 0).reduce((s, x) => s + +x.s, 0)), reajustes: reaj.length, ...cont,
    };
  }

  /* ---------- importação da planilha "Acerto Mensal" (já lida na tela) ---------- */
  async function importa(b, real) {
    const imovelId = +b.imovel_id; if (!imovelId) throw new Error('Escolha o imóvel');
    const meses = Array.isArray(b.meses) ? b.meses : [];
    if (!meses.length) throw new Error('Nenhum mês para importar');
    const ja = await q(`select count(*)::int n from locacao.lancamentos where imovel_id=$1`, [imovelId]);
    if (ja[0].n && !b.substituir) throw new Error(`Esse imóvel já tem ${ja[0].n} lançamentos. Marque "substituir o que foi importado antes" para trocar.`);
    if (b.substituir) await q(`delete from locacao.lancamentos where imovel_id=$1 and origem='importado'`, [imovelId]);
    let n = 0;
    for (const m of meses) {
      if (!/^\d{4}-\d{2}$/.test(m.competencia)) continue;
      for (const it of m.itens || []) {
        if (!TIPOS.includes(it.tipo)) it.tipo = 'outros';
        await q(`insert into locacao.lancamentos(imovel_id, competencia, data, tipo, descricao, valor, origem, por) values ($1,$2,$3,$4,$5,$6,'importado',$7)`,
          [imovelId, m.competencia, it.data || null, it.tipo, String(it.descricao).slice(0, 300), R2(it.valor), real]);
        n++;
      }
    }
    await log(real, 'locacao_importacao', { imovel: imovelId, meses: meses.length, lancamentos: n });
    return { lancamentos: n, saldo: await saldoImovel(imovelId) };
  }

  return async function rotasLocacao(p, m, body, real, url) {
    if (p[0] !== 'loc') return null;
    if (real !== 'luis') return json({ erro: 'A locação, por enquanto, é só do administrador.' }, 403);
    await garante();
    const [, a, id, acao] = p;
    const b = normaliza(body || {});
    try {
      if (a === 'painel' && m === 'GET') return json(await painel());

      /* pessoas */
      if (a === 'pessoas' && m === 'GET') return json(await q(`select p.*,
        (select string_agg(apelido, ', ') from locacao.imoveis i where i.proprietario_id=p.id) proprietario_de,
        (select string_agg(i.apelido, ', ') from locacao.locacoes l join locacao.imoveis i on i.id=l.imovel_id where l.locatario_id=p.id and l.status='ativa') inquilino_de
        from locacao.pessoas p order by p.nome`));
      if (a === 'pessoa' && (m === 'POST' || m === 'PUT')) {
        if (m === 'POST' && !String(b.nome || '').trim()) return json({ erro: 'Informe o nome' }, 400);
        if (b.documento && !docValido(b.documento)) return json({ erro: 'CPF/CNPJ inválido: confira os números.' }, 400);
        if (b.documento) { const [d] = await q(`select id, nome from locacao.pessoas where documento=$1 and id<>$2`, [b.documento, +id || 0]); if (d) return json({ erro: `Esse CPF/CNPJ já está cadastrado (${d.nome}).` }, 409); }
        if (m === 'PUT' && 'telefone' in b) {
          const [old] = await q(`select telefone, telefones_antigos from locacao.pessoas where id=$1`, [id]);
          if (old?.telefone && old.telefone !== b.telefone) b.telefones_antigos = [...new Set([...(old.telefones_antigos || []), old.telefone])];
        }
        const r = await upsert('pessoas', C_PESSOA, b, m === 'PUT' ? id : null);
        await log(real, m === 'POST' ? 'loc_pessoa_criada' : 'loc_pessoa_alterada', { id: r.id, nome: r.nome });
        return json(r);
      }
      if (a === 'pessoa' && m === 'DELETE') {
        const [u] = await q(`select (select count(*) from locacao.imoveis where proprietario_id=$1)+(select count(*) from locacao.locacoes where locatario_id=$1)+(select count(*) from locacao.administracoes where proprietario_id=$1) n`, [id]);
        if (+u.n) return json({ erro: 'Essa pessoa está ligada a imóvel ou contrato; não dá para excluir.' }, 409);
        await q(`delete from locacao.pessoas where id=$1`, [id]); await log(real, 'loc_pessoa_excluida', { id });
        return json({ ok: true });
      }

      /* imóveis */
      if (a === 'imoveis' && m === 'GET') {
        const I = await q(`select i.*, p.nome proprietario, (select coalesce(sum(valor),0) from locacao.lancamentos where imovel_id=i.id) saldo,
          (select json_build_object('id',l.id,'locatario',pl.nome,'aluguel',l.aluguel,'dia',l.dia_vencimento) from locacao.locacoes l join locacao.pessoas pl on pl.id=l.locatario_id where l.imovel_id=i.id and l.status='ativa' order by l.id desc limit 1) locacao
          from locacao.imoveis i left join locacao.pessoas p on p.id=i.proprietario_id order by i.ativo desc, i.apelido`);
        return json(I);
      }
      if (a === 'imovel' && m === 'GET' && id) {
        const [i] = await q(`select i.*, p.nome proprietario from locacao.imoveis i left join locacao.pessoas p on p.id=i.proprietario_id where i.id=$1`, [id]);
        if (!i) return json({ erro: 'Imóvel não encontrado' }, 404);
        const adms = await q(`select a.*, p.nome proprietario from locacao.administracoes a left join locacao.pessoas p on p.id=a.proprietario_id where a.imovel_id=$1 order by a.id desc`, [id]);
        const locs = await q(`select l.id, l.status, to_char(l.inicio,'YYYY-MM-DD') inicio, to_char(l.encerrada_em,'YYYY-MM-DD') encerrada_em, l.aluguel, l.dia_vencimento, p.nome locatario
          from locacao.locacoes l join locacao.pessoas p on p.id=l.locatario_id where l.imovel_id=$1 order by l.inicio desc`, [id]);
        const docs = await q(`select id, tipo, nome, bytes, em from locacao.documentos where entidade='imovel' and entidade_id=$1 order by em desc`, [id]);
        return json({ imovel: i, administracoes: adms, locacoes: locs, documentos: docs, ...(await extrato(id, url.searchParams.get('de'), url.searchParams.get('ate'))) });
      }
      if (a === 'imovel' && (m === 'POST' || m === 'PUT')) {
        if (m === 'POST' && !String(b.apelido || '').trim()) return json({ erro: 'Informe o nome do imóvel (ex.: Home Serrinha 2305)' }, 400);
        if (b.apelido) { const [d] = await q(`select id from locacao.imoveis where lower(trim(apelido))=lower(trim($1)) and id<>$2`, [b.apelido, +id || 0]); if (d) return json({ erro: 'Já existe um imóvel com esse nome.' }, 409); }
        if (b.proprietario_id) { const [pp] = await q(`select id from locacao.pessoas where id=$1`, [b.proprietario_id]); if (!pp) return json({ erro: 'Proprietário não encontrado no cadastro.' }, 400); }
        const r = await upsert('imoveis', C_IMOVEL, b, m === 'PUT' ? id : null);
        await log(real, m === 'POST' ? 'loc_imovel_criado' : 'loc_imovel_alterado', { id: r.id, apelido: r.apelido });
        return json(r);
      }
      if (a === 'imovel' && m === 'DELETE') {
        const [u] = await q(`select (select count(*) from locacao.locacoes where imovel_id=$1)+(select count(*) from locacao.lancamentos where imovel_id=$1)+(select count(*) from locacao.administracoes where imovel_id=$1) n`, [id]);
        if (+u.n) return json({ erro: 'O imóvel tem contratos ou lançamentos: em vez de excluir, marque como inativo.' }, 409);
        await q(`delete from locacao.imoveis where id=$1`, [id]); await log(real, 'loc_imovel_excluido', { id });
        return json({ ok: true });
      }

      /* contrato de administração (com o proprietário) */
      if (a === 'administracao' && (m === 'POST' || m === 'PUT')) {
        if (m === 'POST' && !b.imovel_id) return json({ erro: 'Falta o imóvel' }, 400);
        if (m === 'POST') {
          const [im] = await q(`select proprietario_id from locacao.imoveis where id=$1`, [b.imovel_id]);
          if (!im) return json({ erro: 'Imóvel não encontrado.' }, 400);
          if (!im.proprietario_id) return json({ erro: 'Cadastre o proprietário na ficha do imóvel antes do contrato de administração.' }, 400);
          b.proprietario_id = im.proprietario_id;
          const [at] = await q(`select id from locacao.administracoes where imovel_id=$1 and status='ativo'`, [b.imovel_id]);
          if (at && (b.status || 'ativo') === 'ativo') return json({ erro: 'Esse imóvel já tem contrato de administração ativo. Encerre o anterior antes.' }, 409);
        }
        if (b.taxa_valor !== undefined && b.taxa_valor !== null && +b.taxa_valor < 0) return json({ erro: 'Taxa inválida.' }, 400);
        const r = await upsert('administracoes', C_ADM, b, m === 'PUT' ? id : null);
        await log(real, 'loc_administracao_salva', { id: r.id, imovel: r.imovel_id });
        return json(r);
      }

      /* contrato de locação */
      if (a === 'locacoes' && m === 'GET') return json(await q(`select l.id, l.status, to_char(l.inicio,'YYYY-MM-DD') inicio, to_char(l.encerrada_em,'YYYY-MM-DD') encerrada_em, l.aluguel, l.dia_vencimento, l.prazo_meses, l.indice,
        l.garantia, i.apelido, i.id imovel_id, p.nome locatario, p.telefone,
        l.garantia_dados, (select count(*) from locacao.mensalidades x where x.locacao_id=l.id and x.situacao='aberta' and x.vencimento<current_date)::int atrasadas
        from locacao.locacoes l join locacao.imoveis i on i.id=l.imovel_id join locacao.pessoas p on p.id=l.locatario_id order by l.status, i.apelido`).then(L => L.map(l => ({ ...l, alerta_garantia: alertaGarantia(l) }))));
      if (a === 'locacao' && m === 'GET' && id && !acao) {
        const [l] = await q(`select l.*,
          i.apelido, p.nome locatario, p.telefone, p.email
          from locacao.locacoes l join locacao.imoveis i on i.id=l.imovel_id join locacao.pessoas p on p.id=l.locatario_id where l.id=$1`, [id]);
        if (!l) return json({ erro: 'Contrato não encontrado' }, 404);
        const ms = await q(`select * from locacao.mensalidades where locacao_id=$1 order by competencia desc`, [id]);
        for (const x of ms) if (x.situacao === 'aberta') x.encargos = encargos(x, l);
        const rj = await q(`select * from locacao.reajustes where locacao_id=$1 order by data desc`, [id]);
        const docs = await q(`select id, tipo, nome, bytes, em from locacao.documentos where entidade='locacao' and entidade_id=$1 order by em desc`, [id]);
        const ob = await q(`select * from locacao.obrigacoes where locacao_id=$1 order by competencia desc, item`, [id]);
        return json({ locacao: l, mensalidades: ms, obrigacoes: ob, reajustes: rj, documentos: docs, proximo_reajuste: l.status === 'ativa' ? proximoAniversario(l) : null, fim_prazo: addMeses(String(l.inicio).slice(0, 10), +l.prazo_meses || 30), alerta_garantia: alertaGarantia(l) });
      }
      if (a === 'locacao' && (m === 'POST' || m === 'PUT') && !acao) {
        if (m === 'POST') {
          if (!b.imovel_id || !b.locatario_id || !b.inicio || !b.dia_vencimento || !b.aluguel) return json({ erro: 'Preencha imóvel, inquilino, início, dia de vencimento e aluguel.' }, 400);
          const [im] = await q(`select proprietario_id from locacao.imoveis where id=$1`, [b.imovel_id]);
          if (!im) return json({ erro: 'Imóvel não encontrado.' }, 400);
          if (!im.proprietario_id) return json({ erro: 'O imóvel não tem proprietário cadastrado. Cadastre na ficha do imóvel.' }, 400);
          const [ad] = await q(`select id from locacao.administracoes where imovel_id=$1 and status='ativo' order by id desc limit 1`, [b.imovel_id]);
          if (!ad) return json({ erro: 'O imóvel não tem contrato de administração. Cadastre na aba "Contrato de administração" do imóvel antes da locação.' }, 400);
          b.administracao_id = ad.id;
          const [lt] = await q(`select id from locacao.pessoas where id=$1`, [b.locatario_id]);
          if (!lt) return json({ erro: 'Inquilino não encontrado no cadastro.' }, 400);
          if (+b.locatario_id === +im.proprietario_id) return json({ erro: 'O inquilino não pode ser o próprio proprietário.' }, 400);
          const [at] = await q(`select id from locacao.locacoes where imovel_id=$1 and status='ativa'`, [b.imovel_id]);
          if (at) return json({ erro: 'Esse imóvel já tem um contrato de locação ativo. Encerre o anterior primeiro.' }, 409);
        }
        if ('aluguel' in b && !(+b.aluguel > 0)) return json({ erro: 'Aluguel inválido.' }, 400);
        if (Array.isArray(b.fiadores)) {
          b.fiadores = b.fiadores.filter(f => f && f.pessoa_id);
          const inqId = +(b.locatario_id || (m === 'PUT' ? (await q(`select locatario_id from locacao.locacoes where id=$1`, [id]))[0]?.locatario_id : 0));
          for (const f of b.fiadores) {
            const [pp] = await q(`select id, nome from locacao.pessoas where id=$1`, [f.pessoa_id]);
            if (!pp) return json({ erro: 'Fiador não encontrado no cadastro.' }, 400);
            if (+f.pessoa_id === inqId) return json({ erro: 'O fiador não pode ser o próprio inquilino.' }, 400);
            f.nome = pp.nome;
          }
          if (new Set(b.fiadores.map(f => +f.pessoa_id)).size !== b.fiadores.length) return json({ erro: 'Fiador repetido.' }, 400);
        }
        if (b.garantia === 'fiador' && Array.isArray(b.fiadores) && !b.fiadores.length) return json({ erro: 'Garantia por fiador: escolha pelo menos um fiador.' }, 400);
        if ('dia_vencimento' in b && !(+b.dia_vencimento >= 1 && +b.dia_vencimento <= 31)) return json({ erro: 'Dia de vencimento deve ser de 1 a 31.' }, 400);
        if (m === 'PUT') delete b.imovel_id; /* contrato não troca de imóvel */
        const r = await upsert('locacoes', C_LOC, b, m === 'PUT' ? id : null);
        if (m === 'PUT') { /* cobranças em aberto acompanham o contrato (valor e dia) */
          const ab = await q(`select * from locacao.mensalidades where locacao_id=$1 and situacao='aberta'`, [id]);
          for (const x of ab) { const it = itensDoMes(r, x.competencia); await q(`update locacao.mensalidades set itens=$2, total=$3, vencimento=$4 where id=$1`, [x.id, JSON.stringify(it), R2(it.reduce((s, y) => s + y.valor, 0)), vencDe(x.competencia, r.dia_vencimento)]); }
        }
        await q(`update locacao.imoveis set ativo=true where id=$1`, [r.imovel_id]);
        await log(real, m === 'POST' ? 'loc_locacao_criada' : 'loc_locacao_alterada', { id: r.id, imovel: r.imovel_id });
        return json(r);
      }
      /* saída do inquilino: pode sair a qualquer momento. Antes do fim do prazo paga multa proporcional ao tempo que falta;
         no fim do prazo, nada; depois do prazo (contrato por prazo indeterminado), sem multa, mas sem aviso de 30 dias paga um aluguel */
      if (a === 'locacao' && acao === 'saida' && m === 'GET') {
        const [l] = await q(`select * from locacao.locacoes where id=$1`, [id]);
        if (!l) return json({ erro: 'Contrato não encontrado' }, 404);
        return json(calculaSaida(l, url.searchParams.get('data') || hojeBR()));
      }
      if (a === 'locacao' && acao === 'encerrar' && m === 'POST') {
        if (!b.data) return json({ erro: 'Informe a data de saída' }, 400);
        const [l] = await q(`select * from locacao.locacoes where id=$1`, [id]);
        if (!l || l.status !== 'ativa') return json({ erro: 'Contrato não está ativo.' }, 409);
        const s = calculaSaida(l, b.data);
        const itens = [];
        const prop = nb(body.proporcional), multa = nb(body.multa), aviso = nb(body.aviso_previo);
        if (prop) itens.push({ tipo: 'aluguel', descricao: `Aluguel proporcional até ${b.data.split('-').reverse().join('/')} (${s.dias_usados} dias)`, valor: R2(prop) });
        if (multa) itens.push({ tipo: 'rescisao', descricao: 'Multa por saída antes do fim do contrato', valor: R2(multa) });
        if (aviso) itens.push({ tipo: 'rescisao', descricao: 'Aviso prévio não cumprido (1 aluguel)', valor: R2(aviso) });
        await q(`update locacao.locacoes set status='encerrada', encerrada_em=$2, motivo_fim=$3 where id=$1`, [id, b.data, b.motivo || null]);
        /* cobrança do mês da saída vira o acerto de saída (se ainda estiver em aberto); se já foi paga, o acerto vai para o mês seguinte */
        let comp = s.competencia;
        const [doMes] = await q(`select * from locacao.mensalidades where locacao_id=$1 and competencia=$2`, [id, comp]);
        if (doMes && doMes.situacao === 'paga') { comp = somaMes(comp, 1); if (prop) itens.shift(); }
        const c = await q(`update locacao.mensalidades set situacao='cancelada', obs=coalesce(obs||' · ','')||'cancelada na saída do inquilino' where locacao_id=$1 and situacao='aberta' and competencia>$2 returning id`, [id, comp]);
        if (itens.length) {
          const tot = R2(itens.reduce((x, y) => x + y.valor, 0));
          await q(`insert into locacao.mensalidades(locacao_id, competencia, vencimento, itens, total, obs) values ($1,$2,$3,$4,$5,'acerto de saída')
            on conflict (locacao_id, competencia) do update set itens=excluded.itens, total=excluded.total, vencimento=excluded.vencimento, situacao='aberta', obs='acerto de saída'`,
            [id, comp, b.data, JSON.stringify(itens), tot]);
        } else if (doMes && doMes.situacao === 'aberta' && comp === s.competencia) {
          await q(`update locacao.mensalidades set situacao='cancelada', obs='cancelada na saída do inquilino' where id=$1`, [doMes.id]);
        }
        await q(`update locacao.obrigacoes set situacao='dispensado', obs='inquilino saiu' where locacao_id=$1 and situacao='pendente' and competencia>$2`, [id, s.competencia]);
        await log(real, 'loc_locacao_encerrada', { id, data: b.data, motivo: b.motivo, canceladas: c.length, itens });
        return json({ ok: true, canceladas: c.length, acerto: itens.length ? R2(itens.reduce((x, y) => x + y.valor, 0)) : 0 });
      }

      /* cobranças do inquilino */
      if (a === 'mensalidades' && id === 'gerar' && m === 'POST') {
        if (!/^\d{4}-\d{2}$/.test(b.competencia || '')) return json({ erro: 'Mês inválido' }, 400);
        const r = await geraMensalidades(b.competencia, b.locacao_id || null);
        await log(real, 'loc_cobrancas_geradas', { competencia: b.competencia, ...r });
        return json(r);
      }
      if (a === 'mensalidade' && id) {
        const [x] = await q(`select * from locacao.mensalidades where id=$1`, [id]);
        if (!x) return json({ erro: 'Cobrança não encontrada' }, 404);
        if (!acao && m === 'PUT') {
          if (x.situacao !== 'aberta') return json({ erro: 'Só dá para alterar cobrança em aberto.' }, 409);
          const it = (Array.isArray(body.itens) ? body.itens : x.itens).map(y => ({ tipo: TIPOS.includes(y.tipo) ? y.tipo : 'outros', descricao: String(y.descricao || '').trim() || 'Item', valor: R2(nb(y.valor)) })).filter(y => y.valor);
          await q(`update locacao.mensalidades set itens=$2, total=$3, vencimento=coalesce($4, vencimento), obs=$5 where id=$1`, [id, JSON.stringify(it), R2(it.reduce((s, y) => s + y.valor, 0)), limpa(body.vencimento), limpa(body.obs)]);
          await log(real, 'loc_cobranca_alterada', { id }); return json({ ok: true });
        }
        if (acao === 'pagar' && m === 'POST') {
          if (x.situacao !== 'aberta') return json({ erro: 'Essa cobrança não está em aberto.' }, 409);
          const pago = R2(nb(body.valor_pago)); if (!pago || !body.pago_em) return json({ erro: 'Informe a data e o valor pago.' }, 400);
          const dif = R2(pago - +x.total);
          const [y] = await q(`update locacao.mensalidades set situacao='paga', pago_em=$2, valor_pago=$3, encargos_pagos=$4, desconto=$5, forma=$6 where id=$1 returning *`,
            [id, body.pago_em, pago, dif > 0 ? dif : 0, dif < 0 ? -dif : 0, body.forma || 'Pix']);
          await lancaPagamento(y, real);
          await log(real, 'loc_cobranca_paga', { id, pago, pago_em: body.pago_em });
          return json({ ok: true });
        }
        if (acao === 'estornar' && m === 'POST') {
          if (x.situacao !== 'paga') return json({ erro: 'Essa cobrança não está paga.' }, 409);
          const [rp] = await q(`select count(*)::int n from locacao.lancamentos where imovel_id=(select imovel_id from locacao.locacoes where id=$1) and tipo='repasse' and competencia>=$2`, [x.locacao_id, x.competencia]);
          await q(`delete from locacao.lancamentos where mensalidade_id=$1 and origem='pagamento'`, [id]);
          await q(`update locacao.mensalidades set situacao='aberta', pago_em=null, valor_pago=null, encargos_pagos=null, desconto=null, forma=null where id=$1`, [id]);
          await log(real, 'loc_cobranca_estornada', { id });
          return json({ ok: true, aviso: rp.n ? 'Atenção: já houve repasse nesse mês ou depois; confira o saldo do proprietário.' : null });
        }
        if (acao === 'cancelar' && m === 'POST') {
          if (x.situacao !== 'aberta') return json({ erro: 'Só dá para cancelar cobrança em aberto.' }, 409);
          await q(`update locacao.mensalidades set situacao='cancelada', obs=$2 where id=$1`, [id, limpa(body.obs) || 'cancelada']);
          await log(real, 'loc_cobranca_cancelada', { id }); return json({ ok: true });
        }
      }

      /* conta corrente do proprietário */
      if (a === 'lancamento' && m === 'POST' && !id) {
        if (!b.imovel_id || !/^\d{4}-\d{2}$/.test(b.competencia || '') || !String(b.descricao || '').trim() || !nb(b.valor)) return json({ erro: 'Preencha imóvel, mês, descrição e valor.' }, 400);
        const n = Math.max(1, Math.min(60, parseInt(b.parcelas || 1, 10)));
        const tipo = TIPOS.includes(b.tipo) ? b.tipo : 'outros';
        const tot = R2(nb(b.valor)), cada = R2(tot / n);
        for (let i = 0; i < n; i++) {
          const v = i === n - 1 ? R2(tot - cada * (n - 1)) : cada;
          await q(`insert into locacao.lancamentos(imovel_id, competencia, data, tipo, descricao, valor, parcela, origem, por, documento_id) values ($1,$2,$3,$4,$5,$6,$7,'manual',$8,$9)`,
            [b.imovel_id, somaMes(b.competencia, i), i ? null : limpa(b.data), tipo, String(b.descricao).trim(), v, n > 1 ? `${i + 1}/${n}` : null, real, b.documento_id || null]);
        }
        await log(real, 'loc_lancamento', { imovel: b.imovel_id, competencia: b.competencia, tipo, valor: tot, parcelas: n });
        return json({ ok: true });
      }
      if (a === 'lancamento' && id && (m === 'PUT' || m === 'DELETE')) {
        const [x] = await q(`select * from locacao.lancamentos where id=$1`, [id]);
        if (!x) return json({ erro: 'Lançamento não encontrado' }, 404);
        if (x.origem === 'pagamento' && !['adm', 'intermediacao'].includes(x.tipo)) return json({ erro: 'Esse lançamento veio do pagamento do inquilino: para mudar, desfaça o pagamento.' }, 409);
        if (m === 'DELETE') { await q(`delete from locacao.lancamentos where id=$1`, [id]); await log(real, 'loc_lancamento_excluido', { id, antes: x }); return json({ ok: true }); }
        await q(`update locacao.lancamentos set competencia=coalesce($2,competencia), data=$3, tipo=coalesce($4,tipo), descricao=coalesce($5,descricao), valor=coalesce($6,valor), documento_id=coalesce($7,documento_id) where id=$1`,
          [id, limpa(b.competencia), limpa(b.data), TIPOS.includes(b.tipo) ? b.tipo : null, limpa(b.descricao), nb(b.valor), b.documento_id || null]);
        await log(real, 'loc_lancamento_alterado', { id }); return json({ ok: true });
      }
      if (a === 'repasse' && m === 'POST') {
        const v = R2(nb(b.valor));
        if (!b.imovel_id || !/^\d{4}-\d{2}$/.test(b.competencia || '') || !v || !b.data) return json({ erro: 'Preencha imóvel, mês, data e valor do repasse.' }, 400);
        const saldo = await saldoImovel(b.imovel_id);
        if (v > saldo + 0.004) return json({ erro: `O repasse (${v.toFixed(2).replace('.', ',')}) é maior que o saldo do proprietário (${saldo.toFixed(2).replace('.', ',')}).` }, 400);
        await q(`insert into locacao.lancamentos(imovel_id, competencia, data, tipo, descricao, valor, origem, por, documento_id) values ($1,$2,$3,'repasse',$4,$5,'manual',$6,$7)`,
          [b.imovel_id, b.competencia, b.data, String(b.descricao || 'Repasse ao proprietário'), -v, real, b.documento_id || null]);
        await log(real, 'loc_repasse', { imovel: b.imovel_id, competencia: b.competencia, valor: v });
        return json({ ok: true, saldo: await saldoImovel(b.imovel_id) });
      }

      /* condomínio e IPTU do mês: conferir o que o inquilino pagou / registrar o que a Inerente pagou pelo proprietário */
      if (a === 'obrigacao' && id && m === 'POST') {
        const [o] = await q(`select * from locacao.obrigacoes where id=$1`, [id]);
        if (!o) return json({ erro: 'Item não encontrado' }, 404);
        const nome = o.item === 'condominio' ? 'Condomínio' : 'IPTU', ref = `${o.competencia.slice(5)}/${o.competencia.slice(0, 4)}`;
        if (acao === 'pagar') {
          if (o.situacao !== 'pendente') return json({ erro: 'Esse item já foi resolvido.' }, 409);
          if (!body.pago_em) return json({ erro: 'Informe a data do pagamento.' }, 400);
          let lanc = null;
          const v = R2(nb(body.valor));
          if (o.responsavel === 'proprietario') {
            if (!v) return json({ erro: 'Informe o valor pago pela Inerente.' }, 400);
            [lanc] = await q(`insert into locacao.lancamentos(imovel_id, competencia, data, tipo, descricao, valor, origem, por, documento_id) values ($1,$2,$3,$4,$5,$6,'manual',$7,$8) returning id`,
              [o.imovel_id, o.competencia, body.pago_em, o.item, `${nome} ${ref} (pago pela Inerente)`, -v, real, body.documento_id || null]);
          }
          await q(`update locacao.obrigacoes set situacao='pago', pago_em=$2, valor=$3, documento_id=$4, lancamento_id=$5, obs=$6 where id=$1`, [id, body.pago_em, v || null, body.documento_id || null, lanc?.id || null, limpa(body.obs)]);
          await log(real, 'loc_obrigacao_paga', { id, item: o.item, competencia: o.competencia, responsavel: o.responsavel, valor: v });
          return json({ ok: true });
        }
        if (acao === 'dispensar') {
          await q(`update locacao.obrigacoes set situacao='dispensado', obs=$2 where id=$1 and situacao='pendente'`, [id, limpa(body.obs) || 'não há cobrança nesse mês']);
          await log(real, 'loc_obrigacao_dispensada', { id }); return json({ ok: true });
        }
        if (acao === 'desfazer') {
          if (o.lancamento_id) await q(`delete from locacao.lancamentos where id=$1`, [o.lancamento_id]);
          await q(`update locacao.obrigacoes set situacao='pendente', pago_em=null, valor=null, documento_id=null, lancamento_id=null where id=$1`, [id]);
          await log(real, 'loc_obrigacao_desfeita', { id }); return json({ ok: true });
        }
      }

      /* calendário do mês (a planilha "Calendário": dia 10/20/30, recebido, repassado) */
      if (a === 'calendario' && m === 'GET') {
        const comp = /^\d{4}-\d{2}$/.test(id || '') ? id : compDe(hojeBR());
        const [y, mm] = comp.split('-').map(Number), ini = comp + '-01', fim = `${comp}-${ultimoDia(y, mm)}`;
        const L = await q(`select l.id, l.imovel_id, l.dia_vencimento, l.aluguel, l.status, i.apelido, p.nome locatario, p.telefone,
          (select row_to_json(x) from (select id, situacao, total, valor_pago, to_char(vencimento,'YYYY-MM-DD') vencimento, to_char(pago_em,'YYYY-MM-DD') pago_em from locacao.mensalidades where locacao_id=l.id and competencia=$3) x) cobranca,
          (select coalesce(-sum(valor),0) from locacao.lancamentos where imovel_id=l.imovel_id and tipo='repasse' and competencia=$3) repassado,
          (select coalesce(sum(valor),0) from locacao.lancamentos where imovel_id=l.imovel_id and tipo='adm' and competencia=$3) adm,
          (select coalesce(sum(valor),0) from locacao.lancamentos where imovel_id=l.imovel_id) saldo,
          (select coalesce(json_agg(json_build_object('id',o.id,'item',o.item,'responsavel',o.responsavel,'situacao',o.situacao)),'[]') from locacao.obrigacoes o where o.locacao_id=l.id and o.competencia=$3) obrigacoes
          from locacao.locacoes l join locacao.imoveis i on i.id=l.imovel_id join locacao.pessoas p on p.id=l.locatario_id
          where l.inicio<=$2 and (l.status='ativa' or l.encerrada_em>=$1) order by l.dia_vencimento, i.apelido`, [ini, fim, comp]);
        return json({ competencia: comp, hoje: hojeBR(), itens: L });
      }

      /* inadimplência */
      if (a === 'inadimplencia' && m === 'GET') {
        const M = await q(`select m.*, l.multa_pct, l.juros_mes_pct, l.cobranca_pct, l.cobranca_dias, l.honorarios_pct, l.honorarios_dias,
          l.caucao_valor, l.id locacao_id, i.apelido, p.nome locatario, p.telefone from locacao.mensalidades m join locacao.locacoes l on l.id=m.locacao_id
          join locacao.imoveis i on i.id=l.imovel_id join locacao.pessoas p on p.id=l.locatario_id where m.situacao='aberta' and m.vencimento<$1 order by m.vencimento`, [hojeBR()]);
        return json(M.map(x => ({ ...x, encargos: encargos(x, x) })));
      }

      /* reajustes */
      if (a === 'reajustes' && m === 'GET') {
        const L = await q(`select l.*, i.apelido, p.nome locatario from locacao.locacoes l
          join locacao.imoveis i on i.id=l.imovel_id join locacao.pessoas p on p.id=l.locatario_id where l.status='ativa' order by i.apelido`);
        return json(L.map(l => ({ id: l.id, apelido: l.apelido, locatario: l.locatario, aluguel: l.aluguel, indice: l.indice, inicio: l.inicio, ultimo_reajuste: l.ultimo_reajuste, aniversario: proximoAniversario(l) }))
          .sort((x, y) => x.aniversario.localeCompare(y.aniversario)));
      }
      if (a === 'reajuste' && id && m === 'GET') {
        const [l] = await q(`select * from locacao.locacoes where id=$1`, [id]);
        if (!l) return json({ erro: 'Contrato não encontrado' }, 404);
        const data = url.searchParams.get('data') || proximoAniversario(l);
        const ind = url.searchParams.get('indice') || l.indice;
        const calc = ind === 'fixo' ? { meses: [], percentual: +l.reajuste_fixo_pct || 0 } : await indiceAcumulado(ind, data);
        const negativo = calc.percentual < 0; if (negativo) calc.percentual = 0; /* correção negativa não existe: o aluguel fica igual */
        return json({ data, indice: ind, ...calc, negativo, aluguel: +l.aluguel, novo: R2(+l.aluguel * (1 + calc.percentual / 100)) });
      }
      if (a === 'reajuste' && id && m === 'POST') {
        const [l] = await q(`select * from locacao.locacoes where id=$1`, [id]);
        const pct = nb(body.percentual); if (pct === null || !body.data) return json({ erro: 'Informe a data e o percentual' }, 400);
        if (pct < 0) return json({ erro: 'Correção negativa não existe: o aluguel não pode diminuir pelo reajuste.' }, 400);
        const novo = body.novo ? R2(nb(body.novo)) : R2(+l.aluguel * (1 + pct / 100));
        if (novo < +l.aluguel) return json({ erro: 'O reajuste não pode diminuir o aluguel. Desconto só por renegociação.' }, 400);
        await q(`insert into locacao.reajustes(locacao_id, data, indice, percentual, valor_antes, valor_depois, memoria, por) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, body.data, body.indice || l.indice, pct, l.aluguel, novo, JSON.stringify(body.memoria || null), real]);
        const [r] = await q(`update locacao.locacoes set aluguel=$2, ultimo_reajuste=$3 where id=$1 returning *`, [id, novo, body.data]);
        const ab = await q(`select * from locacao.mensalidades where locacao_id=$1 and situacao='aberta' and vencimento>=$2`, [id, body.data]);
        for (const x of ab) { const it = itensDoMes(r, x.competencia); await q(`update locacao.mensalidades set itens=$2, total=$3 where id=$1`, [x.id, JSON.stringify(it), R2(it.reduce((s, y) => s + y.valor, 0))]); }
        await log(real, 'loc_reajuste', { locacao: id, data: body.data, percentual: pct, de: l.aluguel, para: novo, cobrancas_atualizadas: ab.length });
        return json({ ok: true, novo, cobrancas_atualizadas: ab.length });
      }

      /* documentos (arquivos guardados no Netlify, fora do banco) */
      if (a === 'documentos' && m === 'GET') return json(await q(`select id, entidade, entidade_id, tipo, nome, bytes, em from locacao.documentos where entidade=$1 and entidade_id=$2 order by em desc`, [url.searchParams.get('entidade'), url.searchParams.get('id')]));
      if (a === 'documento' && m === 'POST' && !id) {
        if (!body.base64 || !body.nome || !body.entidade || !body.entidade_id) return json({ erro: 'Arquivo incompleto' }, 400);
        const tabEnt = { imovel: 'imoveis', locacao: 'locacoes', pessoa: 'pessoas', administracao: 'administracoes' }[body.entidade];
        if (!tabEnt) return json({ erro: 'Tipo de documento inválido.' }, 400);
        const [ent] = await q(`select id from locacao.${tabEnt} where id=$1`, [body.entidade_id]);
        if (!ent) return json({ erro: 'O registro desse documento não existe.' }, 400);
        const buf = Buffer.from(String(body.base64).replace(/^data:[^,]*,/, ''), 'base64');
        const chave = `${body.entidade}/${body.entidade_id}/${Date.now()}-${String(body.nome).replace(/[^\w.\-]+/g, '_')}`;
        await arquivos.set(chave, buf);
        const [r] = await q(`insert into locacao.documentos(entidade, entidade_id, tipo, nome, chave, bytes, por) values ($1,$2,$3,$4,$5,$6,$7) returning id`, [body.entidade, body.entidade_id, body.tipo || null, body.nome, chave, buf.length, real]);
        await log(real, 'loc_documento', { id: r.id, entidade: body.entidade, entidade_id: body.entidade_id, nome: body.nome });
        return json({ id: r.id });
      }
      if (a === 'documento' && id && m === 'GET') {
        const [d] = await q(`select * from locacao.documentos where id=$1`, [id]);
        const buf = d && await arquivos.get(d.chave);
        if (!buf) return json({ erro: 'Arquivo não encontrado' }, 404);
        const ext = (d.nome.split('.').pop() || '').toLowerCase();
        const ct = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }[ext] || 'application/octet-stream';
        return new Response(buf, { headers: { 'content-type': ct, 'content-disposition': `inline; filename="${encodeURIComponent(d.nome)}"` } });
      }
      if (a === 'documento' && id && m === 'DELETE') {
        const [d] = await q(`delete from locacao.documentos where id=$1 returning *`, [id]);
        if (d) { await arquivos.del(d.chave).catch(() => null); await log(real, 'loc_documento_excluido', { id, nome: d.nome }); }
        return json({ ok: true });
      }

      if (a === 'importar' && m === 'POST') return json(await importa(body, real));
      if (a === 'copia' && m === 'GET') {
        const tabs = (await q(`select tablename from pg_tables where schemaname='locacao' and tablename<>'arquivos' order by 1`)).map(r => r.tablename);
        const dados = {}; for (const tb of tabs) dados[tb] = await q(`select * from locacao."${tb}"`);
        return new Response(JSON.stringify({ gerado_em: new Date().toISOString(), tabelas: dados }), { headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="locacao-${hojeBR()}.json"` } });
      }

      return json({ erro: 'Rota não encontrada' }, 404);
    } catch (e) {
      return json({ erro: /duplicate key/.test(e.message) ? 'Registro repetido.' : e.message }, 500);
    }
  };
}

export const _teste = { vencDe, addMeses, somaMes, R2 };
