"""Dashboard > Financeiro da Intranet no ERP: Saidas, Programacao (contas programadas) e Placas de EPS.

- DocType "Classificacao Financeira" (catalogo do Nomus: 14 grupos da DRE e 112 classificacoes) e o campo "Classificacao financeira" em
  Fatura de Compra, Fatura de Venda, Lancamento de Pagamento (Payment Entry) e Lancamento Contabil; as faturas de abertura NOMUS-P-<id> recebem
  a classificacao da conta do Nomus.
- DocType "Conta Programada" (nome, data, valor, autorizado, pago), "Lancamento EPS" e "Configuracao EPS" (precos de bloco e fornecedor).
- Paginas /desk/saidas-financeiras, /desk/programacao-contas e /desk/placas-eps (modulo Contas).

Uso (container backend): copiar financeiro-classificacoes.json e os .js/.css das tres paginas para /tmp/ e rodar
  echo 'exec(open("/tmp/aplicar-financeiro.py").read(), globals())' | bench --site erp.gferro.com.br console
Depois: clear-cache. Pode rodar de novo.
"""
import json
import os
import shutil

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

ROLES_FIN = ["System Manager", "Accounts Manager", "Accounts User", "Gestor Comercial"]
PERMS = [{"role": r, "read": 1, "write": 1, "create": 1, "delete": d, "print": 1, "export": 1, "email": 0, "share": 0}
         for r, d in (("System Manager", 1), ("Accounts Manager", 1), ("Accounts User", 0), ("Gestor Comercial", 0)) if frappe.db.exists("Role", r)]
D = json.load(open("/tmp/financeiro-classificacoes.json", encoding="utf-8"))

# ---- classificacao financeira
if not frappe.db.exists("DocType", "Classificacao Financeira"):
    frappe.get_doc({"doctype": "DocType", "name": "Classificacao Financeira", "module": "Accounts", "custom": 1, "autoname": "field:codigo", "naming_rule": "By fieldname",
                    "title_field": "nome", "search_fields": "nome,grupo", "fields": [
        {"fieldname": "codigo", "label": "Código", "fieldtype": "Data", "reqd": 1, "unique": 1, "in_list_view": 1},
        {"fieldname": "nome", "label": "Nome", "fieldtype": "Data", "reqd": 1, "in_list_view": 1},
        {"fieldname": "grupo", "label": "Título da DRE", "fieldtype": "Data", "in_list_view": 1, "in_standard_filter": 1}], "permissions": PERMS}).insert(ignore_permissions=True)
    frappe.db.commit()
novas = 0
for cod, nome in D["classificacoes"].items():
    if not frappe.db.exists("Classificacao Financeira", cod):
        frappe.get_doc({"doctype": "Classificacao Financeira", "codigo": cod, "nome": nome, "grupo": D["grupos"].get(cod.split(".")[0], "")}).insert(ignore_permissions=True)
        novas += 1
for dt in ("Purchase Invoice", "Sales Invoice", "Payment Entry", "Journal Entry"):
    if not frappe.db.exists("Custom Field", dt + "-classificacao_financeira"):
        create_custom_field(dt, {"fieldname": "classificacao_financeira", "label": "Classificação financeira", "fieldtype": "Link", "options": "Classificacao Financeira",
                                 "insert_after": "posting_date", "allow_on_submit": 1})
frappe.db.commit()
marcadas = 0
for pid, cod in D["contas_pagar"].items():
    nome = "NOMUS-P-" + pid
    if cod in D["classificacoes"] and frappe.db.exists("Purchase Invoice", nome):
        frappe.db.set_value("Purchase Invoice", nome, "classificacao_financeira", cod, update_modified=False)
        marcadas += 1
frappe.db.commit()
print("CLASSIFICACOES_OK novas", novas, "faturas de abertura classificadas", marcadas)

# ---- conta programada
if not frappe.db.exists("DocType", "Conta Programada"):
    frappe.get_doc({"doctype": "DocType", "name": "Conta Programada", "module": "Accounts", "custom": 1, "autoname": "hash", "title_field": "nome", "track_changes": 1, "fields": [
        {"fieldname": "nome", "label": "Nome da conta", "fieldtype": "Data", "reqd": 1, "in_list_view": 1},
        {"fieldname": "data", "label": "Data", "fieldtype": "Date", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
        {"fieldname": "valor", "label": "Valor (R$)", "fieldtype": "Currency", "in_list_view": 1},
        {"fieldname": "autorizado", "label": "Autorizado", "fieldtype": "Check", "in_list_view": 1, "in_standard_filter": 1},
        {"fieldname": "pago", "label": "Pago", "fieldtype": "Check", "in_list_view": 1, "in_standard_filter": 1}], "permissions": PERMS}).insert(ignore_permissions=True)

# ---- EPS
TIPOS = "TRAPEZIO_TR25\nTRAPEZIO_TR40\nFORRO_TR25\nFORRO_TR40"
if not frappe.db.exists("DocType", "Lancamento EPS"):
    frappe.get_doc({"doctype": "DocType", "name": "Lancamento EPS", "module": "Manufacturing", "custom": 1, "autoname": "hash", "title_field": "tipo", "track_changes": 1, "fields": [
        {"fieldname": "data", "label": "Data", "fieldtype": "Date", "reqd": 1, "default": "Today", "in_list_view": 1, "in_standard_filter": 1},
        {"fieldname": "tipo", "label": "Tipo de placa", "fieldtype": "Select", "options": TIPOS, "reqd": 1, "in_list_view": 1},
        {"fieldname": "blocos", "label": "Blocos usados", "fieldtype": "Int", "reqd": 1, "in_list_view": 1},
        {"fieldname": "placas", "label": "Placas produzidas", "fieldtype": "Int", "reqd": 1, "in_list_view": 1},
        {"fieldname": "esperado", "label": "Placas esperadas", "fieldtype": "Int", "in_list_view": 1},
        {"fieldname": "colaborador", "label": "Colaborador", "fieldtype": "Data", "in_list_view": 1},
        {"fieldname": "matricula", "label": "Matrícula", "fieldtype": "Link", "options": "Operador"},
        {"fieldname": "observacao", "label": "Observação", "fieldtype": "Small Text"},
        {"fieldname": "sec_c2", "label": "Caixa 2", "fieldtype": "Section Break"},
        {"fieldname": "caixa2_transferido", "label": "Diferença transferida", "fieldtype": "Check", "in_standard_filter": 1},
        {"fieldname": "caixa2_valor", "label": "Valor transferido (R$)", "fieldtype": "Currency", "read_only": 1},
        {"fieldname": "caixa2_por", "label": "Confirmado por", "fieldtype": "Data", "read_only": 1},
        {"fieldname": "caixa2_em", "label": "Confirmado em", "fieldtype": "Datetime", "read_only": 1}], "permissions": PERMS + [{"role": "Manufacturing User", "read": 1, "write": 1, "create": 1}]}).insert(ignore_permissions=True)
if not frappe.db.exists("DocType", "Configuracao EPS"):
    frappe.get_doc({"doctype": "DocType", "name": "Configuracao EPS", "module": "Manufacturing", "custom": 1, "issingle": 1, "fields": [
        {"fieldname": "sec_t", "label": "Trapézio", "fieldtype": "Section Break"},
        {"fieldname": "trap_bloco", "label": "Preço do bloco (R$)", "fieldtype": "Currency", "default": "230"},
        {"fieldname": "trap_placas", "label": "Placas por bloco", "fieldtype": "Int", "default": "40"},
        {"fieldname": "trap_forn", "label": "Preço da placa no fornecedor (R$)", "fieldtype": "Currency", "default": "9.5"},
        {"fieldname": "sec_f", "label": "Telha forro", "fieldtype": "Section Break"},
        {"fieldname": "forro_bloco", "label": "Preço do bloco (R$)", "fieldtype": "Currency", "default": "230"},
        {"fieldname": "forro_placas", "label": "Placas por bloco", "fieldtype": "Int", "default": "20"},
        {"fieldname": "forro_forn", "label": "Preço da placa no fornecedor (R$)", "fieldtype": "Currency", "default": "20"}], "permissions": PERMS}).insert(ignore_permissions=True)
for original, trad in (("Classificacao Financeira", "Classificação Financeira"), ("Lancamento EPS", "Lançamento de EPS"), ("Configuracao EPS", "Configuração de EPS")):
    if not frappe.db.exists("Translation", {"source_text": original, "language": "pt-BR"}):
        frappe.get_doc({"doctype": "Translation", "language": "pt-BR", "source_text": original, "translated_text": trad}).insert(ignore_permissions=True)
cfg = frappe.get_single("Configuracao EPS")
if not cfg.trap_bloco:
    cfg.update({"trap_bloco": 230, "trap_placas": 40, "trap_forn": 9.5, "forro_bloco": 230, "forro_placas": 20, "forro_forn": 20})
    cfg.save(ignore_permissions=True)
frappe.db.commit()

# ---- paginas
PAGINAS = (("saidas-financeiras", "saidas_financeiras", "Saídas"), ("programacao-contas", "programacao_contas", "Programação"), ("placas-eps", "placas_eps", "Placas de EPS"))
for rota, pasta_nome, titulo in PAGINAS:
    pasta = frappe.get_app_path("erpnext", "accounts", "page", pasta_nome)
    os.makedirs(pasta, exist_ok=True)
    for ext in ("js", "css"):
        shutil.copyfile("/tmp/%s.%s" % (rota, ext), os.path.join(pasta, pasta_nome + "." + ext))
    open(os.path.join(pasta, "__init__.py"), "a").close()
    frappe.db.sql("delete from `tabHas Role` where parenttype='Page' and parent=%s", rota)
    frappe.db.sql("delete from tabPage where name=%s", rota)
    frappe.get_doc({"doctype": "Page", "name": rota, "page_name": rota, "title": titulo, "module": "Accounts", "standard": "Yes", "system_page": 0}).db_insert()
    roles = ROLES_FIN + (["Manufacturing User", "Manufacturing Manager"] if rota == "placas-eps" else [])
    for papel in roles:
        if frappe.db.exists("Role", papel):
            frappe.get_doc({"doctype": "Has Role", "parent": rota, "parenttype": "Page", "parentfield": "roles", "role": papel}).db_insert()
frappe.db.commit()
frappe.clear_cache()
print("FINANCEIRO_OK", [p[0] for p in PAGINAS])
