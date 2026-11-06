"""Lanca no ERPNext as contas a pagar e a receber EM ABERTO do Nomus como faturas de abertura.

Uso (container backend, pasta do bench), com o pacote de montar-pacote-financeiro.py em /tmp/financeiro-abertura.json:
  echo 'globals()["LIMITE"]=3; exec(open("/tmp/importar-financeiro-abertura.py", encoding="utf-8").read(), globals())' | bench --site erp.gferro.com.br console
  (LIMITE = quantas faturas de cada tipo; sem definir lanca todas. Atencao: tem que ser globals()["LIMITE"]=..., pois
   o console do bench nao repassa uma variavel simples para o exec; assim foi lancado tudo num teste de 3.)

O que faz:
- cria a conta "Abertura Temporaria" (tipo Temporary, exigida pela ferramenta de faturas de abertura do ERPNext) sob o Ativo;
  a contabilidade zera essa conta contra o patrimonio liquido depois de conferir os saldos
- cria os clientes e fornecedores que faltam (reaproveita por CPF/CNPJ ou pelo nome)
- cria Sales Invoice (a receber) e Purchase Invoice (a pagar) de abertura com o saldo em aberto e o vencimento do Nomus
Idempotente: fatura com o mesmo numero (NOMUS-R-<id> / NOMUS-P-<id>) e ignorada. Erros ficam listados no fim.
"""
import json

import frappe

LIMITE = globals().get("LIMITE")
dados = json.load(open("/tmp/financeiro-abertura.json", encoding="utf-8"))
EMPRESA = frappe.get_all("Company", pluck="name")[0]
CENTRO = frappe.db.get_value("Company", EMPRESA, "cost_center")
erros = []

# ---------- 1) conta temporaria de abertura ----------
sufixo = frappe.db.get_value("Company", EMPRESA, "abbr")
ativo = "ATIVO - " + sufixo
grupo_tmp = "Contas Temporarias - " + sufixo
conta_tmp = "Abertura Temporaria - " + sufixo
if not frappe.db.exists("Account", grupo_tmp):
    frappe.get_doc({"doctype": "Account", "account_name": "Contas Temporarias", "parent_account": ativo, "company": EMPRESA,
                    "is_group": 1, "root_type": "Asset"}).insert(ignore_permissions=True)
if not frappe.db.exists("Account", conta_tmp):
    frappe.get_doc({"doctype": "Account", "account_name": "Abertura Temporaria", "parent_account": grupo_tmp, "company": EMPRESA,
                    "is_group": 0, "account_type": "Temporary", "root_type": "Asset"}).insert(ignore_permissions=True)
frappe.db.commit()


# ---------- 2) clientes e fornecedores ----------
def achar_ou_criar(tipo, p):
    """Devolve o nome do Customer/Supplier para a pessoa do Nomus (cria se nao existir)."""
    campo = "customer_name" if tipo == "Customer" else "supplier_name"
    nome = p["nome"][:140]
    if p["doc"]:
        existente = frappe.db.get_value(tipo, {"tax_id": p["doc"]}, "name")
        if existente:
            return existente
    if frappe.db.exists(tipo, nome):
        outro_doc = frappe.db.get_value(tipo, nome, "tax_id")
        if not (p["doc"] and outro_doc and outro_doc != p["doc"]):
            return nome  # mesmo nome e sem documento conflitante: e a mesma pessoa
        nome = ("%s (%s)" % (p["nome"][:120], p["id"]))
        if frappe.db.exists(tipo, nome):
            return nome
    doc = {"doctype": tipo, campo: nome, "tax_id": p["doc"] or None,
           ("customer_type" if tipo == "Customer" else "supplier_type"): "Individual" if p["pf"] else "Company"}
    if tipo == "Customer":
        doc.update({"customer_group": "Individual" if p["pf"] else "Commercial", "territory": "Brazil"})
    else:
        doc.update({"supplier_group": "All Supplier Groups"})
    frappe.get_doc(doc).insert(ignore_permissions=True)
    return nome


def parte(tipo, p):
    try:
        n = achar_ou_criar(tipo, p)
        frappe.db.commit()
        return n
    except Exception as e:  # noqa: BLE001
        frappe.db.rollback()
        erros.append(("%s %s" % (tipo, p["nome"]), str(e).replace("\n", " ")[:160]))
        return None


# ---------- 3) faturas de abertura ----------
def lancar(chave, tipo_fatura, doctype, tipo_parte):
    itens = dados[chave][:LIMITE] if LIMITE else dados[chave]
    criadas = puladas = 0
    cache = {}
    for it in itens:
        if frappe.db.exists(doctype, it["numero"]):
            puladas += 1
            continue
        pid = it["pessoa"]["id"]
        if pid not in cache:
            cache[pid] = parte(tipo_parte, it["pessoa"])
        if not cache[pid]:
            continue
        ferramenta = frappe.get_doc({"doctype": "Opening Invoice Creation Tool", "company": EMPRESA, "invoice_type": tipo_fatura,
                                     "create_missing_party": 0, "cost_center": CENTRO, "invoices": [{
                                         "party": cache[pid], "temporary_opening_account": conta_tmp, "posting_date": it["lancamento"],
                                         "due_date": it["vencimento"], "item_name": it["descricao"] or "Saldo em aberto (Nomus)",
                                         "outstanding_amount": it["valor"], "qty": 1, "invoice_number": it["numero"], "cost_center": CENTRO}]})
        try:
            fatura = ferramenta.get_invoices()[0]
            doc = frappe.get_doc(fatura)
            doc.flags.ignore_mandatory = True
            doc.flags.dont_auto_add_taxes = True
            doc.insert(set_name=it["numero"])
            doc.submit()
            frappe.db.commit()
            criadas += 1
        except Exception as e:  # noqa: BLE001
            frappe.db.rollback()
            erros.append((it["numero"], str(e).replace("\n", " ")[:200]))
    print("%s: criadas=%d ja_existiam=%d" % (doctype, criadas, puladas))


lancar("receber", "Sales", "Sales Invoice", "Customer")
lancar("pagar", "Purchase", "Purchase Invoice", "Supplier")
for dt in ("Sales Invoice", "Purchase Invoice"):
    r = frappe.db.sql("select count(*), coalesce(sum(outstanding_amount),0) from `tab%s` where is_opening='Yes' and docstatus=1" % dt)[0]
    print("TOTAL %s de abertura: %d faturas, saldo em aberto R$ %.2f" % (dt, r[0], r[1]))
print("RESULTADO clientes=%d fornecedores=%d erros=%d" % (frappe.db.count("Customer"), frappe.db.count("Supplier"), len(erros)))
vistos = {}
for rotulo, msg in erros:
    vistos.setdefault(msg[:100], []).append(rotulo)
for msg, rots in sorted(vistos.items(), key=lambda x: -len(x[1]))[:12]:
    print("ERRO x%d (%s): %s" % (len(rots), ", ".join(rots[:3]), msg))
