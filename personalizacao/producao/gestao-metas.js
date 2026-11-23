/* Gestão - Metas Mensais - Grupo Gferro (página "gestao-metas")
 * Dashboard > Gestão da Intranet com os dados do ERP: meta mensal de cada loja, planejamento semanal (por dias trabalhados; a cada semana
 * encerrada o saldo da meta é dividido igualmente entre as semanas restantes) e o realizado (Pedidos de Venda confirmados, pela loja do vendedor).
 * Quem pode editar salva a distribuição da meta do mês ("Meta Mensal de Loja"). */
frappe.pages["gestao-metas"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Gestão", single_column: true });
  $(wrapper).addClass("gf-gest");
  wrapper.gf_gest = new GfGestao(page);
};
frappe.pages["gestao-metas"].on_page_show = function (wrapper) { if (wrapper.gf_gest) wrapper.gf_gest.carregar(); };

var GFG_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
function ggMoeda(n) { return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function ggNum(n) { return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function ggPct(n) { return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"; }
function ggEsc(s) { return frappe.utils.escape_html(s == null ? "" : String(s)); }
function ggLerValor(t) { var s = String(t || "").trim().replace(/\s/g, "").replace(/^R\$/i, ""); if (!s) return 0; if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", "."); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); var n = Number(s); return isFinite(n) && n >= 0 ? n : null; }

function ggSemanas(ano, mes) {
  var ultimo = new Date(ano, mes + 1, 0).getDate(), semanas = [], ini = 1;
  while (ini <= ultimo) {
    var dw = new Date(ano, mes, ini).getDay(), ate = dw === 0 ? 0 : 7 - dw, fim = Math.min(ultimo, ini + ate), dt = 0;
    for (var d = ini; d <= fim; d++) if (new Date(ano, mes, d).getDay() !== 0) dt++;
    semanas.push({ inicio: ini, fim: fim, dias: dt }); ini = fim + 1;
  }
  return semanas;
}
/** Mesmo cálculo da Intranet (calcularMetasSemanais). */
function ggMetasSemanais(metaMensal, semanas, realizados, ano, mes, hoje) {
  var meta = Math.round(Math.max(0, metaMensal) * 100), dias = semanas.reduce(function (t, s) { return t + s.dias; }, 0), acum = 0, dist = 0;
  var metas = semanas.map(function (s) { acum += s.dias; var a = dias ? Math.round(meta * acum / dias) : 0, v = a - dist; dist = a; return v; });
  if (!realizados) return metas.map(function (v) { return v / 100; });
  var real = 0;
  for (var i = 0; i < semanas.length - 1; i++) {
    var enc = new Date(ano, mes, semanas[i].fim + 1); if (hoje < enc) break;
    real += Math.round((realizados[i] || 0) * 100);
    var rest = Math.max(0, meta - real), q = semanas.length - i - 1, parcela = Math.floor(rest / q), extras = rest % q;
    for (var p = i + 1; p < semanas.length; p++) metas[p] = parcela + (p - i - 1 < extras ? 1 : 0);
  }
  return metas.map(function (v) { return v / 100; });
}

function GfGestao(page) {
  var h = new Date(); this.page = page; this.ano = h.getFullYear(); this.mes = h.getMonth(); this.dados = null; this.edit = {}; this.alterou = false; this.salvo = false; this.erro = ""; this.podeEditar = frappe.user_roles && (frappe.user_roles.indexOf("System Manager") >= 0 || frappe.user_roles.indexOf("Gestor Comercial") >= 0 || frappe.user_roles.indexOf("Accounts Manager") >= 0);
  this.$ = $(page.main); this.$.html('<div class="gfg"></div>'); this.$r = this.$.find(".gfg");
  var self = this;
  this.$r.on("click", "[data-mes]", function () { self.mes = +$(this).data("mes"); self.carregar(); });
  this.$r.on("change", "[data-ano]", function () { self.ano = +this.value; self.carregar(); });
  this.$r.on("input", "[data-meta]", function () { var v = ggLerValor(this.value); if (v === null) return; self.edit[$(this).attr("data-meta")] = v; self.alterou = true; self.salvo = false; });
  this.$r.on("blur", "[data-meta]", function () { self.desenhar(); });
  this.$r.on("click", "[data-salvar]", function () { self.salvar(); });
  this.$r.on("click", "[data-atualizar]", function () { self.carregar(); });
}
GfGestao.prototype.ref = function () { return this.ano + "-" + ("0" + (this.mes + 1)).slice(-2); };
GfGestao.prototype.carregar = function () {
  var self = this, ref = this.ref(); this.alterou = false; this.salvo = false;
  frappe.call({ method: "erpnext.gferro_utils.gestao_metas", args: { mes: ref } }).then(function (r) {
    if (ref !== self.ref()) return; self.dados = r.message; self.edit = {}; r.message.lojas.forEach(function (l) { self.edit[l.id] = l.meta; }); self.erro = ""; self.desenhar();
  }).catch(function () { self.erro = "Não foi possível consultar as metas mensais."; self.desenhar(); });
};
GfGestao.prototype.salvar = function () {
  var self = this;
  frappe.call({ method: "erpnext.gferro_utils.gestao_metas_salvar", args: { mes: this.ref(), metas: JSON.stringify(this.edit) } }).then(function (r) {
    self.edit = r.message.metas; self.alterou = false; self.salvo = true; self.dados.lojas.forEach(function (l) { l.meta = self.edit[l.id] != null ? self.edit[l.id] : l.meta; }); self.desenhar();
  }).catch(function () { self.erro = "Não foi possível salvar as metas."; self.desenhar(); });
};

GfGestao.prototype.desenhar = function () {
  var self = this, d = this.dados, h = "", ref = this.ref(), hoje = new Date(), semanas = ggSemanas(this.ano, this.mes), dias = semanas.reduce(function (t, s) { return t + s.dias; }, 0);
  var lojas = d ? d.lojas.map(function (l) { return $.extend({}, l, { meta: self.edit[l.id] != null ? self.edit[l.id] : l.meta }); }) : [];
  var realNaSem = function (l, s) { var t = 0; for (var dia = s.inicio; dia <= s.fim; dia++) t += l.realizadoPorDia[ref + "-" + ("0" + dia).slice(-2)] || 0; return t; };
  var metaTotal = lojas.reduce(function (t, l) { return t + l.meta; }, 0);
  var metasSem = {}; lojas.forEach(function (l) { metasSem[l.id] = ggMetasSemanais(l.meta, semanas, d ? semanas.map(function (s) { return realNaSem(l, s); }) : null, self.ano, self.mes, hoje); });
  var totSem = semanas.map(function (_, i) { return lojas.reduce(function (t, l) { return t + Math.round(metasSem[l.id][i] * 100); }, 0) / 100; });
  var realLoja = {}; lojas.forEach(function (l) { realLoja[l.id] = semanas.reduce(function (t, s) { return t + realNaSem(l, s); }, 0); });
  var realTotal = lojas.reduce(function (t, l) { return t + realLoja[l.id]; }, 0);
  var anos = [this.ano - 1, this.ano, this.ano + 1];
  h += '<div class="gfg-topo"><div><div class="gfg-trilha">Dashboard • Gestão</div><h1>Metas Mensais</h1><p>Planejamento semanal das unidades e acompanhamento do realizado no ERP.</p></div><div class="gfg-pills"><div><span>Meta anual</span><strong>' + ggMoeda(metaTotal * 12) + '</strong></div><div class="gfg-am"><span>Meta do mês</span><strong>' + ggMoeda(metaTotal) + "</strong></div></div></div>";
  h += '<section class="gfg-card"><div class="gfg-meses">' + GFG_MESES.map(function (n, i) { return '<button type="button" data-mes="' + i + '" class="' + (i === self.mes ? "gfg-on" : "") + '">' + n + "</button>"; }).join("") + "</div>" +
    '<div class="gfg-sub"><div class="gfg-chips"><div class="gfg-esc"><span>Total dias úteis</span><strong>' + dias + '</strong></div><div class="gfg-chip"><span>Mês</span><strong>' + GFG_MESES[this.mes] + '</strong></div><label class="gfg-chip"><span>Ano</span><select data-ano="1">' + anos.map(function (a) { return "<option" + (a === self.ano ? " selected" : "") + ">" + a + "</option>"; }).join("") + '</select></label></div><div class="gfg-up">' + (d ? "Atualizado em " + new Date(d.atualizadoEm.replace(" ", "T")).toLocaleString("pt-BR") : "Aguardando dados") + ' <button type="button" class="gfg-b" data-atualizar="1">Atualizar</button></div></div>';
  if (this.erro) h += '<p class="gfg-aviso">' + ggEsc(this.erro) + "</p>";
  h += '<div class="gfg-tw"><table class="gfg-t"><thead><tr class="gfg-h1"><th rowspan="3">#</th><th rowspan="3" class="l">Unidades</th>' + semanas.map(function (s, i) { return '<th colspan="2"><small>Semana ' + ("0" + (i + 1)).slice(-2) + "</small>" + ("0" + s.inicio).slice(-2) + " a " + ("0" + s.fim).slice(-2) + "</th>"; }).join("") + '<th colspan="3" class="gfg-ty">' + GFG_MESES[this.mes] + " • " + this.ano + '</th></tr><tr class="gfg-h2">' + semanas.map(function (s) { return '<th colspan="2">' + s.dias + " dias trabalhados</th>"; }).join("") + '<th rowspan="2" class="gfg-ty2">Realizado</th><th rowspan="2" class="gfg-ty2">Meta</th><th rowspan="2" class="gfg-ty2">% Crescimento</th></tr><tr class="gfg-h3">' + semanas.map(function () { return "<th>Planejado</th><th>Realizado</th>"; }).join("") + "</tr></thead><tbody>";
  lojas.forEach(function (l, i) {
    var cres = l.meta > 0 ? (realLoja[l.id] / l.meta - 1) * 100 : 0;
    h += '<tr><td class="c"><span class="gfg-n">' + (i + 1) + '</span></td><td class="l"><b>' + ggEsc(String(l.nome).toUpperCase()) + "</b></td>" + semanas.map(function (s, k) { return '<td class="n">' + ggNum(metasSem[l.id][k]) + '</td><td class="n gfg-vd">' + (d ? ggNum(realNaSem(l, s)) : "—") + "</td>"; }).join("") +
      '<td class="n gfg-ty3 gfg-vd"><b>' + (d ? ggNum(realLoja[l.id]) : "—") + '</b></td><td class="n gfg-ty3"><b>' + ggNum(l.meta) + '</b></td><td class="n gfg-ty3 ' + (cres >= 0 ? "gfg-vd" : "gfg-vm") + '"><b>' + (d ? ggPct(cres) : "—") + "</b></td></tr>";
  });
  h += '</tbody><tfoot><tr class="gfg-f1"><td colspan="2" class="r">Total Semana</td>' + semanas.map(function (s, k) { return '<td class="n">' + ggNum(totSem[k]) + '</td><td class="n gfg-vd">' + (d ? ggNum(lojas.reduce(function (t, l) { return t + realNaSem(l, s); }, 0)) : "—") + "</td>"; }).join("") +
    '<td class="n gfg-ty4 gfg-vd">' + (d ? ggNum(realTotal) : "—") + '</td><td class="n gfg-ty4">' + ggNum(metaTotal) + '</td><td class="n gfg-ty4">' + (d && metaTotal ? ggPct((realTotal / metaTotal - 1) * 100) : "—") + '</td></tr><tr class="gfg-f2"><td colspan="2" class="r">Total Acumulado</td>' +
    semanas.map(function (s, k) { var ant = semanas.slice(0, k + 1), ma = totSem.slice(0, k + 1).reduce(function (t, v) { return t + Math.round(v * 100); }, 0) / 100, ra = lojas.reduce(function (t, l) { return t + ant.reduce(function (z, x) { return z + realNaSem(l, x); }, 0); }, 0); return '<td class="n gfg-am2">' + ggNum(ma) + '</td><td class="n">' + (d ? ggNum(ra) : "—") + "</td>"; }).join("") + '<td colspan="3" class="n gfg-am2">Meta mensal ' + ggMoeda(metaTotal) + "</td></tr></tfoot></table></div>" +
    '<p class="gfg-nota">A cada semana encerrada, o saldo da meta mensal é dividido igualmente entre as semanas restantes, incluindo a semana atual. As metas das semanas encerradas são mantidas no histórico.</p></section>';
  // distribuicao + resumo
  h += '<section class="gfg-grid"><div class="gfg-card"><div class="gfg-dc"><div><h2>Distribuição da meta mensal</h2><p>Defina a meta por loja; a soma é a meta corporativa do mês.</p></div>' + (this.podeEditar ? '<button type="button" class="gfg-save" data-salvar="1"' + (this.alterou ? "" : this.salvo ? " disabled" : "") + ">" + (this.salvo ? "✓ Metas salvas" : "Salvar distribuição") + "</button>" : "") + '</div><div class="gfg-tw"><table class="gfg-t2"><thead><tr><th class="l">Unidade</th><th class="n">Meta mensal</th><th class="n">% da meta</th><th class="n">Realizado</th><th class="n">Atingimento</th></tr></thead><tbody>';
  lojas.forEach(function (l) { var at = l.meta > 0 ? (realLoja[l.id] / l.meta) * 100 : 0; h += '<tr><td class="l"><b>' + ggEsc(String(l.nome).toUpperCase()) + '</b></td><td class="n">' + (self.podeEditar ? '<input class="gfg-in" data-meta="' + ggEsc(l.id) + '" value="' + String(l.meta).replace(".", ",") + '" inputmode="decimal">' : ggMoeda(l.meta)) + '</td><td class="n">' + (metaTotal ? ggPct((l.meta / metaTotal) * 100) : "—") + '</td><td class="n gfg-vd">' + (d ? ggMoeda(realLoja[l.id]) : "—") + '</td><td class="n">' + (d ? ggPct(at) : "—") + "</td></tr>"; });
  h += '</tbody><tfoot><tr><td class="l">TOTAL</td><td class="n">' + ggMoeda(metaTotal) + '</td><td class="n">100,0%</td><td class="n">' + (d ? ggMoeda(realTotal) : "—") + '</td><td class="n">' + (d && metaTotal ? ggPct((realTotal / metaTotal) * 100) : "—") + '</td></tr></tfoot></table></div></div>' +
    '<div class="gfg-exec"><span>Resumo executivo</span><div><small>Meta corporativa</small><strong>' + ggMoeda(metaTotal) + '</strong></div><div><small>Realizado no mês</small><strong class="gfg-vd">' + (d ? ggMoeda(realTotal) : "—") + '</strong></div><div class="gfg-bar"><i style="width:' + Math.min(100, metaTotal ? (realTotal / metaTotal) * 100 : 0) + '%"></i></div><div class="gfg-at"><small>Atingimento</small><b>' + (d && metaTotal ? ggPct((realTotal / metaTotal) * 100) : "—") + "</b></div><p>" + lojas.length + " unidades no planejamento de " + GFG_MESES[this.mes] + ".</p></div></section>";
  var foco = document.activeElement && $(document.activeElement).is("[data-meta]") ? $(document.activeElement).attr("data-meta") : null;
  this.$r.html(h); if (foco) this.$r.find('[data-meta="' + foco + '"]').trigger("focus");
};
