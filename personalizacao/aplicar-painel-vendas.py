"""Registra as paginas "Painel de Vendas" e "Ranking de Vendedores" e cria os campos Gerente e Meta mensal nas lojas.

O Frappe le o JS/CSS de uma pagina dos ARQUIVOS do app. Este script copia os arquivos de /tmp para
selling/page/<pagina>/ (o Containerfile tambem copia no build) e cria o registro de cada pagina.

Uso (container backend, pasta do bench):
  echo 'exec(open("/tmp/aplicar-painel-vendas.py").read(), globals())' | bench --site erp.gferro.com.br console
Depois: bench --site erp.gferro.com.br clear-cache. Pode rodar de novo.
"""
import os
import shutil

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

# (nome da rota, pasta/arquivo no app, titulo, arquivos de origem em /tmp)
PAGINAS = [
    ("painel-vendas", "painel_vendas", "Painel de Vendas", "/tmp/painel-vendas"),
    ("ranking-vendedores", "ranking_vendedores", "Ranking de Vendedores", "/tmp/ranking-vendedores"),
]
ROLES = ["System Manager", "Sales Manager", "Sales User", "Vendedor Gferro", "Gerente de Loja", "Gestor Comercial"]

# 1) arquivos das paginas
for rota, pasta_nome, titulo, origem in PAGINAS:
    pasta = frappe.get_app_path("erpnext", "selling", "page", pasta_nome)
    os.makedirs(pasta, exist_ok=True)
    for ext in ("js", "css"):
        if os.path.exists(origem + "." + ext):
            shutil.copyfile(origem + "." + ext, os.path.join(pasta, pasta_nome + "." + ext))
    open(os.path.join(pasta, "__init__.py"), "a").close()

# 2) nome do gerente em cada loja (aparece ao lado da unidade no painel)
if not frappe.db.exists("Custom Field", "Branch-gerente"):
    create_custom_field("Branch", {"fieldname": "gerente", "label": "Gerente", "fieldtype": "Data",
                                   "insert_after": "branch"})

# meta mensal de vendas de cada unidade (aparece no indicador Meta Mensal)
if not frappe.db.exists("Custom Field", "Branch-meta_mensal"):
    create_custom_field("Branch", {"fieldname": "meta_mensal", "label": "Meta mensal de vendas (R$)",
                                   "fieldtype": "Currency", "insert_after": "gerente"})
if frappe.db.exists("Branch", "Loja 1") and not frappe.db.get_value("Branch", "Loja 1", "meta_mensal"):
    frappe.db.set_value("Branch", "Loja 1", "meta_mensal", 650000)  # valor do painel de referencia

# gerentes das unidades (como no painel de referencia); a Loja 5 mostra a cidade
for loja, texto in (("Loja 1", "Petter"), ("Loja 2", "Lucas"), ("Loja 3", "Paulo"), ("Loja 4", "Bruna"), ("Loja 5", "Tatuí")):
    if frappe.db.exists("Branch", loja) and not frappe.db.get_value("Branch", loja, "gerente"):
        frappe.db.set_value("Branch", loja, "gerente", texto)

# 3) registro das paginas (inserido direto: criar Page pela API exige modo desenvolvedor)
for rota, pasta_nome, titulo, origem in PAGINAS:
    frappe.db.sql("delete from `tabHas Role` where parenttype='Page' and parent=%s", rota)
    frappe.db.sql("delete from tabPage where name=%s", rota)
    pagina = frappe.get_doc({"doctype": "Page", "name": rota, "page_name": rota, "title": titulo,
                             "module": "Selling", "standard": "Yes", "system_page": 0})
    pagina.db_insert()
    for papel in ROLES:
        if frappe.db.exists("Role", papel):
            frappe.get_doc({"doctype": "Has Role", "parent": rota, "parenttype": "Page", "parentfield": "roles",
                            "role": papel}).db_insert()

frappe.db.commit()
frappe.clear_cache()
print("PAINEL_OK", [p[0] for p in PAGINAS])
