"""Cria/atualiza o formato de impressao "Orçamento Gferro" e o define como padrao do Orçamento.

Uso (dentro do container backend, na pasta do bench):
  bench --site erp.gferro.com.br console < /tmp/aplicar-orcamento.py
Espera /tmp/orcamento-gferro.html. Pode rodar de novo (atualiza o HTML).
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field
from frappe.custom.doctype.property_setter.property_setter import make_property_setter

NOME = "Orçamento Gferro"
html = open("/tmp/orcamento-gferro.html", encoding="utf-8").read()

# logo embutido no HTML: o gerador de PDF nao precisa buscar a imagem pela rede
import base64
_logo = base64.b64encode(open("/tmp/gferro-logo.webp", "rb").read()).decode()
html = html.replace("/files/gferro-logo.webp", "data:image/webp;base64," + _logo)

existe = frappe.db.exists("Print Format", NOME)
if existe:
    pf = frappe.get_doc("Print Format", NOME)
else:
    pf = frappe.new_doc("Print Format")
    pf.name = NOME
pf.doc_type = "Quotation"
pf.module = "Selling"
pf.standard = "No"
pf.custom_format = 1
pf.print_format_type = "Jinja"
pf.html = html
pf.disabled = 0
if pf.meta.has_field("pdf_generator"):
    pf.pdf_generator = "chrome"
pf.font_size = 12
pf.margin_top = 10
pf.margin_bottom = 10
pf.margin_left = 10
pf.margin_right = 10
if existe:
    pf.save(ignore_permissions=True)
else:
    pf.insert(ignore_permissions=True)

make_property_setter("Quotation", None, "default_print_format", NOME, "Data", for_doctype=True)

# campo "Vendedor" no orcamento (aparece no modelo)
if not frappe.db.exists("Custom Field", "Quotation-vendedor"):
    create_custom_field("Quotation", {"fieldname": "vendedor", "label": "Vendedor", "fieldtype": "Data",
                                      "insert_after": "valid_till"})

# numeracao CP 00001, CP 00002... (a serie CP e a primeira opcao)
make_property_setter("Quotation", "naming_series", "options", "CP .#####\nSAL-QTN-.YYYY.-", "Text")
make_property_setter("Quotation", "naming_series", "default", "CP .#####", "Text")

# unidades de medida em portugues (renomeia e atualiza todos os itens)
for antigo, novo in (("Square Meter", "M²"), ("Meter", "M")):
    if frappe.db.exists("UOM", antigo) and not frappe.db.exists("UOM", novo):
        frappe.rename_doc("UOM", antigo, novo, force=True)

# colunas "Medida da telha" e "Qtde de pecas" no item do orcamento.
# Subtotal = medida x quantidade de pecas x preco unitario: o campo padrao Qtde guarda medida x pecas.
_campos_item = frappe.get_meta("Quotation Item")
_antes = "quantity_and_rate" if _campos_item.has_field("quantity_and_rate") else "item_name"
for _nome, _rotulo, _depois in (("medida", "Medida da telha (m)", _antes), ("qtd_pecas", "Qtde de peças", "medida")):
    if not frappe.db.exists("Custom Field", "Quotation Item-" + _nome):
        create_custom_field("Quotation Item", {"fieldname": _nome, "label": _rotulo, "fieldtype": "Float",
                                               "insert_after": _depois, "in_list_view": 1, "columns": 1,
                                               "precision": "2"})

_js = chr(10).join([
    "frappe.ui.form.on('Quotation Item', {",
    "  medida: function (frm, cdt, cdn) { gf_calc(frm, cdt, cdn); },",
    "  qtd_pecas: function (frm, cdt, cdn) { gf_calc(frm, cdt, cdn); }",
    "});",
    "function gf_calc(frm, cdt, cdn) {",
    "  var r = locals[cdt][cdn];",
    "  if (r.medida > 0 && r.qtd_pecas > 0) {",
    "    frappe.model.set_value(cdt, cdn, 'qty', flt(r.medida) * flt(r.qtd_pecas));",
    "  }",
    "}",
])
_nome_cs = "Orçamento - medida x quantidade"
if frappe.db.exists("Client Script", _nome_cs):
    _cs = frappe.get_doc("Client Script", _nome_cs)
    _cs.script = _js
    _cs.enabled = 1
    _cs.save(ignore_permissions=True)
else:
    frappe.get_doc({"doctype": "Client Script", "name": _nome_cs, "dt": "Quotation", "view": "Form",
                    "enabled": 1, "script": _js}).insert(ignore_permissions=True)
frappe.db.commit()
frappe.clear_cache()
print("OK", NOME)
