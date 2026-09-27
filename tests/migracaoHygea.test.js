/**
 * tests/migracaoHygea.test.js — ponto 60: a IA interna passou a chamar-se
 * HYGEA (era FARMA) e a mudança foi até ao fundo do código, incluindo os
 * nomes das chaves onde os dados de cada farmácia estão gravados.
 *
 * O que estes testes protegem é a parte que mais facilmente passaria
 * despercebida numa mudança de nome: as farmácias que JÁ existiam. Sem
 * migração, a IA arrancava sem a memória que tinha aprendido, o atalho do
 * módulo ficava a apontar para um ficheiro inexistente, e podia aparecer um
 * segundo atalho para o mesmo módulo.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createStore, reducer, initialState } from "../src/store.js";
import { createActions } from "../src/actions.js";
import { migrarServicosHygea, migrarConfigHygea, CONFIG_RENOMEADAS } from "../src/migracaoHygea.js";
import { normalizarChaveUso } from "../src/usoCatalogo.js";
import { agregarPorModulo, agregarPorTarefa, calcularPoupanca } from "../src/usoLeitura.js";

class FakeLocalStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
if (typeof globalThis.localStorage === "undefined") globalThis.localStorage = new FakeLocalStorage();

function fakeDataStore({ servicos = [], categorias = [], config = {} } = {}) {
  const servidor = { servicos: servicos.slice(), categorias: categorias.slice(), config: { ...config } };
  const escritas = [];
  return {
    servidor,
    escritas,
    async getAll(nome) {
      return nome === "servicos" ? servidor.servicos.slice() : nome === "categorias" ? servidor.categorias.slice() : [];
    },
    async putAll(nome, items) {
      escritas.push({ op: "putAll", nome });
      if (nome === "servicos") servidor.servicos = items.slice();
      else if (nome === "categorias") servidor.categorias = items.slice();
    },
    async getConfig(key) { return key in servidor.config ? servidor.config[key] : null; },
    async setConfig(key, value) { escritas.push({ op: "setConfig", key }); servidor.config[key] = value; },
    async getAsset() { return null; },
    async setAsset() {},
    async refresh() {}
  };
}

const CATEGORIA_INDEFINIDA = { id: "cat_indefinida", nome: "Categoria Indefinida", sistema: true, ordem: 9999 };

/** Farmácia "antiga": atalho do módulo com o id/URL/nome de origem da FARMA. */
function servicoAtalhoAntigo(extra = {}) {
  return {
    id: "srv_antigo", nome: "FARMA IA", descricao: "", tipo: "modulo", modulo: "farma-ia",
    url: null, categoriaId: "cat_clinicos", tags: ["módulo"], favorito: false, status: "ativo",
    ordem: 3, criadoEm: 1, atualizadoEm: 1, ultimoAcesso: null, contadorAcessos: 7, ...extra
  };
}

describe("migrarServicosHygea() — parte pura", () => {
  test("atalho antigo do módulo fica com o id, o nome e o URL novos", () => {
    const { servicos, mudou } = migrarServicosHygea([servicoAtalhoAntigo()]);
    assert.equal(mudou, true);
    assert.equal(servicos[0].modulo, "hygea-ia");
    assert.equal(servicos[0].nome, "HYGEA IA");
    assert.equal(servicos[0].contadorAcessos, 7, "o histórico do serviço tem de ser preservado tal e qual");
  });

  test("um nome dado pela farmácia é respeitado — só o nome de origem é substituído", () => {
    const { servicos } = migrarServicosHygea([servicoAtalhoAntigo({ nome: "Assistente da Ana" })]);
    assert.equal(servicos[0].modulo, "hygea-ia");
    assert.equal(servicos[0].nome, "Assistente da Ana");
  });

  test("um serviço criado à mão a apontar para o ficheiro antigo do módulo passa a apontar para o novo", () => {
    const { servicos, mudou } = migrarServicosHygea([
      { id: "s1", tipo: "url", nome: "Atalho meu", url: "modulos/farma-ia.html#alertas" }
    ]);
    assert.equal(mudou, true);
    assert.equal(servicos[0].url, "modulos/hygea-ia.html#alertas");
  });

  test("numa farmácia já migrada (ou nova) não mexe em nada", () => {
    const originais = [{ id: "s1", tipo: "modulo", modulo: "hygea-ia", nome: "HYGEA IA" }];
    const { servicos, mudou } = migrarServicosHygea(originais);
    assert.equal(mudou, false);
    assert.equal(servicos, originais, "sem alterações, devolve a mesma lista (evita gravações inúteis)");
  });
});

describe("migrarConfigHygea() — memória e definições da IA", () => {
  test("move cada chave antiga para a nova e limpa a antiga", async () => {
    const dataStore = fakeDataStore({ config: {
      farmaIaMemoria: { aprendido: ["x"] },
      farmaNomeAssistente: "Hygeazinha",
      outraCoisa: "não tocar"
    }});
    const migradas = await migrarConfigHygea(dataStore);
    assert.deepEqual(migradas.sort(), ["farmaIaMemoria", "farmaNomeAssistente"]);
    assert.deepEqual(dataStore.servidor.config.hygeaIaMemoria, { aprendido: ["x"] });
    assert.equal(dataStore.servidor.config.hygeaNomeAssistente, "Hygeazinha");
    assert.equal(dataStore.servidor.config.farmaIaMemoria, null);
    assert.equal(dataStore.servidor.config.outraCoisa, "não tocar");
  });

  test("se a chave nova já tiver valor, é esse que fica (nunca é substituído pelo antigo)", async () => {
    const dataStore = fakeDataStore({ config: {
      farmaNomeAssistente: "nome antigo",
      hygeaNomeAssistente: "nome novo, já usado noutro computador"
    }});
    await migrarConfigHygea(dataStore);
    assert.equal(dataStore.servidor.config.hygeaNomeAssistente, "nome novo, já usado noutro computador");
    assert.equal(dataStore.servidor.config.farmaNomeAssistente, null);
  });

  test("sem nada antigo para migrar, não escreve absolutamente nada", async () => {
    const dataStore = fakeDataStore({ config: { hygeaIaMemoria: { a: 1 } } });
    const migradas = await migrarConfigHygea(dataStore);
    assert.deepEqual(migradas, []);
    assert.deepEqual(dataStore.escritas, []);
  });

  test("todas as chaves conhecidas da IA estão na tabela de migração", () => {
    // guarda contra esquecer uma chave nova no futuro: os nomes novos têm
    // todos de começar por "hygea" e os antigos por "farma"
    for (const [antiga, nova] of Object.entries(CONFIG_RENOMEADAS)) {
      assert.ok(antiga.startsWith("farma"), `${antiga} devia ser uma chave antiga`);
      assert.equal(nova, antiga.replace(/^farma/, "hygea"));
    }
  });
});

describe("arranque de uma farmácia que já existia (iniciar)", () => {
  test("o atalho antigo é migrado e NÃO aparece um segundo atalho para o mesmo módulo", async () => {
    const dataStore = fakeDataStore({
      servicos: [servicoAtalhoAntigo()],
      categorias: [CATEGORIA_INDEFINIDA, { id: "cat_clinicos", nome: "Serviços Clínicos", ordem: 0 }],
      config: { farmaIaMemoria: { aprendido: ["dose de paracetamol"] } } // atalhosModulosCriados ausente de propósito
    });
    const store = createStore(reducer, initialState);
    const actions = createActions(store, dataStore);
    await actions.iniciar();
    await actions.recarregarDoServidor(); // espera pela gravação de fundo (ponto 58)

    const doModulo = store.getState().servicos.filter(s => s.modulo === "hygea-ia");
    assert.equal(doModulo.length, 1, "tem de existir exatamente UM atalho para a HYGEA IA");
    assert.equal(doModulo[0].id, "srv_antigo", "tem de ser o atalho que já lá estava, não um novo");
    assert.equal(store.getState().servicos.some(s => s.modulo === "farma-ia"), false);
    assert.deepEqual(dataStore.servidor.config.hygeaIaMemoria, { aprendido: ["dose de paracetamol"] },
      "a memória da IA tem de sobreviver à mudança de nome");
  });

  test("farmácia com os atalhos já criados: o atalho antigo é corrigido na mesma e gravado no servidor", async () => {
    const dataStore = fakeDataStore({
      servicos: [servicoAtalhoAntigo()],
      categorias: [CATEGORIA_INDEFINIDA],
      config: { atalhosModulosCriados: true }
    });
    const store = createStore(reducer, initialState);
    const actions = createActions(store, dataStore);
    await actions.iniciar();
    await actions.recarregarDoServidor();

    assert.equal(dataStore.servidor.servicos[0].modulo, "hygea-ia");
    assert.equal(dataStore.servidor.servicos[0].nome, "HYGEA IA");
  });

  test("correr o arranque duas vezes não volta a gravar nada (migração idempotente)", async () => {
    const dataStore = fakeDataStore({
      servicos: [{ id: "s1", tipo: "modulo", modulo: "hygea-ia", nome: "HYGEA IA", categoriaId: "cat_clinicos" }],
      categorias: [CATEGORIA_INDEFINIDA],
      config: { atalhosModulosCriados: true, hygeaIaMemoria: { a: 1 } }
    });
    const store = createStore(reducer, initialState);
    const actions = createActions(store, dataStore);
    await actions.iniciar();
    await actions.recarregarDoServidor();
    dataStore.escritas.length = 0;
    await actions.iniciar();
    await actions.recarregarDoServidor();
    assert.deepEqual(dataStore.escritas, [], "numa farmácia já migrada, o arranque não pode escrever nada");
  });
});

describe("histórico de uso (Poupança & ROI) com o id antigo do módulo", () => {
  test("normalizarChaveUso() traduz só o módulo renomeado", () => {
    assert.equal(normalizarChaveUso("farma-ia.perguntar"), "hygea-ia.perguntar");
    assert.equal(normalizarChaveUso("pim.registar_receita"), "pim.registar_receita");
    assert.equal(normalizarChaveUso("hygea-ia.perguntar"), "hygea-ia.perguntar");
  });

  test("ocorrências registadas com o id antigo continuam a contar, somadas às novas", () => {
    const dias = { "2026-09-01": { "farma-ia.perguntar": 3, "hygea-ia.perguntar": 2 } };
    const porTarefa = agregarPorTarefa(dias, {});
    const linha = porTarefa.find(l => l.chave === "hygea-ia.perguntar");
    assert.equal(linha.totalOcorrencias, 5, "3 antigas + 2 novas");
    const porModulo = agregarPorModulo(dias, {});
    assert.equal(Object.keys(porModulo).includes("farma-ia"), false, "não pode aparecer um módulo fantasma com o nome antigo");
    assert.equal(porModulo["hygea-ia"].totalOcorrencias, 5);
    assert.ok(calcularPoupanca(dias, {}).segundosPoupados > 0, "a poupança histórica não pode ir a zero com a mudança de nome");
  });
});
