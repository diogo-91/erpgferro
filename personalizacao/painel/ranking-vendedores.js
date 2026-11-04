/* Ranking de Vendedores - Grupo Gferro (pagina "ranking-vendedores") */
frappe.pages["ranking-vendedores"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Ranking de Vendedores", single_column: true });
  $(wrapper).addClass("gf-ranking");
  wrapper.gf_rank = new GfRanking(page);
};
frappe.pages["ranking-vendedores"].on_page_show = function (wrapper) {
  var r = wrapper.gf_rank;
  if (!r) return;
  var op = frappe.route_options || {};
  if (op.loja !== undefined) { r.estado.loja = op.loja || null; }
  if (op.mes) { r.estado.mes = op.mes; r.estado.de = r.estado.ate = ""; }
  if (op.de || op.ate) { r.estado.de = op.de || ""; r.estado.ate = op.ate || ""; }
  frappe.route_options = null;
  r.sincronizar();
  r.carregar();
};

function GfRanking(page) {
  var hoje = new Date();
  this.page = page;
  this.estado = { mes: this.chaveMes(hoje), de: "", ate: "", loja: null, busca: "" };
  this.linhas = [];
  this.montar();
  this.sincronizar();
}

GfRanking.prototype.chaveMes = function (d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); };
GfRanking.prototype.iso = function (d) {
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
};
GfRanking.prototype.esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
};
GfRanking.prototype.m2 = function (n) {
  return "R$ " + (n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
GfRanking.prototype.q3 = function (n) { return (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 }); };

GfRanking.prototype.ico = function (d) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + d + "</svg>";
};
var GFR = {
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M8 14h2M14 14h2"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  atualizar: '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>',
  carteira: '<path d="M4 7a2 2 0 012-2h12v4M4 7v10a2 2 0 002 2h13a1 1 0 001-1v-9a1 1 0 00-1-1H6a2 2 0 01-2-2zM16 14h2"/>',
  percentual: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10c0-2 6-2 6 0s-6 2-6 4 6 2 6 0"/>',
  caixa: '<path d="M12 3l8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10"/>',
  recebivel: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>',
  parafuso: '<path d="M12 3l8 4v10l-8 4-8-4V7zM12 8v8M9 10h6"/>',
  caminhao: '<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z"/><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>'
};

/* medalha em SVG (1o ouro com coroa, 2o prata, 3o bronze) */
GfRanking.prototype.medalha = function (pos) {
  var c = { 1: ["#FFE27A", "#F5A800", "#9A6200"], 2: ["#EEF1F6", "#9AA6B8", "#5E6B80"], 3: ["#FFC9A0", "#D2691E", "#7A3A0B"] }[pos];
  var id = "gm" + pos;
  var coroa = pos === 1 ? '<path d="M31 14l5 6 6-8 6 8 5-6-2 12H33z" fill="#F5A800" stroke="#9A6200" stroke-width="1.5"/>' : '';
  return '<svg class="rk-medalha" viewBox="0 0 84 96"><defs><radialGradient id="' + id + '" cx="40%" cy="35%" r="75%">' +
    '<stop offset="0" stop-color="' + c[0] + '"/><stop offset=".6" stop-color="' + c[1] + '"/><stop offset="1" stop-color="' + c[2] + '"/></radialGradient></defs>' +
    '<path d="M10 62c-8-10-8-26 0-38M74 62c8-10 8-26 0-38" fill="none" stroke="' + c[1] + '" stroke-width="3" stroke-linecap="round" opacity=".55"/>' +
    '<path d="M32 70l-6 22 16-8 16 8-6-22z" fill="' + c[1] + '" opacity=".9"/>' + coroa +
    '<circle cx="42" cy="50" r="26" fill="url(#' + id + ')" stroke="' + c[2] + '" stroke-width="2"/>' +
    '<circle cx="42" cy="50" r="19" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>' +
    '<text x="42" y="58" text-anchor="middle" font-size="22" font-weight="800" fill="#fff" stroke="' + c[2] + '" stroke-width=".8">' + pos + 'º</text></svg>';
};

GfRanking.prototype.trofeu = function () {
  return '<svg class="rk-trofeu" viewBox="0 0 220 190"><defs><linearGradient id="tg" x1="0" x2="1"><stop offset="0" stop-color="#FFE9A0"/>' +
    '<stop offset=".5" stop-color="#F5B400"/><stop offset="1" stop-color="#B97800"/></linearGradient></defs>' +
    '<path d="M60 24h100v46c0 28-22 50-50 50s-50-22-50-50z" fill="url(#tg)"/>' +
    '<path d="M60 36H34c0 26 12 40 30 44M160 36h26c0 26-12 40-30 44" fill="none" stroke="url(#tg)" stroke-width="10" stroke-linecap="round"/>' +
    '<rect x="98" y="118" width="24" height="28" fill="url(#tg)"/><rect x="72" y="146" width="76" height="18" rx="5" fill="url(#tg)"/>' +
    '<path d="M110 44l9 18 20 3-14 14 4 20-19-10-19 10 4-20-14-14 20-3z" fill="#FFF3BD" opacity=".85"/></svg>';
};

GfRanking.prototype.montar = function () {
  var self = this, hoje = new Date(), opcoes = "";
  for (var i = 0; i < 12; i++) {
    var d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    opcoes += '<option value="' + this.chaveMes(d) + '">' + (i === 0 ? "Mês atual" : d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })) + "</option>";
  }
  var controles = function (extra) {
    return '<select class="rk-mes">' + opcoes + "</select>" +
      '<div class="rk-datas"><span>' + self.ico(GFR.cal) + '</span><label>De <input type="date" class="rk-de"></label>' +
      '<span>' + self.ico(GFR.cal) + '</span><label>Até <input type="date" class="rk-ate"></label></div>' + (extra || "");
  };
  var html =
    '<div class="rk">' +
    '<header class="rk-head"><div class="rk-tit">' +
    '<div class="rk-crumb">Dashboard <i>›</i> Vendas <i>›</i> <b>Ranking de Vendedores</b></div>' +
    '<h1>Ranking de <span>Vendedores</span></h1><p>Veja o desempenho da equipe de vendas, com todos os indicadores.</p></div>' +
    '<div class="rk-ctrl rk-ctrl-top">' + controles('<button class="rk-atualizar" type="button">' + this.ico(GFR.atualizar) + "Atualizar dados</button>") + "</div>" +
    "</header>" +
    '<section class="rk-podio"></section>' +
    '<section class="rk-painel"><div class="rk-barra"><label class="rk-busca">' + this.ico(GFR.busca) +
    '<input type="search" class="rk-q" placeholder="Buscar vendedor…"></label><div class="rk-ctrl rk-ctrl-tab">' + controles() + "</div></div>" +
    '<div class="rk-tab"></div></section></div>';
  $(this.page.body).html(html);
  this.$ = $(this.page.body);

  this.$.on("change", ".rk-mes", function () {
    self.estado.mes = $(this).val(); self.estado.de = self.estado.ate = "";
    self.sincronizar(); self.carregar();
  });
  this.$.on("change", ".rk-de, .rk-ate", function () {
    var bloco = $(this).closest(".rk-ctrl");
    self.estado.de = bloco.find(".rk-de").val(); self.estado.ate = bloco.find(".rk-ate").val();
    self.sincronizar(); self.carregar();
  });
  this.$.on("click", ".rk-atualizar", function () { self.carregar(); });
  this.$.on("input", ".rk-q", function () { self.estado.busca = $(this).val().toLowerCase(); self.tabela(); });
};

GfRanking.prototype.intervalo = function () {
  var e = this.estado;
  if (e.de || e.ate) return [e.de || "1900-01-01", e.ate || "2999-12-31"];
  var p = e.mes.split("-"), a = parseInt(p[0], 10), m = parseInt(p[1], 10);
  var ini = new Date(a, m - 1, 1), fim = new Date(a, m, 0), hoje = new Date();
  if (fim > hoje && this.chaveMes(hoje) === e.mes) fim = hoje;
  return [this.iso(ini), this.iso(fim)];
};

GfRanking.prototype.sincronizar = function () {
  var iv = this.intervalo();
  this.$.find(".rk-mes").val(this.estado.mes);
  this.$.find(".rk-de").val(iv[0] === "1900-01-01" ? "" : iv[0]);
  this.$.find(".rk-ate").val(iv[1] === "2999-12-31" ? "" : iv[1]);
};

GfRanking.prototype.carregar = function () {
  var self = this, iv = this.intervalo();
  var filtros = [["docstatus", "=", 1], ["transaction_date", "between", iv]];
  if (this.estado.loja) filtros.push(["loja", "=", this.estado.loja]);
  return frappe.call({
    method: "frappe.client.get_list",
    args: { doctype: "Sales Order", fields: ["name", "grand_total", "advance_paid", "total_taxes_and_charges", "vendedor", "owner", "etapa_pedido"],
            filters: filtros, limit_page_length: 0 }
  }).then(function (r) {
    var linhas = ((r && r.message) || []).filter(function (x) { return x.etapa_pedido !== "Cancelado"; });
    self.linhas = linhas;
    var nomes = linhas.map(function (x) { return x.name; });
    if (!nomes.length) { self.itens = []; return self.desenhar(); }
    return frappe.call({
      method: "frappe.client.get_list",
      args: { doctype: "Sales Order Item", parent: "Sales Order", fields: ["parent", "item_name", "qty", "amount"],
              filters: [["parent", "in", nomes]], limit_page_length: 0 }
    }).then(function (ri) { self.itens = (ri && ri.message) || []; self.desenhar(); })
      .catch(function () { self.itens = []; self.desenhar(); });
  });
};

GfRanking.prototype.agregar = function () {
  var por = {}, dono = {};
  this.linhas.forEach(function (x) {
    // sem o campo Vendedor, mostra o nome (nao o e-mail) de quem criou o pedido
    var v = x.vendedor || ((frappe.user_info && frappe.user_info(x.owner)) || {}).fullname || x.owner || "—";
    dono[x.name] = v;
    var g = por[v] = por[v] || { nome: v, n: 0, t: 0, r: 0, fr: 0, pFrete: 0, pPar: {}, qPar: 0, vPar: 0 };
    g.n += 1; g.t += flt(x.grand_total); g.r += flt(x.advance_paid); g.fr += flt(x.total_taxes_and_charges);
    if (flt(x.total_taxes_and_charges) > 0) g.pFrete += 1;
  });
  (this.itens || []).forEach(function (it) {
    if (!/parafuso/i.test(it.item_name || "")) return;
    var v = dono[it.parent]; if (!v || !por[v]) return;
    por[v].pPar[it.parent] = true; por[v].qPar += flt(it.qty); por[v].vPar += flt(it.amount);
  });
  return Object.keys(por).map(function (k) { return por[k]; }).sort(function (a, b) { return b.t - a.t; });
};

GfRanking.prototype.desenhar = function () {
  this.lista = this.agregar();
  var self = this, top = this.lista.slice(0, 3), $p = this.$.find(".rk-podio");
  if (!top.length) {
    $p.html('<div class="rk-vazio">Nenhum pedido liberado neste período.</div>');
  } else {
    // cartoes do modelo (medalha e louros fazem parte da imagem); so o texto e dinamico
    var card = function (pos, v) {
      if (!v) {
        return '<div class="rk-card rk-p' + pos + ' rk-livre"><span class="rk-nome">—</span><span class="rk-rot">Total Vendido</span>' +
          '<span class="rk-val">' + self.m2(0) + "</span></div>";
      }
      return '<div class="rk-card rk-p' + pos + '"><span class="rk-nome" title="' + self.esc(v.nome) + '">' + self.esc(v.nome) +
        '</span><span class="rk-rot">Total Vendido</span><span class="rk-val">' + self.m2(v.t) + "</span></div>";
    };
    $p.html(card(2, top[1]) + card(1, top[0]) + card(3, top[2]));
  }
  this.tabela();
};

GfRanking.prototype.tabela = function () {
  var self = this, busca = this.estado.busca || "";
  var th = function (ic, t) { return "<th>" + (ic ? self.ico(GFR[ic]) : "") + t + "</th>"; };
  var corpo = (this.lista || []).map(function (g, i) {
    if (busca && g.nome.toLowerCase().indexOf(busca) < 0) return "";
    var cls = i < 3 ? " m" + (i + 1) : "";
    return '<tr class="' + (i === 0 ? "top1" : "") + '"><td><span class="rk-pos' + cls + '">' + (i + 1) + "</span></td><td>" + self.esc(g.nome) + "</td>" +
      '<td class="c-verde">' + self.m2(g.t) + '</td><td class="c-magenta">' + self.m2(g.n ? g.t / g.n : 0) + '</td><td class="c-violeta">' + g.n + "</td>" +
      '<td class="c-teal">' + self.m2(g.r) + '</td><td class="c-laranja">' + Object.keys(g.pPar).length + '</td><td class="c-laranja">' + self.q3(g.qPar) + "</td>" +
      '<td class="c-vermelho">' + self.m2(g.vPar) + '</td><td class="c-azul">' + g.pFrete + '</td><td class="c-ciano">' + self.m2(g.fr) + "</td></tr>";
  }).join("");
  this.$.find(".rk-tab").html('<table><thead><tr><th>#</th><th>Vendedor</th>' + th("carteira", "Total vendido") + th("percentual", "Ticket médio") +
    th("caixa", "Pedidos") + th("recebivel", "Total recebível") + th("parafuso", "Ped.<br>parafusos") + th("parafuso", "Parafusos") +
    th("parafuso", "Valor parafusos") + th("caminhao", "Ped.<br>frete/outros") + th("caminhao", "Fretes") + "</tr></thead><tbody>" +
    (corpo || '<tr><td colspan="11" class="rk-nada">Nenhum vendedor encontrado.</td></tr>') + "</tbody></table>");
};
