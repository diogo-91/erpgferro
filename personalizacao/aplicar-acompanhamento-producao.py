"""Registra a pagina "Acompanhamento da Producao" (Kanban das Ordens de Producao) no modulo Manufacturing.

O Frappe le o JS/CSS de uma pagina dos ARQUIVOS do app. Este script copia os arquivos de /tmp para
manufacturing/page/acompanhamento_producao/ (o Containerfile tambem copia no build) e cria o registro da pagina.

Uso (container backend, pasta do bench):
  echo 'exec(open("/tmp/aplicar-acompanhamento-producao.py").read(), globals())' | bench --site erp.gferro.com.br console
Depois: bench --site erp.gferro.com.br clear-cache. Pode rodar de novo.
"""
import os
import shutil

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

# campo para tirar uma ordem do quadro da TV (botao "Ocultar pedido" no detalhe do card); vale em ordem ja liberada (allow_on_submit)
if not frappe.db.exists("Custom Field", "Work Order-ocultar_no_quadro"):
    create_custom_field("Work Order", {"fieldname": "ocultar_no_quadro", "label": "Ocultar no quadro de produção", "fieldtype": "Check",
                                       "insert_after": "status", "allow_on_submit": 1, "no_copy": 1, "default": "0"})

ROTA, PASTA, TITULO, ORIGEM = "acompanhamento-producao", "acompanhamento_producao", "Acompanhamento da Produção", "/tmp/acompanhamento-producao"
ROLES = ["System Manager", "Manufacturing Manager", "Manufacturing User", "Gestor Comercial", "Gerente de Loja"]

pasta = frappe.get_app_path("erpnext", "manufacturing", "page", PASTA)
os.makedirs(pasta, exist_ok=True)
for ext in ("js", "css"):
    shutil.copyfile(ORIGEM + "." + ext, os.path.join(pasta, PASTA + "." + ext))
open(os.path.join(pasta, "__init__.py"), "a").close()

# inserido direto: criar Page pela API exige modo desenvolvedor
frappe.db.sql("delete from `tabHas Role` where parenttype='Page' and parent=%s", ROTA)
frappe.db.sql("delete from tabPage where name=%s", ROTA)
pagina = frappe.get_doc({"doctype": "Page", "name": ROTA, "page_name": ROTA, "title": TITULO,
                         "module": "Manufacturing", "standard": "Yes", "system_page": 0})
pagina.db_insert()
for papel in ROLES:
    if frappe.db.exists("Role", papel):
        frappe.get_doc({"doctype": "Has Role", "parent": ROTA, "parenttype": "Page", "parentfield": "roles",
                        "role": papel}).db_insert()
frappe.db.commit()
frappe.clear_cache()
print("PRODUCAO_OK", ROTA)
