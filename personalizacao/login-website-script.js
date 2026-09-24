/*
  Personalizacao da tela de login - Grupo Gferro
  Onde colar: Site > Personalizar > Script de website (Website Script)
  Foto de fundo: envie "gferro-login-bg.webp" em File como arquivo PUBLICO
  (se usar outro nome, ajuste BG_URL logo abaixo)
*/
(function () {
  var BG_URL = "/files/ChatGPT Image 24 de set. de 2026, 09_03_41.png";

  var css = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

:root {
  --gf-yellow: #F5C518;
  --gf-black: #141414;
  --gf-text: #1c1c1c;
  --gf-muted: #6b6b6b;
}

/* ---------- Só na tela de login ---------- */
body[data-path="login"] {
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  min-height: 100vh;
  background: #1a1a1a var(--gf-bg-img, none) center center / cover no-repeat fixed;
}

/* esconde o topo e o rodapé padrão (o rodapé vai para dentro do cartão) */
body[data-path="login"] .navbar,
body[data-path="login"] .page-breadcrumbs,
body[data-path="login"] .page-header-wrapper,
body[data-path="login"] .web-footer { display: none !important; }

/* texto de boas-vindas sobre a parte escura da imagem (esquerda) */
.gf-hero {
  position: fixed; left: 6%; top: 50%; transform: translateY(-8%);
  width: 34%; max-width: 520px; z-index: 1; color: #fff;
  text-shadow: 0 2px 18px rgba(0,0,0,.45);
}
.gf-hero h2 {
  font-size: clamp(32px, 3.4vw, 58px); line-height: 1.08; font-weight: 500;
  margin: 0 0 24px; letter-spacing: -.01em; color: #fff;
}
.gf-hero h2 span { color: var(--gf-yellow); font-weight: 700; }
.gf-hero .gf-bar { width: 52px; height: 4px; background: var(--gf-yellow); border-radius: 2px; margin-bottom: 20px; }
.gf-hero p { font-size: clamp(15px, 1.2vw, 19px); color: rgba(255,255,255,.85); margin: 0; line-height: 1.55; }

/* cartão de login à direita */
body[data-path="login"] #page-login,
body[data-path="login"] #page-login .page-content-wrapper { min-height: 100vh; }
body[data-path="login"] #page-login main.container {
  max-width: none; width: 100%; margin: 0; padding: 0 6vw 0 0;
  min-height: 100vh; display: flex; align-items: center; justify-content: flex-end;
}
body[data-path="login"] #page-login .page_content { position: relative; z-index: 2; width: 100%; max-width: 460px; }
body[data-path="login"] .login-content.page-card {
  background: rgba(255,255,255,.96); border: 0; border-radius: 26px;
  padding: 40px 42px 26px; max-width: 460px; width: 100%; margin: 0;
  backdrop-filter: blur(6px);
  box-shadow: 0 30px 70px rgba(0,0,0,.28), 0 6px 18px rgba(0,0,0,.1);
}
body[data-path="login"] .page-card-head { text-align: left; margin-bottom: 22px; }
body[data-path="login"] .page-card-head .app-logo { height: 58px; width: auto; border-radius: 4px; margin-bottom: 20px; }
body[data-path="login"] .page-card-head h4 { font-size: 36px; font-weight: 800; color: var(--gf-text); letter-spacing: -.02em; margin: 0 0 6px; }
body[data-path="login"] .page-card-subtitle { color: var(--gf-muted); font-size: 16px; }

body[data-path="login"] .form-label { color: var(--gf-muted); font-size: 14px; font-weight: 500; }
body[data-path="login"] .form-control {
  height: 50px; border-radius: 12px; border: 1px solid #e3e6ee; background: #f3f5fb;
  font-size: 15px; transition: box-shadow .15s, border-color .15s, background .15s;
}
body[data-path="login"] .form-control:focus {
  background: #fff; border-color: var(--gf-yellow); box-shadow: 0 0 0 4px rgba(245,197,24,.28);
}
body[data-path="login"] .forgot-password-message { text-align: right; margin: 8px 0 0; }
body[data-path="login"] .forgot-password-message a {
  color: var(--gf-text); font-weight: 600; text-decoration: none;
  border-bottom: 2px solid var(--gf-yellow); padding-bottom: 1px;
}

/* botão principal */
body[data-path="login"] .btn-login {
  height: 52px; border-radius: 12px; background: var(--gf-black); border: 0; color: #fff;
  font-size: 16px; font-weight: 700; letter-spacing: .01em;
  box-shadow: 0 8px 20px rgba(0,0,0,.22); transition: transform .12s, box-shadow .12s, background .12s;
}
body[data-path="login"] .btn-login:hover { background: #000; transform: translateY(-1px); box-shadow: 0 12px 26px rgba(0,0,0,.28); }
body[data-path="login"] .btn-login::after { content: "  →"; color: var(--gf-yellow); }

/* remove o botão "Entrar com link de e-mail" */
body[data-path="login"] .for-login .btn-login-with-email-link { display: none !important; }

/* rodapé dentro do cartão */
.gf-card-foot { margin-top: 22px; padding-top: 16px; border-top: 1px solid #ececec;
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; color: var(--gf-muted); font-size: 12.5px; }
.gf-card-foot img { height: 30px; border-radius: 3px; }
.gf-card-foot .gf-addr { line-height: 1.4; margin-top: 8px; font-size: 12px; }

/* telas estreitas / celular: só o cartão, centralizado sobre a imagem */
@media (max-width: 991px) {
  .gf-hero { display: none; }
  body[data-path="login"] #page-login main.container { justify-content: center; padding: 20px 14px; }
  body[data-path="login"] .login-content.page-card { padding: 30px 24px 22px; }
}
`;

  if (!document.getElementById("gf-login-style")) {
    var st = document.createElement("style");
    st.id = "gf-login-style";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function build() {
    if (document.body.getAttribute("data-path") !== "login" || document.querySelector(".gf-hero")) return;

    document.body.style.setProperty("--gf-bg-img", "url('" + encodeURI(BG_URL) + "')");

    var hero = document.createElement("div");
    hero.className = "gf-hero";
    hero.innerHTML =
      '<h2>Construindo soluções para o <span>seu projeto.</span></h2>' +
      '<div class="gf-bar"></div>' +
      '<p>Qualidade, confiança e variedade para a sua obra.</p>';
    document.body.appendChild(hero);

    // rodapé (logo + endereço) dentro do cartão de login
    var card = document.querySelector(".for-login .login-content");
    var flogo = document.querySelector(".footer-logo");
    var info = document.querySelector(".footer-info .footer-col-left");
    if (card && !card.querySelector(".gf-card-foot")) {
      var lines = info ? info.innerText.split("\n").map(function (s) { return s.trim(); }).filter(Boolean) : [];
      var foot = document.createElement("div");
      foot.className = "gf-card-foot";
      foot.innerHTML =
        '<div>' + (flogo ? '<img src="' + flogo.getAttribute("src") + '" alt="">' : "") +
        '<div class="gf-addr">' + (lines[1] || "") + '</div></div>' +
        '<div>' + (lines[0] || "") + '</div>';
      card.appendChild(foot);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
