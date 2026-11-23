/* Comissões - Grupo Gferro (página "comissoes-fabrica")
 * Fechamento mensal das comissões dos vendedores, trazido da Intranet (Dashboard > Financeiro > Comissões) e calculado com os dados
 * do ERP (Pedidos de Venda, pagamentos, loja do vendedor). Termo de aceite (por pedido) e ajuste (por vendedor) são digitados aqui.
 * Regras: comissão de vendas = taxa do vendedor (padrão 2%) do valor RECEBIDO; comissão de frete por pedido pelas faixas da
 * "Configuracao Comissao"; semana do mês = WEEKNUM (começa no domingo). */
frappe.pages["comissoes-fabrica"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Comissões", single_column: true });
  $(wrapper).addClass("gf-com");
  wrapper.gf_com = new GfComissoes(page);
};
frappe.pages["comissoes-fabrica"].on_page_show = function (wrapper) {
  if (wrapper.gf_com) wrapper.gf_com.carregar();
};

var GFC_MES_INICIAL = "2026-11";
var GFC_SEMANAS = 5;
var GFC_MINUSC = { da: 1, de: 1, do: 1, das: 1, dos: 1, e: 1 };

function gfcMesAtual() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); }
function gfcSomaMes(mes, n) { var p = mes.split("-").map(Number), d = new Date(p[0], p[1] - 1 + n, 1); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); }
function gfcRotuloMes(mes) { var p = mes.split("-").map(Number), t = new Date(p[0], p[1] - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); return t.charAt(0).toUpperCase() + t.slice(1); }
function gfcBrl(n) { return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function gfcDec(n) { return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function gfcInt(n) { return Number(n || 0).toLocaleString("pt-BR"); }
function gfcPct(n) { return n === null || n === undefined ? "—" : (n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"; }
function gfcEsc(s) { return frappe.utils.escape_html(s == null ? "" : String(s)); }
function gfcBonito(nome) { return String(nome).toLowerCase().split(" ").map(function (p, i) { return i > 0 && GFC_MINUSC[p] ? p : p.charAt(0).toUpperCase() + p.slice(1); }).join(" "); }
function gfcPrimeiro(nome) { return gfcBonito(nome).split(" ")[0]; }
function gfcCent(n) { return Math.round(n * 100) / 100; }
function gfcSinal(n) { return (n > 0 ? "+" : n < 0 ? "−" : "") + gfcBrl(Math.abs(n)); }
function gfcBr(iso) { var p = String(iso).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso; }

/** "8,50", "-8,5", "1.200,00" -> número; vazio -> 0; inválido -> null. */
function gfcLerValor(texto) {
  var s = String(texto || "").trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (!s) return 0;
  if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  var n = Number(s);
  return isFinite(n) ? n : null;
}

function gfcSemanaAno(a, m, d) {
  var data = Date.UTC(a, m - 1, d), jan = Date.UTC(a, 0, 1);
  var diaAno = Math.round((data - jan) / 86400000) + 1, dow = new Date(jan).getUTCDay();
  return Math.floor((diaAno - 1 + dow) / 7) + 1;
}
function gfcSemanaMes(iso) { var p = iso.split("-").map(Number); return gfcSemanaAno(p[0], p[1], p[2]) - gfcSemanaAno(p[0], p[1], 1) + 1; }
function gfcComFrete(frete, faixas) { for (var i = 0; i < faixas.length; i++) if (frete >= faixas[i].minimo) return faixas[i].comissao; return 0; }

/** Mesmo cálculo da Intranet (calcularComissoes). */
function gfcCalcular(d) {
  var porV = {}, lojaDe = {};
  (d.vendedores || []).forEach(function (v) { if (!porV[v.nome]) porV[v.nome] = []; lojaDe[v.nome] = v.loja; });
  d.pedidos.forEach(function (p) { (porV[p.vendedor] = porV[p.vendedor] || []).push(p); if (p.loja) lojaDe[p.vendedor] = p.loja; });
  Object.keys(d.ajustes || {}).forEach(function (n) { if (!porV[n]) porV[n] = []; });
  var res = Object.keys(porV).map(function (v) {
    var calc = porV[v].map(function (p) {
      return $.extend({}, p, { percentual: p.valorTotal > 0 ? p.valorRecebido / p.valorTotal : null, semana: gfcSemanaMes(p.dataEmissao), comissaoFrete: gfcComFrete(p.valorFrete, d.faixas), termoAceite: (d.termos || {})[p.codigo] || null });
    }).sort(function (a, b) { return a.dataEmissao.localeCompare(b.dataEmissao) || a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }); });
    var vs = [0, 0, 0, 0, 0], rs = [0, 0, 0, 0, 0];
    calc.forEach(function (p) { var i = Math.min(Math.max(p.semana, 1), GFC_SEMANAS) - 1; vs[i] += p.valorTotal; rs[i] += p.valorRecebido; });
    var comPct = calc.filter(function (p) { return p.percentual !== null; });
    var taxa = (d.taxas || {})[v] != null ? d.taxas[v] : d.taxaPadrao;
    var soma = function (f) { return calc.reduce(function (s, p) { return s + f(p); }, 0); };
    var totalRec = gfcCent(soma(function (p) { return p.valorRecebido; })), comFrete = gfcCent(soma(function (p) { return p.comissaoFrete; }));
    var comVendas = gfcCent(totalRec * taxa), aj = (d.ajustes || {})[v] || null;
    return {
      vendedor: v, loja: lojaDe[v] || "", pedidos: calc, totalVendas: gfcCent(soma(function (p) { return p.valorTotal; })), totalRecebido: totalRec,
      mediaPercentual: comPct.length ? comPct.reduce(function (s, p) { return s + p.percentual; }, 0) / comPct.length : null,
      vendasPorSemana: vs.map(gfcCent), recebidoPorSemana: rs.map(gfcCent), quantidadeParafusos: soma(function (p) { return p.quantidadeParafusos; }),
      valorParafusos: gfcCent(soma(function (p) { return p.valorParafusos; })), totalFrete: gfcCent(soma(function (p) { return p.valorFrete; })), comissaoFrete: comFrete, taxa: taxa,
      comissaoVendas: comVendas, ajuste: aj, totalComissao: gfcCent(comVendas + comFrete + (aj ? aj.valor : 0))
    };
  });
  return res.sort(function (a, b) { return b.totalVendas - a.totalVendas || a.vendedor.localeCompare(b.vendedor, "pt-BR"); });
}
function gfcSomar(rs) {
  var s = function (f) { return gfcCent(rs.reduce(function (t, r) { return t + f(r); }, 0)); };
  var comPct = []; rs.forEach(function (r) { r.pedidos.forEach(function (p) { if (p.percentual !== null) comPct.push(p.percentual); }); });
  var sem = function (campo) { return [0, 1, 2, 3, 4].map(function (i) { return s(function (r) { return r[campo][i]; }); }); };
  return {
    pedidos: rs.reduce(function (t, r) { return t + r.pedidos.length; }, 0), totalVendas: s(function (r) { return r.totalVendas; }), totalRecebido: s(function (r) { return r.totalRecebido; }),
    mediaPercentual: comPct.length ? comPct.reduce(function (a, b) { return a + b; }, 0) / comPct.length : null, vendasPorSemana: sem("vendasPorSemana"), recebidoPorSemana: sem("recebidoPorSemana"),
    quantidadeParafusos: rs.reduce(function (t, r) { return t + r.quantidadeParafusos; }, 0), valorParafusos: s(function (r) { return r.valorParafusos; }), totalFrete: s(function (r) { return r.totalFrete; }),
    comissaoFrete: s(function (r) { return r.comissaoFrete; }), comissaoVendas: s(function (r) { return r.comissaoVendas; }), ajustes: s(function (r) { return r.ajuste ? r.ajuste.valor : 0; }), totalComissao: s(function (r) { return r.totalComissao; })
  };
}

function GfComissoes(page) {
  this.page = page; this.mes = gfcMesAtual(); if (this.mes < GFC_MES_INICIAL) this.mes = GFC_MES_INICIAL;
  this.dados = null; this.sel = null; this.erro = "";
  this.$ = $(page.main); this.$.html('<div class="gfc"></div>'); this.$r = this.$.find(".gfc");
  var self = this;
  this.$r.on("click", "[data-mes]", function () { self.mes = gfcSomaMes(self.mes, +$(this).data("mes")); self.dados = null; self.carregar(); });
  this.$r.on("click", "[data-atualizar]", function () { self.carregar(); });
  this.$r.on("click", "[data-csv]", function () { self.csv(); });
  this.$r.on("click", "[data-sel]", function () { self.sel = $(this).attr("data-sel"); self.desenhar(); });
  this.$r.on("change", "[data-termo]", function () {
    var cod = $(this).attr("data-termo"), v = this.value;
    if (v) self.dados.termos[cod] = v; else delete self.dados.termos[cod];
    frappe.call({ method: "erpnext.gferro_utils.comissoes_termo", args: { pedido: cod, valor: v } }).catch(function () { self.erro = "Não foi possível salvar o termo."; self.carregar(); });
    self.desenhar();
  });
  this.$r.on("blur", ".gfc-aj", function () { self.salvarAjuste(); });
  this.$r.on("keydown", ".gfc-aj", function (e) { if (e.key === "Enter") this.blur(); });
}

GfComissoes.prototype.carregar = function () {
  var self = this, mes = this.mes;
  frappe.call({ method: "erpnext.gferro_utils.comissoes_fabrica", args: { mes: mes } }).then(function (r) {
    if (mes !== self.mes) return;
    self.dados = r.message; self.erro = ""; self.desenhar();
  }).catch(function () { self.erro = "Não foi possível carregar as comissões."; self.desenhar(); });
};

GfComissoes.prototype.salvarAjuste = function () {
  var v = this.sel; if (!v) return;
  var $v = this.$r.find(".gfc-aj-valor"), $o = this.$r.find(".gfc-aj-obs"), n = gfcLerValor($v.val());
  if (n === null) { $v.addClass("gfc-inv"); return; }
  $v.removeClass("gfc-inv");
  var atual = this.dados.ajustes[v] || { valor: 0, observacao: "" }, obs = ($o.val() || "").trim();
  if (n === atual.valor && obs === atual.observacao) return;
  if (n === 0 && !obs) delete this.dados.ajustes[v]; else this.dados.ajustes[v] = { valor: n, observacao: obs };
  var self = this;
  frappe.call({ method: "erpnext.gferro_utils.comissoes_ajuste", args: { mes: this.mes, vendedor: v, valor: n, observacao: obs } }).catch(function () { self.erro = "Não foi possível salvar o ajuste."; self.carregar(); });
  this.desenhar();
};

GfComissoes.prototype.nomeLoja = function (id) { return id || "Sem loja definida"; };

GfComissoes.prototype.grupos = function (resumos) {
  var lojas = (this.dados.lojas || []).map(function (l) { return { id: l.id, nome: l.nome, resumos: resumos.filter(function (r) { return r.loja === l.id; }) }; });
  var sem = resumos.filter(function (r) { return !lojas.some(function (l) { return l.id === r.loja; }); });
  if (sem.length) lojas.push({ id: "", nome: "Sem loja definida", resumos: sem });
  return lojas;
};

GfComissoes.prototype.desenhar = function () {
  var self = this, d = this.dados, h = "";
  var ant = this.mes <= GFC_MES_INICIAL, prox = this.mes >= gfcMesAtual();
  h += '<div class="gfc-topo"><div><div class="gfc-trilha">Dashboard › Financeiro › <b>Comissões</b></div><h1>Comissões</h1>' +
    "<p>Fechamento mensal dos vendedores de todas as lojas, calculado dos pedidos do ERP: vendas, recebido, parafusos, frete e comissões.</p></div>" +
    '<div class="gfc-acoes"><button type="button" class="gfc-b" data-atualizar="1">Atualizar</button><button type="button" class="gfc-b" data-csv="1"' + (d && d.pedidos.length ? "" : " disabled") + ">Baixar Excel (CSV)</button></div></div>" +
    '<div class="gfc-mes"><button type="button" class="gfc-b gfc-ic" data-mes="-1"' + (ant ? " disabled" : "") + ' aria-label="Mês anterior">&#8249;</button><strong>' + gfcRotuloMes(this.mes) +
    '</strong><button type="button" class="gfc-b gfc-ic" data-mes="1"' + (prox ? " disabled" : "") + ' aria-label="Próximo mês">&#8250;</button></div>';
  if (this.erro) h += '<p class="gfc-aviso gfc-erro">' + gfcEsc(this.erro) + "</p>";
  if (!d) { this.$r.html(h + '<p class="gfc-vazio">Carregando...</p>'); return; }
  var resumos = gfcCalcular(d), grupos = this.grupos(resumos), tot = gfcSomar(resumos);
  this.resumos = resumos; this.tot = tot;
  var atual = resumos.filter(function (r) { return r.vendedor === self.sel; })[0] || resumos[0];
  if (atual) this.sel = atual.vendedor;
  var c = function (t, v, s, cl) { return '<div class="gfc-card' + (cl ? " " + cl : "") + '"><span>' + t + "</span><strong>" + v + "</strong><small>" + s + "</small></div>"; };
  h += '<section class="gfc-cards">' + c("Vendas do mês", gfcBrl(tot.totalVendas), gfcInt(tot.pedidos) + " pedidos") + c("Recebido", gfcBrl(tot.totalRecebido), "média de " + gfcPct(tot.mediaPercentual) + " por pedido") +
    c("Comissão de vendas", gfcBrl(tot.comissaoVendas), gfcPct(d.taxaPadrao) + " do valor recebido") + c("Comissão de frete", gfcBrl(tot.comissaoFrete), "frete cobrado " + gfcBrl(tot.totalFrete)) +
    c("Total a pagar", gfcBrl(tot.totalComissao), "vendas + frete" + (tot.ajustes !== 0 ? " " + (tot.ajustes > 0 ? "+" : "−") + " ajustes " + gfcBrl(Math.abs(tot.ajustes)) : ""), "gfc-dest") + "</section>";

  // resumo por loja
  grupos.forEach(function (g) {
    var t = gfcSomar(g.resumos);
    h += '<div class="gfc-painel"><div class="gfc-lojacab"><h2>' + gfcEsc(g.nome) + "</h2><span>" + g.resumos.length + " vendedor" + (g.resumos.length === 1 ? "" : "es") + " · vendas " + gfcBrl(t.totalVendas) + " · total a pagar <b>" + gfcBrl(t.totalComissao) + "</b></span></div>" +
      '<div class="gfc-tw"><table class="gfc-t"><thead><tr><th>Vendedor</th><th class="n">Pedidos</th><th class="n">Vendas (R$)</th><th class="n">Recebido (R$)</th><th class="n" title="Média simples do % recebido de cada pedido">% médio</th><th class="n">Parafusos (un)</th><th class="n">Parafusos (R$)</th><th class="n">Frete (R$)</th><th class="n">Com. frete (R$)</th><th class="n">Com. vendas (R$)</th><th class="n">Ajuste (R$)</th><th class="n">Total a pagar (R$)</th></tr></thead><tbody>';
    g.resumos.forEach(function (r) {
      var aj = r.ajuste && r.ajuste.valor !== 0 ? r.ajuste.valor : 0;
      h += '<tr class="gfc-lin' + (r.pedidos.length === 0 && !r.ajuste ? " gfc-apagado" : "") + '" data-sel="' + gfcEsc(r.vendedor) + '"><td><b>' + gfcEsc(gfcBonito(r.vendedor)) + '</b></td><td class="n">' + r.pedidos.length + '</td><td class="n">' + gfcDec(r.totalVendas) +
        '</td><td class="n">' + gfcDec(r.totalRecebido) + '</td><td class="n">' + gfcPct(r.mediaPercentual) + '</td><td class="n">' + gfcInt(r.quantidadeParafusos) + '</td><td class="n">' + gfcDec(r.valorParafusos) + '</td><td class="n">' + gfcDec(r.totalFrete) +
        '</td><td class="n">' + gfcDec(r.comissaoFrete) + '</td><td class="n" title="' + gfcPct(r.taxa) + ' do recebido">' + gfcDec(r.comissaoVendas) + '</td><td class="n ' + (aj > 0 ? "gfc-pos" : aj < 0 ? "gfc-neg" : "gfc-apagado") + '" title="' + gfcEsc(r.ajuste ? r.ajuste.observacao : "") + '">' +
        (aj ? gfcSinal(aj) : "—") + '</td><td class="n"><b>' + gfcDec(r.totalComissao) + "</b></td></tr>";
    });
    if (!g.resumos.length) h += '<tr><td colspan="12" class="gfc-vazio">Nenhum vendedor cadastrado nesta loja.</td></tr>';
    if (g.resumos.length > 1) h += '<tr class="gfc-tot"><td>Total da loja</td><td class="n">' + t.pedidos + '</td><td class="n">' + gfcDec(t.totalVendas) + '</td><td class="n">' + gfcDec(t.totalRecebido) + '</td><td class="n">' + gfcPct(t.mediaPercentual) +
      '</td><td class="n">' + gfcInt(t.quantidadeParafusos) + '</td><td class="n">' + gfcDec(t.valorParafusos) + '</td><td class="n">' + gfcDec(t.totalFrete) + '</td><td class="n">' + gfcDec(t.comissaoFrete) + '</td><td class="n">' + gfcDec(t.comissaoVendas) +
      '</td><td class="n">' + (t.ajustes ? gfcSinal(t.ajustes) : "—") + '</td><td class="n">' + gfcDec(t.totalComissao) + "</td></tr>";
    h += "</tbody></table></div></div>";
  });

  // por semana
  if (resumos.length) {
    h += '<section class="gfc-duas">';
    [["Vendas por semana (R$)", "vendasPorSemana"], ["Recebido por semana (R$)", "recebidoPorSemana"]].forEach(function (par) {
      h += '<div class="gfc-painel"><h2>' + par[0] + '</h2><div class="gfc-tw"><table class="gfc-t"><thead><tr><th>Vendedor</th>' + [1, 2, 3, 4, 5].map(function (i) { return '<th class="n">Sem. ' + i + "</th>"; }).join("") + "</tr></thead><tbody>";
      grupos.filter(function (g) { return g.resumos.length; }).forEach(function (g) {
        h += '<tr><td colspan="6" class="gfc-grp">' + gfcEsc(g.nome) + "</td></tr>";
        g.resumos.forEach(function (r) { h += "<tr><td><b>" + gfcEsc(gfcPrimeiro(r.vendedor)) + "</b></td>" + r[par[1]].map(function (v) { return '<td class="n' + (v === 0 ? " gfc-apagado" : "") + '">' + (v === 0 ? "—" : gfcDec(v)) + "</td>"; }).join("") + "</tr>"; });
      });
      h += '<tr class="gfc-tot"><td>Total geral</td>' + tot[par[1]].map(function (v) { return '<td class="n">' + gfcDec(v) + "</td>"; }).join("") + "</tr></tbody></table></div></div>";
    });
    h += "</section>";
  }

  // detalhe do vendedor
  if (atual) {
    h += '<section class="gfc-painel"><div class="gfc-det-cab"><h2>Pedidos de</h2><span>' + gfcEsc(this.nomeLoja(atual.loja)) + " › <b>" + gfcEsc(gfcBonito(atual.vendedor)) + "</b></span></div><div class=\"gfc-pills\">";
    grupos.filter(function (g) { return g.resumos.length; }).forEach(function (g) {
      h += '<div class="gfc-pl"><span>' + gfcEsc(g.nome) + "</span>" + g.resumos.map(function (r) { return '<button type="button" class="gfc-pill' + (r.vendedor === atual.vendedor ? " gfc-pill-on" : "") + '" data-sel="' + gfcEsc(r.vendedor) + '">' + gfcEsc(gfcPrimeiro(r.vendedor)) + "</button>"; }).join("") + "</div>";
    });
    h += '</div><div class="gfc-resumo"><div><span>Comissão de vendas (' + gfcPct(atual.taxa) + " de " + gfcBrl(atual.totalRecebido) + "): <b>" + gfcBrl(atual.comissaoVendas) + "</b></span><span>Comissão de frete: <b>" + gfcBrl(atual.comissaoFrete) +
      "</b></span><span>Total a pagar: <b>" + gfcBrl(atual.totalComissao) + '</b></span></div><div class="gfc-ajuste"><label>Ajuste (R$)</label><input class="gfc-aj gfc-aj-valor" inputmode="decimal" placeholder="0,00 (use − para descontar)" value="' +
      gfcEsc(atual.ajuste ? String(atual.ajuste.valor).replace(".", ",") : "") + '"><input class="gfc-aj gfc-aj-obs" maxlength="200" placeholder="Observação (ex.: descontar R$ 8)" value="' + gfcEsc(atual.ajuste ? atual.ajuste.observacao : "") + '"></div></div>';
    h += '<div class="gfc-tw"><table class="gfc-t"><thead><tr><th>Data</th><th>Pedido</th><th class="n">Valor vendas (R$)</th><th class="n">Valor recebido (R$)</th><th class="n">%</th><th class="n">Parafusos (un)</th><th class="n">Parafusos (R$)</th><th class="n">Frete (R$)</th><th class="n">Com. frete (R$)</th><th>Semana</th><th>Termo de aceite</th></tr></thead><tbody>';
    atual.pedidos.forEach(function (p) {
      var z = function (v, f) { return v === 0 ? '<td class="n gfc-apagado">—</td>' : '<td class="n">' + f(v) + "</td>"; };
      h += "<tr><td>" + gfcBr(p.dataEmissao) + "</td><td><b>" + gfcEsc(p.codigo) + '</b></td><td class="n">' + gfcDec(p.valorTotal) + '</td><td class="n">' + gfcDec(p.valorRecebido) + '</td><td class="n">' + gfcPct(p.percentual) + "</td>" +
        z(p.quantidadeParafusos, gfcInt) + z(p.valorParafusos, gfcDec) + z(p.valorFrete, gfcDec) + z(p.comissaoFrete, gfcDec) + '<td class="c">' + p.semana + '</td><td><select class="gfc-termo ' + (p.termoAceite === "sim" ? "gfc-sim" : p.termoAceite === "nao" ? "gfc-nao" : "") +
        '" data-termo="' + gfcEsc(p.codigo) + '"><option value="">—</option><option value="sim"' + (p.termoAceite === "sim" ? " selected" : "") + '>Sim</option><option value="nao"' + (p.termoAceite === "nao" ? " selected" : "") + ">Não</option></select></td></tr>";
    });
    if (!atual.pedidos.length) h += '<tr><td colspan="11" class="gfc-vazio">Nenhum pedido neste mês.</td></tr>';
    h += '<tr class="gfc-tot"><td colspan="2">Total</td><td class="n">' + gfcDec(atual.totalVendas) + '</td><td class="n">' + gfcDec(atual.totalRecebido) + '</td><td class="n">' + gfcPct(atual.mediaPercentual) + '</td><td class="n">' + gfcInt(atual.quantidadeParafusos) +
      '</td><td class="n">' + gfcDec(atual.valorParafusos) + '</td><td class="n">' + gfcDec(atual.totalFrete) + '</td><td class="n">' + gfcDec(atual.comissaoFrete) + '</td><td colspan="2"></td></tr></tbody></table></div></section>';
  }

  var fx = d.faixas.slice().reverse();
  h += '<details class="gfc-painel gfc-como"><summary>Como é calculado</summary><ul>' +
    "<li><b>Pedidos:</b> Pedidos de Venda confirmados e emitidos no mês, exceto cancelados. O vendedor e a loja vêm do cadastro de vendedores.</li>" +
    "<li><b>Valor recebido:</b> o maior entre o adiantamento recebido no pedido e o já pago nas notas/faturas do pedido; muda conforme entram os pagamentos.</li>" +
    "<li><b>Comissão de vendas:</b> " + gfcPct(d.taxaPadrao) + " do valor recebido (a taxa de cada vendedor pode ser ajustada no cadastro de vendedores). <b>% médio:</b> média simples do % recebido de cada pedido.</li>" +
    "<li><b>Comissão de frete (por pedido):</b> " + fx.map(function (f, i) { return gfcBrl(f.minimo) + (i < fx.length - 1 ? " a " + gfcBrl(fx[i + 1].minimo - 0.01) : " ou mais") + " = " + gfcBrl(f.comissao); }).join("; ") +
    ". Abaixo de " + (fx.length ? gfcBrl(fx[0].minimo) : "—") + " não há comissão. O frete é o campo “Frete” do pedido.</li>" +
    "<li><b>Semana:</b> semanas do mês começando no domingo (a semana 1 é a que tem o dia 1). <b>Termo de aceite</b> e <b>ajuste</b> são preenchidos à mão e ficam salvos. A taxa padrão e as faixas ficam em “Configuracao Comissao”.</li></ul></details>";
  var foco = this.$r.find(".gfc-aj:focus").length;
  this.$r.html(h);
  if (foco) this.$r.find(".gfc-aj-valor").trigger("focus");
};

GfComissoes.prototype.csv = function () {
  var self = this, rs = this.resumos, tot = this.tot;
  function esc(x) { var s = String(x == null ? "" : x); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function num(n) { return n.toFixed(2).replace(".", ","); }
  function pc(v) { return v === null ? "" : (v * 100).toFixed(1).replace(".", ","); }
  var L = [["Loja", "Vendedor", "Pedidos", "Vendas (R$)", "Recebido (R$)", "% médio recebido", "Parafusos (un)", "Parafusos (R$)", "Frete (R$)", "Comissão frete (R$)", "Taxa", "Comissão vendas (R$)", "Ajuste (R$)", "Obs. do ajuste", "Total (R$)"].map(esc).join(";")];
  rs.forEach(function (r) { L.push([self.nomeLoja(r.loja), gfcBonito(r.vendedor), r.pedidos.length, num(r.totalVendas), num(r.totalRecebido), pc(r.mediaPercentual), r.quantidadeParafusos, num(r.valorParafusos), num(r.totalFrete), num(r.comissaoFrete), (r.taxa * 100).toFixed(0) + "%", num(r.comissaoVendas), num(r.ajuste ? r.ajuste.valor : 0), r.ajuste ? r.ajuste.observacao : "", num(r.totalComissao)].map(esc).join(";")); });
  L.push(["TOTAL", "", tot.pedidos, num(tot.totalVendas), num(tot.totalRecebido), pc(tot.mediaPercentual), tot.quantidadeParafusos, num(tot.valorParafusos), num(tot.totalFrete), num(tot.comissaoFrete), "", num(tot.comissaoVendas), num(tot.ajustes), "", num(tot.totalComissao)].map(esc).join(";"), "");
  L.push(["Loja", "Vendedor", "Data", "Pedido", "Valor vendas (R$)", "Valor recebido (R$)", "%", "Parafusos (un)", "Parafusos (R$)", "Frete (R$)", "Comissão frete (R$)", "Semana", "Termo de aceite"].map(esc).join(";"));
  rs.forEach(function (r) { r.pedidos.forEach(function (p) { L.push([self.nomeLoja(r.loja), gfcBonito(r.vendedor), gfcBr(p.dataEmissao), p.codigo, num(p.valorTotal), num(p.valorRecebido), pc(p.percentual), p.quantidadeParafusos, num(p.valorParafusos), num(p.valorFrete), num(p.comissaoFrete), p.semana, p.termoAceite === "sim" ? "Sim" : p.termoAceite === "nao" ? "Não" : ""].map(esc).join(";")); }); });
  var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + L.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }));
  a.download = "comissoes-fabrica-" + this.mes + ".csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
};
