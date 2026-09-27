/**
 * hygeaPensar.js — ponto 60: o indicador de "a HYGEA está a pensar".
 *
 * Pedido do Ivo: enquanto a HYGEA prepara a resposta, mostrar a animação
 * dela no cantinho esquerdo da caixa onde se escreve a pergunta — tanto no
 * módulo de chat completo como no mini-chat da Central.
 *
 * Um único sítio a criar o elemento, o estilo e o comportamento, para os
 * dois chats mostrarem exatamente a mesma coisa (e para uma futura terceira
 * caixa de conversa não voltar a copiar isto tudo).
 *
 * Notas de implementação que valem a pena guardar:
 *  - O WebM vem primeiro porque é o único dos dois com canal de
 *    transparência: assenta em qualquer fundo. O MP4 a seguir tem o fundo
 *    branco "queimado" e serve os browsers que não leem WebM (Safari), onde
 *    fica bem à mesma por a caixa de escrita ser branca.
 *  - O vídeo é decorativo: fica `aria-hidden` e fora da navegação por
 *    teclado. Quem usa leitor de ecrã ouve o texto "a pensar…", anunciado
 *    pelo `role="status"`, que é a informação a sério.
 *  - Quando está escondido o vídeo é pausado, para não gastar bateria a
 *    descodificar fotogramas que ninguém vê.
 */

const ID_ESTILO = "hygea-pensar-estilo";

function garantirEstilo() {
  if (document.getElementById(ID_ESTILO)) return;
  const style = document.createElement("style");
  style.id = ID_ESTILO;
  style.textContent = `
.hygea-pensar{display:none;align-items:center;gap:7px;flex:0 0 auto;}
.hygea-pensar[data-visivel="1"]{display:inline-flex;}
.hygea-pensar video{width:30px;height:30px;display:none;background:transparent;border:0;pointer-events:none;}
/* o vídeo só entra em cena depois de estar mesmo a tocar; até lá (e para
   sempre, se não houver vídeo) fica o anel, que é só CSS e nunca falha */
.hygea-pensar[data-video="1"] video{display:block;}
.hygea-pensar[data-video="1"] .hygea-pensar-anel{display:none;}
.hygea-pensar-anel{
  width:22px;height:22px;border-radius:50%;flex:0 0 auto;
  border:2.5px solid #CDE7E0;border-top-color:#2E8B77;
  animation:hygeaPensarRoda .9s linear infinite;
}
@keyframes hygeaPensarRoda{ to{ transform:rotate(360deg); } }
.hygea-pensar .hygea-pensar-texto{font-size:12px;color:#5C7A6E;white-space:nowrap;}
.hygea-pensar[data-so-video="1"] .hygea-pensar-texto{
  position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
  clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;
}
@media (prefers-reduced-motion: reduce){
  .hygea-pensar video{display:none;}
  .hygea-pensar[data-video="1"] .hygea-pensar-anel{display:block;animation:none;border-top-color:#CDE7E0;}
}
`;
  document.head.appendChild(style);
}

/**
 * @param {object} [opts]
 * @param {string} [opts.base=""]      prefixo do caminho dos ficheiros ("../" dentro de modulos/)
 * @param {boolean} [opts.comTexto=false] mostrar "a pensar…" ao lado (nas caixas com espaço)
 * @param {string} [opts.texto="a pensar…"]
 */
export function criarIndicadorPensar(opts = {}) {
  const base = opts.base || "";
  const texto = opts.texto || "a pensar…";
  garantirEstilo();

  const el = document.createElement("span");
  el.className = "hygea-pensar";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  if (!opts.comTexto) el.setAttribute("data-so-video", "1");
  el.innerHTML = `
    <span class="hygea-pensar-anel" aria-hidden="true"></span>
    <video muted loop playsinline preload="auto" aria-hidden="true" tabindex="-1" disablepictureinpicture>
      <source src="${base}assets/hygea/hygea-a-pensar.webm" type="video/webm">
      <source src="${base}assets/hygea/hygea-a-pensar.mp4" type="video/mp4">
    </video>
    <span class="hygea-pensar-texto">${texto}</span>`;

  const video = el.querySelector("video");
  // O vídeo só substitui o anel quando estiver MESMO a tocar. Isto cobre o
  // caso real que apanhámos na farmácia: os ficheiros de vídeo não tinham
  // sido publicados no site, e como o indicador era só o vídeo, não aparecia
  // nada — nem sequer se percebia que a HYGEA estava a trabalhar. Assim, com
  // vídeo ou sem ele, vê-se sempre que está a pensar.
  video.addEventListener("playing", () => el.setAttribute("data-video", "1"));
  video.addEventListener("error", () => el.removeAttribute("data-video"), true);

  function mostrar() {
    el.setAttribute("data-visivel", "1");
    // `play()` devolve uma promessa que rejeita se o browser recusar (ex.:
    // formato não suportado). É um enfeite: se falhar, fica-se pelo texto.
    const p = video.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  function esconder() {
    el.removeAttribute("data-visivel");
    try { video.pause(); } catch (e) { /* irrelevante */ }
  }

  /** Corre uma tarefa com o indicador ligado, e desliga-o aconteça o que acontecer. */
  async function durante(tarefa) {
    mostrar();
    try {
      return await tarefa();
    } finally {
      esconder();
    }
  }

  return { el, mostrar, esconder, durante };
}
