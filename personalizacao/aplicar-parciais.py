"""Fecha as funcionalidades que estavam "parciais" em relacao ao Nomus.

1) Compras: relatorio "Necessidade de Compra" (empenhado nas OS abertas - estoque - ja em compra = sugestao de compra).
2) Empenho: relatorio "Empenhos de Material" (o que cada OS aberta ainda vai consumir, com saldo e falta).
3) Paradas: DocType "Causa de Parada" com as 71 causas do Nomus + motivo na pausa do apontamento (Job Card Time Log).
4) Qualidade: parametros e modelos de inspecao (telha e bobina) ligados aos itens.
5) Comissao: relatorio "Comissão de Vendedores" com a regra da Intranet (2% do recebido + faixas de frete) e taxa nos vendedores.
6) Perfis: Role Profiles "Gferro - ..." mapeando os 43 grupos de usuarios do Nomus.
(A entrada de NF de compra por XML esta em importar-nfe-compra.* / gferro_utils.py.)

Uso (container backend, pasta do bench):
  echo 'exec(open("/tmp/aplicar-parciais.py").read(), globals())' | bench --site erp.gferro.com.br console
Precisa de /tmp/causasProblemas.json (copiado de personalizacao/nomus-dados). Pode rodar de novo.
"""
import json

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

ADM = ("System Manager", 1)


def papeis(lista):
    return [{"role": r} for r in lista if frappe.db.exists("Role", r)]


# ---------------------------------------------------------------- 3) causas de parada
if not frappe.db.exists("DocType", "Causa de Parada"):
    perms = [{"role": r, "read": 1, "write": w, "create": w, "delete": w, "print": 1, "export": 1, "email": 0, "share": 1}
             for r, w in (("System Manager", 1), ("Manufacturing Manager", 1), ("Manufacturing User", 0), ("Quality Manager", 1))]
    frappe.get_doc({
        "doctype": "DocType", "name": "Causa de Parada", "module": "Manufacturing", "custom": 1, "autoname": "hash", "title_field": "causa",
        "search_fields": "causa,codigo", "sort_field": "codigo", "sort_order": "ASC", "quick_entry": 0,
        "fields": [
            {"fieldname": "causa", "label": "Causa", "fieldtype": "Data", "reqd": 1, "in_list_view": 1},
            {"fieldname": "codigo", "label": "Código (classificação)", "fieldtype": "Data", "in_list_view": 1, "in_standard_filter": 1},
            {"fieldname": "categoria", "label": "Categoria", "fieldtype": "Select", "in_list_view": 1, "in_standard_filter": 1,
             "options": "\nAnálise de apontamento\nNão conformidade\nReporte de subproduto\nEncerramento: produzido abaixo do planejado\nEncerramento: produzido acima do planejado\nDevolução de compra\nDevolução de venda\nPerda de processo (CRM)"},
            {"fieldname": "tipo", "label": "Tipo", "fieldtype": "Select", "options": "\nSintético\nAnalítico", "in_list_view": 1},
            {"fieldname": "ativo", "label": "Ativo", "fieldtype": "Check", "default": "1", "in_list_view": 1},
            {"fieldname": "id_nomus", "label": "ID no Nomus", "fieldtype": "Data", "read_only": 1},
        ], "permissions": perms,
    }).insert(ignore_permissions=True)
    frappe.db.commit()

CATEG = {"Analise_apontamento": "Análise de apontamento", "Nao_conformidade": "Não conformidade", "Reporte_subproduto": "Reporte de subproduto",
         "Encerramento_ordem_qtde_produzida_inferior_planejada": "Encerramento: produzido abaixo do planejado",
         "Encerramento_ordem_qtde_produzida_superior_planejada": "Encerramento: produzido acima do planejado",
         "Devolucao_compra_entrada": "Devolução de compra", "Devolucao_venda_saida": "Devolução de venda", "Causa_perda_processo_crm": "Perda de processo (CRM)"}
novas = 0
for c in json.load(open("/tmp/causasProblemas.json", encoding="utf-8")):
    if frappe.db.exists("Causa de Parada", {"id_nomus": str(c["id"])}):
        continue
    frappe.get_doc({"doctype": "Causa de Parada", "causa": (c.get("causa") or c.get("descricao") or "").strip(), "codigo": c.get("classificacao") or "",
                    "categoria": CATEG.get(c.get("categoria"), ""), "tipo": "Sintético" if str(c.get("tipo", "")).lower().startswith("sint") else "Analítico",
                    "ativo": 1 if str(c.get("ativo")) == "True" else 0, "id_nomus": str(c["id"])}).insert(ignore_permissions=True)
    novas += 1
if not frappe.db.exists("Custom Field", "Job Card Time Log-causa_parada"):
    create_custom_field("Job Card Time Log", {"fieldname": "causa_parada", "label": "Motivo da pausa", "fieldtype": "Link", "options": "Causa de Parada",
                                              "insert_after": "matricula"})
frappe.db.commit()
print("CAUSAS_OK novas", novas, "total", frappe.db.count("Causa de Parada"))

# ---------------------------------------------------------------- relatorios (Query Report)
def relatorio(nome, ref, modulo, query, filtros, roles):
    if frappe.db.exists("Report", nome):
        frappe.delete_doc("Report", nome, force=True, ignore_permissions=True)
    frappe.get_doc({"doctype": "Report", "report_name": nome, "ref_doctype": ref, "report_type": "Query Report", "is_standard": "No", "module": modulo,
                    "query": query, "filters": filtros, "roles": papeis(roles)}).insert(ignore_permissions=True)


ABERTAS = "wo.docstatus = 1 AND wo.status IN ('Not Started', 'In Process', 'Stopped')"

relatorio("Empenhos de Material", "Work Order", "Manufacturing", """
SELECT wo.name AS "OS:Link/Work Order:130", wo.production_item AS "Produto:Link/Item:110", wo.item_name AS "Descrição do produto::200",
       woi.item_code AS "Material:Link/Item:110", woi.item_name AS "Descrição do material::220",
       woi.required_qty AS "Necessário:Float:100", woi.consumed_qty AS "Consumido:Float:100",
       GREATEST(woi.required_qty - woi.consumed_qty, 0) AS "Empenhado:Float:100",
       IFNULL((SELECT SUM(b.actual_qty) FROM `tabBin` b WHERE b.item_code = woi.item_code), 0) AS "Estoque:Float:100",
       CASE WHEN IFNULL((SELECT SUM(b.actual_qty) FROM `tabBin` b WHERE b.item_code = woi.item_code), 0) >= GREATEST(woi.required_qty - woi.consumed_qty, 0)
            THEN 'Disponível' ELSE 'Falta' END AS "Situação::100"
FROM `tabWork Order` wo JOIN `tabWork Order Item` woi ON woi.parent = wo.name
WHERE """ + ABERTAS + """ AND (%(os)s = '' OR wo.name = %(os)s) AND GREATEST(woi.required_qty - woi.consumed_qty, 0) > 0
ORDER BY wo.planned_start_date, wo.name, woi.idx
""", [{"label": "OS", "fieldname": "os", "fieldtype": "Link", "options": "Work Order", "default": ""}],
    ["System Manager", "Manufacturing Manager", "Manufacturing User", "Stock Manager", "Purchase Manager", "Gestor Comercial"])

relatorio("Necessidade de Compra", "Item", "Buying", """
SELECT t.item_code AS "Material:Link/Item:120", t.item_name AS "Descrição::260", t.um AS "Un::60",
       t.empenhado AS "Empenhado nas OS:Float:130", t.estoque AS "Estoque:Float:100", t.em_compra AS "Já em compra:Float:110",
       GREATEST(t.empenhado - t.estoque - t.em_compra, 0) AS "Sugestão de compra:Float:140"
FROM (
  SELECT woi.item_code, MAX(woi.item_name) AS item_name, MAX(i.stock_uom) AS um,
         SUM(GREATEST(woi.required_qty - woi.consumed_qty, 0)) AS empenhado,
         IFNULL((SELECT SUM(b.actual_qty) FROM `tabBin` b WHERE b.item_code = woi.item_code), 0) AS estoque,
         IFNULL((SELECT SUM(poi.qty - poi.received_qty) FROM `tabPurchase Order Item` poi JOIN `tabPurchase Order` po ON po.name = poi.parent
                 WHERE poi.item_code = woi.item_code AND po.docstatus = 1 AND po.status NOT IN ('Closed', 'Completed', 'Cancelled') AND poi.qty > poi.received_qty), 0) AS em_compra
  FROM `tabWork Order Item` woi JOIN `tabWork Order` wo ON wo.name = woi.parent JOIN `tabItem` i ON i.name = woi.item_code
  WHERE """ + ABERTAS + """ GROUP BY woi.item_code
) t
WHERE t.empenhado > 0 AND (%(so_falta)s = 0 OR t.empenhado - t.estoque - t.em_compra > 0)
ORDER BY (t.empenhado - t.estoque - t.em_compra) DESC
""", [{"label": "Somente com falta", "fieldname": "so_falta", "fieldtype": "Check", "default": "1"}],
    ["System Manager", "Purchase Manager", "Purchase User", "Stock Manager", "Manufacturing Manager", "Gestor Comercial"])

relatorio("Comissão de Vendedores", "Sales Order", "Selling", """
SELECT t.vendedor AS "Vendedor::220", COUNT(*) AS "Pedidos:Int:80", SUM(t.total) AS "Total vendido:Currency:130", SUM(t.recebido) AS "Total recebido:Currency:130",
       SUM(t.frete) AS "Frete cobrado:Currency:120", SUM(t.com_frete) AS "Comissão de frete:Currency:130", MAX(t.taxa) AS "Taxa (%%):Float:80",
       ROUND(SUM(t.recebido) * MAX(t.taxa) / 100, 2) AS "Comissão de vendas:Currency:140",
       ROUND(SUM(t.recebido) * MAX(t.taxa) / 100 + SUM(t.com_frete), 2) AS "Total da comissão:Currency:140"
FROM (
  SELECT IFNULL(NULLIF(so.vendedor, ''), '(sem vendedor)') AS vendedor, so.grand_total AS total,
         GREATEST(IFNULL(so.advance_paid, 0), IFNULL((SELECT SUM(si.grand_total - si.outstanding_amount) FROM `tabSales Invoice` si
                  WHERE si.docstatus = 1 AND si.name IN (SELECT DISTINCT sii.parent FROM `tabSales Invoice Item` sii WHERE sii.sales_order = so.name)), 0)) AS recebido,
         IFNULL(so.frete_valor, 0) AS frete,
         CASE WHEN IFNULL(so.frete_valor, 0) >= 250 THEN 22 WHEN so.frete_valor >= 200 THEN 16 WHEN so.frete_valor >= 150 THEN 13.5 WHEN so.frete_valor >= 110 THEN 10 ELSE 0 END AS com_frete,
         IFNULL(NULLIF((SELECT sp.commission_rate FROM `tabSales Person` sp WHERE sp.name = so.vendedor), 0), 2) AS taxa
  FROM `tabSales Order` so
  WHERE so.docstatus = 1 AND so.status <> 'Cancelled' AND so.transaction_date BETWEEN %(from_date)s AND %(to_date)s
) t
GROUP BY t.vendedor ORDER BY SUM(t.total) DESC
""", [{"label": "De", "fieldname": "from_date", "fieldtype": "Date", "mandatory": 1}, {"label": "Até", "fieldname": "to_date", "fieldtype": "Date", "mandatory": 1}],
    ["System Manager", "Sales Manager", "Gestor Comercial", "Accounts Manager"])
frappe.db.sql("update `tabSales Person` set commission_rate = 2 where ifnull(commission_rate, 0) = 0 and is_group = 0")
frappe.db.commit()
print("RELATORIOS_OK")

# ---------------------------------------------------------------- 4) qualidade
def modelo(nome, itens, filtro_item):
    for esp in itens:
        if not frappe.db.exists("Quality Inspection Parameter", esp):
            frappe.get_doc({"doctype": "Quality Inspection Parameter", "parameter": esp, "description": esp}).insert(ignore_permissions=True)
    if not frappe.db.exists("Quality Inspection Template", nome):
        frappe.get_doc({"doctype": "Quality Inspection Template", "quality_inspection_template_name": nome,
                        "item_quality_inspection_parameter": [{"specification": e, "numeric": 0, "value": "Conforme"} for e in itens]}).insert(ignore_permissions=True)
    n = frappe.db.sql("update tabItem set quality_inspection_template=%s where item_name like %s and ifnull(quality_inspection_template,'')=''", (nome, filtro_item))
    return frappe.db.sql("select count(*) from tabItem where quality_inspection_template=%s", nome)[0][0]


t1 = modelo("Inspeção final de telhas", ["Comprimento confere com a OS", "Largura útil", "Espessura da chapa", "Cor e pintura (superior e inferior)",
                                         "Aderência do EPS (sanduíche)", "Esquadro e ondulação", "Acabamento (amassados e riscos)"], "TELHA%")
t2 = modelo("Inspeção de recebimento de bobina", ["Largura da bobina", "Espessura", "Camada de galvalume (AZ)", "Aspecto da superfície", "Peso confere com a NF"], "BOBINA%")
frappe.db.commit()
print("QUALIDADE_OK itens telha", t1, "itens bobina", t2)

# ---------------------------------------------------------------- 6) perfis de acesso
VENDAS = ["Vendedor Gferro", "Sales User"]
PERFIS = {
    "Vendedor (Vendas, Vendedores e 'Vendas - nome')": VENDAS,
    "Gerente de loja (Gerente, Gerentes_Comerc., GERENTES_OPERAÇÕES)": ["Gerente de Loja", "Sales Manager", "Sales User", "Stock User"],
    "Diretoria": ["Gestor Comercial", "Sales Manager", "Accounts Manager", "Purchase Manager", "Stock Manager", "Manufacturing Manager", "Report Manager"],
    "Financeiro": ["Accounts Manager", "Accounts User"],
    "Faturamento": ["Accounts User", "Sales User", "Stock User"],
    "Controladoria e Custos": ["Accounts Manager", "Accounts User", "Report Manager"],
    "Compras": ["Purchase Manager", "Purchase User", "Item Manager", "Stock User"],
    "Almoxarifado e Recebimento": ["Stock Manager", "Stock User", "Purchase User"],
    "Expedição e Logística": ["Stock User", "Delivery User", "Manufacturing User"],
    "Produção e Chão de fábrica": ["Manufacturing User", "Stock User"],
    "PCP": ["Manufacturing Manager", "Manufacturing User", "Stock User", "Item Manager"],
    "Engenharia": ["Manufacturing Manager", "Item Manager", "Stock User"],
    "Qualidade (Controle, Garantia, Supervisão)": ["Quality Manager", "Manufacturing User", "Stock User"],
    "Manutenção": ["Maintenance Manager", "Maintenance User", "Manufacturing User"],
    "Pós-vendas e Administrativo": ["Sales User", "Support Team", "Stock User"],
    "Recursos Humanos": ["HR Manager", "HR User"],
    "Sistemas e Acesso Total": ["System Manager"],
}
for nome, roles in PERFIS.items():
    pf = "Gferro - " + nome
    if frappe.db.exists("Role Profile", pf):
        continue
    frappe.get_doc({"doctype": "Role Profile", "role_profile": pf, "roles": papeis(roles)}).insert(ignore_permissions=True)
frappe.db.commit()
frappe.clear_cache()
print("PERFIS_OK", frappe.db.count("Role Profile"))
