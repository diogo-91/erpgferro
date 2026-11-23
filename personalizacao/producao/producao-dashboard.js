/* Produção (Dashboard) - Grupo Gferro (página "producao-dashboard")
 * Dashboard > Produção da Intranet com os dados do ERP (Ordens de Serviço e Apontamentos). Duas visões pela rota:
 *   /desk/producao-dashboard/painel        - ordens em execução por centro (ao vivo) + Relatório de Produção do período
 *   /desk/producao-dashboard/planejamento  - Planejamento da Produção: ordens agendadas por dia (calendário) com os materiais
 * O valor produzido é uma estimativa (valor do pedido rateado pela quantidade). */
frappe.pages["producao-dashboard"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Produção", single_column: true });
  $(wrapper).addClass("gf-prd");
  wrapper.gf_prd = new GfProd(page, wrapper);
};
frappe.pages["producao-dashboard"].on_page_show = function (wrapper) {
  if (!wrapper.gf_prd) return;
  var r = (frappe.get_route && frappe.get_route()) || [];
  wrapper.gf_prd.abrir(r[1] === "planejamento" ? "planejamento" : "painel");
};

var GFR_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
var GFR_DIAS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
var GFR_ROT = { "em-producao": ["Em produção", "#d1fae5", "#047857"], "parado": ["Parado", "#fee2e2", "#b91c1c"], "aguardando": ["Aguardando", "#f3f4f6", "#4b5563"] };
var GFR_CORES = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];
function grChave(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function grBr(iso) { var p = String(iso || "").slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "—"; }
function grHora(iso) { return String(iso || "").slice(11, 16); }
function grBrl(n) { return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function grInt(n) { return Number(n || 0).toLocaleString("pt-BR"); }
function grNum(n) { return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }); }
function grEsc(s) { return frappe.utils.escape_html(s == null ? "" : String(s)); }
function grNorm(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function grDur(ms) { var m = Math.round(ms / 60000), h = Math.floor(m / 60); return h > 0 ? h + "h " + ("0" + (m % 60)).slice(-2) + "min" : m + " min"; }
function grDurS(ms) { var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return ("0" + h).slice(-2) + ":" + ("0" + m).slice(-2) + ":" + ("0" + (s % 60)).slice(-2); }

function GfProd(page, wrapper) {
  this.page = page; this.wrapper = wrapper; this.vista = "painel"; this.kanban = null; this.rel = null; this.plan = null; this.erro = "";
  var h = new Date(); this.modo = "dia"; this.ref = h; this.pagina = 1; this.busca = ""; this.ano = h.getFullYear(); this.mes = h.getMonth(); this.diaAberto = null; this.pbusca = "";
  this.$ = $(page.main); this.$.html('<div class="gfr"></div><div class="gfr-modal" hidden></div>'); this.$r = this.$.find(".gfr"); this.$m = this.$.find(".gfr-modal");
  var self = this;
  this.$r.on("click", "[data-modo]", function () { self.modo = $(this).data("modo"); self.pagina = 1; self.carregarRel(); });
  this.$r.on("click", "[data-mover]", function () { self.ref = self.deslocar(+$(this).data("mover")); self.pagina = 1; self.carregarRel(); });
  this.$r.on("click", "[data-hoje]", function () { self.ref = new Date(); self.pagina = 1; self.carregarRel(); });
  this.$r.on("change", "[data-data]", function () { if (this.value) { self.ref = new Date(this.value + "T00:00:00"); self.pagina = 1; self.carregarRel(); } });
  this.$r.on("click", "[data-pag]", function () { self.pagina += +$(this).data("pag"); self.desenhar(); });
  this.$r.on("input", ".gfr-busca", function () { self.busca = this.value; self.pagina = 1; var p = this.selectionStart; self.desenhar(); var i = self.$r.find(".gfr-busca").trigger("focus")[0]; if (i) i.setSelectionRange(p, p); });
  this.$r.on("input", ".gfr-pbusca", function () { self.pbusca = this.value; var p = this.selectionStart; self.desenhar(); var i = self.$r.find(".gfr-pbusca").trigger("focus")[0]; if (i) i.setSelectionRange(p, p); });
  this.$r.on("click", "[data-atualizar]", function () { self.carregar(); });
  this.$r.on("click", "[data-mm]", function () { var d = new Date(self.ano, self.mes + +$(this).data("mm"), 1); self.ano = d.getFullYear(); self.mes = d.getMonth(); self.carregarPlan(); });
  this.$r.on("click", "[data-phoje]", function () { var d = new Date(); self.ano = d.getFullYear(); self.mes = d.getMonth(); self.carregarPlan(); });
  this.$r.on("click", "[data-pdia]", function () { self.diaAberto = $(this).attr("data-pdia"); self.abrirDia(); });
  this.$m.on("click", function (e) { if (e.target === this || $(e.target).is("[data-fechar]")) $(this).attr("hidden", true); });
  this.$m.on("change", "[data-agendar]", function () { var os = $(this).attr("data-agendar"), v = this.value; if (!v) return; self.$m.attr("hidden", true); self.agendar(os, v); });
  $(document).on("keydown.gfr", function (e) { if (e.key === "Escape") self.$m.attr("hidden", true); });
  this.temporizador = setInterval(function () { if ($(self.wrapper).is(":visible") && !document.hidden && self.vista === "painel") self.carregarKanban(true); if (self.kanban && self.vista === "painel") self.desenhar(); }, 30000);
  this.relogio = setInterval(function () { if (self.vista === "painel" && $(self.wrapper).is(":visible")) self.$r.find("[data-t]").each(function () { var $e = $(this), ms = +$e.attr("data-t") + (Date.now() - self.tsKanban); $e.text(grDurS(ms)); }); }, 1000);
}

GfProd.prototype.abrir = function (v) { this.vista = v; this.carregar(); };
GfProd.prototype.carregar = function () { if (this.vista === "planejamento") this.carregarPlan(); else { this.carregarKanban(); this.carregarRel(); } };
GfProd.prototype.deslocar = function (n) { var r = this.ref; return this.modo === "mes" ? new Date(r.getFullYear(), r.getMonth() + n, 1) : new Date(r.getFullYear(), r.getMonth(), r.getDate() + n * (this.modo === "semana" ? 7 : 1)); };
GfProd.prototype.intervalo = function () {
  var r = this.ref;
  if (this.modo === "dia") return { inicio: grChave(r), fim: grChave(r) };
  if (this.modo === "semana") { var dom = new Date(r.getFullYear(), r.getMonth(), r.getDate() - r.getDay()); return { inicio: grChave(dom), fim: grChave(new Date(dom.getFullYear(), dom.getMonth(), dom.getDate() + 6)) }; }
  return { inicio: grChave(new Date(r.getFullYear(), r.getMonth(), 1)), fim: grChave(new Date(r.getFullYear(), r.getMonth() + 1, 0)) };
};
GfProd.prototype.rotulo = function (iv) { if (this.modo === "mes") { var p = iv.inicio.split("-").map(Number); return GFR_MESES[p[1] - 1] + " de " + p[0]; } return iv.inicio === iv.fim ? grBr(iv.inicio) : grBr(iv.inicio) + " a " + grBr(iv.fim); };

GfProd.prototype.carregarKanban = function (silencioso) {
  var self = this;
  frappe.call({ method: "erpnext.gferro_utils.producao_kanban" }).then(function (r) { self.kanban = r.message; self.tsKanban = Date.now(); self.erro = ""; self.desenhar(); }).catch(function () { if (!silencioso) { self.erro = "Não foi possível carregar o painel de produção."; self.desenhar(); } });
};
GfProd.prototype.carregarRel = function () {
  var self = this, iv = this.intervalo(); this.chaveRel = iv.inicio + iv.fim; this.rel = null; this.desenhar();
  frappe.call({ method: "erpnext.gferro_utils.producao_relatorio", args: iv }).then(function (r) { if (r.message.inicio + r.message.fim !== self.chaveRel) return; self.rel = r.message; self.desenhar(); });
};
GfProd.prototype.carregarPlan = function () {
  var self = this, k = this.ano + "-" + ("0" + (this.mes + 1)).slice(-2);
  frappe.call({ method: "erpnext.gferro_utils.producao_planejamento", args: { mes: k } }).then(function (r) { self.plan = r.message; self.erro = ""; self.desenhar(); }).catch(function () { self.erro = "Não foi possível carregar o planejamento."; self.desenhar(); });
};
GfProd.prototype.agendar = function (os, data) {
  var self = this;
  frappe.call({ method: "erpnext.gferro_utils.producao_agendar", args: { os: os, data: data } }).then(function () { self.carregarPlan(); }).catch(function () { self.erro = "Não foi possível agendar a ordem."; self.desenhar(); });
};

GfProd.prototype.desenhar = function () {
  var h = "", plan = this.vista === "planejamento";
  h += '<div class="gfr-abas"><a class="' + (plan ? "" : "gfr-on") + '" href="/desk/producao-dashboard/painel">Painel de produção</a><a class="' + (plan ? "gfr-on" : "") + '" href="/desk/producao-dashboard/planejamento">Planejamento da produção</a></div>';
  if (this.erro) h += '<p class="gfr-aviso">' + grEsc(this.erro) + "</p>";
  h += plan ? this.htmlPlan() : this.htmlPainel();
  var foco = this.$r.find(".gfr-busca:focus").length ? ".gfr-busca" : this.$r.find(".gfr-pbusca:focus").length ? ".gfr-pbusca" : null;
  this.$r.html(h); if (foco) this.$r.find(foco).trigger("focus");
};

/* ---------------- painel ---------------- */
GfProd.prototype.htmlPainel = function () {
  var self = this, k = this.kanban, h = "";
  h += '<div class="gfr-topo"><div><div class="gfr-trilha">Dashboard • Produção</div><h1>Painel de produção</h1><p>O que está em execução agora, por centro de trabalho, e o histórico apontado no período.</p></div><button type="button" class="gfr-b" data-atualizar="1">Atualizar</button></div>';
  if (!k) h += '<p class="gfr-vazio">Consultando as ordens de serviço...</p>';
  else {
    var t = k.totais, kp = function (tt, v, cl) { return '<div class="gfr-kpi"><span>' + tt + "</span><strong class=\"" + cl + '">' + v + "</strong></div>"; };
    h += '<section class="gfr-kpis">' + kp("Em produção agora", t.emProducao, "gfr-vd") + kp("Parados", t.parados, "gfr-vm") + kp("Aguardando", t.aguardando, "") + kp("Concluídas hoje", t.concluidasHoje, "gfr-az") + "</section>";
    h += '<h3 class="gfr-h3">Ordens em execução</h3>';
    if (!k.colunas.length) h += '<p class="gfr-vazio gfr-card">Nenhuma ordem em andamento agora.</p>';
    else h += '<div class="gfr-kan">' + k.colunas.map(function (c) {
      return '<div class="gfr-col"><div class="gfr-colh"><b>' + grEsc(c.nome) + "</b><span>" + c.cards.length + "</span></div>" + c.cards.map(function (cd) {
        var r = GFR_ROT[cd.status];
        return '<div class="gfr-cd"><div class="gfr-cd1"><b>' + grEsc(cd.os) + '</b><span class="gfr-selo" style="background:' + r[1] + ";color:" + r[2] + '">' + r[0] + "</span></div><div class=\"gfr-cdp\">" + grEsc(cd.produto) + "</div><small>" + (cd.pedido ? grEsc(cd.pedido) + " · " : "") + grNum(cd.quantidade) + " " + grEsc(cd.unidade) + "</small><small>Etapa: " + grEsc(cd.operacao) + " (" + cd.etapasConcluidas + "/" + cd.totalEtapas + ')</small><div class="gfr-bar"><i style="width:' + (cd.totalEtapas ? (cd.etapasConcluidas / cd.totalEtapas) * 100 : 0) + '%"></i></div>' +
          (cd.operadorAtual ? "<small>Operador: " + grEsc(cd.operadorAtual) + "</small>" : "") + (cd.motivoParada ? '<small class="gfr-vm">Parada: ' + grEsc(cd.motivoParada) + "</small>" : "") + '<small class="gfr-tmp" ' + (cd.status === "em-producao" ? 'data-t="' + cd.tempoGravadoMs + '"' : "") + ">" + (cd.status === "em-producao" ? grDurS(cd.tempoGravadoMs + (Date.now() - self.tsKanban)) : "Tempo: " + grDur(cd.tempoGravadoMs)) + "</small></div>";
      }).join("") + "</div>";
    }).join("") + "</div>";
  }
  // relatorio
  var iv = this.intervalo(), r = this.rel;
  h += '<div class="gfr-sep"></div><h2 class="gfr-h2">Relatório de Produção</h2><div class="gfr-barra"><div class="gfr-seg">' + [["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"]].map(function (m) { return '<button type="button" data-modo="' + m[0] + '" class="' + (self.modo === m[0] ? "gfr-on" : "") + '">' + m[1] + "</button>"; }).join("") + "</div>" +
    '<div class="gfr-nav"><button type="button" class="gfr-ic" data-mover="-1">&#8249;</button><strong>' + this.rotulo(iv) + '</strong><button type="button" class="gfr-ic" data-mover="1">&#8250;</button><button type="button" class="gfr-b gfr-p" data-hoje="1">Hoje</button><input type="date" data-data="1" value="' + grChave(this.ref) + '"></div></div>';
  if (!r) return h + '<p class="gfr-vazio">Carregando o relatório...</p>';
  if (!r.totalApontamentos) return h + '<p class="gfr-vazio gfr-card">Nenhum apontamento registrado neste período.</p>';
  var totVal = r.porCentro.some(function (c) { return c.valorProduzido != null; }) ? r.porCentro.reduce(function (s, c) { return s + (c.valorProduzido || 0); }, 0) : null;
  var maxA = Math.max.apply(null, r.porCentro.map(function (c) { return c.apontamentos; }));
  h += (totVal != null ? '<div class="gfr-card gfr-tot"><span>Valor total do período <small>(estimativa)</small></span><strong>' + grBrl(totVal) + "</strong></div>" : "") +
    '<div class="gfr-duas"><section class="gfr-card"><h3>Produção por centro</h3>' + r.porCentro.map(function (c, i) {
      return '<div class="gfr-cen"><div class="gfr-l1"><span><i style="background:' + GFR_CORES[i % GFR_CORES.length] + '"></i>' + grEsc(c.centro) + "</span><b>" + c.apontamentos + ' apont.</b></div><div class="gfr-bar"><i style="width:' + (c.apontamentos / maxA) * 100 + "%;background:" + GFR_CORES[i % GFR_CORES.length] + '"></i></div><small>' + c.ordens + " ordem(ns) · " + grDur(c.tempoMs) + (c.quantidades.length ? " · " + c.quantidades.map(function (q) { return grNum(q.quantidade) + " " + grEsc(q.unidade); }).join(", ") : "") + (c.valorProduzido != null ? " · " + grBrl(c.valorProduzido) : "") + "</small></div>";
    }).join("") + '</section><section class="gfr-card"><h3>Distribuição do período</h3>' + this.rosca(r.porCentro) + "</section></div>";
  var t = grNorm(this.busca.trim()), det = r.detalhado.filter(function (d) { return !t || grNorm(d.centro + " " + d.os + " " + d.funcionario + " " + d.operacao).indexOf(t) >= 0; }), TAM = 15, totalPag = Math.max(1, Math.ceil(det.length / TAM));
  if (this.pagina > totalPag) this.pagina = totalPag;
  h += '<section class="gfr-card"><div class="gfr-lc"><h3>Apontamentos do período <small>(' + det.length + ')</small></h3><input type="search" class="gfr-busca" placeholder="Buscar OS, centro ou funcionário..." value="' + grEsc(this.busca) + '"></div><div class="gfr-tw"><table class="gfr-t"><thead><tr><th>Centro</th><th>OS</th><th>Etapa</th><th class="n">Qtd.</th><th>Funcionário</th><th>Início</th><th>Fim</th><th class="n">Duração</th><th class="n">Valor (est.)</th></tr></thead><tbody>';
  det.slice((this.pagina - 1) * TAM, this.pagina * TAM).forEach(function (d) { h += "<tr><td>" + grEsc(d.centro) + "</td><td><b>" + grEsc(d.os) + "</b></td><td>" + grEsc(d.operacao) + '</td><td class="n">' + (d.quantidade ? grNum(d.quantidade) + " " + grEsc(d.unidade) : "—") + "</td><td>" + grEsc(d.funcionario) + "</td><td>" + grBr(d.inicio) + " " + grHora(d.inicio) + "</td><td>" + grBr(d.fim) + " " + grHora(d.fim) + '</td><td class="n">' + grDur(d.duracaoMs) + '</td><td class="n">' + (d.valorProduzido != null ? grBrl(d.valorProduzido) : "—") + "</td></tr>"; });
  h += "</tbody></table></div>" + (totalPag > 1 ? '<div class="gfr-pg"><button type="button" class="gfr-b gfr-p" data-pag="-1"' + (this.pagina <= 1 ? " disabled" : "") + '>Anterior</button><span>Página ' + this.pagina + " de " + totalPag + '</span><button type="button" class="gfr-b gfr-p" data-pag="1"' + (this.pagina >= totalPag ? " disabled" : "") + ">Próxima</button></div>" : "") + "</section>";
  return h;
};
GfProd.prototype.rosca = function (centros) {
  var tot = centros.reduce(function (s, c) { return s + c.apontamentos; }, 0), ang = 0, R = 60, C = 2 * Math.PI * R, off = 0, seg = "";
  centros.forEach(function (c, i) { var len = (c.apontamentos / tot) * C; seg += '<circle cx="80" cy="80" r="' + R + '" fill="none" stroke="' + GFR_CORES[i % GFR_CORES.length] + '" stroke-width="26" stroke-dasharray="' + len + " " + (C - len) + '" stroke-dashoffset="' + -off + '" transform="rotate(-90 80 80)"/>'; off += len; });
  return '<div class="gfr-rosca"><svg viewBox="0 0 160 160" width="170" height="170">' + seg + '<text x="80" y="76" text-anchor="middle" font-size="22" font-weight="900">' + tot + '</text><text x="80" y="94" text-anchor="middle" font-size="9" fill="#6b7280">apontamentos</text></svg><ul>' + centros.map(function (c, i) { return '<li><i style="background:' + GFR_CORES[i % GFR_CORES.length] + '"></i>' + grEsc(c.centro) + " <b>" + Math.round((c.apontamentos / tot) * 100) + "%</b></li>"; }).join("") + "</ul></div>";
};

/* ---------------- planejamento ---------------- */
GfProd.prototype.htmlPlan = function () {
  var self = this, d = this.plan, h = "", hojeIso = grChave(new Date());
  h += '<div class="gfr-topo"><div><div class="gfr-trilha">Dashboard • Produção</div><h1>Planejamento da Produção</h1><p>Ordens de serviço agendadas por dia de início, com os materiais necessários. Abra um dia para reagendar uma ordem.</p></div><button type="button" class="gfr-b" data-atualizar="1">Atualizar</button></div>';
  h += '<div class="gfr-barra"><div class="gfr-nav"><button type="button" class="gfr-ic" data-mm="-1">&#8249;</button><strong>' + GFR_MESES[this.mes] + " " + this.ano + '</strong><button type="button" class="gfr-ic" data-mm="1">&#8250;</button><button type="button" class="gfr-b gfr-p" data-phoje="1">Hoje</button></div><input type="search" class="gfr-pbusca" placeholder="Buscar OS, pedido ou produto..." value="' + grEsc(this.pbusca) + '"></div>';
  if (!d) return h + '<p class="gfr-vazio">Carregando...</p>';
  var t = grNorm(this.pbusca.trim()), itens = d.itens.filter(function (i) { return !t || grNorm(i.os + " " + i.pedido + " " + i.produto).indexOf(t) >= 0; }), porDia = {};
  itens.forEach(function (i) { (porDia[i.data] = porDia[i.data] || []).push(i); });
  var atr = itens.filter(function (i) { return i.atrasado; });
  h += '<section class="gfr-kpis"><div class="gfr-kpi"><span>Ordens abertas</span><strong>' + itens.length + '</strong></div><div class="gfr-kpi"><span>Atrasadas (início já passou)</span><strong class="gfr-vm">' + atr.length + '</strong></div><div class="gfr-kpi"><span>Em andamento</span><strong class="gfr-vd">' + itens.filter(function (i) { return i.emAndamento; }).length + '</strong></div><div class="gfr-kpi"><span>Iniciam hoje</span><strong>' + (porDia[hojeIso] || []).length + "</strong></div></section>";
  var primeiro = new Date(this.ano, this.mes, 1), ini = new Date(this.ano, this.mes, 1 - primeiro.getDay()), cel = "";
  for (var i = 0; i < 42; i++) {
    var dt = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i), iso = grChave(dt), l = porDia[iso] || [], at = l.some(function (x) { return x.atrasado; });
    cel += '<div class="gfr-cel' + (dt.getMonth() === this.mes ? "" : " gfr-fora") + (iso === hojeIso ? " gfr-hoje" : "") + '" data-pdia="' + iso + '"><div class="gfr-dn">' + dt.getDate() + "</div>" + l.slice(0, 3).map(function (x) { return '<div class="gfr-os' + (x.atrasado ? " gfr-os-at" : x.emAndamento ? " gfr-os-ok" : "") + '">' + grEsc(x.os) + "</div>"; }).join("") + (l.length > 3 ? '<div class="gfr-mais">+' + (l.length - 3) + "</div>" : "") + (at ? "" : "") + "</div>";
  }
  return h + '<section class="gfr-card"><div class="gfr-sem">' + GFR_DIAS.map(function (x) { return "<span>" + x + "</span>"; }).join("") + '</div><div class="gfr-grade">' + cel + "</div></section>";
};
GfProd.prototype.abrirDia = function () {
  var dia = this.diaAberto, l = this.plan.itens.filter(function (i) { return i.data === dia; }), mat = {};
  l.forEach(function (i) { i.materiais.forEach(function (m) { var k = m.codigo + "|" + m.unidade; mat[k] = mat[k] || { d: m.descricao, u: m.unidade, q: 0, c: m.codigo }; mat[k].q += m.quantidade; }); });
  var h = '<div class="gfr-dlg"><div class="gfr-dlg-cab"><div><small>Produção agendada</small><h2>' + grBr(dia) + '</h2></div><button type="button" class="gfr-ic" data-fechar="1" aria-label="Fechar">&times;</button></div><div class="gfr-dlg-corpo">';
  h += l.length ? l.map(function (i) {
    return '<div class="gfr-it"><div class="gfr-cd1"><b>' + grEsc(i.os) + "</b>" + (i.atrasado ? '<span class="gfr-selo" style="background:#fee2e2;color:#b91c1c">Atrasada</span>' : i.emAndamento ? '<span class="gfr-selo" style="background:#d1fae5;color:#047857">Em andamento</span>' : "") + "</div><div>" + grEsc(i.produto) + "</div><small>" + (i.pedido ? grEsc(i.pedido) + " · " : "") + grNum(i.quantidade) + " " + grEsc(i.unidade) + (i.valorTotal != null ? " · pedido " + grBrl(i.valorTotal) : "") + '</small><label class="gfr-ag">Reagendar para <input type="date" data-agendar="' + grEsc(i.os) + '" value="' + i.data + '"></label></div>';
  }).join("") : '<p class="gfr-vazio">Nenhuma ordem agendada para este dia.</p>';
  var ms = Object.keys(mat);
  if (ms.length) h += '<h3 class="gfr-h3">Materiais do dia</h3><table class="gfr-t"><tbody>' + ms.map(function (k) { var m = mat[k]; return "<tr><td><b>" + grEsc(m.c) + "</b> " + grEsc(m.d) + '</td><td class="n">' + grNum(m.q) + " " + grEsc(m.u) + "</td></tr>"; }).join("") + "</tbody></table>";
  this.$m.html(h + "</div></div>").removeAttr("hidden");
};
