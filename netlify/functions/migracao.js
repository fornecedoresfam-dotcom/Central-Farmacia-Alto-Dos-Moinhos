/**
 * netlify/functions/migracao.js — inventário dos conteúdos pesados de UMA
 * farmácia, para a cópia de segurança completa poder sair de uma Central e
 * entrar noutra (ponto 62, mudança de alojamento).
 *
 * Porque é que isto precisa de existir:
 * o estado de cada farmácia (serviços, categorias, configurações e as fatias
 * de todos os módulos) sai inteiro num só pedido — `GET /api/data` sem
 * `?campos=` já o devolve todo. Os ficheiros, esses, não: cada documento,
 * anexo, receita digitalizada ou logótipo vive no seu próprio blob
 * (`/api/asset/<chave>`) e a app só sabe ir buscá-los UM a um, pela chave.
 * Cada módulo inventa a sua chave à sua maneira (`doc-<id>`, `rec-<id>`,
 * `aue-<pedido>-<campo>`, o `remoteId` de um anexo...). Para exportar tudo
 * havia duas opções: repetir essas oito regras de nome no cliente — e perder
 * em silêncio o que ficasse de fora — ou perguntar ao servidor o que é que
 * esta farmácia tem lá dentro. É isto, e é a única resposta honesta: o que
 * vem na cópia não depende de nos lembrarmos de todos os módulos.
 *
 * Rota: /api/migracao/inventario   (GET)
 *   -> { versao, total, chaves: ["branding-logo", "doc-xxx", ...] }
 *
 * O `tenantId` vem SEMPRE do token de sessão, nunca do pedido — a mesma
 * regra do data.js e do asset.js: uma farmácia nunca vê o inventário de
 * outra, qualquer que seja o que envie.
 */
import { getStore } from "@netlify/blobs";
import { autenticarPedido } from "./_lib/auth.js";

const STORE_NAME = "central-saas";
export const VERSAO_INVENTARIO = 1;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

/**
 * Transforma a lista de chaves cruas do armazenamento nas chaves que a app
 * conhece. Três coisas a desfazer:
 *
 *  - o prefixo `asset:<tenantId>:`, que é só arrumação interna;
 *  - a fragmentação: um ficheiro acima de 2MB foi guardado como `x:meta` +
 *    `x:part:0..N` (ver `setAsset` em src/db.js). Quem exporta pede `x` e o
 *    `getAsset` remonta-o sozinho — por isso o inventário anuncia `x` uma
 *    só vez e nunca os pedaços, que de outra forma seriam exportados duas
 *    vezes (uma inteira, outra aos bocados);
 *  - as cópias de segurança internas (`backup-...`), instantâneos completos
 *    do estado criados pela própria Central. Multiplicariam o tamanho da
 *    exportação por vinte sem acrescentarem nada: o estado que elas guardam
 *    é, por definição, mais antigo do que o que vai na cópia.
 */
export function normalizarChaves(chavesCruas, prefixo) {
  const base = new Set();
  for (const bruta of chavesCruas) {
    if (!bruta.startsWith(prefixo)) continue;
    const chave = bruta.slice(prefixo.length);
    if (!chave) continue;

    const posParte = chave.indexOf(":part:");
    if (posParte > 0) { base.add(chave.slice(0, posParte)); continue; }
    if (chave.endsWith(":meta")) { base.add(chave.slice(0, -":meta".length)); continue; }

    base.add(chave);
  }

  const chaves = [...base].filter((c) => !c.startsWith("backup-"));
  chaves.sort();
  return chaves;
}

export default async (request, context) => {
  return handleRequest(request, context, getStore);
};

export const config = { path: "/api/migracao/:acao" };

export async function handleRequest(request, context, getStoreImpl) {
  const sessao = autenticarPedido(request);
  if (!sessao) return jsonResponse({ error: "Sessão inválida ou expirada. Inicie sessão novamente." }, 401);

  const acao = context?.params?.acao;
  if (acao !== "inventario") return jsonResponse({ error: "Rota não suportada." }, 404);
  if (request.method !== "GET") return jsonResponse({ error: "Método não suportado." }, 405);

  let store;
  try {
    store = getStoreImpl(STORE_NAME);
  } catch (err) {
    return jsonResponse({ error: "Armazenamento indisponível neste ambiente.", detail: String(err) }, 500);
  }

  const prefixo = `asset:${sessao.tenantId}:`;
  try {
    const listagem = await store.list({ prefix: prefixo });
    const cruas = (listagem?.blobs || []).map((b) => b.key);
    const chaves = normalizarChaves(cruas, prefixo);
    return jsonResponse({ versao: VERSAO_INVENTARIO, total: chaves.length, chaves });
  } catch (err) {
    return jsonResponse({ error: "Falha ao listar os conteúdos desta farmácia.", detail: String(err) }, 500);
  }
}
