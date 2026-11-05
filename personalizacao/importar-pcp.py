"""Importa o PCP do Nomus no ERPNext: itens faltantes, centros (Workstation Type), maquinas (Workstation),
operacoes, roteiros (Routing) e listas de materiais (BOM).

Uso (na pasta do bench, dentro do container backend):
  bench --site erp.gferro.com.br console < /tmp/importar-pcp.py
Espera /tmp/pcp-import.json (gerado por personalizacao/montar-pacote-pcp.py).

Pode rodar de novo: o que ja existe e ignorado.
Mapeamento:
- centro de trabalho -> Workstation Type | recurso (maquina) -> Workstation (do tipo do centro)
- centro sem maquina -> Workstation com o proprio nome do centro
- operacao do roteiro -> Operation (pelo nome) e linha de Routing/BOM (etapa = sequence_id)
- tempo: o Nomus guarda em segundos; aqui vira minutos. "Por unidade" escala com a quantidade; o resto e tempo fixo.
  O setup (sem campo proprio no BOM) e as demais maquinas da etapa vao na descricao da operacao.
- Ressuprimento 2 = fabricado (requisicao Manufacture); demais = comprado.
"""
import json

import frappe

dados = json.load(open("/tmp/pcp-import.json", encoding="utf-8"))
EMPRESA = frappe.get_all("Company", pluck="name")[0]
UDM = {"M2": "M²", "UNID": "Unit", "BARRA": "Barra", "KG": "Kg", "M": "M", "PC": "Peça", "PACOTE": "Pacote",
       "LATA": "Lata", "GALAO": "Galão", "CX": "Box"}
SERVICOS = {"Serviço contratado", "Serviço de produção para terceiros"}
VENDA = {"Produto acabado", "Mercadoria para revenda"}
erros = []


def tentar(rotulo, fn):
    try:
        fn()
        frappe.db.commit()  # grava cada sucesso na hora: o rollback de uma falha nao pode desfazer os anteriores
        return True
    except Exception as e:  # noqa: BLE001 - registra e segue
        frappe.db.rollback()
        erros.append((rotulo, str(e).replace("\n", " ")[:200]))
        return False


def criar(doctype, nome, **campos):
    if frappe.db.exists(doctype, nome):
        return False
    frappe.get_doc({"doctype": doctype, **campos}).insert(ignore_permissions=True)
    return True


# ---------- 0) unidades que aceitam fracao (o Nomus consome 0,2 barra, 0,1 unidade etc.) ----------
for uom in set(UDM.values()):
    if frappe.db.exists("UOM", uom):
        frappe.db.set_value("UOM", uom, "must_be_whole_number", 0)
frappe.db.commit()

# ---------- 1) itens que faltam ----------
n_item = 0
for p in dados["produtos"]:
    if frappe.db.exists("Item", p["codigo"]):
        continue

    def novo_item(p=p):
        udm = UDM.get(p["udm"], p["udm"].title())
        criar("UOM", udm, uom_name=udm, enabled=1)
        criar("Item Group", p["tipo"], item_group_name=p["tipo"], parent_item_group="All Item Groups", is_group=0)
        fabricado = p["ressuprimento"] == 2
        frappe.get_doc({
            "doctype": "Item", "item_code": p["codigo"], "item_name": p["descricao"][:140], "description": p["descricao"],
            "item_group": p["tipo"], "stock_uom": udm, "is_stock_item": 0 if p["tipo"] in SERVICOS else 1,
            "is_purchase_item": 0 if fabricado else 1, "is_sales_item": 1 if p["tipo"] in VENDA else 0,
            "default_material_request_type": "Manufacture" if fabricado else "Purchase",
            "disabled": 0 if p["ativo"] else 1,
        }).insert(ignore_permissions=True)

    if tentar("item " + p["codigo"], novo_item):
        n_item += 1
        if n_item % 50 == 0:
            frappe.db.commit()
frappe.db.commit()
print("itens criados:", n_item)

# ---------- 2) centros, maquinas, operacoes ----------
com_maquina = {r["centro"] for r in dados["recursos"]}
for c in dados["centros"]:
    tentar("tipo " + c["nome"], lambda c=c: criar("Workstation Type", c["nome"], workstation_type=c["nome"]))
for r in dados["recursos"]:
    tentar("maquina " + r["nome"], lambda r=r: criar("Workstation", r["nome"], workstation_name=r["nome"], workstation_type=r["centro"]))
for c in dados["centros"]:
    if c["nome"] not in com_maquina:
        tentar("posto " + c["nome"], lambda c=c: criar("Workstation", c["nome"], workstation_name=c["nome"], workstation_type=c["nome"]))
operacoes = sorted({o["operacao"] for r in dados["roteiros"].values() for o in r["operacoes"]})
for nome in operacoes:
    tentar("operacao " + nome, lambda nome=nome: criar("Operation", nome, name=nome))
frappe.db.commit()
print("workstation types:", frappe.db.count("Workstation Type"), "| workstations:", frappe.db.count("Workstation"), "| operations:", frappe.db.count("Operation"))


# ---------- 3) roteiros (Routing) e BOMs ----------
def linhas_operacao(codigo):
    linhas = []
    for pos, o in enumerate(dados["roteiros"][codigo]["operacoes"], 1):
        maquina = (o["maquinas"] or [o["centro"]])[0]
        if not frappe.db.exists("Workstation", maquina):
            maquina = o["centro"]
        # o ERPNext exige sequence_id consecutivo (1, 2, 3...); a etapa original do Nomus vai na descricao
        extra = ["Etapa Nomus: %s" % o["seq"]]
        if o["setup_min"]:
            extra.append("Setup: %g min" % o["setup_min"])
        if len(o["maquinas"]) > 1:
            extra.append("Outras maquinas: " + ", ".join(o["maquinas"][1:]))
        linhas.append({
            "operation": o["operacao"], "sequence_id": pos, "workstation_type": o["centro"], "workstation": maquina,
            "time_in_mins": o["min"], "fixed_time": 0 if o["por_unidade"] else 1, "description": " | ".join(extra),
        })
    return linhas


n_rot = 0
for codigo in dados["roteiros"]:
    nome = "ROT " + codigo
    if frappe.db.exists("Routing", nome) or not frappe.db.exists("Item", codigo):
        continue
    if tentar("roteiro " + codigo, lambda nome=nome, codigo=codigo: criar("Routing", nome, routing_name=nome, operations=linhas_operacao(codigo))):
        n_rot += 1
frappe.db.commit()
print("roteiros criados:", n_rot)

n_bom = 0
desativados = []
desativados_antes = frappe.db.count("Item", {"disabled": 1})
for codigo, b in dados["boms"].items():
    if not frappe.db.exists("Item", codigo) or frappe.db.exists("BOM", {"item": codigo, "docstatus": ["<", 2]}):
        continue
    envolvidos = [codigo] + [c["codigo"] for c in b["componentes"]]
    # o ERPNext nao aceita item desativado em BOM: liga so durante a criacao e desliga de novo (ficam bloqueados para venda)
    desativados_aqui = frappe.get_all("Item", filters={"name": ["in", envolvidos], "disabled": 1}, pluck="name")
    if desativados_aqui:
        desativados.append(codigo)

    def nova_bom(codigo=codigo, b=b, desativados_aqui=desativados_aqui):
        for it in desativados_aqui:
            frappe.db.set_value("Item", it, "disabled", 0, update_modified=False)
        try:
            criar_bom(codigo, b)
        finally:
            for it in desativados_aqui:
                frappe.db.set_value("Item", it, "disabled", 1, update_modified=False)

    def criar_bom(codigo, b):
        itens = []
        for c in b["componentes"]:
            if not frappe.db.exists("Item", c["codigo"]):
                continue
            itens.append({"item_code": c["codigo"], "qty": c["qtd"], "uom": frappe.db.get_value("Item", c["codigo"], "stock_uom"), "rate": 0})
        if not itens:
            raise ValueError("sem componentes validos")
        doc = {"doctype": "BOM", "item": codigo, "quantity": b["qtd_base"], "company": EMPRESA, "currency": "BRL",
               "conversion_rate": 1, "is_active": 1, "is_default": 1, "items": itens}
        if codigo in dados["roteiros"]:
            doc.update({"with_operations": 1, "routing": "ROT " + codigo, "operations": linhas_operacao(codigo)})
        bom = frappe.get_doc(doc)
        bom.insert(ignore_permissions=True)
        bom.submit()

    if tentar("bom " + codigo, nova_bom):
        n_bom += 1
        if n_bom % 25 == 0:
            frappe.db.commit()
frappe.db.commit()
print("BOMs criadas:", n_bom)
print("BOMs que envolvem item desativado (criadas com liga/desliga temporario): %d" % len(desativados))
print("itens desativados antes=%d depois=%d (devem ser iguais)" % (desativados_antes, frappe.db.count("Item", {"disabled": 1})))

print("RESULTADO itens=%d roteiros=%d boms=%d erros=%d" % (frappe.db.count("Item"), frappe.db.count("Routing"), frappe.db.count("BOM"), len(erros)))
vistos = {}
for rotulo, msg in erros:
    chave = msg[:90]
    vistos.setdefault(chave, []).append(rotulo)
for msg, rots in sorted(vistos.items(), key=lambda x: -len(x[1]))[:15]:
    print("ERRO x%d (%s...): %s" % (len(rots), ", ".join(rots[:3]), msg))
