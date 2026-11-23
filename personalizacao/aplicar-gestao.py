"""Dashboard > Gestao (Metas Mensais) da Intranet no ERP: DocType "Meta Mensal de Loja" (mes + loja + valor) e a pagina /desk/gestao-metas (modulo Vendas).
Sem meta salva para o mes, vale a meta padrao da Intranet (Loja 1 R$ 650 mil, Loja 2 R$ 700 mil, Loja 3 R$ 750 mil, Lojas 4 e 5 R$ 250 mil).

Uso (container backend): copiar gestao-metas.js/.css para /tmp/ e rodar
  echo 'exec(open("/tmp/aplicar-gestao.py").read(), globals())' | bench --site erp.gferro.com.br console
"""
import os
import shutil

import frappe

PERMS = [{"role": r, "read": 1, "write": 1, "create": 1, "delete": d, "print": 1, "export": 1, "email": 0, "share": 0}
         for r, d in (("System Manager", 1), ("Gestor Comercial", 1), ("Accounts Manager", 0), ("Sales Manager", 0)) if frappe.db.exists("Role", r)]
if not frappe.db.exists("DocType", "Meta Mensal de Loja"):
    frappe.get_doc({"doctype": "DocType", "name": "Meta Mensal de Loja", "module": "Selling", "custom": 1, "autoname": "hash", "title_field": "loja", "fields": [
        {"fieldname": "mes", "label": "Mês (AAAA-MM)", "fieldtype": "Data", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
        {"fieldname": "loja", "label": "Loja", "fieldtype": "Link", "options": "Branch", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
        {"fieldname": "valor", "label": "Meta (R$)", "fieldtype": "Currency", "reqd": 1, "in_list_view": 1}], "permissions": PERMS}).insert(ignore_permissions=True)
    frappe.db.commit()
if not frappe.db.exists("Translation", {"source_text": "Meta Mensal de Loja", "language": "pt-BR"}):
    frappe.get_doc({"doctype": "Translation", "language": "pt-BR", "source_text": "Meta Mensal de Loja", "translated_text": "Meta Mensal de Loja"}).insert(ignore_permissions=True)
ROTA, PASTA, TITULO = "gestao-metas", "gestao_metas", "Gestão"
pasta = frappe.get_app_path("erpnext", "selling", "page", PASTA)
os.makedirs(pasta, exist_ok=True)
for ext in ("js", "css"):
    shutil.copyfile("/tmp/%s.%s" % (ROTA, ext), os.path.join(pasta, PASTA + "." + ext))
open(os.path.join(pasta, "__init__.py"), "a").close()
frappe.db.sql("delete from `tabHas Role` where parenttype='Page' and parent=%s", ROTA)
frappe.db.sql("delete from tabPage where name=%s", ROTA)
frappe.get_doc({"doctype": "Page", "name": ROTA, "page_name": ROTA, "title": TITULO, "module": "Selling", "standard": "Yes", "system_page": 0}).db_insert()
for papel in ("System Manager", "Gestor Comercial", "Sales Manager", "Accounts Manager"):
    if frappe.db.exists("Role", papel):
        frappe.get_doc({"doctype": "Has Role", "parent": ROTA, "parenttype": "Page", "parentfield": "roles", "role": papel}).db_insert()
frappe.db.commit()
frappe.clear_cache()
print("GESTAO_OK", ROTA)
