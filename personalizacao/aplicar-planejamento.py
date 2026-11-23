"""Planejamento Financeiro (Dashboard > Financeiro) no ERP: pagina /desk/planejamento-financeiro (calendario de contas a pagar e receber, DRE).

Campo "Data replanejada" nas Faturas de Venda e de Compra (o vencimento da fatura nao muda; so a posicao no calendario).
Requer aplicar-financeiro.py (classificacao financeira) ja aplicado.
Uso (container backend): copiar planejamento-financeiro.js/.css para /tmp/ e rodar
  echo 'exec(open("/tmp/aplicar-planejamento.py").read(), globals())' | bench --site erp.gferro.com.br console
"""
import os
import shutil

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

for dt in ("Sales Invoice", "Purchase Invoice"):
    if not frappe.db.exists("Custom Field", dt + "-data_replanejada"):
        create_custom_field(dt, {"fieldname": "data_replanejada", "label": "Data replanejada (calendário financeiro)", "fieldtype": "Date", "insert_after": "due_date",
                                 "allow_on_submit": 1, "no_copy": 1})
ROTA, PASTA, TITULO = "planejamento-financeiro", "planejamento_financeiro", "Planejamento Financeiro"
pasta = frappe.get_app_path("erpnext", "accounts", "page", PASTA)
os.makedirs(pasta, exist_ok=True)
for ext in ("js", "css"):
    shutil.copyfile("/tmp/%s.%s" % (ROTA, ext), os.path.join(pasta, PASTA + "." + ext))
open(os.path.join(pasta, "__init__.py"), "a").close()
frappe.db.sql("delete from `tabHas Role` where parenttype='Page' and parent=%s", ROTA)
frappe.db.sql("delete from tabPage where name=%s", ROTA)
frappe.get_doc({"doctype": "Page", "name": ROTA, "page_name": ROTA, "title": TITULO, "module": "Accounts", "standard": "Yes", "system_page": 0}).db_insert()
for papel in ("System Manager", "Accounts Manager", "Accounts User", "Gestor Comercial"):
    if frappe.db.exists("Role", papel):
        frappe.get_doc({"doctype": "Has Role", "parent": ROTA, "parenttype": "Page", "parentfield": "roles", "role": papel}).db_insert()
frappe.db.commit()
frappe.clear_cache()
print("PLANEJAMENTO_OK", ROTA)
