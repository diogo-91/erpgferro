"""Cria um orçamento de teste com 50% entrada + 50% na entrega e 9 itens, gera o HTML e apaga o teste."""
import frappe

itens = frappe.db.sql("select name from tabItem where is_sales_item=1 and disabled=0 order by name limit 9")
q = frappe.get_doc({
    "doctype": "Quotation", "naming_series": "CP .#####", "quotation_to": "Customer",
    "party_name": "EDUARDO GONÇALVES DE OLIVEIRA", "company": "Grupo Gferro",
    "transaction_date": "2026-10-14", "valid_till": "2026-10-24", "order_type": "Sales", "currency": "BRL",
    "selling_price_list": "Standard Selling", "vendedor": "EDER PULLHEIS",
    "payment_terms_template": "50% entrada + 50% na entrega",
    "incoterm": "CIF", "named_place": "por conta do emitente",
    "items": [{"item_code": r[0], "qty": 10 + i, "rate": 50 + i * 3.5, "medida": 3.5, "qtd_pecas": 2 + i, "prazo_dias": 10 + i}
              for i, r in enumerate(itens)],
    "taxes": [{"charge_type": "Actual", "account_head": "Receita de Frete - GF", "description": "Frete", "tax_amount": 450}],
})
q.insert(ignore_permissions=True)
NOME = q.name
html = frappe.get_print("Quotation", q.name, "Orçamento Gferro", as_pdf=False, no_letterhead=1)
html = html.replace("<head>", '<head><base href="http://frontend:8080/">', 1)
open("/tmp/orc-teste9.html", "w", encoding="utf-8").write(html)
print("T9_OK", q.name, q.grand_total, [(p.payment_term, p.payment_amount) for p in q.payment_schedule])
frappe.delete_doc("Quotation", q.name, ignore_permissions=True, force=True)
frappe.db.commit()
