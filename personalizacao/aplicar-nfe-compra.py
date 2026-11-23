"""Pagina "Entrada de NF de compra (XML)" + campo da chave da NF-e no Recebimento de Compra.

Uso (container backend): copiar importar-nfe-compra.js/.css para /tmp/ e rodar
  echo 'exec(open("/tmp/aplicar-nfe-compra.py").read(), globals())' | bench --site erp.gferro.com.br console
Depois: clear-cache. Pode rodar de novo.
"""
import os
import shutil

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

if not frappe.db.exists("Custom Field", "Purchase Receipt-gf_chave_nfe"):
    create_custom_field("Purchase Receipt", {"fieldname": "gf_chave_nfe", "label": "Chave da NF-e", "fieldtype": "Data", "insert_after": "supplier_delivery_note",
                                             "read_only": 1, "no_copy": 1})

ROTA, PASTA, TITULO, ORIGEM = "importar-nfe-compra", "importar_nfe_compra", "Entrada de NF de compra (XML)", "/tmp/importar-nfe-compra"
ROLES = ["System Manager", "Purchase Manager", "Purchase User", "Stock Manager", "Stock User"]
pasta = frappe.get_app_path("erpnext", "buying", "page", PASTA)
os.makedirs(pasta, exist_ok=True)
for ext in ("js", "css"):
    shutil.copyfile(ORIGEM + "." + ext, os.path.join(pasta, PASTA + "." + ext))
open(os.path.join(pasta, "__init__.py"), "a").close()
frappe.db.sql("delete from `tabHas Role` where parenttype='Page' and parent=%s", ROTA)
frappe.db.sql("delete from tabPage where name=%s", ROTA)
frappe.get_doc({"doctype": "Page", "name": ROTA, "page_name": ROTA, "title": TITULO, "module": "Buying", "standard": "Yes", "system_page": 0}).db_insert()
for papel in ROLES:
    if frappe.db.exists("Role", papel):
        frappe.get_doc({"doctype": "Has Role", "parent": ROTA, "parenttype": "Page", "parentfield": "roles", "role": papel}).db_insert()
frappe.db.commit()
frappe.clear_cache()
print("NFE_COMPRA_OK", ROTA)
