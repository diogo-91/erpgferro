"""Dashboard > Producao da Intranet no ERP: pagina /desk/producao-dashboard/painel (ordens em execucao + Relatorio de Producao) e
/desk/producao-dashboard/planejamento (Planejamento da Producao). Dados: Ordens de Servico e Apontamentos do ERP.

Uso (container backend): copiar producao-dashboard.js/.css para /tmp/ e rodar
  echo 'exec(open("/tmp/aplicar-producao-dashboard.py").read(), globals())' | bench --site erp.gferro.com.br console
"""
import os
import shutil

import frappe

ROTA, PASTA, TITULO = "producao-dashboard", "producao_dashboard", "Produção"
pasta = frappe.get_app_path("erpnext", "manufacturing", "page", PASTA)
os.makedirs(pasta, exist_ok=True)
for ext in ("js", "css"):
    shutil.copyfile("/tmp/%s.%s" % (ROTA, ext), os.path.join(pasta, PASTA + "." + ext))
open(os.path.join(pasta, "__init__.py"), "a").close()
frappe.db.sql("delete from `tabHas Role` where parenttype='Page' and parent=%s", ROTA)
frappe.db.sql("delete from tabPage where name=%s", ROTA)
frappe.get_doc({"doctype": "Page", "name": ROTA, "page_name": ROTA, "title": TITULO, "module": "Manufacturing", "standard": "Yes", "system_page": 0}).db_insert()
for papel in ("System Manager", "Manufacturing Manager", "Manufacturing User", "Gestor Comercial", "Sales Manager"):
    if frappe.db.exists("Role", papel):
        frappe.get_doc({"doctype": "Has Role", "parent": ROTA, "parenttype": "Page", "parentfield": "roles", "role": papel}).db_insert()
frappe.db.commit()
frappe.clear_cache()
print("PRODUCAO_DASH_OK", ROTA)
