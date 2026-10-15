"""Lojas e permissoes: vendedor ve so o que e dele, gerente ve a loja, gestor ve tudo.

Uso (container backend, pasta do bench) - rode DEPOIS de habilitar os scripts do servidor:
  bench set-config -g server_script_enabled 1      (e reinicie o backend)
  echo 'exec(open("/tmp/aplicar-permissoes-lojas.py").read(), globals())' | bench --site erp.gferro.com.br console

Regras:
- Vendedor Gferro : cria/edita so orçamentos, pedidos, clientes, enderecos e contatos que ELE criou ("somente do criador").
- Gerente de Loja : ve e edita tudo da loja dele (permissao de usuario por loja) e pode compartilhar (passar carteira).
- Gestor Comercial: ve e edita tudo, de todas as lojas.
- Cliente cadastrado por um vendedor nao aparece para os outros; CPF/CNPJ repetido e barrado.
Pode rodar de novo.
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field
from frappe.permissions import add_permission, update_permission_property

LOJAS = {
    "Loja 1": "Rua Professor Toledo, 125 - Sorocaba/SP",
    "Loja 2": "Av. Pereira da Silva, 273 - Sorocaba/SP",
    "Loja 3": "Av. Itavuvú, 5040 - Galpão 1 - Sorocaba/SP",
    "Loja 4": "Av. Gisele Constantino, 122 - Votorantim/SP",
    "Loja 5": "Av. Firmo Vieira de Camargo, 979 - Tatuí/SP",
}
VENDEDOR, GERENTE, GESTOR = "Vendedor Gferro", "Gerente de Loja", "Gestor Comercial"
DOCS = ["Quotation", "Sales Order", "Customer", "Address", "Contact"]
resumo = []

# 1) lojas (usa o cadastro "Branch")
for nome in LOJAS:
    if not frappe.db.exists("Branch", nome):
        frappe.get_doc({"doctype": "Branch", "branch": nome}).insert(ignore_permissions=True)
        resumo.append("loja " + nome)

# 2) campo Loja nos documentos
ANTES = {"Quotation": "vendedor", "Sales Order": "vendedor", "Customer": "customer_type",
         "Address": "address_title", "Contact": "first_name"}
for dt in DOCS:
    if not frappe.db.exists("Custom Field", dt + "-loja"):
        create_custom_field(dt, {"fieldname": "loja", "label": "Loja", "fieldtype": "Link", "options": "Branch",
                                 "insert_after": ANTES[dt], "in_standard_filter": 1, "in_list_view": 0})
        resumo.append("campo loja em " + dt)

# vendedor travado para quem nao e gerente/gestor
TRAVA = ("eval:!(frappe.user_roles.includes('Gestor Comercial') || frappe.user_roles.includes('Gerente de Loja')"
         " || frappe.user_roles.includes('System Manager'))")
for dt in ("Quotation", "Sales Order"):
    nome = frappe.db.get_value("Custom Field", {"dt": dt, "fieldname": "vendedor"}, "name")
    if nome:
        frappe.db.set_value("Custom Field", nome, "read_only_depends_on", TRAVA)

# 3) papeis
for papel in (VENDEDOR, GERENTE, GESTOR):
    if not frappe.db.exists("Role", papel):
        frappe.get_doc({"doctype": "Role", "role_name": papel, "desk_access": 1}).insert(ignore_permissions=True)
        resumo.append("papel " + papel)

# 4) permissoes por documento
BASE = ["read", "write", "create", "print", "email"]
ptipos = {
    "Quotation": BASE + ["submit"],
    "Sales Order": BASE + ["submit"],
    "Customer": ["read", "write", "create", "print"],
    "Address": ["read", "write", "create"],
    "Contact": ["read", "write", "create"],
}
TUDO = ["read", "write", "create", "delete", "submit", "cancel", "amend", "print", "email", "report", "export", "share"]


def conceder(dt, papel, tipos, so_dono=False):
    add_permission(dt, papel, 0)
    for t in tipos:
        update_permission_property(dt, papel, 0, t, 1)
    update_permission_property(dt, papel, 0, "if_owner", 1 if so_dono else 0)


for dt in DOCS:
    conceder(dt, VENDEDOR, ptipos[dt], so_dono=True)
    conceder(dt, GERENTE, ptipos[dt] + ["cancel", "report", "export", "share"], so_dono=False)
    conceder(dt, GESTOR, TUDO, so_dono=False)

# consulta (somente leitura) para montar orçamentos e pedidos
CONSULTA = ["Item", "Item Group", "UOM", "Price List", "Item Price", "Customer Group", "Territory", "Payment Term",
            "Payment Terms Template", "Terms and Conditions", "Branch", "Company", "Warehouse", "Incoterm",
            "Sales Taxes and Charges Template", "Currency", "Country", "Print Format", "Account", "Cost Center",
            "Tax Category", "Item Tax Template", "Mode of Payment", "Sales Person", "Sales Partner"]
for dt in CONSULTA:
    if not frappe.db.exists("DocType", dt):
        continue
    for papel in (VENDEDOR, GERENTE, GESTOR):
        add_permission(dt, papel, 0)
        update_permission_property(dt, papel, 0, "read", 1)

# 5) modo estrito DESLIGADO: no modo estrito o ERP barra a criacao antes do script preencher a loja.
# A loja e preenchida automaticamente ao salvar; so documentos antigos (sem loja) ficam visiveis a todos os gerentes.
frappe.db.set_single_value("System Settings", "apply_strict_user_permissions", 0)

# 6) scripts do servidor: loja e vendedor automaticos; CPF/CNPJ unico
SCRIPT_LOJA = chr(10).join([
    'if not doc.get("loja"):',
    '    perm = frappe.get_all("User Permission", filters={"user": frappe.session.user, "allow": "Branch"},',
    '                          fields=["for_value"], limit_page_length=1)',
    '    if perm:',
    '        doc.loja = perm[0].for_value',
])
SCRIPT_VENDEDOR = chr(10).join([
    'if not doc.get("vendedor"):',
    '    doc.vendedor = frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user',
])
SCRIPT_CPF = chr(10).join([
    'cpf = (doc.get("tax_id") or "").strip()',
    'if cpf:',
    '    outros = frappe.get_all("Customer", filters={"tax_id": cpf, "name": ["!=", doc.name]}, limit_page_length=1)',
    '    if outros:',
    '        frappe.throw("Este CPF/CNPJ já está cadastrado. Fale com o seu gerente.")',
])


def server_script(nome, dt, codigo):
    dados = {"doctype": "Server Script", "name": nome, "script_type": "DocType Event", "reference_doctype": dt,
             "doctype_event": "Before Validate", "script": codigo, "disabled": 0}
    if frappe.db.exists("Server Script", nome):
        d = frappe.get_doc("Server Script", nome)
        d.script = codigo
        d.disabled = 0
        d.save(ignore_permissions=True)
    else:
        frappe.get_doc(dados).insert(ignore_permissions=True)


for dt in DOCS:
    codigo = SCRIPT_LOJA + (chr(10) + SCRIPT_VENDEDOR if dt in ("Quotation", "Sales Order") else "")
    server_script("Gferro - loja automática - " + dt, dt, codigo)
server_script("Gferro - CPF/CNPJ único", "Customer", SCRIPT_CPF)

frappe.db.commit()
frappe.clear_cache()
print("LOJAS_OK", resumo)
