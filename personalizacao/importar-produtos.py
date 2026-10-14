"""Importa os produtos do Nomus (JSON consolidado) como Itens do ERPNext.

Uso (dentro do container backend, na pasta do bench):
  bench --site erp.gferro.com.br console < /tmp/importar-produtos.py
Espera o arquivo em /tmp/produtos.json (chave "produtos").

Pode rodar de novo: itens cujo codigo ja existe sao ignorados.

Regras:
- Codigo do produto  -> Item Code        | Descricao -> Item Name (ate 140 car.) e Descricao
- Tipo de produto    -> Grupo de Item (criado sob "All Item Groups")
- U.M.               -> UDM de estoque (usa as do ERPNext; cria as que nao existem)
- Servicos           -> sem controle de estoque
- Ressuprimento      -> comprado: item de compra / fabricado: tipo de requisicao "Manufacture"
- Status "Aguardando liberacao" -> item desativado
"""
import json

import frappe

dados = json.load(open("/tmp/produtos.json", encoding="utf-8"))
produtos = dados["produtos"] if isinstance(dados, dict) else dados

UDM = {
    "METRO QUADRADO": "Square Meter",
    "UNIDADE": "Unit",
    "QUILOGRAMA": "Kg",
    "METRO": "Meter",
    "LITRO": "Litre",
    "CAIXA": "Box",
    "BARRA": "Barra",
    "PEÇA": "Peça",
    "PACOTE": "Pacote",
    "LATA": "Lata",
    "GALÃO": "Galão",
    "CAIXA COM 100 UNIDADES": "Caixa com 100 Unidades",
}
SERVICOS = {"Serviço contratado", "Serviço de produção para terceiros"}
VENDA = {"Produto acabado", "Mercadoria para revenda"}


def garantir_udm(nome):
    if not frappe.db.exists("UOM", nome):
        frappe.get_doc({"doctype": "UOM", "uom_name": nome, "enabled": 1}).insert(ignore_permissions=True)


def garantir_grupo(nome):
    if not frappe.db.exists("Item Group", nome):
        frappe.get_doc({"doctype": "Item Group", "item_group_name": nome,
                        "parent_item_group": "All Item Groups", "is_group": 0}).insert(ignore_permissions=True)


criados, existentes, erros = 0, 0, []
for p in produtos:
    codigo = (p.get("Código do produto") or "").strip()
    if not codigo:
        continue
    if frappe.db.exists("Item", codigo):
        existentes += 1
        continue
    try:
        desc = (p.get("Descrição") or codigo).strip()
        tipo = (p.get("Tipo de produto") or "Outras").strip()
        udm = UDM.get((p.get("U.M.") or "").strip().upper())
        if not udm:
            udm = (p.get("U.M.") or "Unit").strip().title()
        garantir_udm(udm)
        garantir_grupo(tipo)
        ress = (p.get("Ressuprimento") or "").lower()
        fabricado = "fabricado" in ress
        item = frappe.get_doc({
            "doctype": "Item",
            "item_code": codigo,
            "item_name": desc[:140],
            "description": desc,
            "item_group": tipo,
            "stock_uom": udm,
            "is_stock_item": 0 if tipo in SERVICOS else 1,
            "is_purchase_item": 0 if fabricado else 1,
            "is_sales_item": 1 if tipo in VENDA else 0,
            "default_material_request_type": "Manufacture" if fabricado else "Purchase",
            "disabled": 1 if (p.get("Status") or "").strip().lower().startswith("aguardando") else 0,
        })
        item.insert(ignore_permissions=True)
        criados += 1
        if criados % 50 == 0:
            frappe.db.commit()
    except Exception as e:  # noqa: BLE001 - registra e segue para o proximo
        frappe.db.rollback()
        erros.append((codigo, str(e)[:160]))

frappe.db.commit()
print("RESULTADO criados=%d ja_existiam=%d erros=%d" % (criados, existentes, len(erros)))
for e in erros[:20]:
    print("ERRO", e)
