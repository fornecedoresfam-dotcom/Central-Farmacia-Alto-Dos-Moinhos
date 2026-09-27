#!/usr/bin/env node
/**
 * scripts/relatorio-aprendizagem-hygea.mjs — ponto 27, "Canal de
 * Aprendizagem" (Ivo ↔ Claude, ver arquitetura-decisoes.md).
 *
 * Não é parte da app (nunca é importado por nenhum módulo/página) — é uma
 * ferramenta de bastidores para o Ivo (ou o Claude, com o token que o Ivo
 * partilhar) ver rapidamente o que a HYGEA IA de uma farmácia real ainda não
 * sabe responder, para conversarmos sobre isso e eu traduzir o que fizer
 * sentido em regras/respostas novas em `src/hygeaIa.js`. NUNCA faz nenhuma
 * chamada à API da Claude nem a nenhum serviço de IA externo — só lê
 * `config.hygeaIaMemoria` (ponto 26) do próprio servidor da app, o mesmo que
 * `modulos/hygea-ia.html` já lê/escreve.
 *
 * Uso:
 *   node scripts/relatorio-aprendizagem-hygea.mjs <BASE_URL> <TOKEN>
 *   node scripts/relatorio-aprendizagem-hygea.mjs   (lê HYGEA_BASE_URL e
 *     HYGEA_TOKEN das variáveis de ambiente, se os argumentos não vierem)
 *
 * <TOKEN> é o token de sessão desta farmácia (o mesmo que o browser guarda
 * em localStorage como `central_saas_token` depois do login) — nunca o
 * partilhes com mais ninguém além de quem estiver a ajudar a rever isto.
 */
const baseUrl = process.argv[2] || process.env.HYGEA_BASE_URL;
const token = process.argv[3] || process.env.HYGEA_TOKEN;

if (!baseUrl || !token) {
  console.error("Uso: node scripts/relatorio-aprendizagem-hygea.mjs <BASE_URL> <TOKEN>");
  console.error("(ou definir HYGEA_BASE_URL / HYGEA_TOKEN no ambiente)");
  process.exit(1);
}

function fmtData(iso) {
  if (!iso) return "?";
  try { return new Date(iso).toLocaleString("pt-PT"); } catch { return iso; }
}

async function main() {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/data`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  if (!res.ok) {
    console.error(`Não foi possível ler os dados (HTTP ${res.status}). Confirma o BASE_URL e se o token ainda é válido.`);
    process.exit(1);
  }
  const estado = await res.json();
  const memoria = estado?.config?.hygeaIaMemoria;

  console.log("=".repeat(70));
  console.log(" HYGEA IA — Relatório de Aprendizagem (ponto 27)");
  console.log("=".repeat(70));

  if (!memoria) {
    console.log("\nEsta farmácia ainda não tem nenhuma memória de aprendizagem gravada");
    console.log("(config.hygeaIaMemoria vazio/inexistente) — ainda não houve nenhuma");
    console.log("pergunta não reconhecida nem alerta dispensado a registar.\n");
    return;
  }

  const perguntas = Array.isArray(memoria.perguntasNaoReconhecidas) ? memoria.perguntasNaoReconhecidas : [];
  const aliases = memoria.aliases && typeof memoria.aliases === "object" ? memoria.aliases : {};
  const dispensados = memoria.alertasDispensados && typeof memoria.alertasDispensados === "object" ? memoria.alertasDispensados : {};

  console.log(`\n— Perguntas que a HYGEA ainda não sabe responder (${perguntas.length}) —`);
  if (!perguntas.length) {
    console.log("  (nenhuma neste momento)");
  } else {
    [...perguntas]
      .sort((a, b) => (b.ocorrencias || 0) - (a.ocorrencias || 0))
      .forEach(p => {
        console.log(`  • "${p.pergunta}"  —  ${p.ocorrencias}× (última vez: ${fmtData(p.ultimaVez)})`);
      });
    console.log("\n  Para cada uma destas que fizer sentido responder, diz-me o que a HYGEA");
    console.log("  devia dizer — eu escrevo a regra/resposta em src/hygeaIa.js, com teste,");
    console.log("  e ela passa a responder a isto (e a perguntas parecidas) para sempre.");
  }

  const nAliases = Object.keys(aliases).length;
  console.log(`\n— Aliases já ensinados nesta farmácia via a UI (${nAliases}) —`);
  if (!nAliases) {
    console.log("  (nenhum ainda)");
  } else {
    Object.entries(aliases).forEach(([texto, intentId]) => console.log(`  • "${texto}" → intent "${intentId}"`));
  }

  const nDispensados = Object.keys(dispensados).length;
  console.log(`\n— Alertas atualmente silenciados (${nDispensados}) —`);
  if (!nDispensados) {
    console.log("  (nenhum ativo neste momento)");
  } else {
    Object.entries(dispensados).forEach(([id, info]) => console.log(`  • ${id}  (até ${fmtData(info.ate)})`));
  }
  console.log("");
}

main().catch(err => { console.error("Erro:", err.message || err); process.exit(1); });
