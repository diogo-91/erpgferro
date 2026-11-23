/* Saídas (Financeiro) - Grupo Gferro (página "saidas-financeiras")
 * Dashboard > Financeiro > Saídas da Intranet com os dados do ERP: o que foi pago no período (Lançamentos de Pagamento), agrupado pelos
 * títulos da DRE (grupo da classificação financeira) e, dentro de cada um, por classificação e por fornecedor.
 * A classificação vem do lançamento de pagamento ou da fatura de compra que ele baixa (campo "Classificação financeira"). */
frappe.pages["saidas-financeiras"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Saídas", single_column: true });
  $(wrapper).addClass("gf-sai");
  wrapper.gf_sai = new GfSaidas(page);
};
frappe.pages["saidas-financeiras"].on_page_show = function (wrapper) { if (wrapper.gf_sai) wrapper.gf_sai.carregar(); };

var GFS_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
var GFS_CORES = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#06b6d4", "#a855f7", "#d97706", "#0ea5e9"];
function gfsChave(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function gfsBr(iso) { var p = String(iso || "").slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "—"; }
function gfsBrl(n) { return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function gfsPct(n) { return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"; }
function gfsEsc(s) { return frappe.utils.escape_html(s == null ? "" : String(s)); }

function GfSaidas(page) {
  this.page = page; this.modo = "mes"; this.ref = new Date(); this.dados = null; this.sel = null; this.erro = "";
  this.$ = $(page.main); this.$.html('<div class="gfs"></div>'); this.$r = this.$.find(".gfs");
  var self = this;
  this.$r.on("click", "[data-modo]", function () { self.modo = $(this).data("modo"); self.sel = null; self.carregar(); });
  this.$r.on("click", "[data-mover]", function () { self.mover(+$(this).data("mover")); });
  this.$r.on("click", "[data-hoje]", function () { self.ref = new Date(); self.carregar(); });
  this.$r.on("change", "[data-data]", function () { if (this.value) { self.ref = new Date(this.value + "T00:00:00"); self.carregar(); } });
  this.$r.on("change", "[data-mesel]", function () { var p = this.value.split("-").map(Number); self.ref = new Date(p[0], p[1] - 1, 1); self.carregar(); });
  this.$r.on("click", "[data-atualizar]", function () { self.carregar(); });
  this.$r.on("click", "[data-grupo]", function () { self.sel = $(this).attr("data-grupo"); self.desenhar(); });
}
GfSaidas.prototype.mover = function (n) {
  var r = this.ref; this.ref = this.modo === "mes" ? new Date(r.getFullYear(), r.getMonth() + n, 1) : new Date(r.getFullYear(), r.getMonth(), r.getDate() + n * (this.modo === "semana" ? 7 : 1)); this.sel = null; this.carregar();
};
GfSaidas.prototype.intervalo = function () {
  var r = this.ref;
  if (this.modo === "dia") return { inicio: gfsChave(r), fim: gfsChave(r) };
  if (this.modo === "semana") { var dom = new Date(r.getFullYear(), r.getMonth(), r.getDate() - r.getDay()); return { inicio: gfsChave(dom), fim: gfsChave(new Date(dom.getFullYear(), dom.getMonth(), dom.getDate() + 6)) }; }
  return { inicio: gfsChave(new Date(r.getFullYear(), r.getMonth(), 1)), fim: gfsChave(new Date(r.getFullYear(), r.getMonth() + 1, 0)) };
};
GfSaidas.prototype.rotulo = function (iv) {
  if (this.modo === "mes") { var p = iv.inicio.split("-").map(Number); return GFS_MESES[p[1] - 1] + " de " + p[0]; }
  return iv.inicio === iv.fim ? gfsBr(iv.inicio) : gfsBr(iv.inicio) + " a " + gfsBr(iv.fim);
};
GfSaidas.prototype.carregar = function () {
  var self = this, iv = this.intervalo(); this.chave = iv.inicio + iv.fim;
  frappe.call({ method: "erpnext.gferro_utils.saidas_financeiras", args: iv }).then(function (r) {
    if (r.message.inicio + r.message.fim !== self.chave) return; self.dados = r.message; self.erro = ""; self.desenhar();
  }).catch(function () { self.erro = "Não foi possível carregar as saídas."; self.desenhar(); });
};

GfSaidas.prototype.lista = function (itens, total, cor) {
  if (!itens.length) return '<p class="gfs-vazio">Sem lançamentos.</p>';
  var max = itens[0].total || 1;
  return '<ol class="gfs-lista">' + itens.map(function (i) {
    return "<li><div class=\"gfs-l1\"><span>" + gfsEsc(i.nome) + "</span><b>" + gfsBrl(i.total) + '</b></div><div class="gfs-b2"><i style="width:' + Math.max(2, (i.total / max) * 100) + "%;background:" + cor + '"></i></div><small>' + (total ? gfsPct((i.total / total) * 100) + " · " : "") + i.quantidade + (i.quantidade === 1 ? " pagamento" : " pagamentos") + "</small></li>";
  }).join("") + "</ol>";
};

GfSaidas.prototype.desenhar = function () {
  var self = this, d = this.dados, iv = this.intervalo(), h = "";
  var opcoes = []; var hoje = new Date(); for (var i = 0; i < 13; i++) { var dt = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1); opcoes.push([gfsChave(dt), GFS_MESES[dt.getMonth()] + " de " + dt.getFullYear()]); }
  h += '<div class="gfs-topo"><div><div class="gfs-trilha">Financeiro • Saídas</div><h1>Saídas do caixa</h1><p>O que foi pago no período, por título da DRE, classificação e fornecedor.</p></div><button type="button" class="gfs-b" data-atualizar="1">Atualizar</button></div>';
  h += '<div class="gfs-barra"><div class="gfs-seg">' + [["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"]].map(function (m) { return '<button type="button" data-modo="' + m[0] + '" class="' + (self.modo === m[0] ? "gfs-on" : "") + '">' + m[1] + "</button>"; }).join("") + "</div>" +
    '<div class="gfs-nav"><button type="button" class="gfs-ic" data-mover="-1" aria-label="Período anterior">&#8249;</button><strong>' + this.rotulo(iv) + '</strong><button type="button" class="gfs-ic" data-mover="1" aria-label="Próximo período">&#8250;</button><button type="button" class="gfs-b gfs-p" data-hoje="1">Hoje</button>' +
    '<input type="date" data-data="1" value="' + gfsChave(this.ref) + '" aria-label="Escolher uma data">' + (this.modo === "mes" ? '<select data-mesel="1" class="gfs-sel">' + opcoes.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === iv.inicio ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" : "") + "</div></div>";
  if (this.erro) h += '<p class="gfs-aviso">' + gfsEsc(this.erro) + "</p>";
  if (!d) { this.$r.html(h + '<p class="gfs-vazio">Carregando...</p>'); return; }
  var grupos = d.grupos, atual = grupos.filter(function (g) { return g.nome === self.sel; })[0] || grupos[0];
  if (atual) this.sel = atual.nome;
  h += '<section class="gfs-kpis"><div class="gfs-kpi gfs-am"><span>Total pago</span><strong>' + gfsBrl(d.total) + "</strong><small>" + d.quantidade + (d.quantidade === 1 ? " pagamento" : " pagamentos") + " no período</small></div>" +
    '<div class="gfs-kpi"><span>Títulos da DRE</span><strong>' + grupos.length + "</strong><small>" + (grupos[0] ? "maior: " + gfsEsc(grupos[0].nome) + " (" + gfsPct(grupos[0].percentual) + ")" : "sem saídas") + "</small></div></section>";
  if (!grupos.length) return this.$r.html(h + '<p class="gfs-vazio">Nenhuma saída paga neste período.</p>');
  h += '<section class="gfs-card"><h2>Para onde foi o dinheiro — por título da DRE</h2><div class="gfs-grupos">' + grupos.map(function (g, i) {
    var cor = g.nome === "Sem classificação" ? "#94a3b8" : GFS_CORES[i % GFS_CORES.length];
    return '<button type="button" class="gfs-grupo' + (g.nome === self.sel ? " gfs-gsel" : "") + '" data-grupo="' + gfsEsc(g.nome) + '"><div class="gfs-l1"><span><i style="background:' + cor + '"></i>' + gfsEsc(g.nome) + "</span><b>" + gfsBrl(g.total) + '</b></div><div class="gfs-b2"><i style="width:' + Math.max(2, g.percentual) + "%;background:" + cor + '"></i></div><small>' + gfsPct(g.percentual) + " · " + g.quantidade + (g.quantidade === 1 ? " pagamento" : " pagamentos") + "</small></button>";
  }).join("") + "</div></section>";
  var idx = grupos.indexOf(atual), cor = atual.nome === "Sem classificação" ? "#94a3b8" : GFS_CORES[idx % GFS_CORES.length];
  h += '<div class="gfs-duas"><section class="gfs-card"><h2>' + gfsEsc(atual.nome) + " — por classificação</h2>" + this.lista(atual.categorias, atual.total, cor) + '</section><section class="gfs-card"><h2>' + gfsEsc(atual.nome) + " — maiores fornecedores</h2>" + this.lista(atual.fornecedores, atual.total, cor) + "</section></div>";
  this.$r.html(h);
};
