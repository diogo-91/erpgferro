"""Importa para o ERPNext os dados fiscais do Nomus (pacote gerado por montar-pacote-fiscal.py em /tmp/nomus-fiscal.json).

- Empresa "Grupo Gferro": regime (CRT), inscricao estadual, CNAE e endereco.
- Itens: NCM (campo padrao "Numero da tarifa aduaneira"), GTIN (codigo de barras), CFOP/CST/aliquotas padrao inferidos das NF-e emitidas.
- Clientes: CPF/CNPJ, inscricao estadual, tipo de contribuinte, codigo IBGE e endereco (cadastros so com nome, sem nenhum dado, ficam de fora).
- DocType "NF-e Nomus": as NF-e ja emitidas no Nomus (cabecalho + XML) para consulta.
Pode rodar de novo (idempotente).

Uso (container backend, pasta do bench):
  echo 'exec(open("/tmp/importar-fiscal.py").read(), globals())' | bench --site erp.gferro.com.br console
"""
import json
import re

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

D = json.load(open("/tmp/nomus-fiscal.json", encoding="utf-8"))
EMPRESA = "Grupo Gferro"


def campo(dt, nome, rotulo, tipo="Data", depois=None, **extra):
    if not frappe.db.exists("Custom Field", dt + "-" + nome):
        d = {"fieldname": nome, "label": rotulo, "fieldtype": tipo}
        if depois:
            d["insert_after"] = depois
        d.update(extra)
        create_custom_field(dt, d)


# ---------- campos ----------
campo("Company", "gf_fiscal", "Dados fiscais (Nomus)", "Section Break", "tax_id")
campo("Company", "gf_crt", "Regime tributário (CRT)", "Select", "gf_fiscal", options="\n1 - Simples Nacional\n2 - Simples Nacional - excesso de sublimite\n3 - Regime normal")
campo("Company", "gf_inscricao_estadual", "Inscrição estadual", "Data", "gf_crt")
campo("Company", "gf_cnae", "CNAE principal", "Data", "gf_inscricao_estadual")
campo("Company", "gf_codigo_ibge", "Código IBGE do município", "Data", "gf_cnae")
campo("Customer", "gf_fiscal", "Dados fiscais", "Section Break", "tax_id")
campo("Customer", "gf_inscricao_estadual", "Inscrição estadual", "Data", "gf_fiscal")
campo("Customer", "gf_contribuinte_icms", "Tipo de contribuinte ICMS", "Select", "gf_inscricao_estadual",
      options="\n1 - Contribuinte ICMS\n2 - Contribuinte isento\n9 - Não contribuinte")
campo("Customer", "gf_codigo_ibge", "Código IBGE do município", "Data", "gf_contribuinte_icms")
campo("Customer", "gf_codigo_nomus", "Código no Nomus", "Data", "gf_codigo_ibge", read_only=1)
campo("Item", "gf_fiscal", "Tributação padrão (inferida das NF-e)", "Section Break", "customs_tariff_number")
campo("Item", "gf_cfop", "CFOP", "Data", "gf_fiscal")
campo("Item", "gf_cst_icms", "CST/CSOSN do ICMS", "Data", "gf_cfop")
campo("Item", "gf_aliq_icms", "Alíquota de ICMS (%)", "Float", "gf_cst_icms")
campo("Item", "gf_cst_pis", "CST do PIS", "Data", "gf_aliq_icms")
campo("Item", "gf_cst_cofins", "CST do COFINS", "Data", "gf_cst_pis")
campo("Item", "gf_excecao_ncm", "Exceção do NCM (EX TIPI)", "Data", "gf_cst_cofins")

# ---------- NF-e emitidas ----------
if not frappe.db.exists("DocType", "NF-e Nomus"):
    perms = [{"role": r, "read": 1, "write": w, "create": 0, "delete": 0, "print": 1, "export": 1, "email": 0, "share": 1}
             for r, w in (("System Manager", 1), ("Accounts Manager", 0), ("Accounts User", 0))]
    frappe.get_doc({
        "doctype": "DocType", "name": "NF-e Nomus", "module": "Accounts", "custom": 1, "autoname": "field:chave", "naming_rule": "By fieldname",
        "title_field": "numero", "sort_field": "data_emissao", "sort_order": "DESC", "search_fields": "numero,destinatario,chave", "track_changes": 0,
        "fields": [
            {"fieldname": "numero", "label": "Número", "fieldtype": "Data", "in_list_view": 1, "in_standard_filter": 1},
            {"fieldname": "serie", "label": "Série", "fieldtype": "Data", "in_list_view": 1},
            {"fieldname": "chave", "label": "Chave de acesso", "fieldtype": "Data", "unique": 1, "reqd": 1, "read_only": 1},
            {"fieldname": "protocolo", "label": "Protocolo de autorização", "fieldtype": "Data", "read_only": 1},
            {"fieldname": "data_emissao", "label": "Data de emissão", "fieldtype": "Date", "in_list_view": 1, "in_standard_filter": 1},
            {"fieldname": "situacao", "label": "Situação", "fieldtype": "Data", "in_list_view": 1, "in_standard_filter": 1},
            {"fieldname": "emitente", "label": "Emitente", "fieldtype": "Data", "in_standard_filter": 1},
            {"fieldname": "emitente_cnpj", "label": "CNPJ do emitente", "fieldtype": "Data"},
            {"fieldname": "natureza_operacao", "label": "Natureza da operação", "fieldtype": "Data"},
            {"fieldname": "destinatario", "label": "Destinatário", "fieldtype": "Data", "in_list_view": 1},
            {"fieldname": "destinatario_documento", "label": "CPF/CNPJ do destinatário", "fieldtype": "Data"},
            {"fieldname": "destinatario_uf", "label": "UF do destinatário", "fieldtype": "Data"},
            {"fieldname": "valor_total", "label": "Valor da NF", "fieldtype": "Currency", "in_list_view": 1},
            {"fieldname": "valor_icms", "label": "Valor do ICMS", "fieldtype": "Currency"},
            {"fieldname": "ambiente", "label": "Ambiente", "fieldtype": "Data"},
            {"fieldname": "usuario_nomus", "label": "Usuário que emitiu (Nomus)", "fieldtype": "Data"},
            {"fieldname": "id_nomus", "label": "ID no Nomus", "fieldtype": "Data", "read_only": 1},
            {"fieldname": "xml", "label": "XML da NF-e", "fieldtype": "Code", "options": "XML", "read_only": 1},
        ], "permissions": perms,
    }).insert(ignore_permissions=True)
    frappe.db.commit()

SITUACAO = {"100": "Autorizada", "101": "Cancelada", "110": "Denegada", "": "Sem autorização (cancelada/inutilizada)"}
nome_emit = {e["cnpj"]: e["razao"] for e in D["emitentes"]}
novas = 0
for n in D["nfes"]:
    if frappe.db.exists("NF-e Nomus", n["chave"]):
        continue
    frappe.get_doc({"doctype": "NF-e Nomus", "numero": n["numero"], "serie": n["serie"], "chave": n["chave"], "protocolo": n["protocolo"],
                    "data_emissao": n["data"] or None, "situacao": SITUACAO.get(n["cstat"], n["motivo"] or n["cstat"]), "emitente": nome_emit.get(n["emitente"], ""),
                    "emitente_cnpj": n["emitente"], "natureza_operacao": n["natop"], "destinatario": n["dest_nome"], "destinatario_documento": n["dest_doc"],
                    "destinatario_uf": n["dest_uf"], "valor_total": float(n["valor"] or 0), "valor_icms": float(n["icms"] or 0),
                    "ambiente": "Produção" if n["ambiente"] == "1" else "Homologação", "usuario_nomus": n["usuario"], "id_nomus": n["id"],
                    "xml": n["xml"]}).insert(ignore_permissions=True)
    novas += 1
print("NFE_NOVAS", novas, "total", frappe.db.count("NF-e Nomus"))

# ---------- empresa ----------
gf = next((e for e in D["empresas"] if e["nome"] == "GFERRO"), None)
emit = next((e for e in D["emitentes"] if e["cnpj"] == re.sub(r"\D", "", frappe.db.get_value("Company", EMPRESA, "tax_id") or "")), None)
if gf and emit:
    crt = {"1": "1 - Simples Nacional", "2": "2 - Simples Nacional - excesso de sublimite", "3": "3 - Regime normal"}.get(gf["crt"] or emit["crt"])
    frappe.db.set_value("Company", EMPRESA, {"gf_crt": crt, "gf_inscricao_estadual": emit["ie"] or gf["ie"], "gf_cnae": gf["cnae"], "gf_codigo_ibge": emit["ibge"]})
    if not frappe.db.exists("Address", {"address_title": EMPRESA, "address_type": "Billing"}):
        a = frappe.get_doc({"doctype": "Address", "address_title": EMPRESA, "address_type": "Billing", "address_line1": (gf["endereco"] + ", " + gf["numero"]).strip(", "),
                            "address_line2": " - ".join(x for x in (gf["complemento"], gf["bairro"]) if x), "city": gf["municipio"], "state": gf["uf"],
                            "pincode": gf["cep"], "country": "Brazil", "phone": gf["telefone"], "is_your_company_address": 1,
                            "links": [{"link_doctype": "Company", "link_name": EMPRESA}]})
        a.insert(ignore_permissions=True)
    print("EMPRESA_OK", crt, emit["ie"])

# ---------- itens ----------
n_ncm = n_gtin = n_trib = 0
for p in D["produtos"]:
    if not frappe.db.exists("Item", p["codigo"]):
        continue
    v = {}
    if p["ncm"]:
        if not frappe.db.exists("Customs Tariff Number", p["ncm"]):
            frappe.get_doc({"doctype": "Customs Tariff Number", "tariff_number": p["ncm"]}).insert(ignore_permissions=True)
        v["customs_tariff_number"] = p["ncm"]
        n_ncm += 1
    if p["excecao_ncm"]:
        v["gf_excecao_ncm"] = p["excecao_ncm"]
    if "cfop" in p:
        v.update({"gf_cfop": p["cfop"], "gf_cst_icms": p["cst_icms"], "gf_aliq_icms": float(p["aliq_icms"] or 0), "gf_cst_pis": p["cst_pis"], "gf_cst_cofins": p["cst_cofins"]})
        n_trib += 1
    if v:
        frappe.db.set_value("Item", p["codigo"], v, update_modified=False)
    if p["gtin"] and not frappe.db.exists("Item Barcode", {"barcode": p["gtin"]}):
        frappe.get_doc({"doctype": "Item Barcode", "parent": p["codigo"], "parenttype": "Item", "parentfield": "barcodes", "barcode": p["gtin"]}).db_insert()
        n_gtin += 1
frappe.db.commit()
print("ITENS_OK ncm", n_ncm, "gtin", n_gtin, "tributacao", n_trib)

# ---------- clientes ----------
def fmt_doc(d):
    if len(d) == 14:
        return "%s.%s.%s/%s-%s" % (d[:2], d[2:5], d[5:8], d[8:12], d[12:])
    if len(d) == 11:
        return "%s.%s.%s-%s" % (d[:3], d[3:6], d[6:9], d[9:])
    return d


CONTRIB = {"1": "1 - Contribuinte ICMS", "2": "2 - Contribuinte isento", "3": "9 - Não contribuinte", "9": "9 - Não contribuinte"}
territorio = frappe.db.get_value("Territory", {"is_group": 0}, "name") or "Brasil"
if frappe.db.exists("Territory", "Brasil"):
    territorio = "Brasil"
elif frappe.db.exists("Territory", "Brazil"):
    territorio = "Brazil"


def achar_cliente(c):
    if c["doc"]:
        for fm in (fmt_doc(c["doc"]), c["doc"]):
            r = frappe.db.get_value("Customer", {"tax_id": fm}, "name")
            if r:
                return r
    return frappe.db.get_value("Customer", {"customer_name": c["nome"]}, "name")


novos = atual = erros = 0
for c in D["clientes"]:
    if not c["doc"] or not c["nome"]:
        continue
    try:
        frappe.db.savepoint("cli")
        email = c["email"] if frappe.utils.validate_email_address(c["email"] or "") else None
        nome = achar_cliente(c)
        vals = {"gf_inscricao_estadual": c["ie"], "gf_contribuinte_icms": CONTRIB.get(c["contrib"], ""), "gf_codigo_ibge": c["ibge"], "gf_codigo_nomus": c["codigo"] or c["id"]}
        if nome:
            vals["tax_id"] = fmt_doc(c["doc"])
            frappe.db.set_value("Customer", nome, vals, update_modified=False)
            atual += 1
        else:
            pj = len(c["doc"]) == 14
            cli = frappe.get_doc({"doctype": "Customer", "customer_name": c["nome"][:140], "customer_type": "Company" if pj else "Individual",
                                  "customer_group": "Comercial" if pj else "Pessoa Física", "territory": territorio, "tax_id": fmt_doc(c["doc"]), "email_id": c["email"] or None,
                                  "disabled": 0 if c["ativo"] else 1, **vals})
            if frappe.db.exists("Customer", cli.customer_name):
                cli.customer_name = (c["nome"][:120] + " (" + str(c["codigo"] or c["id"]) + ")")
            cli.insert(ignore_permissions=True)
            nome = cli.name
            novos += 1
        if c["endereco"] and not frappe.db.exists("Dynamic Link", {"link_doctype": "Customer", "link_name": nome, "parenttype": "Address"}):
            frappe.get_doc({"doctype": "Address", "address_title": nome[:100], "address_type": "Billing", "address_line1": (c["endereco"] + ", " + c["numero"]).strip(", ")[:140],
                            "address_line2": " - ".join(x for x in (c["complemento"], c["bairro"]) if x)[:140], "city": c["municipio"] or "-", "state": c["uf"],
                            "pincode": c["cep"], "country": "Brazil", "email_id": email, "phone": c["telefone"] or None,
                            "links": [{"link_doctype": "Customer", "link_name": nome}]}).insert(ignore_permissions=True)
    except Exception as e:  # um cadastro ruim nao pode parar os outros
        erros += 1
        frappe.db.rollback(save_point="cli")
        if erros <= 8:
            print("ERRO_CLIENTE", c["id"], c["nome"][:30], str(e)[:140])
    if (novos + atual) % 200 == 0:
        frappe.db.commit()
frappe.db.commit()
print("CLIENTES_OK novos", novos, "atualizados", atual, "erros", erros, "| total no ERP", frappe.db.count("Customer"))
