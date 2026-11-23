/* Planejamento Financeiro - Grupo Gferro (página "planejamento-financeiro")
 * Dashboard > Financeiro da Intranet com os dados do ERP: calendário do mês com as contas a receber (Faturas de Venda em aberto) e a pagar
 * (Faturas de Compra em aberto), KPIs, "Resultado do dia" (meta 70/20/10), fila de vencidas, replanejamento (mover a conta de dia sem mudar o
 * vencimento da fatura), detalhe do dia e DRE do mês por título. Programação = tela de contas programadas. */
frappe.pages["planejamento-financeiro"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Planejamento Financeiro", single_column: true });
  $(wrapper).addClass("gf-plan");
  wrapper.gf_plan = new GfPlan(page);
};
frappe.pages["planejamento-financeiro"].on_page_show = function (wrapper) { if (wrapper.gf_plan) wrapper.gf_plan.carregar(); };

var GFL_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
var GFL_DIAS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
var GFL_FIXOS = ["Despesa Administrativa", "Despesas RH", "Manutenção", "Despesa Logística", "Marketing"];
function glBrl(n) { return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function glChave(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function glBr(iso) { var p = String(iso || "").slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "—"; }
function glEsc(s) { return frappe.utils.escape_html(s == null ? "" : String(s)); }
function glNorm(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function glPct(n) { return (n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + "%"; }

function GfPlan(page) {
  this.page = page; var h = new Date(); this.ano = h.getFullYear(); this.mes = h.getMonth(); this.dia = glChave(h); this.dados = null; this.dre = null; this.vista = "calendario"; this.busca = ""; this.mover = null; this.diaAberto = null; this.erro = "";
  this.$ = $(page.main); this.$.html('<div class="gfl"></div><div class="gfl-modal" hidden></div>'); this.$r = this.$.find(".gfl"); this.$m = this.$.find(".gfl-modal");
  var self = this;
  this.$r.on("click", "[data-mm]", function () { var d = new Date(self.ano, self.mes + +$(this).data("mm"), 1); self.ano = d.getFullYear(); self.mes = d.getMonth(); self.carregar(); });
  this.$r.on("click", "[data-hoje]", function () { var h2 = new Date(); self.ano = h2.getFullYear(); self.mes = h2.getMonth(); self.dia = glChave(h2); self.carregar(); });
  this.$r.on("click", "[data-atualizar]", function () { self.carregar(); });
  this.$r.on("change", "[data-ir]", function () { if (!this.value) return; var d = new Date(this.value + "T00:00:00"); self.dia = this.value; self.ano = d.getFullYear(); self.mes = d.getMonth(); self.carregar(); });
  this.$r.on("input", ".gfl-busca", function () { self.busca = this.value; var p = this.selectionStart; self.desenhar(); var i = self.$r.find(".gfl-busca").trigger("focus")[0]; if (i) i.setSelectionRange(p, p); });
  this.$r.on("click", "[data-vista]", function () { self.vista = $(this).data("vista"); if (self.vista === "dre" && !self.dre) self.carregarDre(); self.desenhar(); });
  this.$r.on("click", "[data-mover]", function (e) { e.stopPropagation(); self.iniciarMover($(this).attr("data-mover")); });
  this.$r.on("click", "[data-cancelar]", function () { self.mover = null; self.desenhar(); });
  this.$r.on("click", "[data-dia]", function () { var d = $(this).attr("data-dia"); if (self.mover) self.moverPara(d); else { self.diaAberto = d; self.abrirDia(); } });
  this.$r.on("click", "[data-dreabre]", function () { var k = $(this).attr("data-dreabre"); self.dreAberto = self.dreAberto || {}; self.dreAberto[k] = !self.dreAberto[k]; self.desenhar(); });
  this.$m.on("click", function (e) { if (e.target === this || $(e.target).is("[data-fechar]")) $(this).attr("hidden", true); });
  this.$m.on("click", "[data-mover]", function () { self.$m.attr("hidden", true); self.iniciarMover($(this).attr("data-mover")); });
  this.$m.on("click", "[data-desfazer]", function () { self.reprogramar($(this).attr("data-desfazer"), null); });
  $(document).on("keydown.gfl", function (e) { if (e.key === "Escape") { self.$m.attr("hidden", true); if (self.mover) { self.mover = null; self.desenhar(); } } });
}

GfPlan.prototype.chaveMes = function () { return this.ano + "-" + ("0" + (this.mes + 1)).slice(-2); };
GfPlan.prototype.carregar = function () {
  var self = this, k = this.chaveMes(); this.dre = null;
  frappe.call({ method: "erpnext.gferro_utils.planejamento_financeiro", args: { mes: k } }).then(function (r) { if (k !== self.chaveMes()) return; self.dados = r.message; self.erro = ""; self.desenhar(); if (self.vista === "dre") self.carregarDre(); })
    .catch(function () { self.erro = "Não foi possível carregar os dados financeiros."; self.desenhar(); });
};
GfPlan.prototype.carregarDre = function () {
  var self = this, k = this.chaveMes();
  frappe.call({ method: "erpnext.gferro_utils.financeiro_dre", args: { mes: k } }).then(function (r) { if (k !== self.chaveMes()) return; self.dre = r.message; self.desenhar(); });
};
GfPlan.prototype.todas = function () { return this.dados.contasReceber.concat(this.dados.contasPagar); };
GfPlan.prototype.achar = function (id) { return this.todas().filter(function (c) { return c.id === id; })[0]; };

GfPlan.prototype.iniciarMover = function (id) { this.mover = this.achar(id); this.vista = "calendario"; this.desenhar(); };
GfPlan.prototype.moverPara = function (dia) { var c = this.mover; if (!c) return; this.mover = null; this.reprogramar(c.id, dia); };
GfPlan.prototype.reprogramar = function (id, dia) {
  var self = this, c = this.achar(id); if (!c) return;
  frappe.call({ method: "erpnext.gferro_utils.financeiro_reprogramar", args: { tipo: c.tipo, id: id, nova_data: dia || "" } }).then(function () {
    if (dia) { if (!c.vencimentoOriginal) c.vencimentoOriginal = c.vencimento; c.vencimento = dia; } else if (c.vencimentoOriginal) { c.vencimento = c.vencimentoOriginal; c.vencimentoOriginal = null; }
    self.$m.attr("hidden", true); self.desenhar();
  }).catch(function () { self.erro = "Não foi possível mover a conta."; self.desenhar(); });
};

GfPlan.prototype.filtrar = function (lista) { var t = glNorm(this.busca.trim()); return t ? lista.filter(function (c) { return glNorm(c.pessoa + " " + c.categoria + " " + c.id).indexOf(t) >= 0; }) : lista; };

GfPlan.prototype.desenhar = function () {
  var self = this, d = this.dados, h = "", hojeIso = glChave(new Date());
  var noMesAtual = this.ano === new Date().getFullYear() && this.mes === new Date().getMonth();
  h += '<div class="gfl-topo"><div><h1>Planejamento Financeiro</h1><p>Clique em “Mover” numa conta e depois no dia do calendário em que ela deve ser paga ou recebida (o vencimento da fatura não muda).</p></div><div class="gfl-acoes"><input type="text" class="gfl-busca" placeholder="Buscar lançamento no calendário..." value="' + glEsc(this.busca) + '"><input type="date" data-ir="1" value="' + this.dia + '" title="Ir para um dia"></div></div>';
  h += '<div class="gfl-barra"><div class="gfl-mes"><button type="button" class="gfl-ic" data-mm="-1">&#8249;</button><strong>' + GFL_MESES[this.mes] + " " + this.ano + '</strong><button type="button" class="gfl-ic" data-mm="1">&#8250;</button></div>' +
    '<button type="button" class="gfl-b" data-hoje="1"' + (noMesAtual ? " disabled" : "") + '>Hoje</button><button type="button" class="gfl-b" data-atualizar="1">Atualizar</button>' +
    '<button type="button" class="gfl-b gfl-esc" data-vista="' + (this.vista === "dre" ? "calendario" : "dre") + '">' + (this.vista === "dre" ? "Calendário" : "DRE") + '</button><a class="gfl-b gfl-am" href="/desk/programacao-contas">Programação</a></div>';
  if (this.mover) h += '<div class="gfl-banner">Clique no dia do calendário para onde quer mover <b>' + glEsc(this.mover.pessoa) + "</b> (" + glBrl(this.mover.valor) + ') <button type="button" class="gfl-b gfl-p" data-cancelar="1">Cancelar</button></div>';
  if (this.erro) h += '<p class="gfl-aviso">' + glEsc(this.erro) + "</p>";
  if (!d) { this.$r.html(h + '<p class="gfl-vazio">Carregando...</p>'); return; }
  if (this.vista === "dre") { this.$r.html(h + this.htmlDre()); return; }

  var k = this.chaveMes(), noMes = function (c) { return String(c.vencimento).slice(0, 7) === k; };
  var rec = this.filtrar(d.contasReceber), pag = this.filtrar(d.contasPagar);
  var concl = d.contasConcluidas, recDia = concl.filter(function (c) { return c.tipo === "receber" && c.dataBaixa === self.dia; }), pagDia = concl.filter(function (c) { return c.tipo === "pagar" && c.dataBaixa === self.dia; });
  var soma = function (l) { return l.reduce(function (s, c) { return s + c.valor; }, 0); };
  var diaNoMes = this.dia.slice(0, 7) === k, ehHoje = this.dia === hojeIso;
  var recMes = soma(d.contasReceber.filter(noMes)), pagMes = soma(d.contasPagar.filter(noMes)), projetado = d.saldoMes + recMes - pagMes;
  var kpi = function (t, v, s, cor) { return '<div class="gfl-kpi"><span>' + t + '</span><strong class="' + (cor || "") + '">' + v + "</strong><small>" + s + "</small></div>"; };
  h += '<section class="gfl-kpis">' + kpi(ehHoje ? "Entrou no caixa hoje" : "Entrou no caixa em " + glBr(this.dia), diaNoMes ? glBrl(soma(recDia)) : "—", diaNoMes ? recDia.length + " lançamento(s)" : "Fora do mês exibido", "gfl-vd") +
    kpi("Saldo do mês", glBrl(d.saldoMes), "recebido − pago · atualizado " + new Date(d.atualizadoEm.replace(" ", "T")).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })) +
    kpi("A receber", glBrl(d.totalReceber), "Total de " + d.contasReceber.length + " contas") + kpi("A pagar", glBrl(d.totalPagar), "Total de " + d.contasPagar.length + " contas") +
    kpi("Saldo projetado", glBrl(projetado), "ao final de " + GFL_MESES[this.mes], projetado >= 0 ? "" : "gfl-vm") + "</section>";

  // resultado do dia 70/20/10
  if (diaNoMes) {
    var receita = soma(recDia), mp = soma(pagDia.filter(function (c) { return c.grupo === "CMV / CPV / CSV"; })), cf = soma(pagDia.filter(function (c) { return GFL_FIXOS.indexOf(c.grupo) >= 0; })), lucro = receita - mp - cf;
    var rd = function (t, v, meta) { return '<div class="gfl-kpi"><span>' + t + "</span><strong>" + glBrl(v) + "</strong><small>" + (receita > 0 ? glPct(v / receita) + " da receita" : "sem receita no dia") + " · meta " + meta + "</small></div>"; };
    h += '<h3 class="gfl-h3">Resultado do dia — Meta 70/20/10' + (ehHoje ? "" : " (" + glBr(this.dia) + ")") + '</h3><section class="gfl-kpis gfl-k3">' + rd("Matéria prima", mp, "70%") + rd("Custo fixo", cf, "20%") + rd("Lucro", lucro, "10%") + "</section>";
  }

  // fila de vencidas
  var venc = rec.concat(pag).filter(function (c) { return c.status === "Vencida"; }).sort(function (a, b) { return a.vencimento.localeCompare(b.vencimento); });
  if (venc.length) {
    h += '<section class="gfl-painel"><h3 class="gfl-h3 gfl-vm">Vencidas — ' + venc.length + " lançamento(s) · " + glBrl(soma(venc)) + '</h3><div class="gfl-fila">' + venc.slice(0, 12).map(function (c) {
      return '<div class="gfl-it gfl-' + c.tipo + '"><div><b>' + glEsc(c.pessoa) + "</b><small>" + glEsc(c.categoria) + " · venceu em " + glBr(c.vencimento) + '</small></div><div class="gfl-it-d"><b>' + glBrl(c.valor) + '</b><button type="button" class="gfl-lk" data-mover="' + glEsc(c.id) + '">Mover</button></div></div>';
    }).join("") + (venc.length > 12 ? '<p class="gfl-nota">+ ' + (venc.length - 12) + " vencidas (veja no calendário)</p>" : "") + "</div></section>";
  }

  // calendario
  var primeiro = new Date(this.ano, this.mes, 1), ini = new Date(this.ano, this.mes, 1 - primeiro.getDay()), cel = "";
  var porDia = {}; rec.concat(pag).forEach(function (c) { (porDia[c.vencimento] = porDia[c.vencimento] || []).push(c); });
  for (var i = 0; i < 42; i++) {
    var dt = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i), iso = glChave(dt), dm = dt.getMonth() === this.mes, lista = porDia[iso] || [];
    var r2 = lista.filter(function (c) { return c.tipo === "receber"; }), p2 = lista.filter(function (c) { return c.tipo === "pagar"; });
    cel += '<div class="gfl-cel' + (dm ? "" : " gfl-fora") + (iso === hojeIso ? " gfl-hoje" : "") + (iso === this.dia ? " gfl-ref" : "") + (this.mover ? " gfl-alvo" : "") + '" data-dia="' + iso + '"><div class="gfl-dn">' + dt.getDate() + "</div>" +
      (r2.length ? '<div class="gfl-chip gfl-cr">+ ' + glBrl(soma(r2)) + " <small>(" + r2.length + ")</small></div>" : "") + (p2.length ? '<div class="gfl-chip gfl-cp">− ' + glBrl(soma(p2)) + " <small>(" + p2.length + ")</small></div>" : "") +
      (lista.some(function (c) { return c.vencimentoOriginal; }) ? '<div class="gfl-repl">replanejado</div>' : "") + "</div>";
  }
  h += '<section class="gfl-painel"><div class="gfl-cal"><div class="gfl-sem">' + GFL_DIAS.map(function (x) { return "<span>" + x + "</span>"; }).join("") + '</div><div class="gfl-grade">' + cel + "</div></div></section>";
  this.$r.html(h);
};

GfPlan.prototype.abrirDia = function () {
  var self = this, dia = this.diaAberto, d = this.dados;
  var ab = this.todas().filter(function (c) { return c.vencimento === dia; }), cn = d.contasConcluidas.filter(function (c) { return c.dataBaixa === dia; });
  var bloco = function (tit, lista, cl) {
    return '<h3 class="gfl-h3 ' + cl + '">' + tit + " (" + lista.length + ")</h3>" + (lista.length ? lista.map(function (c) {
      return '<div class="gfl-it gfl-' + c.tipo + '"><div><b>' + glEsc(c.pessoa) + "</b><small>" + glEsc(c.categoria) + (c.status ? " · " + c.status : "") + (c.vencimentoOriginal ? " · original " + glBr(c.vencimentoOriginal) : "") + '</small></div><div class="gfl-it-d"><b>' + glBrl(c.valor) + "</b>" +
        (c.id && c.status ? '<button type="button" class="gfl-lk" data-mover="' + glEsc(c.id) + '">Mover</button>' + (c.vencimentoOriginal ? '<button type="button" class="gfl-lk" data-desfazer="' + glEsc(c.id) + '">Desfazer</button>' : "") : "") + "</div></div>";
    }).join("") : '<p class="gfl-nota">Nada neste dia.</p>');
  };
  var h = '<div class="gfl-dlg"><div class="gfl-dlg-cab"><div><small>Detalhe do dia</small><h2>' + glBr(dia) + '</h2></div><button type="button" class="gfl-ic" data-fechar="1" aria-label="Fechar">&times;</button></div><div class="gfl-dlg-corpo">' +
    bloco("A pagar", ab.filter(function (c) { return c.tipo === "pagar"; }), "gfl-vm") + bloco("A receber", ab.filter(function (c) { return c.tipo === "receber"; }), "gfl-vd") +
    bloco("Pago neste dia", cn.filter(function (c) { return c.tipo === "pagar"; }), "") + bloco("Recebido neste dia", cn.filter(function (c) { return c.tipo === "receber"; }), "") + "</div></div>";
  this.$m.html(h).removeAttr("hidden");
};

GfPlan.prototype.htmlDre = function () {
  var self = this, d = this.dre;
  if (!d) return '<p class="gfl-vazio">Carregando a DRE...</p>';
  var totR = d.linhas.reduce(function (s, l) { return s + l.realizado; }, 0), maxv = Math.max.apply(null, d.linhas.map(function (l) { return Math.max(l.programado, l.realizado); }).concat([1]));
  var h = '<section class="gfl-painel"><h2 class="gfl-h2">Demonstrativo do resultado — ' + GFL_MESES[this.mes] + " " + this.ano + '</h2><p class="gfl-nota">Programado = faturas com vencimento no mês · Realizado = pagamentos e recebimentos do mês, por título (grupo da classificação financeira).</p><div class="gfl-dre">';
  if (!d.linhas.length) h += '<p class="gfl-vazio">Sem movimentação neste mês.</p>';
  d.linhas.forEach(function (l, i) {
    var ab = self.dreAberto && self.dreAberto[l.grupo];
    h += '<div class="gfl-dreg"><button type="button" class="gfl-dreh" data-dreabre="' + glEsc(l.grupo) + '"><b>' + glEsc(l.grupo) + '</b><span>Realizado ' + glBrl(l.realizado) + " · Programado " + glBrl(l.programado) + '</span></button><div class="gfl-b2"><i style="width:' + Math.max(2, (l.programado / maxv) * 100) + '%;background:#cbd5e1"></i></div><div class="gfl-b2"><i style="width:' + Math.max(2, (l.realizado / maxv) * 100) + '%;background:#f59e0b"></i></div>' +
      (ab ? '<table class="gfl-t"><thead><tr><th>Classificação</th><th class="n">Programado</th><th class="n">Realizado</th></tr></thead><tbody>' + l.contas.map(function (c) { return "<tr><td>" + glEsc(c.categoria) + '</td><td class="n">' + glBrl(c.programado) + '</td><td class="n">' + glBrl(c.realizado) + "</td></tr>"; }).join("") + "</tbody></table>" : "") + "</div>";
  });
  return h + "</div></section>";
};
