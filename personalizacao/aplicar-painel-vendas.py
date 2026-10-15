"""Registra a pagina "Painel de Vendas" (painel-vendas) e cria o campo Gerente nas lojas.

O Frappe le o JS/CSS de uma pagina dos ARQUIVOS do app. Este script copia /tmp/painel-vendas.js e
/tmp/painel-vendas.css para selling/page/painel_vendas/ (o Containerfile tambem copia no build) e cria o registro.

Uso (container backend, pasta do bench):
  echo 'exec(open("/tmp/aplicar-painel-vendas.py").read(), globals())' | bench --site erp.gferro.com.br console
Depois: bench --site erp.gferro.com.br clear-cache. Pode rodar de novo.
"""
import os
import shutil

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

NOME = "painel-vendas"
PASTA = frappe.get_app_path("erpnext", "selling", "page", "painel_vendas")
ROLES = ["System Manager", "Sales Manager", "Sales User", "Vendedor Gferro", "Gerente de Loja", "Gestor Comercial"]

# 1) arquivos da pagina
os.makedirs(PASTA, exist_ok=True)
for origem, destino in (("/tmp/painel-vendas.js", "painel_vendas.js"), ("/tmp/painel-vendas.css", "painel_vendas.css")):
    if os.path.exists(origem):
        shutil.copyfile(origem, os.path.join(PASTA, destino))
open(os.path.join(PASTA, "__init__.py"), "a").close()

# 2) nome do gerente em cada loja (aparece ao lado da unidade no painel)
if not frappe.db.exists("Custom Field", "Branch-gerente"):
    create_custom_field("Branch", {"fieldname": "gerente", "label": "Gerente", "fieldtype": "Data",
                                   "insert_after": "branch"})

# gerentes das unidades (como no painel de referencia); a Loja 5 mostra a cidade
for loja, texto in (("Loja 1", "Petter"), ("Loja 2", "Lucas"), ("Loja 3", "Paulo"), ("Loja 4", "Bruna"), ("Loja 5", "Tatuí")):
    if frappe.db.exists("Branch", loja) and not frappe.db.get_value("Branch", loja, "gerente"):
        frappe.db.set_value("Branch", loja, "gerente", texto)

# 3) registro da pagina (inserido direto: criar Page pela API exige modo desenvolvedor)
frappe.db.sql("delete from `tabHas Role` where parenttype='Page' and parent=%s", NOME)
frappe.db.sql("delete from tabPage where name=%s", NOME)
pagina = frappe.get_doc({"doctype": "Page", "name": NOME, "page_name": NOME, "title": "Painel de Vendas",
                         "module": "Selling", "standard": "Yes", "system_page": 0})
pagina.db_insert()
for papel in ROLES:
    if frappe.db.exists("Role", papel):
        frappe.get_doc({"doctype": "Has Role", "parent": NOME, "parenttype": "Page", "parentfield": "roles",
                        "role": papel}).db_insert()

frappe.db.commit()
frappe.clear_cache()
print("PAINEL_OK", NOME, PASTA)
