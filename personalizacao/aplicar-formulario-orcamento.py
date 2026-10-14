"""Deixa o formulario do Orçamento com todos os campos do modelo Gferro.

Uso (dentro do container backend, na pasta do bench):
  echo 'exec(open("/tmp/aplicar-formulario-orcamento.py").read())' | bench --site erp.gferro.com.br console
Rode DEPOIS de aplicar-orcamento.py. Pode rodar de novo.

Cria:
- campos no orçamento: Valor do frete, Valor do seguro, Outros valores
- campo no item: Prazo de entrega (dias)
- script de formulario: medida x peças = qtde; frete/seguro/outros viram linhas de total; prazo vira data
- condições de pagamento: À vista, 50% entrada + 50% na entrega, 100% na entrega
- Termos e Condições "Condições Gferro" (observações do orçamento), usado como padrão
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field
from frappe.custom.doctype.property_setter.property_setter import make_property_setter

EMPRESA = "Grupo Gferro"
resultado = []


def campo(doctype, fieldname, rotulo, tipo, depois, **extra):
    if frappe.db.exists("Custom Field", doctype + "-" + fieldname):
        return
    cfg = {"fieldname": fieldname, "label": rotulo, "fieldtype": tipo, "insert_after": depois}
    cfg.update(extra)
    create_custom_field(doctype, cfg)
    resultado.append("campo " + fieldname)


# 1) campos do orçamento (valores que viram linhas de total)
campo("Quotation", "frete_valor", "Valor do frete", "Currency", "vendedor", options="currency")
campo("Quotation", "seguro_valor", "Valor do seguro", "Currency", "frete_valor", options="currency")
campo("Quotation", "outros_valor", "Outros valores", "Currency", "seguro_valor", options="currency")
campo("Quotation Item", "prazo_dias", "Prazo de entrega (dias)", "Int", "qtd_pecas", in_list_view=1, columns=1)

# 2) contas de receita acessoria
frete = "Receita de Frete - GF"
outras = "Outras Receitas Acessórias - GF"
if frappe.db.exists("Account", frete) and not frappe.db.exists("Account", outras):
    pai = frappe.db.get_value("Account", frete, "parent_account")
    frappe.get_doc({"doctype": "Account", "account_name": "Outras Receitas Acessórias", "company": EMPRESA,
                    "parent_account": pai, "root_type": "Income", "account_type": "Income Account",
                    "is_group": 0}).insert(ignore_permissions=True)
    resultado.append("conta " + outras)

# 3) script do formulario
linhas = [
    "frappe.ui.form.on('Quotation Item', {",
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
    "frappe.ui.form.on('Quotation', {",
    "  frete_valor: function (frm) { gf_taxa(frm, 'frete_valor', 'Frete', 'Receita de Frete - GF'); },",
    "  seguro_valor: function (frm) { gf_taxa(frm, 'seguro_valor', 'Seguro', 'Outras Receitas Acessórias - GF'); },",
    "  outros_valor: function (frm) { gf_taxa(frm, 'outros_valor', 'Outros', 'Outras Receitas Acessórias - GF'); }",
    "});",
]
js = chr(10).join(linhas)
nome_cs = "Orçamento - medida x quantidade"
if frappe.db.exists("Client Script", nome_cs):
    cs = frappe.get_doc("Client Script", nome_cs)
    cs.script = js
    cs.enabled = 1
    cs.save(ignore_permissions=True)
else:
    frappe.get_doc({"doctype": "Client Script", "name": nome_cs, "dt": "Quotation", "view": "Form",
                    "enabled": 1, "script": js}).insert(ignore_permissions=True)

# 4) condicoes de pagamento
def termo(nome, porcao, dias, desc):
    if not frappe.db.exists("Payment Term", nome):
        frappe.get_doc({"doctype": "Payment Term", "payment_term_name": nome, "invoice_portion": porcao,
                        "due_date_based_on": "Day(s) after invoice date", "credit_days": dias,
                        "description": desc}).insert(ignore_permissions=True)


def modelo(nome, partes):
    if frappe.db.exists("Payment Terms Template", nome):
        return
    frappe.get_doc({"doctype": "Payment Terms Template", "template_name": nome,
                    "terms": [{"payment_term": t, "description": d, "invoice_portion": p,
                               "due_date_based_on": "Day(s) after invoice date", "credit_days": c}
                              for (t, d, p, c) in partes]}).insert(ignore_permissions=True)
    resultado.append("condicao " + nome)


termo("À vista", 100, 0, "Pagamento à vista")
termo("Entrada", 50, 0, "Entrada na confirmação do pedido")
# o ERPNext nao aceita duas parcelas com o mesmo vencimento: a "Na entrega" vence 30 dias depois
# (a data pode ser ajustada na tabela de pagamento; a impressão mostra "Na entrega")
termo("Na entrega", 50, 30, "Pagamento na entrega")
termo("100% na entrega", 100, 0, "Pagamento integral na entrega")
modelo("À vista", [("À vista", "Pagamento à vista", 100, 0)])
modelo("50% entrada + 50% na entrega", [("Entrada", "Entrada na confirmação do pedido", 50, 0),
                                         ("Na entrega", "Pagamento na entrega", 50, 30)])
modelo("100% na entrega", [("100% na entrega", "Pagamento integral na entrega", 100, 0)])

# 5) observações padrão do orçamento (Termos e Condições)
itens = [
    "Posição de pedidos: contatar o SAC (15) 99850-7812 — somente WhatsApp, não recebemos ligação.",
    "O descarregamento só é feito mediante o pagamento do valor devido, salvo acordo entre cliente e empresa, com o aval da diretoria.",
    "A descarga é feita somente ao lado do nosso caminhão.",
    "A taxa da maquininha do cartão de crédito é repassada ao cliente.",
    "Não aceitamos alteração nem devolução de dinheiro após o início da produção.",
    "Conferir o pedido na entrega (itens, medidas, quantidades, valores, condições de pagamento, endereço e prazo de entrega).",
    "O recebimento e a conferência devem ser feitos pelo próprio cliente ou por profissional da obra por ele autorizado, no momento do descarregamento.",
    "O cliente é responsável pelas medidas especificadas no pedido.",
    "É necessário quitar 100% do pedido para descarregar o material.",
    "Entregas de acordo com a logística de formação de carga.",
    "Em razão de logística e pintura poderá haver atraso, sem que isso implique responsabilidade civil por parte da GFERRO.",
]
html = "<ol>" + "".join("<li>" + i + "</li>" for i in itens) + "</ol>"
tc = "Condições Gferro"
if frappe.db.exists("Terms and Conditions", tc):
    d = frappe.get_doc("Terms and Conditions", tc)
    d.terms = html
    d.save(ignore_permissions=True)
else:
    frappe.get_doc({"doctype": "Terms and Conditions", "title": tc, "selling": 1, "buying": 0,
                    "terms": html}).insert(ignore_permissions=True)
make_property_setter("Quotation", "tc_name", "default", tc, "Link")

frappe.db.commit()
frappe.clear_cache()
print("FORM_OK", resultado)
