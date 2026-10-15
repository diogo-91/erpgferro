/* Painel de Vendas - Grupo Gferro (pagina "painel-vendas") */
frappe.pages["painel-vendas"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Painel de Vendas", single_column: true });
  $(wrapper).addClass("gf-painel");
  wrapper.gf_painel = new GfPainelVendas(page, wrapper);
};
frappe.pages["painel-vendas"].on_page_show = function (wrapper) {
  if (wrapper.gf_painel) wrapper.gf_painel.carregar();
};

var GFP_ICONES = {
  predio: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  trofeu: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3"/>',
  atualizar: '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>',
  pdf: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6"/>',
  loja: '<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0M9 20v-6h6v6"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M8 14h2M14 14h2"/>',
  dia: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v4l2 2"/>',
  carteira: '<path d="M4 7a2 2 0 012-2h12v4M4 7v10a2 2 0 002 2h13a1 1 0 001-1v-9a1 1 0 00-1-1H6a2 2 0 01-2-2zM16 14h2"/>',
  documento: '<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"/>',
  pessoas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-4.5 12.2-4.5 13 0M16 4.6a3.3 3.3 0 010 6.4M18.5 15.5c1.8.6 2.8 2 3 4.5"/>',
  ticket: '<path d="M5 4h14v6a2 2 0 000 4v6H5v-6a2 2 0 000-4zM9 9h6M9 13h6"/>',
  percentual: '<path d="M18 6L6 18"/><circle cx="7.5" cy="7.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/>',
  ampulheta: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
  caixa: '<path d="M12 3l8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10"/>',
  caminhao: '<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8zM6 18.5v.01M17 18.5v.01"/><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  tendencia: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>'
};

function GfPainelVendas(page, wrapper) {
  var self = this;
  this.page = page;
  this.wrapper = wrapper;
  this.estado = { periodo: "mes", mes: this.chaveMes(new Date()), de: "", ate: "", loja: null };
  this.lojas = [];
  this.linhas = [];
  this.ehGestor = frappe.user_roles.indexOf("Gestor Comercial") > -1 || frappe.user_roles.indexOf("System Manager") > -1 ||
    frappe.user_roles.indexOf("Sales Manager") > -1;
  this.montar();
  this.carregarLojas().then(function () { self.carregar(); });
}

GfPainelVendas.prototype.chaveMes = function (d) {
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
};
GfPainelVendas.prototype.iso = function (d) {
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
};
GfPainelVendas.prototype.esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
};
GfPainelVendas.prototype.rs = function (v) {
  return "R$ " + Math.round(v || 0).toLocaleString("pt-BR");
};
GfPainelVendas.prototype.icone = function (n, cls) {
  return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
    'stroke-linecap="round" stroke-linejoin="round">' + GFP_ICONES[n] + "</svg>";
};

GfPainelVendas.prototype.montar = function () {
  var self = this, hoje = new Date(), opcoes = "";
  for (var i = 0; i < 12; i++) {
    var d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    var rotulo = i === 0 ? "Mês atual" : d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    opcoes += '<option value="' + this.chaveMes(d) + '">' + rotulo + "</option>";
  }
  var html =
    '<div class="gfp">' +
    '<section class="gfp-hero">' +
    '<div class="gfp-top">' +
    '<div class="gfp-tit"><div class="gfp-crumb">Dashboard <i>›</i> <b>Vendas</b></div><h1>Painel de Vendas</h1>' +
    "<p>Somente pedidos Liberados ou Atendidos Totalmente, vendedores e desempenho comercial da GFERRO.</p></div>" +
    '<div class="gfp-btns"><button class="gfp-btn gfp-btn-claro" data-acao="gestao">' + this.icone("predio") + "Gestão</button>" +
    '<button class="gfp-btn" data-acao="ranking">' + this.icone("trofeu") + "Ranking de Vendedores</button></div></div>" +
    '<div class="gfp-lojas"></div>' +
    "</section>" +
    '<section class="gfp-filtros">' +
    '<div class="gfp-seg"><button data-p="dia">' + this.icone("dia") + 'Dia</button><button data-p="semana">Semana</button>' +
    '<button data-p="mes" class="on">Mês</button></div>' +
    '<select class="gfp-mes">' + opcoes + "</select>" +
    '<div class="gfp-datas"><span class="gfp-cal">' + this.icone("calendario") + "</span>" +
    '<label>De <input type="date" class="gfp-de"></label><label>Até <input type="date" class="gfp-ate"></label></div>' +
    '<span class="gfp-atual"></span>' +
    '<button class="gfp-btn gfp-btn-borda" data-acao="atualizar">' + this.icone("atualizar") + "Atualizar dados</button>" +
    '<button class="gfp-btn gfp-btn-borda" data-acao="pdf">' + this.icone("pdf") + "Baixar PDF</button></section>" +
    '<div class="gfp-kpis"></div>' +
    '<div class="gfp-vazio" hidden>Nenhum pedido liberado neste período.</div>' +
    "</div>";
  $(this.page.body).html(html);
  this.$ = $(this.page.body);

  this.$.on("click", "[data-acao]", function () {
    var a = $(this).data("acao");
    if (a === "atualizar") self.carregar();
    else if (a === "pdf") window.print();
    else if (a === "gestao") frappe.set_route("List", "Sales Order", "Kanban", "Pedidos");
    else if (a === "ranking") self.ranking();
  });
  this.$.on("click", ".gfp-seg button", function () {
    self.estado.periodo = $(this).data("p");
    self.$.find(".gfp-seg button").removeClass("on");
    $(this).addClass("on");
    self.$.find(".gfp-de, .gfp-ate").val("");
    self.estado.de = self.estado.ate = "";
    self.carregar();
  });
  this.$.on("change", ".gfp-mes", function () {
    self.estado.periodo = "mes";
    self.estado.mes = $(this).val();
    self.$.find(".gfp-seg button").removeClass("on").filter('[data-p="mes"]').addClass("on");
    self.$.find(".gfp-de, .gfp-ate").val("");
    self.estado.de = self.estado.ate = "";
    self.carregar();
  });
  this.$.on("change", ".gfp-de, .gfp-ate", function () {
    self.estado.de = self.$.find(".gfp-de").val();
    self.estado.ate = self.$.find(".gfp-ate").val();
    if (self.estado.de || self.estado.ate) {
      self.estado.periodo = "custom";
      self.$.find(".gfp-seg button").removeClass("on");
      self.carregar();
    }
  });
  this.$.on("click", ".gfp-loja", function () {
    var v = $(this).data("loja");
    self.estado.loja = self.estado.loja === v ? null : v;
    self.desenharLojas();
    self.carregar();
  });
};

GfPainelVendas.prototype.carregarLojas = function () {
  var self = this;
  return frappe.call({
    method: "frappe.client.get_list",
    args: { doctype: "Branch", fields: ["name", "gerente"], limit_page_length: 50, order_by: "name asc" }
  }).then(function (r) {
    self.lojas = (r && r.message) || [];
    self.desenharLojas();
  }).catch(function () { self.lojas = []; });
};

GfPainelVendas.prototype.desenharLojas = function () {
  var self = this, $l = this.$.find(".gfp-lojas");
  if (!this.ehGestor || !this.lojas.length) { $l.hide(); return; }
  $l.show().html(this.lojas.map(function (l) {
    var nome = l.name.replace(/^Loja\s*/, "Unidade ") + (l.gerente ? " — " + l.gerente : "");
    return '<button class="gfp-loja' + (self.estado.loja === l.name ? " on" : "") + '" data-loja="' + self.esc(l.name) + '">' +
      self.icone("loja") + self.esc(nome) + "</button>";
  }).join(""));
};

GfPainelVendas.prototype.intervalo = function () {
  var e = this.estado, hoje = new Date(), de, ate;
  if (e.periodo === "custom") {
    de = e.de || "1900-01-01"; ate = e.ate || "2999-12-31";
  } else if (e.periodo === "dia") {
    de = ate = this.iso(hoje);
  } else if (e.periodo === "semana") {
    var d0 = new Date(hoje); d0.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
    var d1 = new Date(d0); d1.setDate(d0.getDate() + 6);
    de = this.iso(d0); ate = this.iso(d1);
  } else {
    var p = e.mes.split("-"), a = parseInt(p[0], 10), m = parseInt(p[1], 10);
    de = this.iso(new Date(a, m - 1, 1)); ate = this.iso(new Date(a, m, 0));
  }
  return [de, ate];
};

GfPainelVendas.prototype.carregar = function () {
  var self = this, iv = this.intervalo();
  var filtros = [["docstatus", "=", 1], ["transaction_date", "between", iv]];
  if (this.estado.loja) filtros.push(["loja", "=", this.estado.loja]);
  return frappe.call({
    method: "frappe.client.get_list",
    args: {
      doctype: "Sales Order",
      fields: ["name", "transaction_date", "grand_total", "total_taxes_and_charges", "advance_paid", "vendedor", "owner", "loja", "etapa_pedido"],
      filters: filtros, limit_page_length: 0
    }
  }).then(function (r) {
    var linhas = ((r && r.message) || []).filter(function (x) { return x.etapa_pedido !== "Cancelado"; });
    self.linhas = linhas;
    var nomes = linhas.map(function (x) { return x.name; });
    if (!nomes.length) { self.parafusos = 0; return self.desenhar(); }
    return frappe.call({
      method: "frappe.client.get_list",
      args: { doctype: "Sales Order Item", parent: "Sales Order", fields: ["parent", "item_name", "amount"],
              filters: [["parent", "in", nomes]], limit_page_length: 0 }
    }).then(function (ri) {
      var tot = 0;
      ((ri && ri.message) || []).forEach(function (it) {
        if (/parafuso/i.test(it.item_name || "")) tot += flt(it.amount);
      });
      self.parafusos = tot;
      self.desenhar();
    }).catch(function () { self.parafusos = 0; self.desenhar(); });
  });
};

/* mini grafico decorativo no rodape de cada indicador */
GfPainelVendas.prototype.onda = function (n) {
  var formas = [
    "M0 40 C20 40 25 22 45 24 C65 26 70 10 92 14 C112 18 118 34 140 30 C160 26 170 38 200 36 L200 48 L0 48Z",
    "M0 42 C25 42 30 30 52 32 C72 34 78 16 100 20 C122 24 130 38 152 34 C172 30 184 40 200 40 L200 48 L0 48Z",
    "M0 38 C18 36 32 28 50 30 C70 32 80 18 104 22 C128 26 136 40 160 36 C176 33 188 38 200 37 L200 48 L0 48Z"
  ];
  return '<svg class="gfp-onda" viewBox="0 0 200 48" preserveAspectRatio="none"><path d="' + formas[n % 3] + '"/></svg>';
};

GfPainelVendas.prototype.desenhar = function () {
  var self = this, L = this.linhas, total = 0, rec = 0, fretes = 0, vend = {};
  L.forEach(function (x) {
    total += flt(x.grand_total); rec += flt(x.advance_paid); fretes += flt(x.total_taxes_and_charges);
    var v = x.vendedor || x.owner; if (v) vend[v] = true;
  });
  var n = L.length, ticket = n ? total / n : 0, falta = Math.max(total - rec, 0);
  var pct = total ? rec * 100 / total : 0;
  var idx = 0;
  var cartao = function (cls, icone, rotulo, valor, selo) {
    var html = '<div class="gfp-k gfp-' + cls + '"><div class="gfp-kh"><span class="gfp-ico">' + self.icone(icone) + "</span>" +
      '<span class="gfp-kl">' + rotulo + "</span></div>" +
      '<div class="gfp-kv">' + valor + "</div>" +
      '<div class="gfp-kf">' + (selo ? '<span class="gfp-badge">' + selo + "</span>" : "<span></span>") +
      '<span class="gfp-trend">' + self.icone("tendencia") + "</span></div>" + self.onda(idx) + "</div>";
    idx += 1;
    return html;
  };
  this.$.find(".gfp-kpis").html(
    cartao("verde", "carteira", "Total de Vendas", this.rs(total)) +
    cartao("roxo", "documento", "Pedidos", n) +
    cartao("amarelo", "pessoas", "Vendedores<br>Ativos", Object.keys(vend).length) +
    cartao("rosa", "ticket", "Ticket Médio", this.rs(ticket)) +
    cartao("agua", "percentual", "Percentual<br>Recebido", this.rs(rec), pct.toFixed(1).replace(".", ",") + "%") +
    cartao("laranja", "ampulheta", "Falta Receber", this.rs(falta)) +
    cartao("ambar", "caixa", "Total em<br>Parafusos", this.rs(this.parafusos || 0)) +
    cartao("azul", "caminhao", "Total Fretes e<br>Outros", this.rs(fretes))
  );
  this.$.find(".gfp-vazio").prop("hidden", n > 0);
  var agora = new Date();
  this.$.find(".gfp-atual").text("Atualizado em " + agora.toLocaleDateString("pt-BR") + ", " + agora.toLocaleTimeString("pt-BR"));
};

GfPainelVendas.prototype.ranking = function () {
  var por = {}, self = this;
  this.linhas.forEach(function (x) {
    var v = x.vendedor || x.owner || "—";
    por[v] = por[v] || { n: 0, t: 0 };
    por[v].n += 1; por[v].t += flt(x.grand_total);
  });
  var lista = Object.keys(por).map(function (k) { return { v: k, n: por[k].n, t: por[k].t }; })
    .sort(function (a, b) { return b.t - a.t; });
  var tot = lista.reduce(function (s, x) { return s + x.t; }, 0);
  var corpo = lista.map(function (x, i) {
    return "<tr><td>" + (i + 1) + "º</td><td>" + self.esc(x.v) + "</td><td>" + x.n + "</td><td>" + self.rs(x.t) + "</td><td>" +
      self.rs(x.n ? x.t / x.n : 0) + "</td><td>" + (tot ? (x.t * 100 / tot).toFixed(1).replace(".", ",") : "0") + "%</td></tr>";
  }).join("") || '<tr><td colspan="6" style="text-align:center">Sem pedidos no período.</td></tr>';
  var d = new frappe.ui.Dialog({ title: "Ranking de Vendedores", size: "large" });
  d.$body.html('<table class="gfp-rank"><thead><tr><th>#</th><th>Vendedor</th><th>Pedidos</th><th>Total</th><th>Ticket médio</th><th>% do total</th></tr></thead><tbody>' + corpo + "</tbody></table>");
  d.show();
};
