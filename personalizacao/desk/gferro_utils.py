"""Funcoes de apoio para os modelos de impressao Gferro (registradas como metodos Jinja) e o apontamento por codigo de barras."""
import base64
import io
import re
from urllib.parse import quote

import frappe
from frappe import _
from frappe.utils import flt, now_datetime, time_diff_in_hours


def gf_qr(texto, escala=4):
    """QR code em PNG (data URI) para colocar direto em <img src=...>."""
    import pyqrcode

    buf = io.BytesIO()
    pyqrcode.create(str(texto), error="M").png(buf, scale=escala, quiet_zone=1)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def gf_whatsapp(telefone, mensagem=""):
    """Link wa.me a partir de um telefone brasileiro, ex.: (15) 99850-7812."""
    digitos = re.sub(r"\D", "", telefone or "")
    if digitos and not digitos.startswith("55"):
        digitos = "55" + digitos
    url = "https://wa.me/" + digitos
    return url + ("?text=" + quote(mensagem) if mensagem else "")


def gf_barcode(texto, altura=13, largura_modulo=0.33):
    """Codigo de barras Code 128 em PNG (data URI) para colocar direto em <img src=...>. Le qualquer texto ASCII (ex.: OS, etapa, matricula)."""
    import barcode
    from barcode.writer import ImageWriter

    buf = io.BytesIO()
    barcode.get("code128", str(texto), writer=ImageWriter()).write(
        buf, options={"module_width": largura_modulo, "module_height": altura, "quiet_zone": 2, "write_text": False, "dpi": 300}
    )
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------------------------------------
# Apontamento por codigo de barras (tela "Apontamento de Producao")
# Leitura em sequencia: matricula do colaborador (cracha) -> ordem de servico -> etapa do processo.
# Cada etapa da OS e um Job Card do ERPNext; o tempo fica nas linhas de tempo do Job Card.
# O operador vem do cadastro "Operador" (matricula = codigo de barras do cracha), sem depender de Employee.
# ---------------------------------------------------------------------------------------------
def _estado(jc):
    if jc.get("docstatus") == 1 or jc.get("status") == "Completed":
        return "concluida"
    if jc.get("is_paused"):
        return "pausada"
    if jc.get("status") == "Work In Progress":
        return "producao"
    return "aguardando"


def _cartao(jc):
    wo = frappe.db.get_value("Work Order", jc.work_order, ["production_item", "item_name", "sales_order"], as_dict=True) or {}
    aberto = next((r.from_time for r in jc.get("time_logs") or [] if r.from_time and not r.to_time), None)
    return {
        "tipo": "etapa", "job_card": jc.name, "os": jc.work_order, "pedido": wo.get("sales_order") or "",
        "codigo": wo.get("production_item"), "produto": wo.get("item_name") or wo.get("production_item"),
        "operacao": jc.operation, "recurso": jc.workstation or "", "centro": jc.workstation_type or "",
        "sequencia": jc.sequence_id, "qtd": flt(jc.for_quantity), "feito": flt(jc.total_completed_qty),
        "estado": _estado(jc), "operador": jc.get("operador") or "", "minutos": flt(jc.total_time_in_mins),
        "aberto_desde": str(aberto) if aberto else "",
    }


def _etapa_ativa(codigo):
    """Nome do Job Card vigente para o codigo lido. Se a etapa foi desfeita depois de finalizada, o ERPNext cria uma
    versao corrigida (PO-JOB00021-1) e o codigo impresso continua apontando para ela."""
    ativo = frappe.db.get_value("Job Card", {"name": codigo, "docstatus": ["<", 2]}, "name")
    if ativo:
        return ativo
    alt = frappe.get_all("Job Card", filters={"name": ["like", codigo + "-%"], "docstatus": ["<", 2]}, pluck="name",
                         order_by="creation desc", limit=1)
    return alt[0] if alt else None


@frappe.whitelist()
def apontamento_operador(matricula):
    """Identifica o colaborador pelo cracha (a matricula e o codigo de barras)."""
    m = (matricula or "").strip()
    if not m:
        frappe.throw(_("Bipe o crachá do colaborador."))
    op = frappe.db.get_value("Operador", m, ["name", "nome", "ativo"], as_dict=True)
    if not op:
        frappe.throw(_("Matrícula {0} não cadastrada.").format(m))
    if not op.ativo:
        frappe.throw(_("A matrícula {0} está inativa.").format(m))
    return {"matricula": op.name, "nome": op.nome}


@frappe.whitelist()
def apontamento_buscar(codigo):
    """Resolve o que foi lido pela leitora: o codigo de uma etapa (Job Card) ou o de uma OS (Work Order)."""
    codigo = (codigo or "").strip()
    if not codigo:
        frappe.throw(_("Leia o código de barras."))
    etapa = _etapa_ativa(codigo)
    if etapa:
        return _cartao(frappe.get_doc("Job Card", etapa))
    if frappe.db.exists("Work Order", codigo):
        wo = frappe.get_doc("Work Order", codigo)
        etapas = frappe.get_all("Job Card", filters={"work_order": codigo, "docstatus": ["<", 2]}, pluck="name", order_by="sequence_id asc")
        return {"tipo": "os", "os": codigo, "produto": wo.item_name or wo.production_item, "pedido": wo.sales_order or "",
                "etapas": [_cartao(frappe.get_doc("Job Card", n)) for n in etapas]}
    frappe.throw(_("Código {0} não encontrado. Confira a etiqueta.").format(codigo))


def _baixar_estoque(os_nome):
    """Ao fechar a ULTIMA etapa da OS lanca a Fabricacao (Stock Entry): consome a materia-prima e da entrada no produto acabado.
    Se faltar saldo ou custo, o lancamento fica como rascunho e o aviso volta para a tela (a producao nunca trava por causa do estoque)."""
    from erpnext.manufacturing.doctype.work_order.work_order import make_stock_entry
    from frappe.utils import strip_html

    wo = frappe.get_doc("Work Order", os_nome)
    ops = frappe.get_all("Work Order Operation", filters={"parent": os_nome}, fields=["status", "completed_qty"])
    if not ops or any(o.status != "Completed" for o in ops):
        return None  # ainda ha etapas por fazer
    ja = frappe.db.exists("Stock Entry", {"work_order": os_nome, "purpose": "Manufacture", "docstatus": ["<", 2]})
    qtd = min(flt(o.completed_qty) for o in ops) - flt(wo.produced_qty)
    if ja and not flt(wo.produced_qty):
        return {"status": "existente", "documento": ja, "mensagem": _("A OS já tem lançamento de estoque ({0}).").format(ja)}
    if qtd <= 0:
        return {"status": "nenhum", "mensagem": _("Nada a lançar no estoque.")}
    se = None
    try:
        se = frappe.get_doc(make_stock_entry(os_nome, "Manufacture", qtd))
        se.flags.ignore_permissions = True
        se.insert()
        frappe.db.commit()
    except Exception as e:  # noqa: BLE001 - nao pode travar o apontamento
        frappe.db.rollback()
        return {"status": "erro", "mensagem": strip_html(str(e))[:300]}
    erro = None
    for tentativa in (1, 2):
        try:
            se.flags.ignore_permissions = True
            se.submit()
            frappe.db.commit()
            return {"status": "lancado", "documento": se.name, "quantidade": qtd, "mensagem": _("Estoque baixado: {0}.").format(se.name)}
        except Exception as e:  # noqa: BLE001
            frappe.db.rollback()
            erro = strip_html(str(e))[:300]
            if tentativa == 2:
                break
            # 2a tentativa: so os itens SEM custo cadastrado passam a aceitar custo zero (os demais mantem o custo real)
            se = frappe.get_doc("Stock Entry", se.name)
            sem_custo = [i for i in se.items if not flt(i.basic_rate)]
            if not sem_custo:
                break
            for i in sem_custo:
                i.allow_zero_valuation_rate = 1
            se.flags.ignore_permissions = True
            se.save()
            frappe.db.commit()
    return {"status": "rascunho", "documento": se.name, "quantidade": qtd, "mensagem": erro}


def _desfazer(jc):
    """Cancelar apontamento: desfaz o ultimo registro da etapa. Devolve o nome do Job Card vigente."""
    aberto = next((r for r in jc.time_logs if r.from_time and not r.to_time), None)
    if jc.docstatus == 1:  # etapa finalizada: cancela e recria limpa (versao corrigida do mesmo codigo)
        baixa = frappe.db.exists("Stock Entry", {"work_order": jc.work_order, "purpose": "Manufacture", "docstatus": 1})
        if baixa:
            frappe.throw(_("A ordem {0} já teve o estoque baixado ({1}). Cancele esse lançamento de estoque antes de desfazer a etapa.").format(jc.work_order, baixa))
        jc.cancel()
        novo = frappe.copy_doc(jc)
        novo.amended_from = jc.name
        novo.docstatus = 0
        novo.set("time_logs", [])
        novo.set("employee", [])
        for campo in ("total_completed_qty", "total_time_in_mins", "pending_qty", "process_loss_qty", "manufactured_qty", "transferred_qty"):
            novo.set(campo, 0)
        for campo in ("operador", "actual_start_date", "actual_end_date"):
            novo.set(campo, None)
        novo.is_paused = 0
        novo.status = "Open"
        novo.insert()
        return novo.name
    if aberto:  # em producao: tira o inicio
        jc.remove(aberto)
        jc.is_paused = 0
    elif jc.is_paused and jc.time_logs:  # pausada: tira a pausa (volta a produzir)
        ultimo = jc.time_logs[-1]
        ultimo.to_time = None
        ultimo.time_in_mins = 0
        jc.is_paused = 0
    else:
        frappe.throw(_("Não há apontamento para cancelar nesta etapa."))
    jc.save()
    return jc.name


@frappe.whitelist()
def apontamento_acao(job_card, acao, matricula=None, qtd=None, os=None, causa=None):
    """iniciar | pausar | finalizar | cancelar uma etapa. Devolve o cartao atualizado."""
    etapa = _etapa_ativa((job_card or "").strip())
    if not etapa:
        frappe.throw(_("Etapa {0} não encontrada.").format(job_card))
    jc = frappe.get_doc("Job Card", etapa)
    jc.check_permission("write")
    if os and jc.work_order != os.strip():
        frappe.throw(_("A etapa {0} não pertence à ordem {1}.").format(jc.name, os))
    op = apontamento_operador(matricula)
    nome, mat = op["nome"], op["matricula"]
    agora = now_datetime()
    resultado = jc.name
    estoque = None

    if acao == "cancelar":
        resultado = _desfazer(jc)
    else:
        if jc.docstatus != 0:
            frappe.throw(_("Esta etapa já foi concluída."))
        aberto = next((r for r in jc.time_logs if r.from_time and not r.to_time), None)
        if acao == "iniciar":
            if aberto:
                frappe.throw(_("Esta etapa já está em andamento."))
            limite = frappe.db.get_value("Operador", mat, "limite_apontamentos") or 1
            em_curso = frappe.db.count("Job Card Time Log", {"parenttype": "Job Card", "matricula": mat, "to_time": ["is", "not set"]})
            if em_curso >= limite:
                frappe.throw(_("{0} já tem {1} apontamento(s) em andamento (limite {2}). Pause ou finalize antes de iniciar outro.").format(nome, em_curso, limite))
            jc.is_paused = 0
            jc.append("time_logs", {"from_time": agora, "completed_qty": 0, "operador": nome, "matricula": mat})
            jc.operador = nome
            jc.save()
        elif acao == "pausar":
            if not aberto:
                frappe.throw(_("Esta etapa não está em andamento."))
            aberto.to_time = agora
            aberto.time_in_mins = time_diff_in_hours(agora, aberto.from_time) * 60
            if causa and frappe.db.exists("Causa de Parada", causa):
                aberto.causa_parada = causa  # motivo da pausa (causas do Nomus)
            jc.is_paused = 1
            jc.save()
        elif acao == "finalizar":
            feito = flt(qtd) if qtd not in (None, "") else flt(jc.for_quantity)
            if feito <= 0:
                frappe.throw(_("Informe a quantidade produzida."))
            if feito > flt(jc.for_quantity):
                frappe.throw(_("A quantidade produzida não pode passar de {0}.").format(flt(jc.for_quantity)))
            if aberto:
                aberto.to_time = agora
                aberto.time_in_mins = time_diff_in_hours(agora, aberto.from_time) * 60
                alvo = aberto
            elif jc.time_logs:
                alvo = jc.time_logs[-1]
            else:
                frappe.throw(_("Inicie a etapa antes de finalizar."))
            alvo.completed_qty = flt(alvo.completed_qty) + feito
            jc.is_paused = 0
            jc.pending_qty = max(flt(jc.for_quantity) - feito - flt(jc.process_loss_qty), 0)
            jc.operador = nome
            jc.save()
            jc.submit()
            frappe.db.commit()
            estoque = _baixar_estoque(jc.work_order)
        else:
            frappe.throw(_("Ação inválida."))
    frappe.db.commit()
    cartao = _cartao(frappe.get_doc("Job Card", resultado))
    if estoque:
        cartao["estoque"] = estoque
    if acao == "finalizar":  # a OS segue para a proxima etapa, que fica aguardando
        prox = frappe.get_all("Job Card", filters={"work_order": cartao["os"], "docstatus": 0, "sequence_id": [">", cartao["sequencia"]]},
                              fields=["name", "operation", "workstation", "workstation_type", "sequence_id"], order_by="sequence_id asc", limit=1)
        cartao["proxima"] = prox[0] if prox else None
    return cartao


# ---------------------------------------------------------------- entrada de NF de compra por XML (NF-e)
def _nfe_parse(xml):
    import xml.etree.ElementTree as ET

    ns = {"n": "http://www.portalfiscal.inf.br/nfe"}
    try:
        raiz = ET.fromstring((xml or "").strip().encode("utf-8"))
    except ET.ParseError:
        frappe.throw(_("Arquivo inválido: não é um XML de NF-e."))
    inf = raiz.find(".//n:infNFe", ns)
    if inf is None:
        frappe.throw(_("Arquivo inválido: não é um XML de NF-e."))

    def t(no, caminho):
        r = no.find(caminho, ns) if no is not None else None
        return (r.text or "").strip() if r is not None and r.text else ""

    emit = inf.find("n:emit", ns)
    itens = []
    for det in inf.findall("n:det", ns):
        p = det.find("n:prod", ns)
        itens.append({"codigo": t(p, "n:cProd"), "ean": t(p, "n:cEAN"), "nome": t(p, "n:xProd"), "ncm": t(p, "n:NCM"), "unidade": t(p, "n:uCom"),
                      "qtd": flt(t(p, "n:qCom")), "valor_unit": flt(t(p, "n:vUnCom")), "valor": flt(t(p, "n:vProd")), "desconto": flt(t(p, "n:vDesc"))})
    return {
        "chave": (inf.get("Id") or "").replace("NFe", ""), "numero": t(inf, "n:ide/n:nNF"), "serie": t(inf, "n:ide/n:serie"),
        "emissao": (t(inf, "n:ide/n:dhEmi") or t(inf, "n:ide/n:dEmi"))[:10], "fornecedor_cnpj": t(emit, "n:CNPJ"), "fornecedor_nome": t(emit, "n:xNome"),
        "valor_nf": flt(t(inf, "n:total/n:ICMSTot/n:vNF")), "frete": flt(t(inf, "n:total/n:ICMSTot/n:vFrete")),
        "itens": itens,
        "duplicatas": [{"numero": t(d, "n:nDup"), "vencimento": t(d, "n:dVenc"), "valor": flt(t(d, "n:vDup"))} for d in inf.findall(".//n:cobr/n:dup", ns)],
    }


def _fmt_cnpj(d):
    d = re.sub(r"\D", "", d or "")
    return "%s.%s.%s/%s-%s" % (d[:2], d[2:5], d[5:8], d[8:12], d[12:]) if len(d) == 14 else d


def _nfe_fornecedor(cnpj):
    for v in (_fmt_cnpj(cnpj), re.sub(r"\D", "", cnpj or "")):
        r = frappe.db.get_value("Supplier", {"tax_id": v}, "name")
        if r:
            return r
    return None


def _nfe_item_sugerido(it, fornecedor):
    if fornecedor and it["codigo"]:
        r = frappe.db.sql("select parent from `tabItem Supplier` where supplier=%s and supplier_part_no=%s limit 1", (fornecedor, it["codigo"]))
        if r:
            return r[0][0]
    if it["ean"] and it["ean"].upper() != "SEM GTIN":
        r = frappe.db.get_value("Item Barcode", {"barcode": it["ean"]}, "parent")
        if r:
            return r
    if it["codigo"] and frappe.db.exists("Item", it["codigo"]):
        return it["codigo"]
    return frappe.db.get_value("Item", {"item_name": it["nome"]}, "name")


@frappe.whitelist()
def nfe_compra_ler(xml):
    """Le o XML da NF-e de compra e sugere o fornecedor e o item do ERP de cada linha."""
    nf = _nfe_parse(xml)
    forn = _nfe_fornecedor(nf["fornecedor_cnpj"])
    nf["fornecedor"] = forn
    nf["fornecedor_cnpj_fmt"] = _fmt_cnpj(nf["fornecedor_cnpj"])
    nf["ja_importada"] = frappe.db.get_value("Purchase Receipt", {"gf_chave_nfe": nf["chave"], "docstatus": ["<", 2]}, "name") if nf["chave"] else None
    for it in nf["itens"]:
        it["item"] = _nfe_item_sugerido(it, forn)
        it["item_nome"] = frappe.db.get_value("Item", it["item"], "item_name") if it["item"] else None
    return nf


@frappe.whitelist()
def nfe_compra_criar(xml, mapa, armazem=None, criar_fornecedor=0):
    """Cria o Recebimento de Compra (rascunho) a partir do XML. mapa = {indice_da_linha: codigo_do_item}. Guarda o codigo do fornecedor para as proximas notas."""
    import json

    frappe.only_for(["System Manager", "Purchase Manager", "Purchase User", "Stock Manager", "Stock User"])
    nf = _nfe_parse(xml)
    mapa = json.loads(mapa) if isinstance(mapa, str) else (mapa or {})
    if nf["chave"] and frappe.db.get_value("Purchase Receipt", {"gf_chave_nfe": nf["chave"], "docstatus": ["<", 2]}, "name"):
        frappe.throw(_("Esta NF-e já foi importada."))
    forn = _nfe_fornecedor(nf["fornecedor_cnpj"])
    if not forn:
        if not int(criar_fornecedor or 0):
            frappe.throw(_("Fornecedor {0} ({1}) não cadastrado.").format(nf["fornecedor_nome"], _fmt_cnpj(nf["fornecedor_cnpj"])))
        s = frappe.get_doc({"doctype": "Supplier", "supplier_name": nf["fornecedor_nome"][:140], "supplier_group": frappe.db.get_value("Supplier Group", {"is_group": 0}, "name"),
                            "supplier_type": "Company", "tax_id": _fmt_cnpj(nf["fornecedor_cnpj"])})
        s.insert(ignore_permissions=True)
        forn = s.name
    empresa = frappe.defaults.get_global_default("company") or frappe.db.get_value("Company", {}, "name")
    armazem = armazem or frappe.db.get_value("Warehouse", {"warehouse_name": "Almoxarifado", "company": empresa}, "name")
    linhas = []
    for i, it in enumerate(nf["itens"]):
        cod = mapa.get(str(i)) or mapa.get(i)
        if not cod or not frappe.db.exists("Item", cod):
            frappe.throw(_("Escolha o item do ERP para a linha {0}: {1}.").format(i + 1, it["nome"]))
        stock_uom = frappe.db.get_value("Item", cod, "stock_uom")
        if not frappe.db.get_value("Item", cod, "is_purchase_item"):
            frappe.db.set_value("Item", cod, "is_purchase_item", 1)  # item que entra por NF de compra passa a ser comprável
        valor = it["valor"] - it["desconto"]
        linhas.append({"item_code": cod, "qty": it["qtd"], "uom": stock_uom, "stock_uom": stock_uom, "conversion_factor": 1,
                       "rate": (valor / it["qtd"]) if it["qtd"] else it["valor_unit"], "warehouse": armazem, "description": it["nome"]})
        if it["codigo"] and not frappe.db.exists("Item Supplier", {"parent": cod, "supplier": forn, "supplier_part_no": it["codigo"]}):
            item = frappe.get_doc("Item", cod)
            item.append("supplier_items", {"supplier": forn, "supplier_part_no": it["codigo"]})
            item.flags.ignore_permissions = True
            item.save()
    pr = frappe.get_doc({"doctype": "Purchase Receipt", "supplier": forn, "company": empresa, "posting_date": nf["emissao"] or frappe.utils.today(),
                         "supplier_delivery_note": ("NF %s-%s" % (nf["numero"], nf["serie"]))[:140], "gf_chave_nfe": nf["chave"], "items": linhas,
                         "remarks": "Entrada pela NF-e %s (chave %s)" % (nf["numero"], nf["chave"])})
    pr.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"nome": pr.name, "total": pr.grand_total, "valor_nf": nf["valor_nf"]}
