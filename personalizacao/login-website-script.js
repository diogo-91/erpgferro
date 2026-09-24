/*
  Personalizacao da tela de login - Grupo Gferro
  Onde colar: Site > Personalizar > Script de website (Website Script)
  Foto de fundo: arquivo PUBLICO enviado em File (ajuste BG_URL se o nome mudar)
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
  /* ancora no topo-esquerda: o logo da imagem nunca é cortado, só o rodapé da foto */
  background: #1a1a1a var(--gf-bg-img, none) left top / cover no-repeat fixed;
}

/* esconde o topo e o rodapé padrão (o rodapé vai para dentro do cartão) */
body[data-path="login"] .navbar,
body[data-path="login"] .page-breadcrumbs,
body[data-path="login"] .page-header-wrapper,
body[data-path="login"] .web-footer { display: none !important; }

/* texto de boas-vindas sobre a parte escura da imagem (esquerda) */
.gf-hero {
  position: fixed; left: 5vw; top: 50%; transform: translateY(-2%);
  width: 34vw; max-width: 520px; z-index: 1; color: #fff;
  text-shadow: 0 2px 18px rgba(0,0,0,.5);
}
.gf-hero h2 {
  font-size: clamp(24px, min(3.4vw, 6.2vh), 58px); line-height: 1.1; font-weight: 500;
  margin: 0 0 clamp(12px, 3vh, 24px); letter-spacing: -.01em; color: #fff;
}
.gf-hero h2 span { color: var(--gf-yellow); font-weight: 700; }
.gf-hero .gf-bar { width: 52px; height: 4px; background: var(--gf-yellow); border-radius: 2px; margin-bottom: clamp(10px, 2.4vh, 20px); }
.gf-hero p { font-size: clamp(13px, min(1.2vw, 2.4vh), 19px); color: rgba(255,255,255,.88); margin: 0; line-height: 1.55; }

/* container: centraliza o cartão, mas rola se a tela for baixa demais */
body[data-path="login"] #page-login,
body[data-path="login"] #page-login .page-content-wrapper { min-height: 100vh; padding: 0 !important; margin: 0 !important; }
body[data-path="login"] #page-login .page-footer { display: none !important; }
body[data-path="login"] #page-login main.container {
  max-width: none; width: 100%; margin: 0; box-sizing: border-box;
  min-height: 100vh; display: flex; justify-content: flex-end;
  padding: clamp(12px, 3vh, 28px) 6vw clamp(12px, 3vh, 28px) 0;
}
body[data-path="login"] #page-login .page_content {
  position: relative; z-index: 2; width: 100%; max-width: 460px; margin: auto 0; min-height: 0 !important;
}
body[data-path="login"] .for-login,
body[data-path="login"] .for-login > div { min-height: 0 !important; height: auto !important; }

/* cartão (medidas escalam com a altura da tela) */
body[data-path="login"] .login-content.page-card {
  background: rgba(255,255,255,.96); border: 0; border-radius: 26px;
  padding: clamp(20px, 4.4vh, 40px) clamp(22px, 3vw, 42px) clamp(14px, 2.6vh, 26px);
  max-width: 460px; width: 100%; margin: 0; min-height: 0 !important; height: auto !important;
  backdrop-filter: blur(6px);
  box-shadow: 0 30px 70px rgba(0,0,0,.28), 0 6px 18px rgba(0,0,0,.1);
}
body[data-path="login"] .page-card-head { text-align: left; margin-bottom: clamp(10px, 2.4vh, 22px); }
body[data-path="login"] .page-card-head .app-logo { display: none !important; } /* logo fica so no banner */
body[data-path="login"] .page-card-head h4 { font-size: clamp(26px, 4.6vh, 36px); font-weight: 800; color: var(--gf-text); letter-spacing: -.02em; margin: 0 0 4px; }
body[data-path="login"] .page-card-subtitle { color: var(--gf-muted); font-size: clamp(13px, 2vh, 16px); margin: 0; }

body[data-path="login"] .form-group { margin-bottom: clamp(8px, 1.8vh, 16px); }
body[data-path="login"] .form-label { color: var(--gf-muted); font-size: 14px; font-weight: 500; margin-bottom: 4px; }
body[data-path="login"] .form-control {
  height: clamp(42px, 6vh, 50px); border-radius: 12px; border: 1px solid #e3e6ee; background: #f3f5fb;
  font-size: 15px; transition: box-shadow .15s, border-color .15s, background .15s;
}
body[data-path="login"] .form-control:focus {
  background: #fff; border-color: var(--gf-yellow); box-shadow: 0 0 0 4px rgba(245,197,24,.28);
}
body[data-path="login"] .forgot-password-message { text-align: right; margin: 6px 0 0; }
body[data-path="login"] .forgot-password-message a {
  color: var(--gf-text); font-weight: 600; text-decoration: none;
  border-bottom: 2px solid var(--gf-yellow); padding-bottom: 1px;
}

/* botão principal */
body[data-path="login"] .btn-login {
  height: clamp(44px, 6.4vh, 52px); border-radius: 12px; background: var(--gf-black); border: 0; color: #fff;
  font-size: 16px; font-weight: 700; letter-spacing: .01em;
  box-shadow: 0 8px 20px rgba(0,0,0,.22); transition: transform .12s, box-shadow .12s, background .12s;
}
body[data-path="login"] .btn-login:hover { background: #000; transform: translateY(-1px); box-shadow: 0 12px 26px rgba(0,0,0,.28); }
body[data-path="login"] .btn-login::after { content: "  →"; color: var(--gf-yellow); }

/* remove o botão "Entrar com link de e-mail" */
body[data-path="login"] .for-login .btn-login-with-email-link { display: none !important; }

/* rodapé dentro do cartão */
.gf-card-foot { margin-top: clamp(12px, 2.4vh, 22px); padding-top: clamp(8px, 1.8vh, 16px); border-top: 1px solid #ececec;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; color: var(--gf-muted); font-size: 12.5px; }
.gf-card-foot { flex-direction: column; align-items: flex-start; gap: 3px; }
.gf-card-foot .gf-copy { font-weight: 600; }
.gf-card-foot .gf-addr { line-height: 1.4; font-size: 12px; }

/* telas baixas (notebooks, janelas pequenas): enxuga o cartão */
@media (max-height: 700px) {
  .gf-card-foot .gf-addr { display: none; }
  body[data-path="login"] .page-card-subtitle { display: none; }
}
@media (max-height: 560px) {
  .gf-card-foot { display: none; }
}

/* telas medias: cartao um pouco menor para nao encostar no texto */
@media (max-width: 1200px) {
  body[data-path="login"] #page-login .page_content,
  body[data-path="login"] .login-content.page-card { max-width: 410px; }
}

/* tablet e celular: só o cartão, centralizado sobre a imagem */
@media (max-width: 991px) {
  .gf-hero { display: none; }
  /* imagem inteira como banner no topo, esmaecendo para o fundo escuro */
  body[data-path="login"] {
    background:
      linear-gradient(to bottom, rgba(20,20,20,0) 55%, #141414 100%) top left / 100% calc(100vw * .5625) no-repeat,
      var(--gf-bg-img, none) top left / 100% auto no-repeat,
      #141414;
  }
  body[data-path="login"] #page-login main.container {
    justify-content: center; align-items: flex-start;
    padding: calc(100vw * .5625 - 70px) 14px 28px;
  }
  body[data-path="login"] #page-login .page_content { margin: 0 auto; }
  body[data-path="login"] #page-login .page_content,
  body[data-path="login"] .login-content.page-card { max-width: 440px; }
}
@media (max-width: 480px) {
  body[data-path="login"] .login-content.page-card { border-radius: 20px; }
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

    // rodapé (logo + copyright + endereço) dentro do cartão de login
    var card = document.querySelector(".for-login .login-content");
    var info = document.querySelector(".footer-info .footer-col-left");
    if (card && !card.querySelector(".gf-card-foot")) {
      var lines = info ? info.innerText.split("\n").map(function (s) { return s.trim(); }).filter(Boolean) : [];
      var foot = document.createElement("div");
      foot.className = "gf-card-foot";
      foot.innerHTML =
        '<div class="gf-copy">' + (lines[0] || "") + '</div>' +
        '<div class="gf-addr">' + (lines[1] || "") + '</div>';
      card.appendChild(foot);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
