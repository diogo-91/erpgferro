"""Monta /tmp/nomus-fiscal.json (para importar-fiscal.py) a partir de personalizacao/nomus-dados/.

Conteudo: empresas (com CNPJ/IE tirados dos XMLs das NF-e), produtos (NCM, GTIN, tributacao padrao inferida das NF-e),
clientes (documento, IE, IBGE, endereco) e as NF-e ja emitidas (cabecalho + XML).
Uso: python personalizacao/montar-pacote-fiscal.py [saida.json]
"""
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

AQUI = os.path.dirname(os.path.abspath(__file__))
DADOS = os.path.join(AQUI, "nomus-dados")
NS = {"n": "http://www.portalfiscal.inf.br/nfe"}


def carregar(nome):
    with open(os.path.join(DADOS, nome + ".json"), encoding="utf-8") as f:
        return json.load(f)


def t(no, caminho):
    r = no.find(caminho, NS) if no is not None else None
    return (r.text or "").strip() if r is not None and r.text else ""


def so_digitos(s):
    return re.sub(r"\D", "", s or "")


nfes_raw = carregar("nfes")
emitentes, nfes = {}, []
tributos = defaultdict(list)  # codigo do produto -> [(cfop, grupo, cst, aliq, pis, cofins)]
for n in nfes_raw:
    raiz = ET.fromstring(n["xml"])
    inf = raiz.find(".//n:infNFe", NS)
    emit = inf.find("n:emit", NS)
    cnpj = t(emit, "n:CNPJ")
    emitentes[cnpj] = {"cnpj": cnpj, "razao": t(emit, "n:xNome"), "fantasia": t(emit, "n:xFant"), "ie": t(emit, "n:IE"), "crt": t(emit, "n:CRT"),
                       "uf": t(emit, "n:enderEmit/n:UF"), "municipio": t(emit, "n:enderEmit/n:xMun"), "ibge": t(emit, "n:enderEmit/n:cMun")}
    dest = inf.find("n:dest", NS)
    prot = raiz.find(".//n:protNFe/n:infProt", NS)
    cstat = t(prot, "n:cStat")
    nfes.append({
        "id": n["id"], "numero": n["numero"], "serie": n["serie"], "chave": n["chave"], "protocolo": n["protocolo"], "cstat": cstat,
        "motivo": t(prot, "n:xMotivo"), "ambiente": n["ambiente"], "emitente": cnpj, "usuario": n["usuario"],
        "data": (t(inf, "n:ide/n:dhEmi") or "")[:10], "natop": t(inf, "n:ide/n:natOp"), "finalidade": n["finalidade"],
        "dest_nome": t(dest, "n:xNome"), "dest_doc": t(dest, "n:CNPJ") or t(dest, "n:CPF"), "dest_uf": t(dest, "n:enderDest/n:UF"),
        "valor": t(inf, "n:total/n:ICMSTot/n:vNF"), "icms": t(inf, "n:total/n:ICMSTot/n:vICMS"), "xml": n["xml"],
    })
    if cstat == "100" and t(inf, "n:ide/n:finNFe") == "1":
        for det in inf.findall("n:det", NS):
            ic = det.find("n:imposto/n:ICMS", NS)
            g = list(ic)[0] if ic is not None and len(list(ic)) else None
            tributos[t(det, "n:prod/n:cProd")].append((
                t(det, "n:prod/n:CFOP"), g.tag.split("}")[1] if g is not None else "", t(g, "n:CST") or t(g, "n:CSOSN"), t(g, "n:pICMS"),
                t(det, "n:imposto/n:PIS//n:CST"), t(det, "n:imposto/n:COFINS//n:CST")))


def mais_comum(lista):
    return Counter(lista).most_common(1)[0][0]


produtos = []
for p in carregar("produtos"):
    reg = {"codigo": p["codigo"], "nome": p.get("nome") or p["codigo"], "ncm": so_digitos(p.get("ncm")), "gtin": so_digitos(p.get("codigoGTIN")),
           "excecao_ncm": p.get("excecaoNcm") or ""}
    if p["codigo"] in tributos:
        cfop, grupo, cst, aliq, pis, cof = mais_comum(tributos[p["codigo"]])
        reg.update({"cfop": cfop, "cst_icms": cst, "aliq_icms": aliq, "cst_pis": pis, "cst_cofins": cof})
    produtos.append(reg)

empresas = []
for e in carregar("empresas"):
    empresas.append({"id": e["id"], "nome": e["nome"], "ativo": bool(e["ativo"]), "crt": (e.get("crt") or "")[:1], "ie": e.get("inscricaoEstadual") or "",
                     "cnae": e.get("cnaePrincipal") or "", "endereco": e.get("endereco") or "", "numero": e.get("numero") or "",
                     "complemento": e.get("complemento") or "", "bairro": e.get("bairro") or "", "cep": so_digitos(e.get("cep")),
                     "municipio": e.get("municipio") or "", "uf": e.get("uf") or "", "telefone": e.get("telefone") or ""})

clientes = []
for c in carregar("clientes"):
    doc = so_digitos(c.get("cnpj") or c.get("cpf"))
    clientes.append({"id": c["id"], "codigo": c.get("codigo") or "", "nome": (c.get("razaoSocial") or c.get("nome") or "").strip(), "fantasia": (c.get("nome") or "").strip(),
                     "doc": doc, "ie": so_digitos(c.get("inscricaoEstadual")), "contrib": str(c.get("tipoContribuinteICMS") or ""),
                     "ibge": str(c.get("codigoIBGEMunicipio") or ""), "endereco": c.get("endereco") or "", "numero": c.get("numero") or "",
                     "complemento": c.get("complemento") or "", "bairro": c.get("bairro") or "", "cep": so_digitos(c.get("cep")),
                     "municipio": c.get("municipio") or "", "uf": c.get("uf") or "", "email": c.get("email") or "", "telefone": c.get("telefone") or "",
                     "tipo_pessoa": str(c.get("tipoPessoa") or ""), "ativo": str(c.get("ativo")) == "True"})

saida = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get("TEMP", "/tmp"), "nomus-fiscal.json")
with open(saida, "w", encoding="utf-8") as f:
    json.dump({"emitentes": list(emitentes.values()), "empresas": empresas, "produtos": produtos, "clientes": clientes, "nfes": nfes}, f, ensure_ascii=False)
print("ok", saida, "| emitentes", {k: v["razao"] for k, v in emitentes.items()}, "| nfes", len(nfes), Counter(n["cstat"] for n in nfes),
      "| produtos", len(produtos), "com tributo", sum(1 for p in produtos if "cfop" in p), "| clientes", len(clientes), "com doc", sum(1 for c in clientes if c["doc"]))
