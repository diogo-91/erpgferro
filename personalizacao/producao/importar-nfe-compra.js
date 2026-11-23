/* Entrada de NF de compra por XML - Grupo Gferro (página "importar-nfe-compra")
 * Lê o XML da NF-e do fornecedor, sugere o item do ERP de cada linha (código do fornecedor, GTIN, código ou nome) e cria o
 * Recebimento de Compra em rascunho. O código do fornecedor fica guardado no item e as próximas notas já vêm casadas. */
frappe.pages["importar-nfe-compra"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Entrada de NF de compra (XML)", single_column: true });
  $(wrapper).addClass("gf-nfe");
  wrapper.gf_nfe = new GfNfeCompra(page);
};

function GfNfeCompra(page) {
  this.page = page; this.xml = null; this.nf = null; this.controles = [];
  var $m = $(page.main);
  $m.html('<div class="gfn"><p class="gfn-ajuda">Escolha o arquivo XML da NF-e de compra. O sistema confere o fornecedor, sugere os itens e cria o <b>Recebimento de Compra</b> em rascunho para você revisar e confirmar.</p>' +
    '<div class="gfn-linha"><input type="file" accept=".xml,text/xml" class="gfn-arq"></div><div class="gfn-res"></div></div>');
  var self = this;
  $m.find(".gfn-arq").on("change", function () {
    var f = this.files && this.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () { self.xml = r.result; self.ler(); };
    r.readAsText(f);
  });
}

GfNfeCompra.prototype.ler = function () {
  var self = this, $r = $(this.page.main).find(".gfn-res");
  $r.html("<p>Lendo...</p>");
  frappe.call({ method: "erpnext.gferro_utils.nfe_compra_ler", args: { xml: this.xml } }).then(function (r) {
    self.nf = r.message; self.desenhar();
  }).catch(function () { $r.html('<p class="gfn-erro">Não foi possível ler o XML.</p>'); });
};

GfNfeCompra.prototype.desenhar = function () {
  var self = this, nf = this.nf, $r = $(this.page.main).find(".gfn-res"), e = frappe.utils.escape_html;
  var h = '<div class="gfn-cab"><div><small>NF-e</small><b>' + e(nf.numero) + " / " + e(nf.serie) + "</b></div><div><small>Emissão</small><b>" + e(nf.emissao) + "</b></div>" +
    "<div><small>Fornecedor</small><b>" + e(nf.fornecedor_nome) + "</b><br>" + e(nf.fornecedor_cnpj_fmt) + (nf.fornecedor ? " · cadastrado" : ' · <span class="gfn-erro">não cadastrado</span>') + "</div>" +
    "<div><small>Valor da NF</small><b>" + format_currency(nf.valor_nf) + "</b></div></div>";
  if (nf.ja_importada) h += '<p class="gfn-erro">Esta NF-e já foi importada: ' + e(nf.ja_importada) + ".</p>";
  if (!nf.fornecedor) h += '<label class="gfn-chk"><input type="checkbox" class="gfn-criar" checked> Cadastrar o fornecedor automaticamente</label>';
  h += '<table class="gfn-t"><thead><tr><th>#</th><th>Produto na nota</th><th>Qtd</th><th>Un</th><th>Valor</th><th style="width:260px">Item no ERP</th></tr></thead><tbody>';
  nf.itens.forEach(function (it, i) {
    h += "<tr><td>" + (i + 1) + "</td><td>" + e(it.codigo) + " — " + e(it.nome) + "<br><small>NCM " + e(it.ncm) + "</small></td><td>" + it.qtd + "</td><td>" + e(it.unidade) + "</td><td>" + format_currency(it.valor) +
      '</td><td class="gfn-it" data-i="' + i + '"></td></tr>';
  });
  h += '</tbody></table><div class="gfn-rod"><div class="gfn-arm"></div><button type="button" class="btn btn-primary gfn-ok"' + (nf.ja_importada ? " disabled" : "") + ">Criar Recebimento de Compra</button></div>";
  $r.html(h);
  this.controles = [];
  $r.find(".gfn-it").each(function () {
    var i = +$(this).data("i");
    var c = frappe.ui.form.make_control({ parent: this, df: { fieldtype: "Link", options: "Item", fieldname: "item" + i, placeholder: "Escolha o item" }, render_input: true });
    c.set_value(nf.itens[i].item || "");
    self.controles[i] = c;
  });
  this.armazem = frappe.ui.form.make_control({ parent: $r.find(".gfn-arm")[0], df: { fieldtype: "Link", options: "Warehouse", label: "Armazém de entrada", fieldname: "armazem" }, render_input: true });
  this.armazem.refresh();
  frappe.db.get_value("Warehouse", { warehouse_name: "Almoxarifado" }, "name").then(function (r) { if (r.message && r.message.name) self.armazem.set_value(r.message.name); });
  $r.find(".gfn-ok").on("click", function () { self.criar(); });
};

GfNfeCompra.prototype.criar = function () {
  var self = this, mapa = {}, faltou = false;
  this.controles.forEach(function (c, i) { var v = c.get_value(); if (!v) faltou = true; mapa[i] = v; });
  if (faltou) { frappe.msgprint("Escolha o item do ERP em todas as linhas."); return; }
  frappe.call({ method: "erpnext.gferro_utils.nfe_compra_criar", freeze: true, args: {
    xml: this.xml, mapa: JSON.stringify(mapa), armazem: this.armazem.get_value() || null, criar_fornecedor: $(this.page.main).find(".gfn-criar").is(":checked") ? 1 : 0 } }).then(function (r) {
    var m = r.message;
    frappe.show_alert({ message: "Recebimento " + m.nome + " criado (rascunho).", indicator: "green" });
    frappe.set_route("Form", "Purchase Receipt", m.nome);
  });
};
