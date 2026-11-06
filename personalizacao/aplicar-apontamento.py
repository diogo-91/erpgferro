"""Ativa o apontamento por codigo de barras: cadastro de Operadores (matricula/cracha), folha unica da Ordem de Servico,
etiquetas, cracha e a pagina "Apontamento de Producao".

Uso (container backend, pasta do bench), com os arquivos de personalizacao/producao e /tmp/operadores.json copiados para /tmp:
  echo 'exec(open("/tmp/aplicar-apontamento.py", encoding="utf-8").read(), globals())' | bench --site erp.gferro.com.br console
Depois: bench --site erp.gferro.com.br clear-cache e reiniciar o backend (o gferro_utils.py e o hooks.py novos).
Pode rodar de novo.

- DocType "Operador": matricula (= codigo de barras do cracha), nome, ativo, limite de apontamentos simultaneos. Dispensa
  o cadastro de funcionarios (Employee) do ERPNext. /tmp/operadores.json (matricula, nome, ativo, limite) e carregado se existir.
- Campos "Operador" e "Matricula" nas linhas de tempo do Apontamento (Job Card).
- Modelos de impressao com codigo de barras Code 128: "Ordem de Servico Gferro" (folha A4 unica com a OS e todos os processos,
  padrao da Ordem de Producao), "Etiquetas de OS Gferro", "Etiqueta de Etapa Gferro" e "Cracha Gferro" (Operador).
- Pagina apontamento-producao (modulo Manufacturing).
"""
import json
import os
import shutil

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field
from frappe.custom.doctype.property_setter.property_setter import make_property_setter

# 1) cadastro de operadores
if not frappe.db.exists("DocType", "Operador"):
    papeis = [("System Manager", 1), ("Manufacturing Manager", 1), ("Manufacturing User", 0)]
    frappe.get_doc({
        "doctype": "DocType", "name": "Operador", "module": "Manufacturing", "custom": 1, "autoname": "field:matricula",
        "naming_rule": "By fieldname", "title_field": "nome", "search_fields": "nome", "sort_field": "modified", "sort_order": "ASC",
        "track_changes": 1, "quick_entry": 1,
        "fields": [
            {"fieldname": "matricula", "label": "Matrícula", "fieldtype": "Data", "reqd": 1, "unique": 1, "in_list_view": 1,
             "description": "É o código de barras do crachá."},
            {"fieldname": "nome", "label": "Nome", "fieldtype": "Data", "reqd": 1, "in_list_view": 1},
            {"fieldname": "ativo", "label": "Ativo", "fieldtype": "Check", "default": "1", "in_list_view": 1},
            {"fieldname": "limite_apontamentos", "label": "Limite de apontamentos simultâneos", "fieldtype": "Int", "default": "1"},
            {"fieldname": "observacoes", "label": "Observações", "fieldtype": "Small Text"},
        ],
        "permissions": [{"role": r, "read": 1, "write": 1, "create": 1, "delete": d, "print": 1, "export": 1, "email": 0, "share": 1}
                        for r, d in papeis],
    }).insert(ignore_permissions=True)

# 2) campos nas linhas de tempo e no apontamento
for dt, campo, rotulo, depois in (("Job Card", "operador", "Operador", "workstation"), ("Job Card Time Log", "operador", "Operador", "employee"),
                                  ("Job Card Time Log", "matricula", "Matrícula", "operador")):
    if not frappe.db.exists("Custom Field", dt + "-" + campo):
        create_custom_field(dt, {"fieldname": campo, "label": rotulo, "fieldtype": "Data", "insert_after": depois, "read_only": 1,
                                 "in_list_view": 1 if dt == "Job Card Time Log" else 0, "no_copy": 1})

# 3) operadores vindos do Nomus (matricula = a do cracha atual)
if os.path.exists("/tmp/operadores.json"):
    novos = 0
    for o in json.load(open("/tmp/operadores.json", encoding="utf-8")):
        m = str(o["matricula"]).strip()
        if m and not frappe.db.exists("Operador", m):
            frappe.get_doc({"doctype": "Operador", "matricula": m, "nome": o["nome"].strip(), "ativo": 1 if o.get("ativo", True) else 0,
                            "limite_apontamentos": o.get("limite") or 1}).insert(ignore_permissions=True)
            novos += 1
    print("operadores criados:", novos)

# 4) modelos de impressao
FORMATOS = (("Ordem de Serviço Gferro", "Work Order", "/tmp/ordem-servico.html"),
            ("Etiquetas de OS Gferro", "Work Order", "/tmp/etiquetas-os.html"),
            ("Etiqueta de Etapa Gferro", "Job Card", "/tmp/etiqueta-etapa.html"),
            ("Crachá Gferro", "Operador", "/tmp/cracha.html"))
for nome, doctype, arquivo in FORMATOS:
    html = open(arquivo, encoding="utf-8").read()
    if frappe.db.exists("Print Format", nome):
        pf = frappe.get_doc("Print Format", nome)
        pf.html = html
        pf.save(ignore_permissions=True)
    else:
        frappe.get_doc({"doctype": "Print Format", "name": nome, "doc_type": doctype, "module": "Manufacturing", "standard": "No",
                        "custom_format": 1, "print_format_type": "Jinja", "html": html, "disabled": 0}).insert(ignore_permissions=True)
make_property_setter("Work Order", None, "default_print_format", "Ordem de Serviço Gferro", "Data", for_doctype=True)
make_property_setter("Operador", None, "default_print_format", "Crachá Gferro", "Data", for_doctype=True)

# 5) pagina de apontamento
ROTA, PASTA, TITULO, ORIGEM = "apontamento-producao", "apontamento_producao", "Apontamento de Produção", "/tmp/apontamento-producao"
ROLES = ["System Manager", "Manufacturing Manager", "Manufacturing User", "Gestor Comercial"]
pasta = frappe.get_app_path("erpnext", "manufacturing", "page", PASTA)
os.makedirs(pasta, exist_ok=True)
for ext in ("js", "css"):
    shutil.copyfile(ORIGEM + "." + ext, os.path.join(pasta, PASTA + "." + ext))
open(os.path.join(pasta, "__init__.py"), "a").close()
frappe.db.sql("delete from `tabHas Role` where parenttype='Page' and parent=%s", ROTA)
frappe.db.sql("delete from tabPage where name=%s", ROTA)
frappe.get_doc({"doctype": "Page", "name": ROTA, "page_name": ROTA, "title": TITULO, "module": "Manufacturing", "standard": "Yes",
                "system_page": 0}).db_insert()
for papel in ROLES:
    if frappe.db.exists("Role", papel):
        frappe.get_doc({"doctype": "Has Role", "parent": ROTA, "parenttype": "Page", "parentfield": "roles", "role": papel}).db_insert()
frappe.db.commit()
frappe.clear_cache()
print("APONTAMENTO_OK", ROTA, "| operadores no ERP:", frappe.db.count("Operador"))
