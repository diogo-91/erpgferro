"""Cria a tela "Entregas" (apontamento de entrega) no modulo Manufacturing.

- DocTypes: "Motorista de Entrega" (nome, ativo), "Caminhao" (placa, modelo, ativo) e "Entrega de Pedido"
  (data, motorista, caminhao, pedido, cliente, material, metragem, valor).
- Pagina "apontamento-entrega" (JS/CSS copiados de /tmp para manufacturing/page/apontamento_entrega/).

Uso (container backend, pasta do bench):
  echo 'exec(open("/tmp/aplicar-entregas.py").read(), globals())' | bench --site erp.gferro.com.br console
Depois: bench --site erp.gferro.com.br clear-cache. Pode rodar de novo.
"""
import os
import shutil

import frappe

PAPEIS = [("System Manager", 1), ("Manufacturing Manager", 1), ("Manufacturing User", 0)]
PERMS = [{"role": r, "read": 1, "write": 1, "create": 1, "delete": d, "print": 1, "export": 1, "email": 0, "share": 1} for r, d in PAPEIS]


def criar(nome, campos, **extra):
    if frappe.db.exists("DocType", nome):
        return
    doc = {"doctype": "DocType", "name": nome, "module": "Manufacturing", "custom": 1, "sort_field": "modified",
           "sort_order": "DESC", "track_changes": 1, "quick_entry": 0, "fields": campos, "permissions": PERMS}
    doc.update(extra)
    frappe.get_doc(doc).insert(ignore_permissions=True)


criar("Motorista de Entrega", [
    {"fieldname": "nome", "label": "Nome", "fieldtype": "Data", "reqd": 1, "unique": 1, "in_list_view": 1},
    {"fieldname": "ativo", "label": "Ativo", "fieldtype": "Check", "default": "1", "in_list_view": 1},
], autoname="field:nome", naming_rule="By fieldname", title_field="nome")

criar("Caminhao", [
    {"fieldname": "placa", "label": "Placa", "fieldtype": "Data", "reqd": 1, "unique": 1, "in_list_view": 1},
    {"fieldname": "modelo", "label": "Modelo", "fieldtype": "Data", "in_list_view": 1},
    {"fieldname": "ativo", "label": "Ativo", "fieldtype": "Check", "default": "1", "in_list_view": 1},
], autoname="field:placa", naming_rule="By fieldname", title_field="placa")

criar("Entrega de Pedido", [
    {"fieldname": "data", "label": "Data da entrega", "fieldtype": "Date", "reqd": 1, "in_list_view": 1},
    {"fieldname": "motorista", "label": "Motorista", "fieldtype": "Link", "options": "Motorista de Entrega", "reqd": 1, "in_list_view": 1},
    {"fieldname": "caminhao", "label": "Caminhão", "fieldtype": "Link", "options": "Caminhao", "reqd": 1, "in_list_view": 1},
    {"fieldname": "pedido", "label": "Pedido", "fieldtype": "Data", "reqd": 1, "in_list_view": 1},
    {"fieldname": "cliente", "label": "Cliente", "fieldtype": "Data", "in_list_view": 1},
    {"fieldname": "material", "label": "Material", "fieldtype": "Small Text"},
    {"fieldname": "metragem", "label": "Metragem (m²)", "fieldtype": "Float"},
    {"fieldname": "valor", "label": "Valor (R$)", "fieldtype": "Currency"},
], autoname="hash", title_field="pedido")

# nomes sem acento no banco, rotulos em portugues
for original, trad in (("Caminhao", "Caminhão"), ("Entrega de Pedido", "Entrega de Pedido")):
    if original != trad and not frappe.db.exists("Translation", {"source_text": original, "language": "pt-BR"}):
        frappe.get_doc({"doctype": "Translation", "language": "pt-BR", "source_text": original, "translated_text": trad}).insert(ignore_permissions=True)

ROTA, PASTA, TITULO, ORIGEM = "apontamento-entrega", "apontamento_entrega", "Entregas", "/tmp/apontamento-entrega"
ROLES = ["System Manager", "Manufacturing Manager", "Manufacturing User", "Gestor Comercial", "Gerente de Loja"]

pasta = frappe.get_app_path("erpnext", "manufacturing", "page", PASTA)
os.makedirs(pasta, exist_ok=True)
for ext in ("js", "css"):
    shutil.copyfile(ORIGEM + "." + ext, os.path.join(pasta, PASTA + "." + ext))
open(os.path.join(pasta, "__init__.py"), "a").close()

frappe.db.sql("delete from `tabHas Role` where parenttype='Page' and parent=%s", ROTA)
frappe.db.sql("delete from tabPage where name=%s", ROTA)
frappe.get_doc({"doctype": "Page", "name": ROTA, "page_name": ROTA, "title": TITULO, "module": "Manufacturing",
                "standard": "Yes", "system_page": 0}).db_insert()
for papel in ROLES:
    if frappe.db.exists("Role", papel):
        frappe.get_doc({"doctype": "Has Role", "parent": ROTA, "parenttype": "Page", "parentfield": "roles", "role": papel}).db_insert()
frappe.db.commit()
frappe.clear_cache()
print("ENTREGAS_OK", ROTA)
