/* Pedidos - Grupo Gferro (página "pedidos-dashboard")
 * Dashboard > Pedidos da Intranet, com os dados do ERP (Pedidos de Venda). Três visões, escolhidas pela rota:
 *   /desk/pedidos-dashboard/liberados  - Pedidos liberados (prazo, atraso, falta receber)
 *   /desk/pedidos-dashboard/combinados - Pedidos combinados (observação cita o Dirceu)
 *   /desk/pedidos-dashboard/formato2   - Pedidos Formato 2 (prazo por dias úteis conforme o pagamento, custo e lucro)
 * Pedidos problemáticos ficam no cadastro "Pedido Problemático" (lista do ERP). */
frappe.pages["pedidos-dashboard"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Pedidos", single_column: true });
  $(wrapper).addClass("gf-ped");
  wrapper.gf_ped = new GfPedidos(page);
};
frappe.pages["pedidos-dashboard"].on_page_show = function (wrapper) {
  if (!wrapper.gf_ped) return;
  var r = (frappe.get_route && frappe.get_route()) || [];
  wrapper.gf_ped.abrir(r[1] || "liberados");
};

var GFP_ALERTA = 3, GFP_CORTE = "2026-11-18";
var GFP_COMPOSICAO = [["Bobina", 61], ["EPS", 17], ["Forro Metálico", 11], ["Tinta", 5], ["Translúcida", 2], ["Aço", 1], ["Cola", 1], ["Consigás", 1]];

function gfpBrl(n) { return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function gfpInt(n) { return Number(n || 0).toLocaleString("pt-BR"); }
function gfpPct(n) { return n === null || n === undefined ? "—" : (n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + "%"; }
function gfpEsc(s) { return frappe.utils.escape_html(s == null ? "" : String(s)); }
function gfpBr(iso) { var p = String(iso || "").slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "—"; }
function gfpNorm(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function gfpPlural(n, a, b) { return n + " " + (n === 1 ? a : b); }

/* ---- dias úteis (seg-sex, menos feriados nacionais, Carnaval e Sexta-feira Santa) ---- */
function gfpPad(n) { return ("0" + n).slice(-2); }
function gfpDeIso(i) { var p = i.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
function gfpIso(d) { return d.getUTCFullYear() + "-" + gfpPad(d.getUTCMonth() + 1) + "-" + gfpPad(d.getUTCDate()); }
function gfpSomaCorridos(i, n) { var d = gfpDeIso(i); d.setUTCDate(d.getUTCDate() + n); return gfpIso(d); }
function gfpPascoa(ano) {
  var a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  var mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return ano + "-" + gfpPad(mes) + "-" + gfpPad(dia);
}
var gfpFer = {};
function gfpFeriados(ano) {
  if (gfpFer[ano]) return gfpFer[ano];
  var p = gfpPascoa(ano), s = {};
  [ano + "-01-01", gfpSomaCorridos(p, -48), gfpSomaCorridos(p, -47), gfpSomaCorridos(p, -2), ano + "-04-21", ano + "-05-01", ano + "-09-07", ano + "-10-12", ano + "-11-02", ano + "-11-15"]
    .concat(ano >= 2024 ? [ano + "-11-20"] : []).concat([ano + "-12-25"]).forEach(function (x) { s[x] = 1; });
  return (gfpFer[ano] = s);
}
function gfpUtil(iso) { var dw = gfpDeIso(iso).getUTCDay(); return dw !== 0 && dw !== 6 && !gfpFeriados(+iso.slice(0, 4))[iso]; }
function gfpSomaUteis(ini, n) { var a = ini, r = n; while (r > 0) { a = gfpSomaCorridos(a, 1); if (gfpUtil(a)) r--; } return a; }
function gfpUteisEntre(de, ate) {
  var ini = ate >= de ? de : ate, fim = ate >= de ? ate : de, sinal = ate >= de ? 1 : -1, a = ini, n = 0;
  while (a < fim) { a = gfpSomaCorridos(a, 1); if (gfpUtil(a)) n++; }
  return n * sinal;
}
function gfpCorridos(de, ate) { return Math.round((gfpDeIso(ate) - gfpDeIso(de)) / 86400000); }

/* ---- classificações ---- */
function gfpSituacao(p, hoje) {
  var e = gfpNorm(p.etapa);
  if (e === "entregue") return { s: "entregue-pcp", dias: null, atraso: 0 };
  if (e === "cancelado") return { s: "cancelado-pcp", dias: null, atraso: 0 };
  if (!p.prazo) return { s: "sem-prazo", dias: null, atraso: 0 };
  var d = gfpCorridos(hoje, p.prazo);
  return { s: d < 0 ? "atrasado" : d <= GFP_ALERTA ? "vence-em-breve" : "no-prazo", dias: d, atraso: d < 0 ? -d : 0 };
}
var GFP_EST = {
  "atrasado": ["Atrasados", "#dc2626", "#fee2e2", "#b91c1c"], "vence-em-breve": ["Vence em breve", "#eab308", "#fef9c3", "#854d0e"], "no-prazo": ["Dentro do prazo", "#10b981", "#d1fae5", "#047857"],
  "sem-prazo": ["Sem prazo", "#9ca3af", "#f3f4f6", "#4b5563"], "entregue-pcp": ["Entregues", "#38bdf8", "#e0f2fe", "#0369a1"], "cancelado-pcp": ["Cancelados", "#6b7280", "#e5e7eb", "#374151"]
};
var GFP_ORDEM = ["atrasado", "vence-em-breve", "no-prazo", "sem-prazo", "entregue-pcp", "cancelado-pcp"];
function gfpTextoSit(p, sit) {
  var d = sit.dias;
  switch (sit.s) {
    case "atrasado": return "Atrasado há " + gfpPlural(sit.atraso, "dia", "dias");
    case "vence-em-breve": return d === 0 ? "Vence hoje" : d === 1 ? "Vence amanhã" : "Vence em " + d + " dias";
    case "no-prazo": return "Faltam " + gfpPlural(d, "dia", "dias");
    case "sem-prazo": return "Sem prazo";
    case "entregue-pcp": return "Entregue";
    default: return "Cancelado";
  }
}
function gfpSelo(sit, texto) { var c = GFP_EST[sit.s]; return '<span class="gfp-selo" style="background:' + c[2] + ";color:" + c[3] + '"><i style="background:' + c[1] + '"></i>' + gfpEsc(texto) + "</span>"; }

var GFP_REGRAS = { "contrato": ["Contrato", null, 60], "pago-30-69": ["30% a 69% pago", null, 40], "pago-70-100": ["70% a 100% pago", 7, 10], "abaixo-30": ["Menos de 30% pago", null, null] };
function gfpFormato2(p, hoje) {
  var pct = p.valorTotal > 0 ? Math.min(1, Math.max(0, p.recebido / p.valorTotal)) : 0, regra;
  if (p.contrato) regra = "contrato"; else if (pct >= 0.7) regra = "pago-70-100"; else if (pct >= 0.3) regra = "pago-30-69"; else regra = "abaixo-30";
  var r = GFP_REGRAS[regra], out = { regra: regra, rotulo: r[0], pct: pct, dias: r[2], ini: null, fim: null, status: "sem-regra", atraso: 0, paraPrazo: null };
  if (r[2] === null) return out;
  out.fim = gfpSomaUteis(p.dataEmissao, r[2]); out.ini = r[1] !== null ? gfpSomaUteis(p.dataEmissao, r[1]) : null;
  out.paraPrazo = gfpUteisEntre(hoje, out.fim);
  var passou = hoje > out.fim; out.status = passou ? "atrasado" : "dentro-do-prazo"; out.atraso = passou ? -out.paraPrazo : 0;
  return out;
}
function gfpCusto(v) { // custo de produção por material, em centavos exatos (a soma fecha com o custo)
  var cents = Math.round(v * 100), soma = GFP_COMPOSICAO.reduce(function (t, i) { return t + i[1]; }, 0);
  var partes = GFP_COMPOSICAO.map(function (i, ix) { var ex = (cents * i[1]) / soma; return { ix: ix, nome: i[0], pct: (i[1] / soma) * 100, c: Math.floor(ex), resto: ex - Math.floor(ex) }; });
  var sobra = cents - partes.reduce(function (t, p) { return t + p.c; }, 0);
  partes.slice().sort(function (a, b) { return b.resto - a.resto || a.ix - b.ix; }).forEach(function (p) { if (sobra > 0) { p.c += 1; sobra--; } });
  return partes.map(function (p) { return { nome: p.nome, pct: p.pct, valor: p.c / 100 }; });
}
function gfpDividir(pago) { var lucro = Math.round(pago * 0.3 * 100) / 100; return { custo: Math.round((pago - lucro) * 100) / 100, lucro: lucro }; }

function GfPedidos(page) {
  this.page = page; this.vista = "liberados"; this.dados = null; this.erro = "";
  this.f = { busca: "", situacao: "todos", loja: "todas", receb: "todos", ordem: "urgencia", dir: "asc", regra: "todas", status: "todos", lucro: "todos" };
  this.aberto = {};
  this.$ = $(page.main); this.$.html('<div class="gfp"></div>'); this.$r = this.$.find(".gfp");
  var self = this;
  this.$r.on("input", ".gfp-busca", function () { self.f.busca = this.value; var p = this.selectionStart; self.desenhar(); var i = self.$r.find(".gfp-busca").trigger("focus")[0]; if (i) i.setSelectionRange(p, p); });
  this.$r.on("click", "[data-f]", function () { self.f[$(this).data("f")] = String($(this).data("v")); self.desenhar(); });
  this.$r.on("change", "[data-sel]", function () { self.f[$(this).data("sel")] = this.value; self.desenhar(); });
  this.$r.on("click", "[data-ord]", function () { var c = $(this).data("ord"); if (c === "urgencia") { self.f.ordem = c; self.f.dir = "asc"; } else if (self.f.ordem === c) self.f.dir = self.f.dir === "asc" ? "desc" : "asc"; else { self.f.ordem = c; self.f.dir = /emissao|valor|aReceber/.test(c) ? "desc" : "asc"; } self.desenhar(); });
  this.$r.on("click", "[data-atualizar]", function () { self.carregar(); });
  this.$r.on("click", "[data-abre]", function () { var c = $(this).data("abre"); self.aberto[c] = !self.aberto[c]; self.desenhar(); });
  this.$r.on("change", "[data-lucro]", function () { self.lucro($(this).data("lucro"), this.checked); });
}

GfPedidos.prototype.abrir = function (vista) {
  if (["liberados", "combinados", "formato2"].indexOf(vista) < 0) vista = "liberados";
  this.vista = vista; this.f.busca = ""; this.f.situacao = "todos";
  this.carregar();
};

GfPedidos.prototype.carregar = function () {
  var self = this;
  frappe.call({ method: "erpnext.gferro_utils.pedidos_dashboard" }).then(function (r) { self.dados = r.message; self.erro = ""; self.desenhar(); })
    .catch(function () { self.erro = "Não foi possível carregar os pedidos."; self.desenhar(); });
};

GfPedidos.prototype.lucro = function (codigo, on) {
  var self = this, p = this.dados.pedidos.filter(function (x) { return x.codigo === codigo; })[0]; if (!p) return;
  var l = gfpDividir(p.recebido).lucro;
  if (!on && !window.confirm("Desfazer a confirmação de que o lucro de " + codigo + " (" + gfpBrl(l) + ") foi transferido?")) { this.desenhar(); return; }
  p.lucroTransferido = on ? { valor: l, por: frappe.session.user, em: new Date().toISOString() } : null; this.desenhar();
  frappe.call({ method: "erpnext.gferro_utils.pedidos_lucro_transferido", args: { pedido: codigo, transferido: on ? 1 : 0, valor: l } }).catch(function () { self.erro = "Não foi possível salvar."; self.carregar(); });
};

GfPedidos.prototype.cab = function (titulo, sub, trilha) {
  return '<div class="gfp-topo"><div><div class="gfp-trilha">Dashboard • <b>' + trilha + "</b></div><h1>" + titulo + "</h1><p>" + sub + '</p></div><div class="gfp-acoes">' +
    '<input type="search" class="gfp-busca" placeholder="Buscar pedido, cliente, vendedor..." value="' + gfpEsc(this.f.busca) + '"><button type="button" class="gfp-b" data-atualizar="1">Atualizar</button></div></div>' +
    (this.erro ? '<p class="gfp-aviso">' + gfpEsc(this.erro) + "</p>" : "");
};
GfPedidos.prototype.chip = function (campo, valor, rot, on) { return '<button type="button" class="gfp-chip' + (on ? " gfp-on" : "") + '" data-f="' + campo + '" data-v="' + valor + '">' + rot + "</button>"; };
GfPedidos.prototype.kpi = function (t, v, d, cl) { return '<div class="gfp-kpi ' + (cl || "") + '"><span>' + t + "</span><strong>" + v + "</strong><small>" + d + "</small></div>"; };
GfPedidos.prototype.vazio = function (t) { return '<p class="gfp-vazio">' + t + "</p>"; };

GfPedidos.prototype.desenhar = function () {
  if (!this.dados) { this.$r.html((this.erro ? '<p class="gfp-aviso">' + gfpEsc(this.erro) + "</p>" : "") + '<p class="gfp-vazio">Carregando...</p>'); return; }
  var h = this.vista === "combinados" ? this.vCombinados() : this.vista === "formato2" ? this.vFormato2() : this.vLiberados();
  var foco = this.$r.find(".gfp-busca:focus").length; this.$r.html(h); if (foco) this.$r.find(".gfp-busca").trigger("focus");
};

GfPedidos.prototype.busca = function (p) { var t = gfpNorm(this.f.busca.trim()); return !t || gfpNorm(p.codigo + " " + p.cliente + " " + p.vendedor + " " + p.loja + " " + (p.observacao || "")).indexOf(t) >= 0; };

/* ---------------- liberados ---------------- */
GfPedidos.prototype.vLiberados = function () {
  var self = this, hoje = this.dados.hoje, f = this.f;
  var todos = this.dados.pedidos.map(function (p) { return $.extend({}, p, { sit: gfpSituacao(p, hoje) }); });
  var lojas = []; todos.forEach(function (p) { if (lojas.indexOf(p.loja) < 0) lojas.push(p.loja); }); lojas.sort();
  var sel = todos.filter(function (p) { return (f.loja === "todas" || p.loja === f.loja) && (f.receb === "todos" || (f.receb === "com-saldo" ? p.aReceber > 0 : p.aReceber === 0)) && self.busca(p); });
  var cont = {}; GFP_ORDEM.forEach(function (s) { cont[s] = 0; }); sel.forEach(function (p) { cont[p.sit.s]++; });
  var vis = f.situacao === "todos" ? sel.slice() : sel.filter(function (p) { return p.sit.s === f.situacao; });
  if (f.ordem !== "urgencia") {
    var k = f.dir === "asc" ? 1 : -1, tx = function (a, b) { return String(a).localeCompare(String(b), "pt-BR"); };
    vis.sort(function (a, b) {
      switch (f.ordem) { case "codigo": return k * tx(a.codigo, b.codigo); case "cliente": return k * tx(a.cliente, b.cliente); case "vendedor": return k * tx(a.vendedor, b.vendedor);
        case "prazo": return k * tx(a.prazo || "9999-12-31", b.prazo || "9999-12-31"); case "valor": return k * (a.valorTotal - b.valorTotal); case "aReceber": return k * (a.aReceber - b.aReceber); default: return 0; }
    });
  } else {
    var peso = { "atrasado": 0, "vence-em-breve": 1, "no-prazo": 2, "sem-prazo": 3, "entregue-pcp": 4, "cancelado-pcp": 5 };
    vis.sort(function (a, b) { return peso[a.sit.s] - peso[b.sit.s] || (a.sit.dias === null ? 9e6 : a.sit.dias) - (b.sit.dias === null ? 9e6 : b.sit.dias); });
  }
  var atr = sel.filter(function (p) { return p.sit.s === "atrasado"; });
  var soma = function (l, c) { return l.reduce(function (t, p) { return t + (p[c] || 0); }, 0); };
  var h = this.cab("Pedidos liberados", "Pedidos confirmados no ERP. O atraso conta pelo prazo de entrega do pedido. Vence em breve = até " + GFP_ALERTA + " dias.", "Pedidos");
  h += '<section class="gfp-kpis">' + this.kpi("Pedidos liberados", gfpInt(sel.length), gfpBrl(soma(sel, "valorTotal")) + " em pedidos", "gfp-k-am") +
    this.kpi("Atrasados", gfpInt(atr.length), atr.length ? gfpBrl(soma(atr, "valorTotal")) + " · média de " + gfpPlural(Math.round(atr.reduce(function (t, p) { return t + p.sit.atraso; }, 0) / atr.length), "dia", "dias") : "Nenhum pedido atrasado", "gfp-k-vm") +
    this.kpi("Falta receber", gfpBrl(soma(sel, "aReceber")), "em " + gfpPlural(sel.filter(function (p) { return p.aReceber > 0; }).length, "pedido", "pedidos"), "gfp-k-vd") +
    this.kpi("Vencido a receber", gfpBrl(soma(sel, "vencidoReceber")), "parcelas vencidas em " + gfpPlural(sel.filter(function (p) { return p.vencidoReceber > 0; }).length, "pedido", "pedidos"), "gfp-k-lj") + "</section>";
  h += '<div class="gfp-filtros"><div class="gfp-chips">' + this.chip("situacao", "todos", "Todos (" + sel.length + ")", f.situacao === "todos");
  GFP_ORDEM.filter(function (s) { return cont[s] > 0 || s === "atrasado" || s === f.situacao; }).forEach(function (s) { h += self.chip("situacao", s, '<i style="background:' + GFP_EST[s][1] + '"></i>' + GFP_EST[s][0] + " (" + cont[s] + ")", f.situacao === s); });
  h += '</div><select data-sel="loja" class="gfp-sel"><option value="todas">Todas as lojas</option>' + lojas.map(function (l) { return '<option value="' + gfpEsc(l) + '"' + (f.loja === l ? " selected" : "") + ">" + gfpEsc(l) + "</option>"; }).join("") + "</select>" +
    '<select data-sel="receb" class="gfp-sel"><option value="todos">Recebíveis: todos</option><option value="com-saldo"' + (f.receb === "com-saldo" ? " selected" : "") + '>Com saldo a receber</option><option value="sem-saldo"' + (f.receb === "sem-saldo" ? " selected" : "") + ">Sem saldo a receber</option></select>" +
    '<span class="gfp-cont">' + gfpPlural(vis.length, "pedido", "pedidos") + " · " + gfpBrl(soma(vis, "valorTotal")) + "</span></div>";
  var cols = [["codigo", "Pedido"], ["cliente", "Cliente"], ["vendedor", "Vendedor / Loja"], ["prazo", "Prazo"], ["urgencia", "Situação"], ["valor", "Valor", 1], ["aReceber", "Falta receber", 1]];
  h += '<div class="gfp-tw"><table class="gfp-t"><thead><tr>' + cols.map(function (c) { var on = f.ordem === c[0]; return '<th class="' + (c[2] ? "n" : "") + '"><button type="button" data-ord="' + c[0] + '">' + c[1] + (on ? (f.dir === "asc" ? " ▲" : " ▼") : " ↕") + "</button></th>"; }).join("") + "</tr></thead><tbody>";
  if (!vis.length) h += '<tr><td colspan="7" class="gfp-vazio">' + (todos.length ? "Nenhum pedido encontrado para esses filtros." : "Nenhum pedido liberado.") + "</td></tr>";
  vis.forEach(function (p) {
    h += '<tr><td class="gfp-bl" style="border-left-color:' + GFP_EST[p.sit.s][1] + '"><b>' + gfpEsc(p.codigo) + "</b><small>emitido em " + gfpBr(p.dataEmissao) + "</small></td><td class=\"gfp-w\">" + gfpEsc(p.cliente) + "</td><td class=\"gfp-w\">" + gfpEsc(p.vendedor) + "<small>" + gfpEsc(p.loja) + "</small></td><td>" + gfpBr(p.prazo) + "</td><td>" +
      gfpSelo(p.sit, gfpTextoSit(p, p.sit)) + '</td><td class="n">' + gfpBrl(p.valorTotal) + '</td><td class="n gfp-rec">' +
      (p.aReceber === 0 ? "<small>Nada a receber</small>" : "<b>" + gfpBrl(p.aReceber) + "</b><small>" + (p.titulosAbertos > 0 ? gfpPlural(p.titulosAbertos, "parcela", "parcelas") + " em aberto" + (p.proximoVencimento ? " · " + gfpBr(p.proximoVencimento) : "") : "sem parcela lançada") + "</small>" +
        (p.vencidoReceber > 0 ? '<small class="gfp-venc">' + gfpBrl(p.vencidoReceber) + " vencido</small>" : "")) + "</td></tr>";
  });
  return h + "</tbody></table></div>";
};

/* ---------------- combinados ---------------- */
GfPedidos.prototype.vCombinados = function () {
  var self = this, hoje = this.dados.hoje;
  var lista = this.dados.pedidos.filter(function (p) { return p.dirceu && self.busca(p); }).map(function (p) { return $.extend({}, p, { sit: gfpSituacao(p, hoje) }); });
  var peso = { "atrasado": 0, "vence-em-breve": 1, "no-prazo": 2, "sem-prazo": 3, "entregue-pcp": 4, "cancelado-pcp": 5 };
  lista.sort(function (a, b) { return peso[a.sit.s] - peso[b.sit.s] || (a.sit.dias === null ? 9e6 : a.sit.dias) - (b.sit.dias === null ? 9e6 : b.sit.dias); });
  var h = this.cab("Pedidos combinados", "Pedidos liberados cuja observação cita o Dirceu (a equipe marca assim os pedidos liberados por ele).", "Pedidos");
  h += '<p class="gfp-cont">' + gfpPlural(lista.length, "pedido", "pedidos") + " · " + gfpBrl(lista.reduce(function (t, p) { return t + p.valorTotal; }, 0)) + "</p>";
  h += '<div class="gfp-tw"><table class="gfp-t"><thead><tr><th>Pedido</th><th>Cliente</th><th>Vendedor / Loja</th><th class="n">Valor</th><th>Prazo combinado</th><th>Situação</th><th>Combinado (observação do pedido)</th></tr></thead><tbody>';
  if (!lista.length) h += '<tr><td colspan="7" class="gfp-vazio">Nenhum pedido combinado.</td></tr>';
  lista.forEach(function (p) {
    h += '<tr><td class="gfp-bl" style="border-left-color:' + GFP_EST[p.sit.s][1] + '"><b>' + gfpEsc(p.codigo) + "</b><small>emitido em " + gfpBr(p.dataEmissao) + "</small></td><td class=\"gfp-w\">" + gfpEsc(p.cliente) + "</td><td class=\"gfp-w\">" + gfpEsc(p.vendedor) + "<small>" + gfpEsc(p.loja) + '</small></td><td class="n">' + gfpBrl(p.valorTotal) +
      "</td><td>" + gfpBr(p.prazo) + "</td><td>" + gfpSelo(p.sit, gfpTextoSit(p, p.sit)) + '</td><td class="gfp-obs">' + gfpEsc(p.observacao) + "</td></tr>";
  });
  return h + "</tbody></table></div>";
};

/* ---------------- formato 2 ---------------- */
GfPedidos.prototype.vFormato2 = function () {
  var self = this, hoje = this.dados.hoje, f = this.f;
  var todos = this.dados.pedidos.filter(function (p) { return gfpNorm(p.etapa) !== "cancelado" && p.dataEmissao >= GFP_CORTE; }).map(function (p) {
    var c = gfpFormato2(p, hoje), d = gfpDividir(p.recebido); return $.extend({}, p, { c: c, custo: d.custo, lucro: d.lucro });
  }).filter(function (p) { return p.c.regra !== "abaixo-30"; });
  var lista = todos.filter(function (p) { return self.busca(p) && (f.regra === "todas" || p.c.regra === f.regra) && (f.status === "todos" || p.c.status === f.status) && (f.lucro === "todos" || (f.lucro === "transferido") === !!p.lucroTransferido); });
  var soma = function (l, c) { return l.reduce(function (t, p) { return t + p[c]; }, 0); };
  var transf = lista.filter(function (p) { return p.lucroTransferido; }), aTransf = lista.filter(function (p) { return !p.lucroTransferido; });
  var h = this.cab("Pedidos Formato 2", "Pedidos liberados desde " + gfpBr(GFP_CORTE) + " com o prazo pela regra da GFERRO: contrato 60 dias úteis · 30% a 69% pago 40 dias úteis · 70% a 100% pago 7 a 10 dias úteis.", "Pedidos");
  h += '<section class="gfp-kpis gfp-k6">' + this.kpi("Pedidos", gfpInt(lista.length), gfpBrl(soma(lista, "valorTotal")) + " em pedidos") + this.kpi("Valor pago", gfpBrl(soma(lista, "recebido")), "do valor total") +
    this.kpi("Custo de produção (70%)", gfpBrl(soma(lista, "custo")), "do valor pago") + this.kpi("Lucro (30%)", gfpBrl(soma(lista, "lucro")), "do valor pago") +
    this.kpi("Lucro transferido", gfpBrl(soma(transf, "lucro")), gfpPlural(transf.length, "pedido", "pedidos"), "gfp-k-vd") + this.kpi("Lucro a transferir", gfpBrl(soma(aTransf, "lucro")), gfpPlural(aTransf.length, "pedido", "pedidos"), "gfp-k-am") + "</section>";
  var tot = GFP_COMPOSICAO.map(function (i) { return 0; }); lista.forEach(function (p) { gfpCusto(p.custo).forEach(function (m, i) { tot[i] += m.valor; }); });
  var ref = gfpCusto(0);
  h += '<section class="gfp-card"><h2>Custo de produção detalhado (70% do valor pago)</h2><div class="gfp-comp">' + ref.map(function (m, i) { return "<div><span>" + m.nome + " <small>" + m.pct.toFixed(1).replace(".", ",") + "%</small></span><b>" + gfpBrl(tot[i]) + "</b></div>"; }).join("") + "</div></section>";
  var cnt = function (campo, v) { return todos.filter(function (p) { return campo === "regra" ? (v === "todas" || p.c.regra === v) : campo === "status" ? (v === "todos" || p.c.status === v) : (v === "todos" || (v === "transferido") === !!p.lucroTransferido); }).length; };
  h += '<div class="gfp-filtros"><div class="gfp-chips">' + [["todas", "Todas as regras"], ["contrato", "Contrato"], ["pago-30-69", "30% a 69% pago"], ["pago-70-100", "70% a 100% pago"]].map(function (r) { return self.chip("regra", r[0], r[1] + " (" + cnt("regra", r[0]) + ")", f.regra === r[0]); }).join("") + "</div>" +
    '<div class="gfp-chips">' + [["todos", "Todos os status"], ["atrasado", "Atrasados"], ["dentro-do-prazo", "Dentro do prazo"]].map(function (r) { return self.chip("status", r[0], r[1] + " (" + cnt("status", r[0]) + ")", f.status === r[0]); }).join("") + "</div>" +
    '<div class="gfp-chips">' + [["todos", "Todos"], ["a-transferir", "Lucro a transferir"], ["transferido", "Lucro transferido"]].map(function (r) { return self.chip("lucro", r[0], r[1] + " (" + cnt("lucro", r[0]) + ")", f.lucro === r[0]); }).join("") + "</div></div>";
  h += '<div class="gfp-tw"><table class="gfp-t"><thead><tr><th></th><th>Pedido</th><th>Cliente</th><th>Vendedor / Loja</th><th class="n">Valor total</th><th class="n">Custo produção (70%)</th><th class="n">Lucro (30%)</th><th class="n">Pago</th><th>Prazo de entrega</th><th>Status</th><th>Lucro transferido?</th></tr></thead><tbody>';
  if (!lista.length) h += '<tr><td colspan="11" class="gfp-vazio">Nenhum pedido no Formato 2 para esses filtros.</td></tr>';
  lista.forEach(function (p) {
    var c = p.c, st = c.status === "atrasado" ? ["#fee2e2", "#b91c1c", "Atrasado há " + gfpPlural(c.atraso, "dia útil", "dias úteis")] : c.status === "dentro-do-prazo" ? ["#d1fae5", "#047857", c.paraPrazo === 0 ? "Vence hoje" : "Faltam " + gfpPlural(c.paraPrazo, "dia útil", "dias úteis")] : ["#f3f4f6", "#4b5563", "Sem regra"];
    var t = p.lucroTransferido, ab = self.aberto[p.codigo];
    h += "<tr><td><button type=\"button\" class=\"gfp-seta\" data-abre=\"" + gfpEsc(p.codigo) + '">' + (ab ? "▾" : "▸") + "</button></td><td><b>" + gfpEsc(p.codigo) + "</b><small>emitido em " + gfpBr(p.dataEmissao) + "</small></td><td class=\"gfp-w\">" + gfpEsc(p.cliente) + "</td><td class=\"gfp-w\">" + gfpEsc(p.vendedor) + "<small>" + gfpEsc(p.loja) + '</small></td><td class="n">' + gfpBrl(p.valorTotal) +
      '</td><td class="n">' + gfpBrl(p.custo) + '</td><td class="n"><b class="' + (t ? "gfp-pos" : "") + '">' + gfpBrl(p.lucro) + '</b></td><td class="n">' + gfpBrl(p.recebido) + "<small>" + gfpPct(c.pct) + " · " + c.rotulo + "</small></td><td>" +
      (c.fim ? (c.ini ? gfpBr(c.ini) + " a " : "até ") + gfpBr(c.fim) + "<small>" + c.dias + " dias úteis" + (c.ini ? " (7 a 10)" : "") + "</small>" : "—") + '</td><td><span class="gfp-selo" style="background:' + st[0] + ";color:" + st[1] + '">' + st[2] + "</span></td>" +
      '<td><label class="gfp-lucro' + (t ? " gfp-lucro-on" : "") + '"><input type="checkbox" data-lucro="' + gfpEsc(p.codigo) + '"' + (t ? " checked" : "") + "> " + (t ? "Transferido" : "Não transferido") + "</label>" +
      (t && Math.abs(t.valor - p.lucro) > 0.005 ? '<small class="gfp-venc">lucro mudou: confirmado ' + gfpBrl(t.valor) + "</small>" : "") + (t ? "<small>por " + gfpEsc(t.por) + " em " + gfpBr(t.em) + "</small>" : "") + "</td></tr>";
    if (ab) h += '<tr class="gfp-det"><td></td><td colspan="10"><div class="gfp-comp">' + gfpCusto(p.custo).map(function (m) { return "<div><span>" + m.nome + " <small>" + m.pct.toFixed(1).replace(".", ",") + "%</small></span><b>" + gfpBrl(m.valor) + "</b></div>"; }).join("") + "</div></td></tr>";
  });
  return h + '</tbody></table></div><p class="gfp-nota">Pedido de contrato é o que tem a palavra “contrato” na observação do pedido (vale qualquer que seja o pagamento). O percentual pago é o recebido ÷ valor total. Menos de 30% pago não entra na lista. O prazo conta a partir da data de emissão, em dias úteis.</p>';
};
