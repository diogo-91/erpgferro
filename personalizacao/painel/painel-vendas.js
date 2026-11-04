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
  tendencia: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  grafico: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  parafuso: '<path d="M12 3l8 4v10l-8 4-8-4V7zM12 8v8M9 10h6"/>',
  etiqueta: '<path d="M3 12V4h8l10 10-8 8zM7.5 8.5v.01"/>'
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
    '<div class="gfp-kpis"></div><div class="gfp-prod"></div><div class="gfp-extra"></div>' +
    '<div class="gfp-vazio" hidden>Nenhum pedido liberado neste período.</div>' +
    "</div>";
  $(this.page.body).html(html);
  this.$ = $(this.page.body);

  this.$.on("click", "[data-acao]", function () {
    var a = $(this).data("acao");
    if (a === "atualizar") self.carregar();
    else if (a === "pdf") window.print();
    else if (a === "gestao") frappe.set_route("List", "Sales Order", "Kanban", "Pedidos");
    else if (a === "ranking") {
      // abre a pagina Ranking de Vendedores levando a unidade e o periodo escolhidos
      var iv = self.intervalo();
      frappe.route_options = { loja: self.estado.loja || "", de: iv[0], ate: iv[1] };
      frappe.set_route("ranking-vendedores");
    }
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
    self.estado.loja = (v && self.estado.loja !== v) ? v : null;
    self.desenharLojas();
    self.carregar();
  });
};

GfPainelVendas.prototype.carregarLojas = function () {
  var self = this;
  return frappe.call({
    method: "frappe.client.get_list",
    args: { doctype: "Branch", fields: ["name", "gerente", "meta_mensal"], limit_page_length: 50, order_by: "name asc" }
  }).then(function (r) {
    self.lojas = (r && r.message) || [];
    self.desenharLojas();
  }).catch(function () { self.lojas = []; });
};

GfPainelVendas.prototype.desenharLojas = function () {
  var self = this, $l = this.$.find(".gfp-lojas");
  if (!this.ehGestor || !this.lojas.length) { $l.hide(); return; }
  var todas = '<button class="gfp-loja gfp-todas' + (!self.estado.loja ? " on" : "") + '" data-loja="">' +
    this.icone("predio") + "Visão geral</button>";
  $l.show().html(todas + this.lojas.map(function (l) {
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
    if (!nomes.length) { self.parafusos = 0; self.itens = []; return self.desenhar(); }
    return frappe.call({
      method: "frappe.client.get_list",
      args: { doctype: "Sales Order Item", parent: "Sales Order", fields: ["parent", "item_name", "qty", "uom", "amount"],
              filters: [["parent", "in", nomes]], limit_page_length: 0 }
    }).then(function (ri) {
      var tot = 0;
      ((ri && ri.message) || []).forEach(function (it) {
        if (/parafuso/i.test(it.item_name || "")) tot += flt(it.amount);
      });
      self.parafusos = tot;
      self.itens = (ri && ri.message) || [];
      self.desenhar();
    }).catch(function () { self.parafusos = 0; self.itens = []; self.desenhar(); });
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
  this.metaCartao();
  this.aplicarModo();
  this.produtos();
  this.extras();
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

/* Visao geral: comparativo por unidade. Unidade aberta (ou gerente/vendedor): ranking de vendedores. */
GfPainelVendas.prototype.extras = function () {
  this.$.find(".gfp").toggleClass("vend-primeiro", !!(this.estado.loja || !this.ehGestor));
  if (this.estado.loja || !this.ehGestor) { return this.tabelaVendedores(); }
  var self = this, L = this.linhas, $x = this.$.find(".gfp-extra");
  var porLoja = !this.estado.loja && this.ehGestor;
  var grupos = {}, geral = 0;
  var nomeLoja = function (n) {
    var l = (self.lojas || []).filter(function (z) { return z.name === n; })[0];
    return n.replace(/^Loja\s*/, "Unidade ") + (l && l.gerente ? " — " + l.gerente : "");
  };
  L.forEach(function (x) {
    var chave = porLoja ? (x.loja || "Sem loja") : (x.vendedor || x.owner || "—");
    var g = grupos[chave] = grupos[chave] || { n: 0, t: 0, r: 0 };
    g.n += 1; g.t += flt(x.grand_total); g.r += flt(x.advance_paid);
    geral += flt(x.grand_total);
  });
  if (porLoja) {
    (this.lojas || []).forEach(function (l) { grupos[l.name] = grupos[l.name] || { n: 0, t: 0, r: 0 }; });
  }
  var chaves = Object.keys(grupos).sort(function (a, b) { return grupos[b].t - grupos[a].t || (a < b ? -1 : 1); });
  if (!chaves.length) { $x.html(""); return; }

  var titulo, subtitulo;
  if (porLoja) { titulo = "Resultado por unidade"; subtitulo = "Clique em uma unidade para ver os resultados individuais."; }
  else if (this.estado.loja) { titulo = nomeLoja(this.estado.loja) + " — vendedores"; subtitulo = "Resultados individuais da unidade no período."; }
  else { titulo = "Vendedores"; subtitulo = "Resultados no período."; }

  var linhas = chaves.map(function (k, i) {
    var g = grupos[k], falta = Math.max(g.t - g.r, 0);
    var nome = porLoja ? (k === "Sem loja" ? k : nomeLoja(k)) : k;
    return '<tr' + (porLoja && k !== "Sem loja" ? ' class="gfp-linha" data-loja="' + self.esc(k) + '"' : "") + ">" +
      "<td>" + (i + 1) + "º</td><td><b>" + self.esc(nome) + "</b></td><td>" + g.n + "</td><td>" + self.rs(g.t) + "</td><td>" +
      self.rs(g.n ? g.t / g.n : 0) + "</td><td>" + self.rs(g.r) + "</td><td>" + self.rs(falta) + "</td><td>" +
      '<span class="gfp-part"><i style="width:' + (geral ? Math.round(g.t * 100 / geral) : 0) + '%"></i></span> ' +
      (geral ? (g.t * 100 / geral).toFixed(1).replace(".", ",") : "0") + "%</td></tr>";
  }).join("");
  $x.html(
    '<div class="gfp-tabela"><div class="gfp-th"><h3>' + this.esc(titulo) + "</h3><span>" + this.esc(subtitulo) + "</span></div>" +
    '<table><thead><tr><th>#</th><th>' + (porLoja ? "Unidade" : "Vendedor") + "</th><th>Pedidos</th><th>Total de vendas</th>" +
    "<th>Ticket médio</th><th>Recebido</th><th>Falta receber</th><th>Participação</th></tr></thead><tbody>" + linhas + "</tbody></table></div>"
  );
  $x.find(".gfp-linha").off("click").on("click", function () {
    self.estado.loja = $(this).data("loja");
    self.desenharLojas();
    self.carregar();
  });
};

/* Vendas por Produto / Preco Medio de Venda (itens dos pedidos do periodo) */
GfPainelVendas.prototype.produtos = function () {
  var self = this, por = {};
  (this.itens || []).forEach(function (it) {
    var k = it.item_name || "—";
    var g = por[k] = por[k] || { q: 0, v: 0, u: it.uom || "" };
    g.q += flt(it.qty); g.v += flt(it.amount);
  });
  var lista = Object.keys(por).map(function (k) { return { nome: k, q: por[k].q, v: por[k].v, u: por[k].u, m: por[k].q ? por[k].v / por[k].q : 0 }; })
    .sort(function (a, b) { return b.v - a.v; });
  var $p = this.$.find(".gfp-prod");
  if (!lista.length) { $p.html(""); return; }
  var maxV = Math.max.apply(null, lista.map(function (x) { return x.v; })) || 1;
  var maxM = Math.max.apply(null, lista.map(function (x) { return x.m; })) || 1;
  var dec = function (n) { return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); };
  var moeda = function (n) { return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var lado = function (titulo, icone, cls, fn) {
    return '<div class="gfp-pn"><div class="gfp-pnh"><h3>' + self.icone(icone) + titulo + "</h3><span>" + lista.length +
      ' produtos</span></div><div class="gfp-lista">' + lista.map(fn).join("") + "</div></div>";
  };
  $p.html(
    lado("Vendas por Produto", "grafico", "vendas", function (x) {
      return '<div class="gfp-it"><div class="gfp-itt"><span class="gfp-nm" title="' + self.esc(x.nome) + '">' + self.esc(x.nome) +
        "</span><em>" + dec(x.q) + " " + self.esc(x.u) + '</em></div><div class="gfp-bar"><i class="gfp-b-amarela" style="width:' +
        Math.max(Math.round(x.v * 100 / maxV), 2) + '%"></i></div><b class="gfp-v-verde">' + self.rs(x.v) + "</b></div>";
    }) +
    lado("Preço Médio de Venda", "etiqueta", "preco", function (x) {
      return '<div class="gfp-it"><div class="gfp-itt"><span class="gfp-nm" title="' + self.esc(x.nome) + '">' + self.esc(x.nome) +
        "</span><em>" + dec(x.q) + " " + self.esc(x.u) + '</em></div><div class="gfp-bar"><i class="gfp-b-azul" style="width:' +
        Math.max(Math.round(x.m * 100 / maxM), 2) + '%"></i></div><b class="gfp-v-azul">' + moeda(x.m) + "/" + self.esc(x.u) + "</b></div>";
    })
  );
};

/* ---- visao individual da unidade ---- */
GfPainelVendas.prototype.nomeUnidade = function (n) {
  var l = (this.lojas || []).filter(function (z) { return z.name === n; })[0];
  return n.replace(/^Loja\s*/, "Unidade ") + (l && l.gerente ? " — " + l.gerente : "");
};

/* 9o indicador: meta mensal da unidade com barra de progresso */
GfPainelVendas.prototype.metaCartao = function () {
  var $k = this.$.find(".gfp-kpis"), self = this;
  $k.attr("data-n", this.estado.loja ? 9 : 8);
  if (!this.estado.loja) return;
  var l = (this.lojas || []).filter(function (z) { return z.name === self.estado.loja; })[0];
  var meta = flt(l && l.meta_mensal), total = 0;
  this.linhas.forEach(function (x) { total += flt(x.grand_total); });
  var pct = meta ? total * 100 / meta : 0;
  var corpo = meta
    ? '<div class="gfp-kv">' + this.rs(meta) + '</div><div class="gfp-prog"><i style="width:' + Math.min(pct, 100).toFixed(1) +
      '%"></i></div><div class="gfp-kd">' + pct.toFixed(1).replace(".", ",") + "% atingido</div>"
    : '<div class="gfp-kv">—</div><div class="gfp-kd">Defina a meta no cadastro da loja</div>';
  $k.append('<div class="gfp-k gfp-meta"><div class="gfp-kh"><span class="gfp-ico">' + this.icone("alvo") +
    '</span><span class="gfp-kl">Meta Mensal</span></div>' + corpo + "</div>");
};

/* cabecalho: titulo da unidade e botao de voltar */
GfPainelVendas.prototype.aplicarModo = function () {
  var self = this, $r = this.$.find(".gfp"), loja = this.estado.loja;
  $r.toggleClass("modo-loja", !!loja);
  var $h1 = this.$.find(".gfp h1"), $p = this.$.find(".gfp-tit p");
  if (!this.padraoTitulo) { this.padraoTitulo = $h1.text(); this.padraoSub = $p.text(); }
  if (loja) {
    $h1.html(this.icone("loja") + this.esc(this.nomeUnidade(loja)));
    $p.text("Vendas do período — só os pedidos dos vendedores desta unidade.");
    if (!this.$.find(".gfp-voltar").length) {
      $('<button class="gfp-voltar" type="button">← Visão geral</button>')
        .insertBefore(this.$.find(".gfp-tit .gfp-crumb"))
        .on("click", function () { self.estado.loja = null; self.desenharLojas(); self.carregar(); });
    }
  } else {
    $h1.text(this.padraoTitulo); $p.text(this.padraoSub);
    this.$.find(".gfp-voltar").remove();
  }
};

/* tabela "Vendedores da Unidade" */
GfPainelVendas.prototype.tabelaVendedores = function () {
  var self = this, $x = this.$.find(".gfp-extra"), por = {}, donoPedido = {};
  this.linhas.forEach(function (x) {
    var v = x.vendedor || x.owner || "—";
    donoPedido[x.name] = v;
    var g = por[v] = por[v] || { n: 0, t: 0, r: 0, fr: 0, pFrete: 0, pPar: {}, qPar: 0, vPar: 0 };
    g.n += 1; g.t += flt(x.grand_total); g.r += flt(x.advance_paid);
    g.fr += flt(x.total_taxes_and_charges);
    if (flt(x.total_taxes_and_charges) > 0) g.pFrete += 1;
  });
  (this.itens || []).forEach(function (it) {
    if (!/parafuso/i.test(it.item_name || "")) return;
    var v = donoPedido[it.parent]; if (!v || !por[v]) return;
    por[v].pPar[it.parent] = true; por[v].qPar += flt(it.qty); por[v].vPar += flt(it.amount);
  });
  var nomes = Object.keys(por).sort(function (a, b) { return por[b].t - por[a].t; });
  if (!nomes.length) { $x.html(""); return; }
  var m2 = function (n) { return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var q3 = function (n) { return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 }); };
  var titulo = this.estado.loja ? "Vendedores da " + this.nomeUnidade(this.estado.loja) : "Meus resultados";
  var corpo = nomes.map(function (nome, i) {
    var g = por[nome], medalha = i < 3 ? " m" + (i + 1) : "";
    return '<tr><td><span class="gfp-pos' + medalha + '">' + (i + 1) + "</span></td><td>" + self.esc(nome) + "</td>" +
      '<td class="c-verde">' + m2(g.t) + '</td><td class="c-magenta">' + m2(g.n ? g.t / g.n : 0) + '</td><td class="c-violeta">' + g.n + "</td>" +
      '<td class="c-teal">' + m2(g.r) + '</td><td class="c-laranja">' + Object.keys(g.pPar).length + '</td><td class="c-laranja">' + q3(g.qPar) + "</td>" +
      '<td class="c-vermelho">' + m2(g.vPar) + '</td><td class="c-azul">' + g.pFrete + '</td><td class="c-ciano">' + m2(g.fr) + "</td></tr>";
  }).join("");
  var th = function (ic, t) { return "<th>" + (ic ? self.icone(ic) : "") + t + "</th>"; };
  $x.html('<div class="gfp-vend"><div class="gfp-vh"><div><small>Desempenho da unidade</small><h3>' + this.esc(titulo) + "</h3></div>" +
    '<span class="gfp-pilula">' + nomes.length + " vendedor" + (nomes.length > 1 ? "es" : "") + "</span></div>" +
    '<div class="gfp-vt"><table><thead><tr><th>#</th><th>Vendedor</th>' + th("carteira", "Total vendido") + th("percentual", "Ticket médio") +
    th("caixa", "Pedidos") + th("ticket", "Total recebível") + th("parafuso", "Ped.<br>parafusos") + th("parafuso", "Parafusos") +
    th("parafuso", "Valor parafusos") + th("caminhao", "Ped.<br>frete/outros") + th("caminhao", "Fretes") + "</tr></thead><tbody>" + corpo +
    "</tbody></table></div></div>");
};
