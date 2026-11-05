"""Cria no ERPNext os vendedores do Nomus como "Sales Person" (sob a raiz "Sales Team").

Uso (container backend, pasta do bench):
  echo 'exec(open("/tmp/importar-vendedores.py", encoding="utf-8").read(), globals())' | bench --site erp.gferro.com.br console
Espera /tmp/vendedores.json (recurso "vendedores" coletado do Nomus). Pode rodar de novo: quem ja existe e ignorado.
Nao cria usuarios nem mexe em permissoes: so o cadastro de vendedores.
"""
import json

import frappe

vendedores = json.load(open("/tmp/vendedores.json", encoding="utf-8"))
criados = existentes = 0
for v in vendedores:
    nome = (v.get("nome") or "").strip()
    if not nome:
        continue
    if frappe.db.exists("Sales Person", nome):
        existentes += 1
        continue
    frappe.get_doc({"doctype": "Sales Person", "sales_person_name": nome, "parent_sales_person": "Sales Team",
                    "is_group": 0, "enabled": 1}).insert(ignore_permissions=True)
    criados += 1
frappe.db.commit()
print("RESULTADO vendedores criados=%d ja_existiam=%d total_no_erp=%d" % (criados, existentes, frappe.db.count("Sales Person")))
