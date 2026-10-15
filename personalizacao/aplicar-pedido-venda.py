"""Pedido de Venda Gferro: campos, modelo de impressao, numeracao PD e quadro Kanban por etapa.

Uso (container backend, pasta do bench):
  echo 'exec(open("/tmp/aplicar-pedido-venda.py").read(), globals())' | bench --site erp.gferro.com.br console
Espera em /tmp: pedido-gferro.html e gferro-logo.webp. Rode depois de aplicar-formulario-orcamento.py.
Pode rodar de novo.

Os campos novos usam os MESMOS nomes do orçamento (vendedor, frete_valor, medida, qtd_pecas, prazo_dias...),
assim "Criar > Pedido de venda" a partir do orçamento aprovado leva esses dados junto.
"""
import base64
import json

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field
from frappe.custom.doctype.property_setter.property_setter import make_property_setter

DT = "Sales Order"
IT = "Sales Order Item"
EMPRESA = "Grupo Gferro"
NOME_FORMATO = "Pedido de Venda Gferro"
QUADRO = "Pedidos"
ETAPAS = [
    ("Novo pedido", "Gray"),
    ("Aguardando pagamento", "Orange"),
    ("Em produção", "Blue"),
    ("Pronto para retirada", "Purple"),
    ("Em entrega", "Yellow"),
    ("Entregue", "Green"),
    ("Cancelado", "Red"),
]
resultado = []


def campo(doctype, fieldname, rotulo, tipo, depois, **extra):
    if frappe.db.exists("Custom Field", doctype + "-" + fieldname):
        return
    cfg = {"fieldname": fieldname, "label": rotulo, "fieldtype": tipo, "insert_after": depois}
    cfg.update(extra)
    create_custom_field(doctype, cfg)
    resultado.append(fieldname)


# 1) campos do pedido
campo(DT, "vendedor", "Vendedor", "Data", "delivery_date")
campo(DT, "etapa_pedido", "Etapa do pedido", "Select", "vendedor",
      options="\n".join(e for e, _ in ETAPAS), default="Novo pedido",
      allow_on_submit=1, in_standard_filter=1, in_list_view=1)
campo(DT, "obs_pedido", "Observações do pedido", "Small Text", "etapa_pedido", allow_on_submit=1)
campo(DT, "frete_valor", "Valor do frete", "Currency", "obs_pedido", options="currency")
campo(DT, "seguro_valor", "Valor do seguro", "Currency", "frete_valor", options="currency")
campo(DT, "outros_valor", "Outros valores", "Currency", "seguro_valor", options="currency")

meta_item = frappe.get_meta(IT)
antes = "quantity_and_rate" if meta_item.has_field("quantity_and_rate") else "item_name"
campo(IT, "medida", "Medida (m)", "Float", antes, in_list_view=1, columns=1, precision="2")
campo(IT, "qtd_pecas", "Peças", "Float", "medida", in_list_view=1, columns=1)
campo(IT, "prazo_dias", "Prazo (dias)", "Int", "qtd_pecas", in_list_view=1, columns=1)

# grade de itens
grade = {"item_code": 2, "item_name": 2, "medida": 1, "qtd_pecas": 1, "qty": 1, "rate": 1, "amount": 1, "prazo_dias": 1}
for nome in ("uom", "delivery_date", "item_name", "item_code", "medida", "qtd_pecas", "qty", "rate", "amount", "prazo_dias"):
    make_property_setter(IT, nome, "in_list_view", 1 if nome in grade else 0, "Check")
    if nome in grade:
        make_property_setter(IT, nome, "columns", grade[nome], "Int")
for nome, rotulo in {"item_code": "Código", "item_name": "Produto", "qty": "Qtde total", "rate": "Preço unit.",
                     "amount": "Subtotal"}.items():
    make_property_setter(IT, nome, "label", rotulo, "Data")

# 2) etapa para pedidos que ja existem
frappe.db.sql("update `tabSales Order` set etapa_pedido='Novo pedido' where etapa_pedido is null or etapa_pedido=''")

# 3) script do formulario (mesma logica do orçamento)
linhas = [
    "frappe.ui.form.on('Sales Order Item', {",
    "  medida: function (frm, cdt, cdn) { gf_calc(frm, cdt, cdn); },",
    "  qtd_pecas: function (frm, cdt, cdn) { gf_calc(frm, cdt, cdn); },",
    "  prazo_dias: function (frm, cdt, cdn) {",
    "    var r = locals[cdt][cdn];",
    "    if (r.prazo_dias && frm.doc.transaction_date) {",
    "      frappe.model.set_value(cdt, cdn, 'delivery_date', frappe.datetime.add_days(frm.doc.transaction_date, cint(r.prazo_dias)));",
    "    }",
    "  }",
    "});",
    "function gf_calc(frm, cdt, cdn) {",
    "  var r = locals[cdt][cdn];",
    "  if (flt(r.medida) > 0 && flt(r.qtd_pecas) > 0) {",
    "    frappe.model.set_value(cdt, cdn, 'qty', flt(r.medida) * flt(r.qtd_pecas));",
    "  }",
    "}",
    "function gf_taxa(frm, campo, descricao, conta) {",
    "  var valor = flt(frm.doc[campo]);",
    "  var linha = (frm.doc.taxes || []).filter(function (t) { return t.description === descricao; })[0];",
    "  if (!linha && !valor) { return; }",
    "  if (!linha) {",
    "    linha = frm.add_child('taxes');",
    "    linha.charge_type = 'Actual';",
    "    linha.account_head = conta;",
    "    linha.description = descricao;",
    "  }",
    "  frappe.model.set_value(linha.doctype, linha.name, 'tax_amount', valor);",
    "  frm.refresh_field('taxes');",
    "}",
    "frappe.ui.form.on('Sales Order', {",
    "  frete_valor: function (frm) { gf_taxa(frm, 'frete_valor', 'Frete', 'Receita de Frete - GF'); },",
    "  seguro_valor: function (frm) { gf_taxa(frm, 'seguro_valor', 'Seguro', 'Outras Receitas Acessórias - GF'); },",
    "  outros_valor: function (frm) { gf_taxa(frm, 'outros_valor', 'Outros', 'Outras Receitas Acessórias - GF'); }",
    "});",
]
js = chr(10).join(linhas)
nome_cs = "Pedido de venda - medida x quantidade"
if frappe.db.exists("Client Script", nome_cs):
    cs = frappe.get_doc("Client Script", nome_cs)
    cs.script = js
    cs.enabled = 1
    cs.save(ignore_permissions=True)
else:
    frappe.get_doc({"doctype": "Client Script", "name": nome_cs, "dt": DT, "view": "Form",
                    "enabled": 1, "script": js}).insert(ignore_permissions=True)

# 4) numeracao PD 00001... e observacoes padrao
opcoes = (frappe.get_meta(DT).get_field("naming_series").options or "").split(chr(10))
opcoes = ["PD .#####"] + [o for o in opcoes if o and o != "PD .#####"]
make_property_setter(DT, "naming_series", "options", chr(10).join(opcoes), "Text")
make_property_setter(DT, "naming_series", "default", "PD .#####", "Text")
if not frappe.db.exists("Series", "PD "):
    frappe.db.sql("insert into tabSeries (name, current) values ('PD ', 2146)")
if frappe.db.exists("Terms and Conditions", "Condições Gferro"):
    make_property_setter(DT, "tc_name", "default", "Condições Gferro", "Link")

# 5) modelo de impressao
html = open("/tmp/pedido-gferro.html", encoding="utf-8").read()
logo = base64.b64encode(open("/tmp/gferro-logo.webp", "rb").read()).decode()
html = html.replace("/files/gferro-logo.webp", "data:image/webp;base64," + logo)
logo_branco = base64.b64encode(open("/tmp/logo-branco.png", "rb").read()).decode()
html = html.replace("__LOGO__", "data:image/png;base64," + logo_branco)
banner = base64.b64encode(open("/tmp/banner-pedido.webp", "rb").read()).decode()
html = html.replace("__BANNER__", "data:image/webp;base64," + banner)
existe = frappe.db.exists("Print Format", NOME_FORMATO)
pf = frappe.get_doc("Print Format", NOME_FORMATO) if existe else frappe.new_doc("Print Format")
if not existe:
    pf.name = NOME_FORMATO
pf.doc_type = DT
pf.module = "Selling"
pf.standard = "No"
pf.custom_format = 1
pf.print_format_type = "Jinja"
pf.html = html
pf.disabled = 0
pf.font_size = 12
pf.margin_top = pf.margin_bottom = pf.margin_left = pf.margin_right = 1  # (0 vira o padrao de 15 mm) banner e rodape quase de borda a borda
if pf.meta.has_field("pdf_generator"):
    pf.pdf_generator = "chrome"
if existe:
    pf.save(ignore_permissions=True)
else:
    pf.insert(ignore_permissions=True)
make_property_setter(DT, None, "default_print_format", NOME_FORMATO, "Data", for_doctype=True)

# 6) quadro Kanban por etapa
if frappe.db.exists("Kanban Board", QUADRO):
    q = frappe.get_doc("Kanban Board", QUADRO)
else:
    q = frappe.new_doc("Kanban Board")
    q.kanban_board_name = QUADRO
q.reference_doctype = DT
q.field_name = "etapa_pedido"
q.show_labels = 0
q.fields = json.dumps(["customer_name", "grand_total", "delivery_date", "vendedor"])
q.set("columns", [])
for nome, cor in ETAPAS:
    q.append("columns", {"column_name": nome, "status": "Active", "indicator": cor})
if q.is_new():
    q.insert(ignore_permissions=True)
else:
    q.save(ignore_permissions=True)

frappe.db.commit()
frappe.clear_cache()
print("PEDIDO_OK", resultado)
