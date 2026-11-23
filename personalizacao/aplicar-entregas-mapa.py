"""Dashboard > Entregas e Dashboard > Mapa da Intranet no ERP (paginas "entregas-dashboard" e "mapa-pedidos", modulo Vendas).

Uso (container backend): copiar entregas-dashboard.js/.css e mapa-pedidos.js/.css para /tmp/, copiar mapa/estados.json e
mapa/municipios.json para apps/erpnext/erpnext/public/gferro/mapa/ e rodar
  echo 'exec(open("/tmp/aplicar-entregas-mapa.py").read(), globals())' | bench --site erp.gferro.com.br console
Depois: clear-cache. Pode rodar de novo.
"""
import os
import shutil

import frappe

ROLES = ["System Manager", "Gestor Comercial", "Sales Manager", "Gerente de Loja", "Accounts Manager", "Manufacturing Manager"]
PAGINAS = (("entregas-dashboard", "entregas_dashboard", "Entregas", "/tmp/entregas-dashboard"), ("mapa-pedidos", "mapa_pedidos", "Mapa", "/tmp/mapa-pedidos"))
for rota, pasta_nome, titulo, origem in PAGINAS:
    pasta = frappe.get_app_path("erpnext", "selling", "page", pasta_nome)
    os.makedirs(pasta, exist_ok=True)
    for ext in ("js", "css"):
        shutil.copyfile(origem + "." + ext, os.path.join(pasta, pasta_nome + "." + ext))
    open(os.path.join(pasta, "__init__.py"), "a").close()
    frappe.db.sql("delete from `tabHas Role` where parenttype='Page' and parent=%s", rota)
    frappe.db.sql("delete from tabPage where name=%s", rota)
    frappe.get_doc({"doctype": "Page", "name": rota, "page_name": rota, "title": titulo, "module": "Selling", "standard": "Yes", "system_page": 0}).db_insert()
    for papel in ROLES:
        if frappe.db.exists("Role", papel):
            frappe.get_doc({"doctype": "Has Role", "parent": rota, "parenttype": "Page", "parentfield": "roles", "role": papel}).db_insert()
frappe.db.commit()
frappe.clear_cache()
print("ENTREGAS_MAPA_OK", [p[0] for p in PAGINAS])
