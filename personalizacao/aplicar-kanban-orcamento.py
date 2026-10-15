"""Quadro Kanban do Orçamento por etapa (todo orçamento novo nasce em "Rascunho").

O status padrão do ERP é gravado em inglês (Draft, Open...) e não casa com as colunas em português.
Este script cria o campo "Etapa do orçamento", ligado ao quadro "Orçamentos".

Uso (container backend, pasta do bench):
  echo 'exec(open("/tmp/aplicar-kanban-orcamento.py").read(), globals())' | bench --site erp.gferro.com.br console
Pode rodar de novo. Rode aplicar-layout-orcamento.py depois (ele coloca o campo no formulário).
"""
import json

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

ETAPAS = [
    ("Rascunho", "Gray"),
    ("Enviado ao cliente", "Blue"),
    ("Em negociação", "Orange"),
    ("Aprovado", "Green"),
    ("Pedido gerado", "Purple"),
    ("Perdido", "Red"),
    ("Cancelado", "Gray"),
    ("Expirado", "Gray"),
]
QUADRO = "Orçamentos"

# 1) campo Etapa (padrao Rascunho; pode mudar mesmo com o orçamento enviado)
if not frappe.db.exists("Custom Field", "Quotation-etapa"):
    create_custom_field("Quotation", {
        "fieldname": "etapa", "label": "Etapa do orçamento", "fieldtype": "Select",
        "options": "\n".join(e for e, _ in ETAPAS), "default": "Rascunho", "insert_after": "vendedor",
        "allow_on_submit": 1, "in_standard_filter": 1, "in_list_view": 1,
    })

# 2) todo orçamento sem etapa vai para Rascunho
frappe.db.sql("update tabQuotation set etapa='Rascunho' where etapa is null or etapa=''")

# 3) quadro Kanban lendo a etapa
if frappe.db.exists("Kanban Board", QUADRO):
    q = frappe.get_doc("Kanban Board", QUADRO)
else:
    q = frappe.new_doc("Kanban Board")
    q.kanban_board_name = QUADRO
q.reference_doctype = "Quotation"
q.field_name = "etapa"
q.show_labels = 0
q.fields = json.dumps(["customer_name", "grand_total", "valid_till", "vendedor"])
q.set("columns", [])
for nome, cor in ETAPAS:
    q.append("columns", {"column_name": nome, "status": "Active", "indicator": cor})
if q.is_new():
    q.insert(ignore_permissions=True)
else:
    q.save(ignore_permissions=True)

frappe.db.commit()
frappe.clear_cache()
print("KANBAN_OK", frappe.db.sql("select name, etapa from tabQuotation"))
