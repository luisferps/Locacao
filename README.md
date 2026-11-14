# Administração de Aluguel — Inerente

Sistema próprio da frente **Administração de Aluguel** (separado da carteira do Beira Rio).
Entrada pelo Portal Inerente (cartão "Administração de Aluguel") ou por e-mail e senha.

- `backend/` — servidor (Railway, serviço **Locacao**) com banco próprio (Postgres do Railway, esquema `locacao`).
- `frontend/` — a tela (Railway, serviço **grand-grace**, aluguel.up.railway.app).

O que faz: proprietários e inquilinos, imóveis, contrato de administração, contrato de locação, cobranças do mês,
pagamento → conta corrente do proprietário (acerto mensal com saldo que passa de mês), repasses, calendário 10/20/30,
inadimplência com encargos do contrato, reajuste pelo índice do Banco Central, documentos, recibo, importação da
planilha "Acerto Mensal" de cada imóvel e cópia de segurança.
