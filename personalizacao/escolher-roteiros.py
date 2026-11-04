"""Escolhe o roteiro vigente de cada produto (Nomus). Le 300 OS recentes so em memoria; grava apenas o mapa produto -> roteiro."""
import collections, csv, json, os, sys, time
sys.argv = ["x"]
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "coletar-nomus-pcp.py"), encoding="utf-8").read().split("JANELA =")[0])

J = lambda n: json.load(open(os.path.join(SAIDA, n + ".json"), encoding="utf-8"))
prod = {p["id"]: p for p in J("produtos")}
rot = {r["id"]: r for r in J("roteirosProduto")}
ct = {c["id"]: c["nome"] for c in J("centrosTrabalho")}
cand = collections.defaultdict(list)
for r in rot.values():
    cand[r["produto"]["id"]].append(r["id"])

# 1) uso real: roteiro mais frequente nas 300 OS mais recentes (nada de OS e gravado em disco)
uso = collections.defaultdict(collections.Counter)
for pagina in range(1, 7):
    for o in get(f"{BASE}/ordens?pagina={pagina}"):
        if o.get("idRoteiroProduto"):
            uso[o["idProduto"]][o["idRoteiroProduto"]] += 1
    time.sleep(PAUSA)

# 2) regra pelo nome do produto
def pintura_esperada(p):
    t = (p["descricao"] or p["nome"] or "").upper()
    if "SEM PINTURA" in t: return False
    if "COM PINTURA" in t or "FACE" in t and "PINTAD" in t or "PINTURA PRÓPRIA" in t: return True
    if "PRÉ" in t or "PRE PINT" in t or "SIMPLES" in t: return False
    return None

def etapas(rid):
    return {o["operacao"]: ct.get(o["idCentroTrabalhoPlanejado"]) for o in rot[rid]["operacoes"]}

def tem_pintura(rid):
    return "PINTURA" in {(v or "").upper() for v in etapas(rid).values()}

def completo(rid):  # fluxo atual sempre termina em Estocagem (40) e Logistica (50)
    e = etapas(rid); return 40 in e and 50 in e

def pela_regra(pid):
    exp = pintura_esperada(prod[pid])
    for exigir_completo in (True, False):
        ok = [r for r in cand[pid] if (not exigir_completo or completo(r)) and (exp is None or tem_pintura(r) == exp)]
        if ok: return max(ok), ("regra" if exp is not None else "regra (nome neutro)")
    return max(cand[pid]), "REVISAR"

escolha = {}
for pid in cand:
    if len(cand[pid]) == 1:
        escolha[pid] = (cand[pid][0], "unico", None)
    elif uso.get(pid):
        escolha[pid] = (uso[pid].most_common(1)[0][0], "OS recente", None)
    else:
        rid, fonte = pela_regra(pid); escolha[pid] = (rid, fonte, None)

# 3) validacao: a regra, aplicada aos produtos que TEM OS recente, acerta quanto?
com_os = [p for p in cand if len(cand[p]) > 1 and uso.get(p)]
acertos = sum(1 for p in com_os if pela_regra(p)[0] == uso[p].most_common(1)[0][0])
print(f"produtos com mais de um roteiro: {sum(1 for p in cand if len(cand[p]) > 1)}")
print(f"  resolvidos por OS recente: {len(com_os)} | pela regra do nome: {sum(1 for p in cand if len(cand[p])>1 and not uso.get(p))}")
print(f"validacao da regra nos {len(com_os)} produtos com OS real: acertou {acertos} ({100*acertos//max(1,len(com_os))}%)")
print("fontes:", dict(collections.Counter(v[1] for v in escolha.values())))

with open(os.path.join(SAIDA, "roteiro-escolhido.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(["codigo", "produto", "roteiro_escolhido", "fonte", "etapas", "outros_roteiros"])
    for pid, (rid, fonte, _) in sorted(escolha.items(), key=lambda x: prod[x[0]]["codigo"]):
        w.writerow([prod[pid]["codigo"], prod[pid]["descricao"], rid, fonte,
                    " > ".join(f"{k} {v}" for k, v in sorted(etapas(rid).items())),
                    ", ".join(str(x) for x in sorted(cand[pid]) if x != rid)])
print("gravado: roteiro-escolhido.csv")
