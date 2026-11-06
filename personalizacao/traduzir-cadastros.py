"""Renomeia para pt-BR os cadastros de fabrica do ERPNext que foram criados em ingles.

O ERPNext cria esses registros ja traduzidos quando instalado em portugues (e o codigo procura alguns deles pelo nome
TRADUZIDO, ex.: _("Standard Selling")). Este site foi criado em ingles, entao os nomes ficaram em ingles. Aqui cada
registro e renomeado para a traducao que o proprio sistema ja tem (frappe._); os vinculos sao atualizados pelo rename_doc.

Uso (container backend, pasta do bench):
  echo 'exec(open("/tmp/traduzir-cadastros.py", encoding="utf-8").read(), globals())' | bench --site erp.gferro.com.br console
Faca backup antes (bench --site erp.gferro.com.br backup). Idempotente: o que ja esta em portugues e ignorado.

Nao renomeia: Warehouse Type (o codigo compara "Transit" em ingles), Role, Workspace, Dashboard, Print Format
(nomes usados em rotas/codigo) e UOM cuja traducao colida com outra unidade.
"""
import frappe

frappe.local.lang = "pt-BR"
DOCTYPES = ["Item Group", "Customer Group", "Supplier Group", "Territory", "Price List", "Mode of Payment", "Designation",
            "Industry Type", "Sales Partner Type", "UOM"]
renomeados = {}
erros = []
ignorados = []
for dt in DOCTYPES:
    nomes = frappe.get_all(dt, pluck="name", limit_page_length=0)
    destinos = {}
    for n in nomes:
        destinos.setdefault(frappe._(n), []).append(n)
    n_ok = 0
    for antigo in nomes:
        novo = frappe._(antigo)
        if novo == antigo:
            continue
        if len(destinos[novo]) > 1 or frappe.db.exists(dt, novo):
            ignorados.append((dt, antigo, novo))  # duas origens para o mesmo destino, ou destino ja existe
            continue
        try:
            frappe.rename_doc(dt, antigo, novo, force=True)
            frappe.db.commit()
            n_ok += 1
        except Exception as e:  # noqa: BLE001 - registra e segue
            frappe.db.rollback()
            erros.append((dt, antigo, novo, str(e).replace("\n", " ")[:150]))
    renomeados[dt] = n_ok
    print("RENOMEADOS", dt, n_ok)
print("TOTAL renomeados:", sum(renomeados.values()), "| ignorados (colisao):", len(ignorados), "| erros:", len(erros))
for i in ignorados[:25]:
    print("IGNORADO", i)
for e in erros[:25]:
    print("ERRO", e)
print("CONFERE configuracoes:", frappe.db.get_single_value("Selling Settings", "selling_price_list"), "|", frappe.db.get_single_value("Buying Settings", "buying_price_list"),
      "|", frappe.db.get_single_value("Selling Settings", "customer_group"), "|", frappe.db.get_single_value("Selling Settings", "territory"),
      "| UOM padrao:", frappe.db.get_single_value("Stock Settings", "stock_uom"))
