"""Monta o pacote de importacao do PCP (personalizacao/nomus-dados/pcp-import.json) a partir dos dados do Nomus.

Uso: python personalizacao/montar-pacote-pcp.py   (depois de coletar-nomus-pcp.py e escolher-roteiros.py)

Conteudo do pacote:
- centros: centros de trabalho -> Workstation Type; recursos (maquinas) -> Workstation
- produtos: todos os produtos (para criar no ERPNext os que ainda nao existem)
- roteiros: operacoes do roteiro escolhido de cada produto (roteiro-escolhido.csv)
- boms: lista de materiais padrao dos produtos que tem componentes
Tempos: o Nomus guarda em segundos; o pacote ja leva os minutos para o ERPNext.
"""
import csv
import json
import os
from collections import defaultdict

PASTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nomus-dados")
J = lambda n: json.load(open(os.path.join(PASTA, n + ".json"), encoding="utf-8"))


def num(v):
    """'39,2' / '2' / 2 -> float."""
    if isinstance(v, (int, float)):
        return float(v)
    return float(str(v or 0).replace(".", "").replace(",", ".")) if "," in str(v) else float(str(v or 0))


produtos = J("produtos")
prod_id = {p["id"]: p for p in produtos}
centros = J("centrosTrabalho")
ct_nome = {c["id"]: c["nome"] for c in centros}
recursos = J("recursos")
rot = {r["id"]: r for r in J("roteirosProduto")}

# roteiro escolhido por produto (codigo -> id do roteiro)
escolhido = {}
for linha in csv.DictReader(open(os.path.join(PASTA, "roteiro-escolhido.csv"), encoding="utf-8-sig"), delimiter=";"):
    escolhido[linha["codigo"]] = int(linha["roteiro_escolhido"])

roteiros = {}
for codigo, rid in escolhido.items():
    ops = []
    for o in sorted(rot[rid]["operacoes"], key=lambda o: o["operacao"]):
        maquinas = [x["nome"] for x in o["recursosPlanejados"]]
        ops.append({
            "seq": o["operacao"],
            "operacao": o["descricao"].strip(),
            "centro": ct_nome[o["idCentroTrabalhoPlanejado"]],
            "maquinas": maquinas,
            "min": round(o["tempoOperacao"] / 60, 4),
            "setup_min": round(o["tempoSetup"] / 60, 4),
            "por_unidade": o["tipoTempoOperacao"] == 2,
        })
    roteiros[codigo] = {"roteiro_nomus": rid, "operacoes": ops}

# listas de materiais padrao com componentes (nao alternativos, nem coprodutos/subprodutos)
listas = {l["id"]: l for l in J("listasMateriais") if l["padrao"] and l["ativo"]}
comps = defaultdict(list)
for c in J("componentesListaMateriais"):
    lid = c["listaMateriais"]["id"]
    if lid not in listas or c["alternativo"] or c["coproduto"] or c["subproduto"]:
        continue
    comps[lid].append({"codigo": c["codigoProdutoComponente"], "qtd": num(c["qtdeNecessaria"])})
boms = {}
for lid, itens in comps.items():
    pai = prod_id[listas[lid]["idProduto"]]
    boms[pai["codigo"]] = {"qtd_base": num(listas[lid]["qtdeBase"]) or 1.0, "componentes": itens}

pacote = {
    "centros": [{"nome": c["nome"], "terceiros": c["producaoEmTerceiros"]} for c in centros if c["ativo"]],
    "recursos": [{"nome": r["nome"], "centro": r["centroTrabalho"]["nome"]} for r in recursos if r["ativo"]],
    "produtos": [{
        "codigo": p["codigo"], "descricao": (p["descricao"] or p["nome"] or p["codigo"]).strip(),
        "tipo": (p.get("nomeTipoProduto") or "Outras").strip(), "udm": (p.get("siglaUnidadeMedida") or "UNID").strip().upper(),
        "ressuprimento": p.get("metodoRessuprimento"), "ativo": bool(p["ativo"]),
    } for p in produtos],
    "roteiros": roteiros,
    "boms": boms,
}
destino = os.path.join(PASTA, "pcp-import.json")
json.dump(pacote, open(destino, "w", encoding="utf-8"), ensure_ascii=False)
faltam = {c["codigo"] for b in boms.values() for c in b["componentes"]} - {p["codigo"] for p in produtos}
print(f"centros={len(pacote['centros'])} recursos={len(pacote['recursos'])} produtos={len(produtos)} "
      f"roteiros={len(roteiros)} (operacoes={sum(len(r['operacoes']) for r in roteiros.values())}) "
      f"boms={len(boms)} (componentes={sum(len(b['componentes']) for b in boms.values())})")
print("componentes que nao estao na lista de produtos:", sorted(faltam) or "nenhum")
print("BOMs sem roteiro:", sorted(set(boms) - set(roteiros)) or "nenhum", "| roteiros sem BOM:", len(set(roteiros) - set(boms)))
print("gravado:", destino)
