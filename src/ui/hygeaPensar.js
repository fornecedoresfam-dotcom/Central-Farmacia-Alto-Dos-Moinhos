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
.hygea-pensar video{width:30px;height:30px;display:block;background:transparent;border:0;pointer-events:none;}
.hygea-pensar .hygea-pensar-texto{font-size:12px;color:#5C7A6E;white-space:nowrap;}
.hygea-pensar[data-so-video="1"] .hygea-pensar-texto{
  position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
  clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;
}
@media (prefers-reduced-motion: reduce){ .hygea-pensar video{display:none;} }
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
    <video muted loop playsinline preload="auto" aria-hidden="true" tabindex="-1" disablepictureinpicture>
      <source src="${base}assets/hygea/hygea-a-pensar.webm" type="video/webm">
      <source src="${base}assets/hygea/hygea-a-pensar.mp4" type="video/mp4">
    </video>
    <span class="hygea-pensar-texto">${texto}</span>`;

  const video = el.querySelector("video");

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
