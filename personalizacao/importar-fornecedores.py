"""Cria no ERPNext os fornecedores (Supplier) que aparecem nos pedidos de compra do Nomus.

Uso (container backend, pasta do bench):
  echo 'exec(open("/tmp/importar-fornecedores.py", encoding="utf-8").read(), globals())' | bench --site erp.gferro.com.br console
Espera /tmp/fornecedores.json: lista de {nome, doc (CNPJ/CPF), pf (pessoa fisica), ativo}. Idempotente (ignora quem ja existe).
"""
import json

import frappe
from frappe.utils.nestedset import get_root_of

frappe.local.lang = "pt-BR"


def nome(doctype, ingles):
    """Nome do cadastro de fabrica: a traducao pt-BR se ela existir (depois de traduzir-cadastros.py), senao o original em ingles."""
    traduzido = frappe._(ingles)
    return traduzido if frappe.db.exists(doctype, traduzido) else ingles


fornecedores = json.load(open("/tmp/fornecedores.json", encoding="utf-8"))
grupo = get_root_of("Supplier Group")
criados = existentes = 0
for f in fornecedores:
    nome = f["nome"][:140]
    if frappe.db.exists("Supplier", nome):
        existentes += 1
        continue
    frappe.get_doc({"doctype": "Supplier", "supplier_name": nome, "supplier_group": grupo,
                    "supplier_type": "Individual" if f["pf"] else "Company", "tax_id": f["doc"] or None,
                    "disabled": 0 if f["ativo"] else 1}).insert(ignore_permissions=True)
    criados += 1
frappe.db.commit()
print("RESULTADO fornecedores criados=%d ja_existiam=%d total_no_erp=%d" % (criados, existentes, frappe.db.count("Supplier")))
