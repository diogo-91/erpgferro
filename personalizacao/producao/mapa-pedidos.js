/* Mapa - Grupo Gferro (página "mapa-pedidos")
 * Dashboard > Mapa da Intranet com os dados do ERP: pedidos por cidade e estado (cidade do endereço do cliente no cadastro de endereços).
 * "A entregar (ao vivo)" = pedidos confirmados ainda não entregues; "Pedidos do período" = emitidos no período (exceto cancelados).
 * Clique num estado para ver as cidades e numa cidade (círculo ou lista) para ver os pedidos. */
frappe.pages["mapa-pedidos"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Mapa", single_column: true });
  $(wrapper).addClass("gf-mapa");
  wrapper.gf_mapa = new GfMapa(page, wrapper);
};
frappe.pages["mapa-pedidos"].on_page_show = function (wrapper) { if (wrapper.gf_mapa) wrapper.gf_mapa.carregar(); };

var GFM_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
var GFM_ESC = 15, GFM_FL = Math.cos((15 * Math.PI) / 180);
var GFM_LARG = 40 * GFM_FL * GFM_ESC, GFM_ALT = 39.5 * GFM_ESC;
function gfmProj(lon, lat) { return [(lon + 74) * GFM_FL * GFM_ESC, (5.5 - lat) * GFM_ESC]; }
function gfmEsc(s) { return frappe.utils.escape_html(s == null ? "" : String(s)); }
function gfmBrl(n) { return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function gfmInt(n) { return Number(n || 0).toLocaleString("pt-BR"); }
function gfmPl(n, a, b) { return gfmInt(n) + " " + (n === 1 ? a : b); }
function gfmBr(iso) { var p = String(iso || "").slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "—"; }
function gfmChave(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function gfmNorm(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().toUpperCase(); }
function gfmCaminho(aneis) { return aneis.map(function (anel) { return anel.map(function (p, i) { var q = gfmProj(p[0], p[1]); return (i === 0 ? "M" : "L") + q[0].toFixed(1) + " " + q[1].toFixed(1); }).join("") + "Z"; }).join(""); }
function gfmLimites(f) {
  var mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  f.aneis.forEach(function (a) { a.forEach(function (p) { var q = gfmProj(p[0], p[1]); mnx = Math.min(mnx, q[0]); mxx = Math.max(mxx, q[0]); mny = Math.min(mny, q[1]); mxy = Math.max(mxy, q[1]); }); });
  var m = Math.max(mxx - mnx, mxy - mny) * 0.08; return { x: mnx - m, y: mny - m, l: mxx - mnx + 2 * m, a: mxy - mny + 2 * m };
}

function gfmAgregar(pedidos, loja) {
  var porC = {}, c;
  pedidos.forEach(function (p) {
    if (loja && p.loja !== loja) return;
    var k = p.uf + "|" + gfmNorm(p.cidade);
    c = porC[k] || (porC[k] = { cidade: p.cidade, uf: p.uf, pedidos: 0, valor: 0 }); c.pedidos++; c.valor += p.valor;
  });
  var cidades = Object.keys(porC).map(function (k) { return porC[k]; }).sort(function (a, b) { return b.pedidos - a.pedidos || a.cidade.localeCompare(b.cidade, "pt-BR"); });
  var porE = {};
  cidades.forEach(function (ci) { var e = porE[ci.uf] || (porE[ci.uf] = { uf: ci.uf, pedidos: 0, valor: 0, cidades: [] }); e.pedidos += ci.pedidos; e.valor += ci.valor; e.cidades.push(ci); });
  var estados = Object.keys(porE).map(function (k) { return porE[k]; }).sort(function (a, b) { return b.pedidos - a.pedidos; });
  return { estados: estados, cidades: cidades, pedidos: cidades.reduce(function (s, c2) { return s + c2.pedidos; }, 0), valor: cidades.reduce(function (s, c2) { return s + c2.valor; }, 0) };
}

function GfMapa(page, wrapper) {
  this.wrapper = wrapper; this.page = page; this.modo = "a-entregar"; this.ref = new Date(); this.de = ""; this.ate = ""; this.loja = "todas"; this.uf = null; this.cidade = null;
  this.dados = null; this.estados = null; this.coord = null; this.erro = ""; this.foco = null;
  this.$ = $(page.main); this.$.html('<div class="gfm"></div><div class="gfm-modal" hidden></div>'); this.$r = this.$.find(".gfm"); this.$m = this.$.find(".gfm-modal");
  var self = this;
  this.$r.on("click", "[data-modo]", function () { self.modo = $(this).data("modo"); self.uf = null; self.carregar(); });
  this.$r.on("click", "[data-mes]", function () { self.ref = new Date(self.ref.getFullYear(), self.ref.getMonth() + +$(this).data("mes"), 1); self.uf = null; self.carregar(); });
  this.$r.on("change", "[data-selmes]", function () { var p = this.value.split("-").map(Number); self.ref = new Date(p[0], p[1] - 1, 1); self.uf = null; self.carregar(); });
  this.$r.on("change", "[data-de]", function () { self.de = this.value; self.carregar(); });
  this.$r.on("change", "[data-ate]", function () { self.ate = this.value; self.carregar(); });
  this.$r.on("click", "[data-limpar]", function () { self.de = ""; self.ate = ""; self.carregar(); });
  this.$r.on("change", "[data-loja]", function () { self.loja = this.value; self.desenhar(); });
  this.$r.on("click", "[data-atualizar]", function () { self.carregar(); });
  this.$r.on("click", "[data-uf]", function () { var u = $(this).attr("data-uf"); self.uf = (u === self.uf ? null : u); self.desenhar(); });
  this.$r.on("click", "[data-brasil]", function () { self.uf = null; self.desenhar(); });
  this.$r.on("click", "[data-cid]", function () { self.cidade = { cidade: $(this).attr("data-cid"), uf: $(this).attr("data-cuf") || self.uf || "" }; self.abrirCidade(); });
  this.$r.on("mousemove", "[data-tip]", function (e) { var a = self.$r.find(".gfm-area")[0].getBoundingClientRect(); self.$r.find(".gfm-tip").html($(this).attr("data-tip")).css({ display: "block", left: Math.min(e.clientX - a.left + 12, a.width - 190), top: e.clientY - a.top + 12 }); });
  this.$r.on("mouseleave", "svg", function () { self.$r.find(".gfm-tip").hide(); });
  this.$m.on("click", function (e) { if (e.target === this || $(e.target).is("[data-fechar]")) $(this).attr("hidden", true); });
  $(document).on("keydown.gfm", function (e) { if (e.key === "Escape") self.$m.attr("hidden", true); });
  this.temporizador = setInterval(function () { if (self.modo === "a-entregar" && $(self.wrapper).is(":visible") && !document.hidden) self.carregar(true); }, 30000);
}

GfMapa.prototype.intervalo = function () {
  if (this.de && this.ate) return { inicio: this.de, fim: this.ate };
  return { inicio: gfmChave(new Date(this.ref.getFullYear(), this.ref.getMonth(), 1)), fim: gfmChave(new Date(this.ref.getFullYear(), this.ref.getMonth() + 1, 0)) };
};

GfMapa.prototype.carregar = function (silencioso) {
  var self = this, iv = this.intervalo();
  if (this.modo === "periodo" && this.de && this.ate && this.de > this.ate) { this.erro = "A data inicial deve ser anterior ou igual à data final."; this.desenhar(); return; }
  this.erro = "";
  var geo = this.estados ? Promise.resolve() : Promise.all([
    frappe.call({ method: "erpnext.gferro_utils.mapa_geo", args: { tipo: "estados" } }).then(function (r) { self.estados = r.message; }),
    frappe.call({ method: "erpnext.gferro_utils.mapa_geo", args: { tipo: "municipios" } }).then(function (r) { self.coord = r.message; })]);
  var chave = this.modo + iv.inicio + iv.fim; this.chave = chave;
  Promise.all([geo, frappe.call({ method: "erpnext.gferro_utils.mapa_pedidos", args: { modo: this.modo, inicio: iv.inicio, fim: iv.fim } })]).then(function (r) {
    if (chave !== self.chave) return; self.dados = r[1].message; self.desenhar();
  }).catch(function () { if (!silencioso) { self.erro = "Não foi possível carregar o mapa."; self.desenhar(); } });
};

GfMapa.prototype.desenhar = function () {
  var self = this, d = this.dados, a = this.modo === "a-entregar", h = "";
  var opcoes = []; var hoje = new Date(); for (var i = 0; i < 13; i++) { var dt = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1); opcoes.push({ v: gfmChave(dt), r: GFM_MESES[dt.getMonth()] + " de " + dt.getFullYear() }); }
  var mesAtual = gfmChave(new Date(this.ref.getFullYear(), this.ref.getMonth(), 1)), personalizado = !!(this.de && this.ate);
  h += '<div class="gfm-topo"><div><div class="gfm-trilha">Dashboard • Mapa</div><h1>Pedidos por cidade e estado</h1><p>' + (a ? "Todos os pedidos confirmados que ainda não foram entregues, pela cidade do endereço do cliente no ERP, ao vivo. " : "Todos os pedidos emitidos no período (exceto cancelados), pela cidade do endereço do cliente no ERP. ") +
    'Clique em um estado para ver as cidades.</p></div><button type="button" class="gfm-b" data-atualizar="1">Atualizar</button></div>';
  h += '<div class="gfm-barra"><div class="gfm-seg">' + [["a-entregar", "A entregar (ao vivo)"], ["periodo", "Pedidos do período"]].map(function (m) { return '<button type="button" data-modo="' + m[0] + '" class="' + (self.modo === m[0] ? "gfm-on" : "") + '">' + m[1] + "</button>"; }).join("") + "</div>";
  if (!a && !personalizado) h += '<div class="gfm-mes"><button type="button" class="gfm-ic" data-mes="-1">&#8249;</button><select data-selmes="1" class="gfm-sel">' + (opcoes.some(function (o) { return o.v === mesAtual; }) ? "" : '<option value="' + mesAtual + '">' + GFM_MESES[this.ref.getMonth()] + " de " + this.ref.getFullYear() + "</option>") +
    opcoes.map(function (o) { return '<option value="' + o.v + '"' + (o.v === mesAtual ? " selected" : "") + ">" + o.r + "</option>"; }).join("") + '</select><button type="button" class="gfm-ic" data-mes="1">&#8250;</button></div>';
  if (!a) h += '<div class="gfm-intv' + (personalizado ? " gfm-intv-on" : "") + '">De <input type="date" data-de="1" value="' + this.de + '"> Até <input type="date" data-ate="1" value="' + this.ate + '">' + (this.de || this.ate ? ' <button type="button" class="gfm-lk" data-limpar="1">Limpar</button>' : "") + "</div>";
  var lojas = d ? d.lojas : [];
  h += '<select data-loja="1" class="gfm-sel"><option value="todas">Todas as lojas</option>' + lojas.map(function (l) { return '<option value="' + gfmEsc(l) + '"' + (self.loja === l ? " selected" : "") + ">" + gfmEsc(l) + "</option>"; }).join("") + "</select></div>";
  if (this.erro) h += '<p class="gfm-aviso">' + gfmEsc(this.erro) + "</p>";
  if (!d || !this.estados) { this.$r.html(h + '<p class="gfm-vazio">Carregando...</p>'); return; }
  var lojaSel = this.loja === "todas" ? null : this.loja, ag = gfmAgregar(d.pedidos, lojaSel), porUf = {}; ag.estados.forEach(function (e) { porUf[e.uf] = e; });
  var maxE = ag.estados[0] ? ag.estados[0].pedidos : 0, feic = this.uf ? this.estados.filter(function (e) { return e.uf === self.uf; })[0] : null;
  var cx = feic ? gfmLimites(feic) : { x: 0, y: 0, l: GFM_LARG, a: GFM_ALT };
  var cidV = this.uf ? ag.cidades.filter(function (c) { return c.uf === self.uf; }) : ag.cidades, maxC = cidV[0] ? cidV[0].pedidos : 0, un = cx.l / 600;
  var semLoc = d.semLocalizacao.pedidos;
  var kp = function (t, v, s) { return '<div class="gfm-kpi"><span>' + t + "</span><strong>" + v + "</strong><small>" + s + "</small></div>"; };
  h += '<p class="gfm-nota">' + (a ? '<b class="gfm-live">● Ao vivo</b> ' : "") + "Pedidos do ERP lidos às " + new Date(d.atualizadoEm.replace(" ", "T")).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + "</p>";
  h += '<section class="gfm-kpis">' + kp("Pedidos", gfmInt(ag.pedidos + (lojaSel ? 0 : semLoc)), lojaSel ? gfmEsc(lojaSel) : (a ? "ainda não entregues" : "emitidos no período")) +
    kp("Estados", gfmInt(ag.estados.length), ag.estados[0] ? "mais pedidos: " + ag.estados[0].uf + " (" + gfmInt(ag.estados[0].pedidos) + ")" : "sem pedidos") +
    kp("Cidades", gfmInt(ag.cidades.length), ag.cidades[0] ? "mais pedidos: " + gfmEsc(ag.cidades[0].cidade) + " (" + gfmInt(ag.cidades[0].pedidos) + ")" : "sem pedidos") + kp("Valor dos pedidos", gfmBrl(ag.valor), "nas cidades localizadas") + "</section>";
  var bolhas = [], semCoord = 0;
  cidV.forEach(function (c) { var co = self.coord[c.uf + "|" + gfmNorm(c.cidade)]; if (!co) { semCoord++; return; } var q = gfmProj(co[1], co[0]); bolhas.push({ c: c, x: q[0], y: q[1] }); });
  var svg = '<svg viewBox="' + cx.x + " " + cx.y + " " + cx.l + " " + cx.a + '" class="gfm-svg">';
  this.estados.forEach(function (e) {
    var dd = porUf[e.uf], sel = e.uf === self.uf, it = dd && maxE > 0 ? (self.uf ? 0.14 : 0.18 + 0.72 * Math.sqrt(dd.pedidos / maxE)) : 0;
    svg += '<path d="' + gfmCaminho(e.aneis) + '" fill="' + (dd ? "rgba(234,179,8," + it.toFixed(2) + ")" : "#f5f5f5") + '" stroke="' + (sel ? "#171717" : "#a3a3a3") + '" stroke-width="' + ((sel ? 1.6 : 0.8) * un) + '" stroke-linejoin="round" class="gfm-est" data-uf="' + e.uf +
      '" data-tip="<b>' + gfmEsc(e.nome) + "</b><br>" + gfmPl(dd ? dd.pedidos : 0, "pedido", "pedidos") + " · " + gfmBrl(dd ? dd.valor : 0) + '"/>';
  });
  bolhas.forEach(function (b) {
    var r = (4 + 18 * Math.sqrt(b.c.pedidos / Math.max(maxC, 1))) * un;
    svg += '<circle cx="' + b.x + '" cy="' + b.y + '" r="' + r + '" fill="rgba(23,23,23,.55)" stroke="#fff" stroke-width="' + (0.8 * un) + '" class="gfm-bol" data-cid="' + gfmEsc(b.c.cidade) + '" data-cuf="' + b.c.uf + '" data-tip="<b>' + gfmEsc(b.c.cidade) + " — " + b.c.uf + "</b><br>" + gfmPl(b.c.pedidos, "pedido", "pedidos") + " · " + gfmBrl(b.c.valor) + '"/>';
  });
  svg += "</svg>";
  h += '<div class="gfm-grid"><section class="gfm-card"><div class="gfm-cab"><h2>' + (feic ? gfmEsc(feic.nome) + " (" + feic.uf + ")" : "Brasil") + "</h2>" + (feic ? '<button type="button" class="gfm-b gfm-p" data-brasil="1">Voltar ao Brasil</button>' : "") + '</div><div class="gfm-area">' + svg + '<div class="gfm-tip"></div></div>' +
    '<p class="gfm-nota">Cor do estado e tamanho do círculo = quantidade de pedidos. Passe o mouse para ver o valor e clique no círculo para ver os pedidos da cidade.' + (semCoord > 0 ? " " + gfmPl(semCoord, "cidade", "cidades") + " sem posição no mapa (aparecem na lista)." : "") + "</p></section>";
  var linhas = this.uf ? cidV.map(function (c) { return { nome: c.cidade, pedidos: c.pedidos, valor: c.valor, cid: c.cidade }; }) : ag.estados.map(function (e) { var f = self.estados.filter(function (x) { return x.uf === e.uf; })[0]; return { nome: f ? f.nome : e.uf, pedidos: e.pedidos, valor: e.valor, uf: e.uf }; });
  var mx = this.uf ? maxC : maxE;
  h += '<aside class="gfm-card gfm-lado"><h2>' + (feic ? "Cidades de " + gfmEsc(feic.nome) : "Estados") + '</h2><ol>' + (linhas.length ? linhas.map(function (l) {
    return '<li><button type="button" ' + (l.uf ? 'data-uf="' + l.uf + '"' : 'data-cid="' + gfmEsc(l.cid) + '" data-cuf="' + self.uf + '"') + '><div class="gfm-l1"><span>' + gfmEsc(l.nome) + "</span><b>" + gfmInt(l.pedidos) + '</b></div><div class="gfm-barra2"><i style="width:' + Math.max(3, (l.pedidos / Math.max(mx, 1)) * 100) + '%"></i></div><small>' + gfmBrl(l.valor) + "</small></button></li>";
  }).join("") : '<li class="gfm-vazio">' + (a ? "Nenhum pedido pendente de entrega." : "Sem pedidos no período.") + "</li>") + "</ol>" +
    (!lojaSel && semLoc > 0 ? '<p class="gfm-nota gfm-pad">' + gfmPl(semLoc, "pedido", "pedidos") + " de clientes sem cidade no cadastro (" + gfmBrl(d.semLocalizacao.valor) + ") não aparecem no mapa.</p>" : "") + "</aside></div>";
  this.$r.html(h);
  if (!this.$m.attr("hidden") && this.cidade) this.abrirCidade();
};

GfMapa.prototype.abrirCidade = function () {
  var self = this, c = this.cidade, d = this.dados; if (!d || !c) return;
  var lista = d.pedidos.filter(function (p) { return p.uf === c.uf && gfmNorm(p.cidade) === gfmNorm(c.cidade) && (self.loja === "todas" || p.loja === self.loja); });
  var a = this.modo === "a-entregar", total = lista.reduce(function (s, p) { return s + p.valor; }, 0);
  var h = '<div class="gfm-dlg"><div class="gfm-dlg-cab"><div><h2>' + gfmEsc(c.cidade) + " — " + gfmEsc(c.uf) + "</h2><small>" + gfmPl(lista.length, "pedido", "pedidos") + " · " + gfmBrl(total) + '</small></div><button type="button" class="gfm-ic" data-fechar="1" aria-label="Fechar">&times;</button></div><div class="gfm-dlg-corpo"><table class="gfm-t"><thead><tr><th>Pedido</th><th>Cliente</th><th>Endereço de entrega</th><th>Cidade</th><th>Vendedor</th><th>Loja</th><th>Emissão</th>' + (a ? "<th>Prazo</th>" : "") + '<th class="n">Valor</th></tr></thead><tbody>';
  lista.forEach(function (p) { h += "<tr><td><b>" + gfmEsc(p.codigo) + "</b></td><td>" + gfmEsc(p.cliente) + "</td><td>" + (p.endereco ? gfmEsc(p.endereco) + (p.enderecoEntrega ? "" : " <small>(endereço principal)</small>") : "—") + "</td><td>" + gfmEsc(p.cidade) + "</td><td>" + gfmEsc(p.vendedor) + "</td><td>" + gfmEsc(p.loja) + "</td><td>" + gfmBr(p.dataEmissao) + "</td>" + (a ? "<td>" + gfmBr(p.prazo) + "</td>" : "") + '<td class="n">' + gfmBrl(p.valor) + "</td></tr>"; });
  this.$m.html(h + "</tbody></table></div></div>").removeAttr("hidden");
};
