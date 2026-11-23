"""Dashboard > Pedidos da Intranet no ERP: Pedidos liberados, Pedidos combinados, Pedidos Formato 2 (pagina) e Pedidos problematicos (cadastro).

- Pagina /desk/pedidos-dashboard (Vendas) com as 3 visoes; dados dos Pedidos de Venda do ERP (funcao pedidos_dashboard em gferro_utils.py).
- Campos no Pedido de Venda para "lucro transferido" (formato 2).
- DocType "Pedido Problematico" (urgentes, devolucoes com as 5 etapas do atendimento, defeitos/clientes; "convertidos" = devolucao realizada).

Uso (container backend): copiar pedidos-dashboard.js/.css para /tmp/ e rodar
  echo 'exec(open("/tmp/aplicar-pedidos-dashboard.py").read(), globals())' | bench --site erp.gferro.com.br console
Depois: clear-cache. Pode rodar de novo.
"""
import os
import shutil

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

# ---- campos do formato 2 no pedido
for nome, rot, tipo in (("lucro_transferido", "Lucro transferido", "Check"), ("lucro_transferido_valor", "Valor do lucro transferido", "Currency"),
                        ("lucro_transferido_por", "Lucro transferido por", "Data"), ("lucro_transferido_em", "Lucro transferido em", "Datetime")):
    if not frappe.db.exists("Custom Field", "Sales Order-" + nome):
        create_custom_field("Sales Order", {"fieldname": nome, "label": rot, "fieldtype": tipo, "insert_after": "termo_aceite" if nome == "lucro_transferido" else "lucro_transferido",
                                            "allow_on_submit": 1, "read_only": 1, "no_copy": 1, "hidden": 1})

# ---- pedidos problematicos
PERMS = [{"role": r, "read": 1, "write": 1, "create": 1, "delete": d, "print": 1, "export": 1, "email": 0, "share": 1}
         for r, d in (("System Manager", 1), ("Gestor Comercial", 1), ("Sales Manager", 1), ("Gerente de Loja", 0), ("Accounts User", 0), ("Vendedor Gferro", 0)) if frappe.db.exists("Role", r)]
if not frappe.db.exists("DocType", "Etapa Devolucao"):
    frappe.get_doc({"doctype": "DocType", "name": "Etapa Devolucao", "module": "Selling", "custom": 1, "istable": 1, "editable_grid": 1, "fields": [
        {"fieldname": "etapa", "label": "Etapa", "fieldtype": "Select", "options": "SAC\nVera\nDirceu\nDecisão\nFinanceiro", "reqd": 1, "in_list_view": 1},
        {"fieldname": "feita", "label": "Feita", "fieldtype": "Check", "in_list_view": 1},
        {"fieldname": "quem", "label": "Quem atendeu", "fieldtype": "Data", "in_list_view": 1},
        {"fieldname": "data", "label": "Data", "fieldtype": "Datetime", "in_list_view": 1},
        {"fieldname": "detalhe", "label": "Conversa / detalhe", "fieldtype": "Small Text"}]}).insert(ignore_permissions=True)
if not frappe.db.exists("DocType", "Pedido Problematico"):
    frappe.get_doc({
        "doctype": "DocType", "name": "Pedido Problematico", "module": "Selling", "custom": 1, "autoname": "PROB-.#####", "title_field": "cliente", "track_changes": 1,
        "search_fields": "cliente,pedido,telefone", "sort_field": "modified", "sort_order": "DESC",
        "fields": [
            {"fieldname": "tipo", "label": "Tipo", "fieldtype": "Select", "options": "Urgente\nDevolução\nDefeito", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
            {"fieldname": "status", "label": "Status", "fieldtype": "Select", "options": "Não realizada\nRealizada\nPerdido", "default": "Não realizada", "in_list_view": 1, "in_standard_filter": 1},
            {"fieldname": "cb1", "fieldtype": "Column Break"},
            {"fieldname": "pedido", "label": "Pedido", "fieldtype": "Link", "options": "Sales Order", "reqd": 1, "in_list_view": 1},
            {"fieldname": "cliente", "label": "Cliente", "fieldtype": "Data", "fetch_from": "pedido.customer_name", "in_list_view": 1},
            {"fieldname": "telefone", "label": "Telefone", "fieldtype": "Data", "length": 40},
            {"fieldname": "sec_dados", "label": "Dados", "fieldtype": "Section Break"},
            {"fieldname": "data_entrega_combinada", "label": "Data de entrega combinada", "fieldtype": "Date", "depends_on": "eval:doc.tipo=='Urgente'", "mandatory_depends_on": "eval:doc.tipo=='Urgente'", "in_list_view": 1},
            {"fieldname": "forma_pagamento", "label": "Forma de pagamento", "fieldtype": "Data", "depends_on": "eval:doc.tipo=='Devolução'"},
            {"fieldname": "valor", "label": "Valor da devolução", "fieldtype": "Currency", "depends_on": "eval:doc.tipo=='Devolução'"},
            {"fieldname": "causa", "label": "Causa", "fieldtype": "Small Text", "depends_on": "eval:doc.tipo=='Defeito'", "mandatory_depends_on": "eval:doc.tipo=='Defeito'"},
            {"fieldname": "motorista", "label": "Motorista", "fieldtype": "Data", "depends_on": "eval:doc.tipo=='Defeito'"},
            {"fieldname": "acao", "label": "Ação", "fieldtype": "Small Text", "depends_on": "eval:doc.tipo=='Defeito'"},
            {"fieldname": "prazo_acao", "label": "Prazo da ação", "fieldtype": "Date", "depends_on": "eval:doc.tipo=='Defeito'"},
            {"fieldname": "sec_dev", "label": "Atendimento da devolução (SAC, Vera, Dirceu, Decisão, Financeiro)", "fieldtype": "Section Break", "depends_on": "eval:doc.tipo=='Devolução'"},
            {"fieldname": "etapas", "label": "Etapas", "fieldtype": "Table", "options": "Etapa Devolucao"},
            {"fieldname": "decisao", "label": "Decisão", "fieldtype": "Select", "options": "\nMantém o pedido\nCliente quer cancelar"},
        ], "permissions": PERMS}).insert(ignore_permissions=True)
for original, trad in (("Pedido Problematico", "Pedido Problemático"), ("Etapa Devolucao", "Etapa da Devolução")):
    if not frappe.db.exists("Translation", {"source_text": original, "language": "pt-BR"}):
        frappe.get_doc({"doctype": "Translation", "language": "pt-BR", "source_text": original, "translated_text": trad}).insert(ignore_permissions=True)
frappe.db.commit()

# ---- pagina
ROTA, PASTA, TITULO, ORIGEM = "pedidos-dashboard", "pedidos_dashboard", "Pedidos", "/tmp/pedidos-dashboard"
ROLES = ["System Manager", "Gestor Comercial", "Sales Manager", "Gerente de Loja", "Accounts Manager", "Manufacturing Manager"]
pasta = frappe.get_app_path("erpnext", "selling", "page", PASTA)
os.makedirs(pasta, exist_ok=True)
for ext in ("js", "css"):
    shutil.copyfile(ORIGEM + "." + ext, os.path.join(pasta, PASTA + "." + ext))
open(os.path.join(pasta, "__init__.py"), "a").close()
frappe.db.sql("delete from `tabHas Role` where parenttype='Page' and parent=%s", ROTA)
frappe.db.sql("delete from tabPage where name=%s", ROTA)
frappe.get_doc({"doctype": "Page", "name": ROTA, "page_name": ROTA, "title": TITULO, "module": "Selling", "standard": "Yes", "system_page": 0}).db_insert()
for papel in ROLES:
    if frappe.db.exists("Role", papel):
        frappe.get_doc({"doctype": "Has Role", "parent": ROTA, "parenttype": "Page", "parentfield": "roles", "role": papel}).db_insert()
frappe.db.commit()
frappe.clear_cache()
print("PEDIDOS_OK", ROTA)
