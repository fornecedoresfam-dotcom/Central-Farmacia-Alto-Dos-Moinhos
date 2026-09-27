/**
 * migracaoHygea.js — ponto 60: a IA interna passou a chamar-se HYGEA (era
 * FARMA) e a Central passou a "Central HYGEA". A mudança foi feita até ao
 * fundo do código (nomes de ficheiros, identificadores e chaves), a pedido
 * explícito do Ivo — o que obriga a tratar as farmácias que JÁ EXISTEM: os
 * dados delas estão gravados no servidor com os nomes antigos e, sem esta
 * migração, aconteciam três coisas más de uma vez:
 *
 *   1. a memória/aprendizagem da IA (`config.farmaIaMemoria`), o nome que a
 *      farmácia lhe deu (`config.farmaNomeAssistente`) e as suas propostas
 *      ficavam órfãos — a IA "esquecia" tudo o que tinha aprendido;
 *   2. o atalho do módulo na página inicial continuava a apontar para
 *      `modulos/farma-ia.html`, um ficheiro que deixou de existir (erro 404
 *      ao clicar);
 *   3. como `criarAtalhosModulos()` verifica o que falta pelo campo
 *      `modulo`, o atalho antigo ("farma-ia") deixava de ser reconhecido e,
 *      na primeira farmácia que ainda não tivesse a flag gravada, aparecia
 *      um SEGUNDO atalho ("hygea-ia") ao lado do antigo.
 *
 * A migração corre no arranque (`iniciar()` em actions.js), é idempotente
 * (numa farmácia já migrada, ou numa criada de raiz, não escreve nada) e
 * nunca apaga um valor novo já existente: se as duas chaves existirem, a
 * nova ganha e a antiga é só limpa.
 *
 * O histórico de USO (Poupança & ROI) é deliberadamente deixado como está —
 * ver `normalizarChaveUso()` em usoCatalogo.js: essas chaves são reescritas
 * na leitura, não no servidor, para nunca arriscar meses de dados reais.
 */

/** Chaves de `config` que mudaram de nome (antiga -> nova). */
export const CONFIG_RENOMEADAS = Object.freeze({
  farmaIaMemoria: "hygeaIaMemoria",
  farmaNomeAssistente: "hygeaNomeAssistente",
  farmaPropostas: "hygeaPropostas",
  farmaTreinoLocal: "hygeaTreinoLocal",
  farmaAprendizagemMultifarma: "hygeaAprendizagemMultifarma",
  farmaEtiquetaPendente: "hygeaEtiquetaPendente"
});

export const MODULO_ANTIGO = "farma-ia";
export const MODULO_NOVO = "hygea-ia";
const NOME_ANTIGO = "FARMA IA";
const NOME_NOVO = "HYGEA IA";
const URL_ANTIGA = "modulos/farma-ia.html";
const URL_NOVA = "modulos/hygea-ia.html";

/**
 * Parte pura: devolve a lista de serviços já migrada e se houve alteração.
 * Trata tanto o atalho do módulo (tipo "modulo", campo `modulo`) como um
 * serviço que a farmácia tenha criado à mão a apontar para o URL do módulo.
 *
 * O nome só é atualizado quando ainda é exatamente o nome de origem: se a
 * farmácia lhe chamou outra coisa (ex.: "Assistente da Ana"), esse nome é
 * dela e fica como está.
 */
export function migrarServicosHygea(servicos) {
  let mudou = false;
  const migrados = (servicos || []).map((s) => {
    if (!s) return s;
    const novo = { ...s };
    let alterado = false;
    if (novo.modulo === MODULO_ANTIGO) { novo.modulo = MODULO_NOVO; alterado = true; }
    if (novo.nome === NOME_ANTIGO) { novo.nome = NOME_NOVO; alterado = true; }
    if (typeof novo.url === "string" && novo.url.includes(URL_ANTIGA)) {
      novo.url = novo.url.split(URL_ANTIGA).join(URL_NOVA);
      alterado = true;
    }
    if (!alterado) return s;
    mudou = true;
    novo.atualizadoEm = Date.now();
    return novo;
  });
  return { servicos: mudou ? migrados : servicos, mudou };
}

/**
 * Migra as chaves de `config`. Best-effort e silenciosa: um erro aqui nunca
 * pode impedir a Central de arrancar (a farmácia continua a trabalhar; a
 * migração volta a ser tentada no arranque seguinte).
 *
 * @returns {Promise<string[]>} nomes das chaves antigas efetivamente migradas
 */
export async function migrarConfigHygea(dataStore) {
  const migradas = [];
  for (const [antiga, nova] of Object.entries(CONFIG_RENOMEADAS)) {
    let valorAntigo;
    try {
      valorAntigo = await dataStore.getConfig(antiga);
    } catch (err) {
      continue; // chave inacessível agora — tenta outra vez no próximo arranque
    }
    if (valorAntigo == null) continue;
    try {
      const valorNovo = await dataStore.getConfig(nova);
      // Se a chave nova já tem valor (ex.: já se usou a versão nova noutro
      // computador), esse é o valor bom — aqui só se limpa o resto antigo.
      if (valorNovo == null) await dataStore.setConfig(nova, valorAntigo);
      await dataStore.setConfig(antiga, null);
      migradas.push(antiga);
    } catch (err) {
      console.error(`Não foi possível migrar a definição "${antiga}":`, err);
    }
  }
  return migradas;
}
