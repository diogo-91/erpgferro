"""Monta o pacote de faturas de abertura (contas em aberto do Nomus) em personalizacao/nomus-dados/financeiro-abertura.json.

Uso: python personalizacao/montar-pacote-financeiro.py   (depois de coletar-nomus-pcp.py)

Regras (decididas com o usuario):
- so empresa GFERRO (idEmpresa=3) e so lancamentos EM ABERTO (status False) com saldo diferente de zero
- vencidos antes de 2026 ficam de fora (so no arquivo, para revisao)
- cada fatura leva o id do lancamento do Nomus no numero (NOMUS-R-<id> a receber, NOMUS-P-<id> a pagar)
"""
import json
import os
from datetime import date

PASTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nomus-dados")
J = lambda n: json.load(open(os.path.join(PASTA, n + ".json"), encoding="utf-8"))
EMPRESA = 3
INICIO = date(2026, 1, 1)
FIM_EXERCICIO = date(2026, 12, 31)  # o ERP so tem o exercicio fiscal de 2026; o vencimento continua o do Nomus


def num(v):
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v or "0")
    return float(s.replace(".", "").replace(",", ".")) if "," in s else float(s)


def dia(texto):
    d, m, a = texto[:10].split("/")
    return date(int(a), int(m), int(d))


pessoas = {p["id"]: p for p in J("pessoas")}
pacote = {"receber": [], "pagar": [], "pulados": {"antigos": 0, "sem_saldo": 0, "outra_empresa": 0}}
for chave, arquivo, prefixo in (("receber", "contasReceber", "R"), ("pagar", "contasPagar", "P")):
    for r in J(arquivo):
        if r["status"] is not False:
            continue
        if r["idEmpresa"] != EMPRESA:
            pacote["pulados"]["outra_empresa"] += 1
            continue
        valor = abs(num(r.get("saldoReceber") if r.get("saldoReceber") not in (None, "") else r.get("valorReceber")))
        if valor == 0:
            pacote["pulados"]["sem_saldo"] += 1
            continue
        venc = dia(r["dataVencimento"])
        if venc < INICIO:
            pacote["pulados"]["antigos"] += 1
            continue
        comp = dia(r["dataCompetencia"]) if r.get("dataCompetencia") else venc
        posting = min(max(comp, INICIO), venc, FIM_EXERCICIO)  # lancamento dentro de 2026 e nunca depois do vencimento
        p = pessoas.get(r["idPessoa"], {})
        pacote[chave].append({
            "numero": "NOMUS-%s-%s" % (prefixo, r["id"]), "descricao": (r.get("descricaoLancamento") or "").strip()[:140],
            "valor": round(valor, 2), "vencimento": venc.isoformat(), "lancamento": posting.isoformat(),
            "pessoa": {"id": r["idPessoa"], "nome": (p.get("nome") or r.get("nomePessoa") or "Sem nome").strip(),
                       "doc": (p.get("cnpj") or "").strip(), "pf": p.get("tipoPessoa") == 2,
                       "telefone": (p.get("telefone") or "").strip(), "email": (p.get("email") or "").strip()},
        })
destino = os.path.join(PASTA, "financeiro-abertura.json")
json.dump(pacote, open(destino, "w", encoding="utf-8"), ensure_ascii=False)
for chave in ("receber", "pagar"):
    itens = pacote[chave]
    print(f"{chave.upper():8} {len(itens)} faturas | R$ {sum(i['valor'] for i in itens):,.2f} | pessoas distintas: {len({i['pessoa']['id'] for i in itens})}")
print("pulados:", pacote["pulados"])
print("gravado:", destino)
