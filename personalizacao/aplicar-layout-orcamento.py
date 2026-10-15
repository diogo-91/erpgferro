"""Reorganiza o formulario do Orçamento num layout profissional (blocos logicos, rotulos em pt-BR).

Uso (container backend, pasta do bench):
  echo 'exec(open("/tmp/aplicar-layout-orcamento.py").read(), globals())' | bench --site erp.gferro.com.br console
Rode depois de aplicar-orcamento.py e aplicar-formulario-orcamento.py. Pode rodar de novo.

Aba 1 "Orçamento": Identificação, Cliente, Itens, Frete e entrega, Totais, Condições de pagamento, Desconto
Aba 2 "Endereços": entrega e empresa      Aba 3 "Observações": termos      Aba 4 "Mais informações": o restante
"""
import json

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field
from frappe.custom.doctype.property_setter.property_setter import make_property_setter

DT = "Quotation"

# 1) secoes/colunas novas
novos = [
    ("gf_cliente_section", "Section Break", "Cliente"),
    ("gf_cliente_col2", "Column Break", None),
    ("gf_cliente_col3", "Column Break", None),
    ("gf_frete_section", "Section Break", "Frete e entrega"),
    ("gf_frete_col", "Column Break", None),
    ("gf_totais_section", "Section Break", "Totais"),
    ("gf_totais_col1", "Column Break", None),
    ("gf_totais_col2", "Column Break", None),
]
for nome, tipo, rotulo in novos:
    if not frappe.db.exists("Custom Field", DT + "-" + nome):
        cfg = {"fieldname": nome, "fieldtype": tipo, "insert_after": "amended_from"}
        if rotulo:
            cfg["label"] = rotulo
        create_custom_field(DT, cfg)

# 2) ordem dos campos
principal = [
    "customer_section", "naming_series", "transaction_date", "column_break_7", "valid_till", "vendedor", "etapa",
    "column_break1", "order_type", "company", "amended_from", "has_unit_price_items",
    "gf_cliente_section", "quotation_to", "party_name", "customer_name", "gf_cliente_col2", "customer_address",
    "address_display", "gf_cliente_col3", "contact_person", "contact_mobile", "contact_display", "contact_email",
    "items_section", "scan_barcode", "last_scanned_warehouse", "items",
    "gf_frete_section", "incoterm", "named_place", "gf_frete_col", "frete_valor", "seguro_valor", "outros_valor",
    "gf_totais_section", "total_qty", "total", "gf_totais_col1", "total_taxes_and_charges", "gf_totais_col2",
    "grand_total", "rounding_adjustment", "rounded_total", "disable_rounded_total", "in_words",
    "payment_schedule_section", "payment_terms_template", "payment_schedule",
    "section_break_44", "apply_discount_on", "base_discount_amount", "coupon_code", "column_break_46",
    "additional_discount_percentage", "discount_amount", "referral_sales_partner",
    "address_and_contact_tab", "billing_address_section", "col_break98",
    "shipping_address_section", "shipping_address_name", "column_break_81", "shipping_address",
    "company_address_section", "company_address", "company_address_display", "column_break_87", "company_contact_person",
    "terms_tab", "terms_section_break", "tc_name", "terms",
    "more_info_tab",
]
atuais = [f.fieldname for f in frappe.get_meta(DT).fields]
ordem = [c for c in principal if c in atuais]
ordem += [c for c in atuais if c not in ordem]
make_property_setter(DT, None, "field_order", json.dumps(ordem), "Data", for_doctype=True)

# 3) rotulos em portugues
rotulos = {
    "customer_section": "Identificação", "naming_series": "Número (série)", "quotation_to": "Orçamento para",
    "party_name": "Cliente", "transaction_date": "Data de emissão", "valid_till": "Válido até",
    "vendedor": "Vendedor", "order_type": "Tipo de pedido", "company": "Empresa",
    "customer_address": "Endereço do cliente", "address_display": "Endereço", "contact_person": "Contato",
    "contact_mobile": "Telefone", "contact_display": "Dados do contato",
    "items_section": "Itens do orçamento", "incoterm": "Frete (Incoterm)", "named_place": "Observação do frete",
    "frete_valor": "Valor do frete", "seguro_valor": "Valor do seguro", "outros_valor": "Outros valores",
    "total_qty": "Quantidade total", "total": "Total das mercadorias", "total_taxes_and_charges": "Frete e acréscimos",
    "grand_total": "Total geral", "rounded_total": "Total arredondado", "in_words": "Valor por extenso",
    "payment_schedule_section": "Condições de pagamento", "payment_terms_template": "Condição de pagamento",
    "payment_schedule": "Parcelas", "section_break_44": "Desconto adicional",
    "address_and_contact_tab": "Endereços", "terms_tab": "Observações",
    "terms_section_break": "Observações e condições comerciais", "tc_name": "Modelo de observações",
    "terms": "Texto das observações", "more_info_tab": "Mais informações",
}
for campo, rotulo in rotulos.items():
    if campo in atuais:
        make_property_setter(DT, campo, "label", rotulo, "Data")

# 4) colunas da tabela de itens
item = "Quotation Item"
grade = {"item_code": 2, "item_name": 2, "medida": 1, "qtd_pecas": 1, "qty": 1, "rate": 1, "amount": 1, "prazo_dias": 1}
for campo in ("uom", "item_name", "item_code", "medida", "qtd_pecas", "qty", "rate", "amount", "prazo_dias"):
    make_property_setter(item, campo, "in_list_view", 1 if campo in grade else 0, "Check")
    if campo in grade:
        make_property_setter(item, campo, "columns", grade[campo], "Int")
rotulos_item = {"item_code": "Código", "item_name": "Produto", "medida": "Medida (m)", "qtd_pecas": "Peças",
                "qty": "Qtde total", "rate": "Preço unit.", "amount": "Subtotal", "prazo_dias": "Prazo (dias)"}
for campo, rotulo in rotulos_item.items():
    make_property_setter(item, campo, "label", rotulo, "Data")

# 5) esconde o que nao e usado no dia a dia
for campo in ("scan_barcode", "last_scanned_warehouse", "customer_name", "rounding_adjustment", "disable_rounded_total"):
    make_property_setter(DT, campo, "hidden", 1, "Check")

frappe.db.commit()
frappe.clear_cache()
print("LAYOUT_OK", len(ordem))
