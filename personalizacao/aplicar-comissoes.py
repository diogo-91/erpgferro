"""Tela "Comissões" (fechamento mensal dos vendedores) trazida da Intranet, calculada com os dados do ERP.

- Campo "Loja" no vendedor (Sales Person), preenchido pelo mapeamento vendedor -> loja da Intranet (comissoes-vendedor-loja.json).
- Campo "Termo de aceite" (Sim/Não) no Pedido de Venda (editável com o pedido confirmado).
- DocType "Ajuste de Comissao" (mês + vendedor + valor + observação) e "Configuracao Comissao" (taxa padrão e faixas de frete).
- Página /desk/comissoes-fabrica (Vendas). Substitui o relatório "Comissão de Vendedores".

Uso (container backend, pasta do bench): copiar comissoes-fabrica.js/.css e comissoes-vendedor-loja.json para /tmp/ e rodar
  echo 'exec(open("/tmp/aplicar-comissoes.py").read(), globals())' | bench --site erp.gferro.com.br console
Depois: clear-cache. Pode rodar de novo.
"""
import json
import os
import re
import shutil
import unicodedata

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

PAPEIS = [("System Manager", 1), ("Gestor Comercial", 1), ("Accounts Manager", 1), ("Sales Manager", 1)]
PERMS = [{"role": r, "read": 1, "write": w, "create": w, "delete": w, "print": 1, "export": 1, "email": 0, "share": 0} for r, w in PAPEIS if frappe.db.exists("Role", r)]

# ---- campos
if not frappe.db.exists("Custom Field", "Sales Person-loja"):
    create_custom_field("Sales Person", {"fieldname": "loja", "label": "Loja", "fieldtype": "Link", "options": "Branch", "insert_after": "parent_sales_person", "in_list_view": 1})
if not frappe.db.exists("Custom Field", "Sales Order-termo_aceite"):
    create_custom_field("Sales Order", {"fieldname": "termo_aceite", "label": "Termo de aceite", "fieldtype": "Select", "options": "\nSim\nNão",
                                        "insert_after": "etapa_pedido", "allow_on_submit": 1, "no_copy": 1})

# ---- DocTypes
if not frappe.db.exists("DocType", "Faixa Comissao Frete"):
    frappe.get_doc({"doctype": "DocType", "name": "Faixa Comissao Frete", "module": "Selling", "custom": 1, "istable": 1, "editable_grid": 1, "fields": [
        {"fieldname": "minimo", "label": "Frete a partir de (R$)", "fieldtype": "Currency", "reqd": 1, "in_list_view": 1},
        {"fieldname": "comissao", "label": "Comissão (R$)", "fieldtype": "Currency", "reqd": 1, "in_list_view": 1}]}).insert(ignore_permissions=True)
if not frappe.db.exists("DocType", "Configuracao Comissao"):
    frappe.get_doc({"doctype": "DocType", "name": "Configuracao Comissao", "module": "Selling", "custom": 1, "issingle": 1, "fields": [
        {"fieldname": "taxa_padrao", "label": "Taxa de comissão de vendas (% do valor recebido)", "fieldtype": "Float", "default": "2"},
        {"fieldname": "faixas", "label": "Faixas de comissão de frete (por pedido)", "fieldtype": "Table", "options": "Faixa Comissao Frete"}],
        "permissions": PERMS}).insert(ignore_permissions=True)
if not frappe.db.exists("DocType", "Ajuste de Comissao"):
    frappe.get_doc({"doctype": "DocType", "name": "Ajuste de Comissao", "module": "Selling", "custom": 1, "autoname": "hash", "title_field": "vendedor", "fields": [
        {"fieldname": "mes", "label": "Mês (AAAA-MM)", "fieldtype": "Data", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
        {"fieldname": "vendedor", "label": "Vendedor", "fieldtype": "Data", "reqd": 1, "in_list_view": 1},
        {"fieldname": "valor", "label": "Valor (R$)", "fieldtype": "Currency", "in_list_view": 1, "description": "Positivo soma, negativo desconta."},
        {"fieldname": "observacao", "label": "Observação", "fieldtype": "Data", "length": 200}], "permissions": PERMS}).insert(ignore_permissions=True)
frappe.db.commit()
cfg = frappe.get_single("Configuracao Comissao")
if not cfg.get("faixas"):
    cfg.taxa_padrao = 2
    for minimo, com in ((110, 10), (150, 13.5), (200, 16), (250, 22)):
        cfg.append("faixas", {"minimo": minimo, "comissao": com})
    cfg.save(ignore_permissions=True)


# ---- loja de cada vendedor (mapeamento da Intranet)
def norm(t):
    return re.sub(r"\s+", " ", "".join(c for c in unicodedata.normalize("NFD", t or "") if unicodedata.category(c) != "Mn")).strip().upper()


M = json.load(open("/tmp/comissoes-vendedor-loja.json", encoding="utf-8"))
por_nome = {norm(n): l for n, l in M["vendedor_loja"].items()}
por_primeiro = {norm(n): l for n, l in M["por_primeiro_nome"].items()}
marcados = 0
for sp in frappe.get_all("Sales Person", filters={"is_group": 0}, fields=["name", "loja"]):
    if sp.loja:
        continue
    id_loja = por_nome.get(norm(sp.name)) or por_primeiro.get(norm(sp.name).split(" ")[0])
    if id_loja and M["lojas"].get(id_loja) and frappe.db.exists("Branch", M["lojas"][id_loja]):
        frappe.db.set_value("Sales Person", sp.name, "loja", M["lojas"][id_loja], update_modified=False)
        marcados += 1
frappe.db.commit()
print("VENDEDORES_COM_LOJA", marcados, "de", frappe.db.count("Sales Person", {"is_group": 0}))

# ---- pagina
ROTA, PASTA, TITULO, ORIGEM = "comissoes-fabrica", "comissoes_fabrica", "Comissões", "/tmp/comissoes-fabrica"
pasta = frappe.get_app_path("erpnext", "selling", "page", PASTA)
os.makedirs(pasta, exist_ok=True)
for ext in ("js", "css"):
    shutil.copyfile(ORIGEM + "." + ext, os.path.join(pasta, PASTA + "." + ext))
open(os.path.join(pasta, "__init__.py"), "a").close()
frappe.db.sql("delete from `tabHas Role` where parenttype='Page' and parent=%s", ROTA)
frappe.db.sql("delete from tabPage where name=%s", ROTA)
frappe.get_doc({"doctype": "Page", "name": ROTA, "page_name": ROTA, "title": TITULO, "module": "Selling", "standard": "Yes", "system_page": 0}).db_insert()
for papel, _ in PAPEIS:
    if frappe.db.exists("Role", papel):
        frappe.get_doc({"doctype": "Has Role", "parent": ROTA, "parenttype": "Page", "parentfield": "roles", "role": papel}).db_insert()
if frappe.db.exists("Report", "Comissão de Vendedores"):  # a pagina substitui o relatorio provisorio
    frappe.delete_doc("Report", "Comissão de Vendedores", force=True, ignore_permissions=True)
frappe.db.commit()
frappe.clear_cache()
print("COMISSOES_OK", ROTA)
