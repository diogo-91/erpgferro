"""Configura o estoque para a baixa automatica ao fechar a Ordem de Servico.

Uso (container backend, pasta do bench):
  echo 'exec(open("/tmp/aplicar-estoque.py", encoding="utf-8").read(), globals())' | bench --site erp.gferro.com.br console
Depois: bench --site erp.gferro.com.br clear-cache. Pode rodar de novo.

Depositos no padrao dos setores de estoque do Nomus (empresa GFERRO):
  E2 - ALMOXARIFADO  -> Almoxarifado      (de onde sai a materia-prima)
  E02 - EM PROCESSO  -> Trabalho Em Andamento
  E02 - EXPEDICAO    -> Produtos Acabados (onde entra o produto acabado)
As Ordens de Servico novas ja nascem com esses depositos e SEM a etapa manual de transferencia de material
(skip_transfer): ao finalizar a ultima etapa, o sistema lanca a Fabricacao (consome materia-prima e da entrada no produto acabado).
"""
import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter

EMPRESA = frappe.get_all("Company", pluck="name")[0]
ABREV = frappe.db.get_value("Company", EMPRESA, "abbr")
RAIZ = "Todos os Armazéns - " + ABREV
ALMOX, WIP, FG = "Almoxarifado - " + ABREV, "Trabalho Em Andamento - " + ABREV, "Produtos Acabados - " + ABREV

if not frappe.db.exists("Warehouse", ALMOX):
    frappe.get_doc({"doctype": "Warehouse", "warehouse_name": "Almoxarifado", "company": EMPRESA, "parent_warehouse": RAIZ,
                    "is_group": 0}).insert(ignore_permissions=True)

# padroes da fabricacao
frappe.db.set_single_value("Manufacturing Settings", "default_wip_warehouse", WIP)
frappe.db.set_single_value("Manufacturing Settings", "default_fg_warehouse", FG)
frappe.db.set_value("Company", EMPRESA, "default_wip_warehouse", WIP)

# Ordem de Servico (Work Order): depositos e sem transferencia manual de material
make_property_setter("Work Order", "source_warehouse", "default", ALMOX, "Link")
make_property_setter("Work Order", "wip_warehouse", "default", WIP, "Link")
make_property_setter("Work Order", "fg_warehouse", "default", FG, "Link")
make_property_setter("Work Order", "skip_transfer", "default", "1", "Check")
frappe.db.commit()
frappe.clear_cache()
print("ESTOQUE_OK", [w for w in (ALMOX, WIP, FG) if frappe.db.exists("Warehouse", w)])
