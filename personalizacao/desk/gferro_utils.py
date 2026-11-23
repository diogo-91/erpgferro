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


# ---------------------------------------------------------------- Comissoes (fechamento mensal dos vendedores)
_COMISSAO_PAPEIS = ["System Manager", "Gestor Comercial", "Accounts Manager", "Sales Manager"]
_NOME_CANONICO = {"LUIZ MARCOS MONTEIRO": "Luiz Monteiro", "EDSON RODRIGUES CAVALCANTE": "Edson Cavalcante"}  # mesma pessoa com 2 cadastros


def _norm_nome(t):
    import unicodedata

    return re.sub(r"\s+", " ", "".join(c for c in unicodedata.normalize("NFD", t or "") if unicodedata.category(c) != "Mn")).strip().upper()


def _nome_canonico(nome):
    return _NOME_CANONICO.get(_norm_nome(nome), nome)


@frappe.whitelist()
def comissoes_fabrica(mes):
    """Pedidos do mes com o que o fechamento usa (vendas, recebido, parafusos, frete), vendedores por loja, termos e ajustes. O calculo e feito na tela."""
    import calendar

    frappe.only_for(_COMISSAO_PAPEIS)
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", mes or ""):
        frappe.throw(_("Mês inválido."))
    ano, m = int(mes[:4]), int(mes[5:])
    ini, fim = "%s-01" % mes, "%s-%02d" % (mes, calendar.monthrange(ano, m)[1])
    cfg = frappe.get_single("Configuracao Comissao")
    pessoas = frappe.get_all("Sales Person", filters={"is_group": 0}, fields=["name", "loja", "commission_rate", "enabled"])
    loja_de = {}
    taxa_de = {}
    for p in pessoas:
        nome = _nome_canonico(p.name)
        if p.loja and nome == p.name:
            loja_de[nome] = p.loja
        if flt(p.commission_rate) > 0:
            taxa_de[nome] = flt(p.commission_rate) / 100
    rows = frappe.db.sql(
        """
        select so.name codigo, so.transaction_date data, so.vendedor, so.loja, so.grand_total total, ifnull(so.frete_valor, 0) frete, ifnull(so.advance_paid, 0) adv, so.termo_aceite termo,
          (select ifnull(sum(si.grand_total - si.outstanding_amount), 0) from `tabSales Invoice` si where si.docstatus = 1
             and si.name in (select distinct sii.parent from `tabSales Invoice Item` sii where sii.sales_order = so.name)) pago_nf,
          (select ifnull(sum(i.qty), 0) from `tabSales Order Item` i where i.parent = so.name and i.item_name like %(par)s) par_qtd,
          (select ifnull(sum(i.amount), 0) from `tabSales Order Item` i where i.parent = so.name and i.item_name like %(par)s) par_valor
        from `tabSales Order` so
        where so.docstatus = 1 and so.status <> 'Cancelled' and ifnull(so.etapa_pedido, '') <> 'Cancelado' and so.transaction_date between %(ini)s and %(fim)s
        order by so.transaction_date, so.name""", {"ini": ini, "fim": fim, "par": "%parafuso%"}, as_dict=True)
    pedidos, termos = [], {}
    for r in rows:
        vend = _nome_canonico((r.vendedor or "").strip()) or "(sem vendedor)"
        pedidos.append({"id": r.codigo, "codigo": r.codigo, "dataEmissao": str(r.data), "vendedor": vend, "loja": loja_de.get(vend) or r.loja or "",
                        "valorTotal": flt(r.total), "valorRecebido": max(flt(r.adv), flt(r.pago_nf)), "quantidadeParafusos": flt(r.par_qtd),
                        "valorParafusos": flt(r.par_valor), "valorFrete": flt(r.frete)})
        if r.termo:
            termos[r.codigo] = "sim" if r.termo == "Sim" else "nao"
    ajustes = {a.vendedor: {"valor": flt(a.valor), "observacao": a.observacao or ""}
               for a in frappe.get_all("Ajuste de Comissao", filters={"mes": mes}, fields=["vendedor", "valor", "observacao"])}
    return {"mes": mes, "atualizadoEm": frappe.utils.now(), "pedidos": pedidos, "vendedores": [{"nome": n, "loja": l} for n, l in loja_de.items()],
            "termos": termos, "ajustes": ajustes, "taxaPadrao": flt(cfg.taxa_padrao or 2) / 100, "taxas": taxa_de,
            "faixas": sorted([{"minimo": flt(f.minimo), "comissao": flt(f.comissao)} for f in cfg.faixas], key=lambda f: -f["minimo"]),
            "lojas": [{"id": b.name, "nome": b.name} for b in frappe.get_all("Branch", fields=["name"], order_by="name asc")]}


@frappe.whitelist()
def comissoes_termo(pedido, valor=None):
    """Termo de aceite do pedido: 'sim', 'nao' ou vazio."""
    frappe.only_for(_COMISSAO_PAPEIS)
    v = {"sim": "Sim", "nao": "Não"}.get((valor or "").lower(), "")
    if not frappe.db.exists("Sales Order", pedido):
        frappe.throw(_("Pedido {0} não encontrado.").format(pedido))
    frappe.db.set_value("Sales Order", pedido, "termo_aceite", v, update_modified=False)
    frappe.db.commit()
    return v


@frappe.whitelist()
def comissoes_ajuste(mes, vendedor, valor=0, observacao=""):
    """Ajuste do vendedor no mes (positivo soma, negativo desconta). Valor zero sem observacao apaga o ajuste."""
    frappe.only_for(_COMISSAO_PAPEIS)
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", mes or "") or not vendedor:
        frappe.throw(_("Informe o mês e o vendedor."))
    valor, observacao = flt(valor), (observacao or "").strip()[:200]
    atual = frappe.db.get_value("Ajuste de Comissao", {"mes": mes, "vendedor": vendedor}, "name")
    if valor == 0 and not observacao:
        if atual:
            frappe.delete_doc("Ajuste de Comissao", atual, ignore_permissions=True)
    elif atual:
        frappe.db.set_value("Ajuste de Comissao", atual, {"valor": valor, "observacao": observacao})
    else:
        frappe.get_doc({"doctype": "Ajuste de Comissao", "mes": mes, "vendedor": vendedor, "valor": valor, "observacao": observacao}).insert(ignore_permissions=True)
    frappe.db.commit()
    return {"valor": valor, "observacao": observacao}


# ---------------------------------------------------------------- Dashboard > Pedidos (liberados, combinados, formato 2)
_PEDIDOS_PAPEIS = ["System Manager", "Gestor Comercial", "Sales Manager", "Gerente de Loja", "Accounts Manager", "Manufacturing Manager"]


@frappe.whitelist()
def pedidos_dashboard():
    """Pedidos de Venda confirmados (menos cancelados) com cliente, vendedor, loja, prazo, recebido e parcelas em aberto. A classificacao (prazo, regra do formato 2) e feita na tela."""
    frappe.only_for(_PEDIDOS_PAPEIS)
    cab = frappe.get_list("Sales Order", filters={"docstatus": 1, "status": ["!=", "Cancelled"]}, limit_page_length=0, order_by="transaction_date desc, name desc",
                          fields=["name", "customer_name", "vendedor", "loja", "transaction_date", "delivery_date", "grand_total", "advance_paid", "etapa_pedido", "obs_pedido",
                                  "lucro_transferido", "lucro_transferido_valor", "lucro_transferido_por", "lucro_transferido_em"])
    nomes = [c.name for c in cab]
    loja_de = {_nome_canonico(p.name): p.loja for p in frappe.get_all("Sales Person", filters={"is_group": 0}, fields=["name", "loja"]) if p.loja}
    pago, titulos, prazo_item = {}, {}, {}
    hoje = frappe.utils.today()
    for i in range(0, len(nomes), 500):
        lote = nomes[i:i + 500]
        for r in frappe.db.sql("""select sii.sales_order so, si.name nf, si.grand_total, si.outstanding_amount aberto, si.due_date from `tabSales Invoice Item` sii
                                  join `tabSales Invoice` si on si.name = sii.parent where si.docstatus = 1 and sii.sales_order in %(l)s group by sii.sales_order, si.name""", {"l": lote}, as_dict=True):
            pago[r.so] = pago.get(r.so, 0) + flt(r.grand_total) - flt(r.aberto)
            if flt(r.aberto) > 0.004:
                t = titulos.setdefault(r.so, {"n": 0, "saldo": 0, "vencido": 0, "prox": None})
                t["n"] += 1
                t["saldo"] += flt(r.aberto)
                if r.due_date:
                    d = str(r.due_date)
                    if d < hoje:
                        t["vencido"] += flt(r.aberto)
                    if t["prox"] is None or d < t["prox"]:
                        t["prox"] = d
        for r in frappe.db.sql("select parent, min(delivery_date) d from `tabSales Order Item` where parent in %(l)s and delivery_date is not null group by parent", {"l": lote}, as_dict=True):
            prazo_item[r.parent] = str(r.d)
    saida = []
    for c in cab:
        vend = _nome_canonico((c.vendedor or "").strip()) or "(sem vendedor)"
        recebido = max(flt(c.advance_paid), pago.get(c.name, 0))
        a_receber = max(flt(c.grand_total) - recebido, 0)
        t = titulos.get(c.name) or {"n": 0, "saldo": 0, "vencido": 0, "prox": None}
        obs = (c.obs_pedido or "").strip()
        saida.append({"codigo": c.name, "cliente": c.customer_name or "", "vendedor": vend, "loja": loja_de.get(vend) or c.loja or "Sem loja", "dataEmissao": str(c.transaction_date),
                      "valorTotal": flt(c.grand_total), "etapa": c.etapa_pedido or "", "prazo": str(c.delivery_date) if c.delivery_date else prazo_item.get(c.name), "recebido": recebido,
                      "aReceber": a_receber, "titulosAbertos": t["n"], "saldoEmTitulos": t["saldo"], "vencidoReceber": t["vencido"], "proximoVencimento": t["prox"],
                      "observacao": obs, "contrato": "contrato" in obs.lower(), "dirceu": "dirceu" in obs.lower(),
                      "lucroTransferido": ({"valor": flt(c.lucro_transferido_valor), "por": c.lucro_transferido_por or "", "em": str(c.lucro_transferido_em or "")} if c.lucro_transferido else None)})
    return {"atualizadoEm": frappe.utils.now(), "hoje": hoje, "pedidos": saida}


@frappe.whitelist()
def pedidos_lucro_transferido(pedido, transferido, valor=0):
    """Confirma (ou desfaz) que o lucro do pedido (formato 2) foi transferido."""
    frappe.only_for(["System Manager", "Gestor Comercial", "Accounts Manager"])
    if not frappe.db.exists("Sales Order", pedido):
        frappe.throw(_("Pedido {0} não encontrado.").format(pedido))
    on = int(transferido) == 1
    frappe.db.set_value("Sales Order", pedido, {"lucro_transferido": 1 if on else 0, "lucro_transferido_valor": flt(valor) if on else 0,
                                                 "lucro_transferido_por": frappe.session.user if on else "", "lucro_transferido_em": now_datetime() if on else None}, update_modified=False)
    frappe.db.commit()
    return {"lucroTransferido": {"valor": flt(valor), "por": frappe.session.user, "em": str(now_datetime())} if on else None}


# ---------------------------------------------------------------- Dashboard > Entregas e Mapa
_UF_NOMES = {"ACRE": "AC", "ALAGOAS": "AL", "AMAPA": "AP", "AMAZONAS": "AM", "BAHIA": "BA", "CEARA": "CE", "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", "GOIAS": "GO", "MARANHAO": "MA",
             "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS", "MINAS GERAIS": "MG", "PARA": "PA", "PARAIBA": "PB", "PARANA": "PR", "PERNAMBUCO": "PE", "PIAUI": "PI", "RIO DE JANEIRO": "RJ",
             "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS", "RONDONIA": "RO", "RORAIMA": "RR", "SANTA CATARINA": "SC", "SAO PAULO": "SP", "SERGIPE": "SE", "TOCANTINS": "TO"}
_SIGLAS = set(_UF_NOMES.values())


def _uf_de(estado, cidade):
    e = _norm_nome(estado)
    if e in _SIGLAS:
        return e, cidade
    if e in _UF_NOMES:
        return _UF_NOMES[e], cidade
    m = re.match(r"^(.*?)\s*[-/]\s*([A-Za-z]{2})$", cidade or "")
    if m and m.group(2).upper() in _SIGLAS:
        return m.group(2).upper(), m.group(1).strip()
    return "", cidade


def _loja_do_vendedor():
    return {_nome_canonico(p.name): p.loja for p in frappe.get_all("Sales Person", filters={"is_group": 0}, fields=["name", "loja"]) if p.loja}


def _numero_pedido(texto):
    d = re.sub(r"\D", "", str(texto or ""))
    return "PD %05d" % int(d) if d and len(d) <= 9 and int(d) > 0 else None


@frappe.whitelist()
def entregas_dashboard(inicio, fim):
    """Entregas lancadas (tela Entregas) ligadas ao Pedido de Venda: vendedor, loja, valor, recebimento na entrega e prazo."""
    frappe.only_for(_PEDIDOS_PAPEIS)
    if not (re.fullmatch(r"\d{4}-\d{2}-\d{2}", inicio or "") and re.fullmatch(r"\d{4}-\d{2}-\d{2}", fim or "")):
        frappe.throw(_("Período inválido."))
    ents = frappe.get_all("Entrega de Pedido", filters={"data": ["between", [inicio, fim]]}, order_by="data asc, creation asc",
                          fields=["name", "data", "motorista", "caminhao", "pedido", "cliente", "metragem", "valor", "creation"])
    mot = {m.name: m.nome for m in frappe.get_all("Motorista de Entrega", fields=["name", "nome"])}
    cam = {c.name: c.placa for c in frappe.get_all("Caminhao", fields=["name", "placa"])}
    codigos = {e.name: (_numero_pedido(e.pedido) or "") for e in ents}
    pedidos = sorted({c for c in codigos.values() if c and frappe.db.exists("Sales Order", c)})
    # todas as entregas desses pedidos (a pontualidade conta so a primeira lancada)
    todas = {}
    if pedidos:
        for e in frappe.get_all("Entrega de Pedido", fields=["name", "data", "pedido", "creation"], order_by="data asc, creation asc", limit_page_length=0):
            c = _numero_pedido(e.pedido)
            if c in pedidos:
                todas.setdefault(c, []).append(e.name)
    so, sched, pagtos, prazo_item = {}, {}, {}, {}
    loja_de = _loja_do_vendedor()
    if pedidos:
        for s in frappe.get_all("Sales Order", filters={"name": ["in", pedidos]}, fields=["name", "customer_name", "vendedor", "loja", "grand_total", "advance_paid", "delivery_date", "etapa_pedido"]):
            so[s.name] = s
        for r in frappe.db.sql("select parent, max(delivery_date) d from `tabSales Order Item` where parent in %(l)s and delivery_date is not null group by parent", {"l": pedidos}, as_dict=True):
            prazo_item[r.parent] = str(r.d)
        for r in frappe.get_all("Payment Schedule", filters={"parent": ["in", pedidos], "parenttype": "Sales Order"}, fields=["parent", "payment_term", "description", "payment_amount", "idx"], order_by="idx asc"):
            sched.setdefault(r.parent, []).append(r)
        for r in frappe.db.sql("""
            select x.so, per.allocated_amount valor, per.payment_term term, pe.posting_date data, pe.mode_of_payment forma
            from `tabPayment Entry Reference` per join `tabPayment Entry` pe on pe.name = per.parent and pe.docstatus = 1
            join (select name so, name ref from `tabSales Order` where name in %(l)s
                  union select sii.sales_order so, sii.parent ref from `tabSales Invoice Item` sii where sii.sales_order in %(l)s) x on x.ref = per.reference_name""", {"l": pedidos}, as_dict=True):
            pagtos.setdefault(r.so, []).append(r)
    linhas = []
    for e in ents:
        c = codigos[e.name]
        s = so.get(c)
        l = {"id": e.name, "data": str(e.data), "pedido": c or (e.pedido or ""), "cliente": (s.customer_name if s else None) or e.cliente or None, "metragem": e.metragem, "motorista": mot.get(e.motorista, "—"),
             "caminhao": cam.get(e.caminhao, "—"), "vendedor": None, "loja": "Sem loja", "pedidoEncontrado": bool(s), "valorPedido": None, "recebimento": None, "prazo": None,
             "liberado": False, "lancamentosDoPedido": len(todas.get(c, [])) or 1, "primeiraDoPedido": (todas.get(c) or [e.name])[0] == e.name}
        if s:
            vend = _nome_canonico((s.vendedor or "").strip())
            l.update({"vendedor": vend or None, "loja": loja_de.get(vend) or s.loja or "Sem loja", "valorPedido": flt(s.grand_total),
                      "prazo": str(s.delivery_date) if s.delivery_date else prazo_item.get(c), "liberado": (s.etapa_pedido or "") not in ("Entregue", "Cancelado")})
            lin = pagtos.get(c, [])
            total = max(sum(flt(p.valor) for p in lin), flt(s.advance_paid))
            da_entrega = [p for p in sched.get(c, []) if re.search("entrega", "%s %s" % (p.payment_term or "", p.description or ""), re.I) and not re.search("retira", "%s %s" % (p.payment_term or "", p.description or ""), re.I)]
            formas = set()
            if da_entrega:
                criterio, cobranca = "parcela", sum(flt(p.payment_amount) for p in da_entrega)
                termos = {p.payment_term for p in da_entrega if p.payment_term}
                na_entrega = sum(flt(p.valor) for p in lin if p.term in termos)
                formas = {p.forma for p in lin if p.term in termos and p.forma}
            else:
                criterio = "dia"
                dia = [p for p in lin if str(p.data) == str(e.data)]
                na_entrega = sum(flt(p.valor) for p in dia)
                cobranca = na_entrega
                formas = {p.forma for p in dia if p.forma}
            antes = max(0, total - na_entrega)
            em_aberto = max(0, flt(s.grand_total) - total)
            if cobranca > 0 and na_entrega >= cobranca - 0.01:
                sit = "RECEBIDO"
            elif na_entrega > 0:
                sit = "PARCIAL"
            elif cobranca > 0:
                sit = "A_RECEBER"
            elif antes > 0 and em_aberto <= 0.01:
                sit = "PAGO_ANTES"
            else:
                sit = "NAO"
            l["recebimento"] = {"cobranca": round(cobranca, 2), "naEntrega": round(na_entrega, 2), "antes": round(antes, 2), "total": round(total, 2), "emAberto": round(em_aberto, 2),
                                "formas": sorted(formas), "situacao": sit, "criterio": criterio}
        linhas.append(l)
    return {"inicio": inicio, "fim": fim, "atualizadoEm": frappe.utils.now(), "hoje": frappe.utils.today(), "entregas": linhas}


@frappe.whitelist()
def mapa_pedidos(modo="periodo", inicio=None, fim=None):
    """Pedidos por cidade e estado (cidade do endereco do cliente). modo 'a-entregar' = pedidos ainda nao entregues; 'periodo' = emitidos entre inicio e fim."""
    frappe.only_for(_PEDIDOS_PAPEIS)
    filtros = {"docstatus": 1, "status": ["!=", "Cancelled"]}
    if modo == "a-entregar":
        filtros["etapa_pedido"] = ["not in", ["Entregue", "Cancelado"]]
    else:
        if not (re.fullmatch(r"\d{4}-\d{2}-\d{2}", inicio or "") and re.fullmatch(r"\d{4}-\d{2}-\d{2}", fim or "")):
            frappe.throw(_("Período inválido."))
        filtros["transaction_date"] = ["between", [inicio, fim]]
        filtros["etapa_pedido"] = ["!=", "Cancelado"]
    cab = frappe.get_list("Sales Order", filters=filtros, limit_page_length=0, order_by="grand_total desc",
                          fields=["name", "customer", "customer_name", "vendedor", "loja", "transaction_date", "delivery_date", "grand_total", "shipping_address_name", "customer_address"])
    enderecos = {}
    nomes_end = {c.shipping_address_name or c.customer_address for c in cab if (c.shipping_address_name or c.customer_address)}
    if nomes_end:
        for a in frappe.get_all("Address", filters={"name": ["in", list(nomes_end)]}, fields=["name", "address_line1", "address_line2", "city", "state"]):
            enderecos[a.name] = a
    clientes = {c.customer for c in cab if not (c.shipping_address_name or c.customer_address)}
    por_cliente = {}
    if clientes:
        for a in frappe.db.sql("""select dl.link_name cliente, a.address_line1, a.address_line2, a.city, a.state from `tabAddress` a join `tabDynamic Link` dl on dl.parent = a.name and dl.parenttype = 'Address'
                                  and dl.link_doctype = 'Customer' where dl.link_name in %(c)s order by a.is_primary_address desc, a.creation asc""", {"c": list(clientes)}, as_dict=True):
            por_cliente.setdefault(a.cliente, a)
    loja_de = _loja_do_vendedor()
    pedidos, sem, lojas = [], {"pedidos": 0, "valor": 0}, set()
    for c in cab:
        vend = _nome_canonico((c.vendedor or "").strip()) or "(sem vendedor)"
        loja = loja_de.get(vend) or c.loja or "Sem loja"
        a = enderecos.get(c.shipping_address_name or c.customer_address) or por_cliente.get(c.customer)
        cidade, uf = ((a.city or "").strip(), "") if a else ("", "")
        if a:
            uf, cidade = _uf_de(a.state, cidade)
        if not (cidade and uf):
            sem["pedidos"] += 1
            sem["valor"] += flt(c.grand_total)
            continue
        lojas.add(loja)
        pedidos.append({"codigo": c.name, "cliente": c.customer_name or "", "cidade": cidade, "uf": uf, "endereco": ", ".join(x for x in (a.address_line1, a.address_line2) if x), "enderecoEntrega": bool(c.shipping_address_name),
                        "vendedor": vend, "loja": loja, "dataEmissao": str(c.transaction_date), "prazo": str(c.delivery_date) if c.delivery_date else None, "valor": flt(c.grand_total)})
    return {"modo": modo, "inicio": inicio, "fim": fim, "atualizadoEm": frappe.utils.now(), "totalPedidos": len(pedidos) + sem["pedidos"], "semLocalizacao": sem,
            "lojas": sorted(lojas), "pedidos": pedidos}


@frappe.whitelist()
def mapa_geo(tipo):
    """Desenho dos estados e coordenadas dos municipios (arquivos em public/gferro/mapa)."""
    import json
    import os

    if tipo not in ("estados", "municipios"):
        frappe.throw(_("Tipo inválido."))
    with open(os.path.join(frappe.get_app_path("erpnext", "public", "gferro", "mapa"), tipo + ".json"), encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------- Dashboard > Financeiro > Saidas
@frappe.whitelist()
def saidas_financeiras(inicio, fim):
    """O que foi pago no periodo (Lancamentos de Pagamento 'Pagar'), por titulo da DRE, classificacao e fornecedor. A classificacao vem do lancamento ou da fatura que ele baixa."""
    frappe.only_for(["System Manager", "Accounts Manager", "Accounts User", "Gestor Comercial"])
    if not (re.fullmatch(r"\d{4}-\d{2}-\d{2}", inicio or "") and re.fullmatch(r"\d{4}-\d{2}-\d{2}", fim or "")):
        frappe.throw(_("Período inválido."))
    rows = frappe.db.sql(
        """
        select pe.name, pe.paid_amount valor, pe.party_name fornecedor,
               coalesce(nullif(pe.classificacao_financeira, ''),
                        (select min(pi.classificacao_financeira) from `tabPayment Entry Reference` per join `tabPurchase Invoice` pi on pi.name = per.reference_name
                         where per.parent = pe.name and per.reference_doctype = 'Purchase Invoice' and ifnull(pi.classificacao_financeira, '') <> '')) cod
        from `tabPayment Entry` pe where pe.docstatus = 1 and pe.payment_type = 'Pay' and pe.posting_date between %(i)s and %(f)s""", {"i": inicio, "f": fim}, as_dict=True)
    cls = {c.name: c for c in frappe.get_all("Classificacao Financeira", fields=["name", "nome", "grupo"])}
    SEM = "Sem classificação"
    grupos, total, qtd = {}, 0.0, 0
    for r in rows:
        v = abs(flt(r.valor))
        if not v:
            continue
        c = cls.get(r.cod)
        g = grupos.setdefault((c.grupo if c and c.grupo else SEM), {"total": 0.0, "n": 0, "cat": {}, "forn": {}})
        g["total"] += v
        g["n"] += 1
        for mapa, nome in ((g["cat"], c.nome if c else SEM), (g["forn"], r.fornecedor or "Sem fornecedor")):
            x = mapa.setdefault(nome, {"nome": nome, "total": 0.0, "quantidade": 0})
            x["total"] += v
            x["quantidade"] += 1
        total += v
        qtd += 1

    def lista(mapa, limite=None):
        itens = sorted(({**x, "total": round(x["total"], 2)} for x in mapa.values()), key=lambda x: (-x["total"], x["nome"]))
        return itens[:limite] if limite else itens

    saida = [{"nome": n, "total": round(g["total"], 2), "quantidade": g["n"], "percentual": round(g["total"] / total * 100, 1) if total else 0,
              "categorias": lista(g["cat"]), "fornecedores": lista(g["forn"], 10)} for n, g in grupos.items()]
    saida.sort(key=lambda g: (-g["total"], g["nome"]))
    return {"inicio": inicio, "fim": fim, "total": round(total, 2), "quantidade": qtd, "atualizadoEm": frappe.utils.now(), "grupos": saida}


# ---------------------------------------------------------------- Dashboard > Financeiro > Planejamento financeiro
_FIN_PAPEIS = ["System Manager", "Accounts Manager", "Accounts User", "Gestor Comercial"]


def _mes_limites(mes):
    import calendar

    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", mes or ""):
        frappe.throw(_("Mês inválido."))
    a, m = int(mes[:4]), int(mes[5:])
    return "%s-01" % mes, "%s-%02d" % (mes, calendar.monthrange(a, m)[1])


def _classif_mapa():
    return {c.name: c for c in frappe.get_all("Classificacao Financeira", fields=["name", "nome", "grupo"])}


@frappe.whitelist()
def planejamento_financeiro(mes):
    """Contas em aberto (a receber/a pagar) com a data replanejada, o que foi baixado no mes e os totais do planejamento financeiro."""
    frappe.only_for(_FIN_PAPEIS)
    ini, fim = _mes_limites(mes)
    hoje = frappe.utils.today()
    em7 = str(frappe.utils.add_days(hoje, 7))
    cls = _classif_mapa()

    def cat(cod):
        c = cls.get(cod)
        return (c.nome if c else "Sem classificação"), (c.grupo if c and c.grupo else "Sem classificação")

    receber, pagar = [], []
    for r in frappe.db.sql("""select name, customer_name pessoa, outstanding_amount aberto, due_date, data_replanejada, classificacao_financeira cod from `tabSales Invoice`
                              where docstatus = 1 and outstanding_amount > 0.005 and is_return = 0""", as_dict=True):
        orig = str(r.due_date or hoje)
        venc = str(r.data_replanejada or orig)
        c, g = cat(r.cod or "1.6")
        receber.append({"id": r.name, "tipo": "receber", "pessoa": r.pessoa or "", "categoria": c, "grupo": g, "valor": flt(r.aberto), "vencimento": venc,
                        "status": "Vencida" if venc < hoje else "A Vencer" if venc <= em7 else "Em Dia", "vencimentoOriginal": orig if r.data_replanejada else None})
    for r in frappe.db.sql("""select name, supplier_name pessoa, outstanding_amount aberto, due_date, bill_date, data_replanejada, classificacao_financeira cod from `tabPurchase Invoice`
                              where docstatus = 1 and outstanding_amount > 0.005 and is_return = 0""", as_dict=True):
        orig = str(r.due_date or r.bill_date or hoje)
        venc = str(r.data_replanejada or orig)
        c, g = cat(r.cod)
        pagar.append({"id": r.name, "tipo": "pagar", "pessoa": r.pessoa or "", "categoria": c, "grupo": g, "valor": flt(r.aberto), "vencimento": venc,
                      "status": "Vencida" if venc < hoje else "A Vencer" if venc <= em7 else "Agendada", "vencimentoOriginal": orig if r.data_replanejada else None})
    concl = []
    for r in frappe.db.sql("""
        select pe.name, pe.payment_type tp, pe.party_name pessoa, pe.paid_amount pago, pe.received_amount recebido, pe.posting_date,
               coalesce(nullif(pe.classificacao_financeira, ''),
                 (select min(coalesce(nullif(pi.classificacao_financeira, ''), 'x')) from `tabPayment Entry Reference` per join `tabPurchase Invoice` pi on pi.name = per.reference_name where per.parent = pe.name and per.reference_doctype = 'Purchase Invoice'),
                 (select min('1.6') from `tabPayment Entry Reference` per where per.parent = pe.name and per.reference_doctype in ('Sales Invoice', 'Sales Order'))) cod
        from `tabPayment Entry` pe where pe.docstatus = 1 and pe.payment_type in ('Pay', 'Receive') and pe.posting_date between %(i)s and %(f)s order by pe.posting_date""", {"i": ini, "f": fim}, as_dict=True):
        c, g = cat(r.cod if r.cod and r.cod != "x" else "")
        concl.append({"id": r.name, "tipo": "receber" if r.tp == "Receive" else "pagar", "pessoa": r.pessoa or "", "categoria": c, "grupo": g,
                      "valor": abs(flt(r.recebido if r.tp == "Receive" else r.pago)), "dataBaixa": str(r.posting_date)})
    fat = frappe.db.sql("select ifnull(sum(grand_total), 0) from `tabSales Invoice` where docstatus = 1 and is_return = 0 and posting_date between %s and %s", (ini, fim))[0][0]
    ent = sum(c["valor"] for c in concl if c["tipo"] == "receber")
    sai = sum(c["valor"] for c in concl if c["tipo"] == "pagar")
    return {"mesReferencia": mes, "hoje": hoje, "atualizadoEm": frappe.utils.now(), "faturamentoMes": flt(fat), "totalReceber": sum(c["valor"] for c in receber), "totalPagar": sum(c["valor"] for c in pagar),
            "saldoMes": round(ent - sai, 2), "valorVencidoReceber": sum(c["valor"] for c in receber if c["status"] == "Vencida"), "contasReceber": receber, "contasPagar": pagar, "contasConcluidas": concl}


@frappe.whitelist()
def financeiro_reprogramar(tipo, id, nova_data=None):
    """Move a conta para outro dia no calendario (nao muda o vencimento da fatura). nova_data vazia desfaz."""
    frappe.only_for(_FIN_PAPEIS)
    dt = {"receber": "Sales Invoice", "pagar": "Purchase Invoice"}.get(tipo)
    if not dt or not frappe.db.exists(dt, id):
        frappe.throw(_("Conta não encontrada."))
    if nova_data and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", nova_data):
        frappe.throw(_("Data inválida."))
    frappe.db.set_value(dt, id, "data_replanejada", nova_data or None, update_modified=False)
    frappe.db.commit()
    return {"ok": 1}


@frappe.whitelist()
def financeiro_dre(mes):
    """DRE do mes por titulo (grupo da classificacao): programado = faturas com vencimento no mes; realizado = baixas (pagamentos/recebimentos) no mes."""
    frappe.only_for(_FIN_PAPEIS)
    ini, fim = _mes_limites(mes)
    cls = _classif_mapa()
    grupos = {}
    ordem = sorted({c.grupo for c in cls.values() if c.grupo}, key=lambda g: int((min((x.name for x in cls.values() if x.grupo == g), key=lambda n: int(n.split(".")[0]))).split(".")[0]))

    def somar(cod, campo, valor):
        c = cls.get(cod)
        g = c.grupo if c and c.grupo else "Sem classificação"
        linha = grupos.setdefault(g, {"grupo": g, "programado": 0.0, "realizado": 0.0, "contas": {}})
        linha[campo] += valor
        sub = linha["contas"].setdefault(c.nome if c else "Sem classificação", {"categoria": c.nome if c else "Sem classificação", "programado": 0.0, "realizado": 0.0})
        sub[campo] += valor

    for r in frappe.db.sql("select ifnull(nullif(classificacao_financeira, ''), '1.6') cod, grand_total v from `tabSales Invoice` where docstatus = 1 and is_return = 0 and coalesce(due_date, posting_date) between %s and %s", (ini, fim), as_dict=True):
        somar(r.cod, "programado", flt(r.v))
    for r in frappe.db.sql("select classificacao_financeira cod, grand_total v from `tabPurchase Invoice` where docstatus = 1 and is_return = 0 and coalesce(due_date, bill_date, posting_date) between %s and %s", (ini, fim), as_dict=True):
        somar(r.cod, "programado", flt(r.v))
    for c in planejamento_financeiro(mes)["contasConcluidas"]:
        cod = next((k for k, v in cls.items() if v.nome == c["categoria"]), "")
        somar(cod, "realizado", c["valor"])
    linhas = []
    for g in ordem + [x for x in grupos if x not in ordem]:
        if g in grupos:
            l = grupos[g]
            linhas.append({"grupo": g, "programado": round(l["programado"], 2), "realizado": round(l["realizado"], 2),
                           "contas": sorted(({**v, "programado": round(v["programado"], 2), "realizado": round(v["realizado"], 2)} for v in l["contas"].values()), key=lambda x: -(x["programado"] + x["realizado"]))})
    return {"mesReferencia": mes, "atualizadoEm": frappe.utils.now(), "linhas": linhas}
