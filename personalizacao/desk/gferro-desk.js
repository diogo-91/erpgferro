/*
  ERP GFerro - personalizacao do desk (carregada por app_include_js).
  - sempre abre na tela de menu (/desk)
  - barra lateral unica: modulos expansiveis com seus itens
  - logo do Grupo Gferro no topo
*/
(function () {
  var LOGO = "/assets/erpnext/gferro/gferro-logo.webp";
  var ORDER = ["Setup", "Accounts", "Selling", "Buying", "Stock", "Manufacturing", "Projects", "Assets", "Quality"];
  var STORE = "gf-sidebar-open";

  // rotulos que o Frappe deixa em ingles
  var PT = {
    "Access": "Acesso", "Branch": "Filial", "Appointment Booking": "Agendamento",
    "Stock Reposting": "Reprocessamento de Estoque", "Good morning": "Bom dia"
  };
  function tr(s) { return PT[s] || s; }

  // 1) sempre abre na tela de menu
  try {
    if (!sessionStorage.getItem("gf-menu-done")) {
      sessionStorage.setItem("gf-menu-done", "1");
      if (/^\/desk(\/[^\/]+\/home)?\/?$/.test(location.pathname) && location.pathname !== "/desk") {
        location.replace("/desk");
        return;
      }
    }
  } catch (e) {}

  function opened() { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) { return {}; } }
  function saveOpen(k, v) { try { var o = opened(); o[k] = v; localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function icon(name) {
    try { return name ? frappe.utils.icon(name, "sm") : ""; } catch (e) { return ""; }
  }
  var CHEV = '<svg class="gf-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3l5 5-5 5"/></svg>';

  function route(it) {
    try { return frappe.ui.sidebar_item.get_route(it, true) || ""; } catch (e) { return ""; }
  }
  function moduleIcon(mod) {
    var d = document.querySelector('.dock-item[title="' + mod + '"] svg');
    return d ? d.outerHTML : icon("layout-grid");
  }

  function linkHtml(it) {
    var href = route(it);
    if (!href) return "";
    return '<a class="gf-link" href="' + esc(href) + '" data-href="' + esc(href) + '">' + icon(it.icon) +
      '<span class="gf-label">' + esc(tr(it.label)) + "</span></a>";
  }

  function moduleHtml(mod) {
    var ms = frappe.boot.module_sidebars[mod];
    if (!ms || !ms.items) return "";
    var top = "", sections = [], cur = null;
    ms.items.forEach(function (it) {
      if (it.type === "Section Break") { cur = { label: it.label, icon: it.icon, html: "" }; sections.push(cur); return; }
      if (it.type !== "Link") return;
      var h = linkHtml(it);
      if (!h) return;
      if (cur) cur.html += h; else top += h;
    });
    var secs = sections.filter(function (s) { return s.html; }).map(function (s) {
      var k = mod + "/" + s.label;
      return '<div class="gf-sec' + (opened()[k] ? " gf-open" : "") + '" data-k="' + esc(k) + '">' +
        '<button class="gf-sec-head" type="button">' + icon(s.icon) + '<span class="gf-label">' + esc(tr(s.label)) + "</span>" + CHEV + "</button>" +
        '<div class="gf-children">' + s.html + "</div></div>";
    }).join("");
    return '<div class="gf-mod' + (opened()[mod] ? " gf-open" : "") + '" data-k="' + esc(mod) + '">' +
      '<button class="gf-mod-head" type="button">' + moduleIcon(mod) + '<span class="gf-label">' + esc(tr(ms.label || mod)) + "</span>" + CHEV + "</button>" +
      '<div class="gf-children">' + top + secs + "</div></div>";
  }

  function markActive() {
    var nav = document.querySelector(".gf-nav");
    if (!nav) return;
    var path = decodeURIComponent(location.pathname);
    var best = null;
    // o Frappe abre listas como /desk/<modulo>/<doctype>; compara tambem pelo ultimo trecho
    var segs = path.split("/").filter(Boolean);
    var tail = segs[segs.length - 1] || "";
    nav.querySelectorAll(".gf-link").forEach(function (a) {
      a.classList.remove("gf-active");
      var h = decodeURIComponent(a.getAttribute("data-href").split("?")[0]);
      if (!h) return;
      var hs = h.split("/").filter(Boolean), score = 0;
      if (path === h) score = 1000 + h.length;
      else if (segs.length > 2 && hs.length > 1 && hs[hs.length - 1] === tail) score = 500 + h.length;
      else if (path.indexOf(h + "/") === 0) score = h.length;
      if (score && (!best || score > best.score)) best = { a: a, score: score };
    });
    nav.querySelectorAll(".gf-has-active").forEach(function (m) { m.classList.remove("gf-has-active"); });
    if (best) {
      best.a.classList.add("gf-active");
      var m = best.a.closest(".gf-mod");
      if (m) { m.classList.add("gf-has-active", "gf-open"); }
      var s = best.a.closest(".gf-sec");
      if (s) s.classList.add("gf-open");
    }
  }

  function build() {
    var side = document.querySelector(".body-sidebar");
    if (!side || side.querySelector(".gf-nav")) return;
    if (!window.frappe || !frappe.boot || !frappe.boot.module_sidebars) return;
    var mods = Array.prototype.map.call(document.querySelectorAll(".dock-item[title]"), function (b) { return b.getAttribute("title"); })
      .filter(function (t) { return frappe.boot.module_sidebars[t]; });
    if (!mods.length) mods = ORDER.filter(function (t) { return frappe.boot.module_sidebars[t]; });

    var brand = document.createElement("a");
    brand.className = "gf-brand"; brand.href = "/desk";
    brand.innerHTML = '<img src="' + LOGO + '" alt="Grupo Gferro">';

    var nav = document.createElement("div");
    nav.className = "gf-nav";
    nav.innerHTML = mods.map(moduleHtml).join("");

    var foot = document.createElement("div");
    foot.className = "gf-foot";
    var name = (frappe.session && (frappe.session.user_fullname || frappe.session.user)) || "";
    foot.innerHTML = '<div class="gf-user">' + esc(name) + "<small>" + esc((frappe.session && frappe.session.user) || "") + "</small></div>" +
      '<a class="gf-home" href="/desk">Menu</a><a href="#" class="gf-logout">Sair</a>';
    foot.querySelector(".gf-logout").addEventListener("click", function (e) {
      e.preventDefault();
      if (frappe.app && frappe.app.logout) frappe.app.logout(); else location.href = "/?cmd=web_logout";
    });

    nav.addEventListener("click", function (e) {
      var h = e.target.closest(".gf-mod-head, .gf-sec-head");
      if (!h) return;
      var box = h.parentElement;
      box.classList.toggle("gf-open");
      saveOpen(box.getAttribute("data-k"), box.classList.contains("gf-open"));
    });

    side.insertBefore(brand, side.firstChild);
    side.appendChild(nav);
    side.appendChild(foot);
    markActive();
  }

  function start() {
    build();
    var mo = new MutationObserver(function () { build(); });
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", function () { setTimeout(markActive, 50); });
    try { frappe.router.on("change", function () { setTimeout(markActive, 50); }); } catch (e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
