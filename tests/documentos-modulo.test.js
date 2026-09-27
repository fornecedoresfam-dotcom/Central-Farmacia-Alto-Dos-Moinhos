/**
 * documentos-modulo.test.js — cobre a aba "Documentos" reutilizável (ponto
 * 59), usada de forma independente dentro de PIM, Manipulados e AUE.
 *
 * O componente manipula o DOM diretamente (document.getElementById/
 * innerHTML, FileReader), tal como faz dentro dos módulos reais, em vez de
 * qualquer framework de UI. Em vez de trazer o jsdom só para isto (o
 * sandbox onde este teste corre não tem acesso ao registo npm para o
 * instalar), simula-se aqui um `document`/`FileReader` mínimos, mas reais o
 * suficiente para exercitar o comportamento verdadeiro do componente —
 * nunca os métodos internos a fingir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

/** Elemento falso com innerHTML como propriedade real (get/set), como no DOM a sério. */
class FakeElement {
  constructor(tag) { this.tag = tag || "div"; this._html = ""; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = v; }
  click() {}
}

/** document falso: qualquer id pedido "existe" (criado na hora, na primeira vez) —
 * suficiente para o componente, que só lê/escreve innerHTML e cria <a> para download. */
function fakeDocument() {
  const elements = new Map();
  return {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new FakeElement());
      return elements.get(id);
    },
    createElement(tag) { return new FakeElement(tag); }
  };
}

/** Ficheiro falso — só precisa de name/type/size/conteúdo, tal como um File real. */
function fakeFile(name, type, content) {
  const c = content || "conteudo de teste";
  return { name, type, size: c.length, _conteudo: c };
}

/** FileReader falso: resolve readAsDataURL de forma assíncrona (microtask),
 * tal como o real, codificando o conteúdo do fakeFile em base64. */
class FakeFileReader {
  readAsDataURL(file) {
    Promise.resolve().then(() => {
      this.result = `data:${file.type || "application/octet-stream"};base64,` + Buffer.from(file._conteudo).toString("base64");
      if (this.onload) this.onload();
    });
  }
}

function novoAmbiente() {
  global.document = fakeDocument();
  global.window = global.window || {};
  global.FileReader = FakeFileReader;
}

/** Fake dataStore que imita o comportamento real de db.js: getConfig/setConfig
 * fazem sempre MERGE (nunca substituem as outras chaves), e os assets vivem
 * num mapa à parte — suficiente para verificar a separação entre chaves de
 * módulos diferentes sem precisar de um servidor a sério. */
function fakeDataStore() {
  const config = {};
  const assets = new Map();
  return {
    config, assets,
    async getConfig(key) { return key in config ? config[key] : null; },
    async setConfig(key, value) { config[key] = value; },
    async setAsset(key, content) { assets.set(key, content); },
    async getAsset(key) { return assets.has(key) ? assets.get(key) : null; },
    async deleteAsset(key) { assets.delete(key); }
  };
}

test("estado vazio: mostra 'Sem documentos' antes de qualquer upload", async () => {
  novoAmbiente();
  const { criarAbaDocumentosModulo } = await import("../src/ui/documentos-modulo.js");
  const aba = criarAbaDocumentosModulo({
    dataStore: fakeDataStore(), chaveConfig: "documentos_pim", prefixoAsset: "documento_modulo_pim",
    containerId: "docTab", showToast: () => {}
  });
  await aba.render();
  const html = document.getElementById("docTab").innerHTML;
  assert.match(html, /Sem documentos/);
});

test("upload guarda o conteúdo em setAsset e os metadados em setConfig, e a aba passa a listar o ficheiro", async () => {
  novoAmbiente();
  const { criarAbaDocumentosModulo } = await import("../src/ui/documentos-modulo.js");
  const toasts = [];
  const dataStore = fakeDataStore();
  const aba = criarAbaDocumentosModulo({
    dataStore, chaveConfig: "documentos_pim", prefixoAsset: "documento_modulo_pim",
    containerId: "docTab", showToast: (m) => toasts.push(m)
  });
  await aba.render();
  await aba.handlers.docModHandleUpload([fakeFile("bula.pdf", "application/pdf")]);

  const lista = dataStore.config["documentos_pim"];
  assert.equal(lista.length, 1, "os metadados do ficheiro têm de ficar gravados via setConfig");
  assert.equal(lista[0].name, "bula.pdf");
  assert.equal(lista[0].type, "application/pdf");

  const chaveAsset = "documento_modulo_pim:" + lista[0].id;
  assert.ok(dataStore.assets.has(chaveAsset), "o conteúdo do ficheiro tem de ficar guardado em setAsset, à parte dos metadados");
  assert.match(dataStore.assets.get(chaveAsset), /^data:application\/pdf;base64,/);

  const html = document.getElementById("docTab").innerHTML;
  assert.match(html, /bula\.pdf/);
  assert.ok(toasts.some((t) => /carregado/i.test(t)));
});

test("ficheiro acima de 15MB é recusado, sem ser guardado nem contar para a lista", async () => {
  novoAmbiente();
  const { criarAbaDocumentosModulo } = await import("../src/ui/documentos-modulo.js");
  const toasts = [];
  const dataStore = fakeDataStore();
  const aba = criarAbaDocumentosModulo({
    dataStore, chaveConfig: "documentos_pim", prefixoAsset: "documento_modulo_pim",
    containerId: "docTab", showToast: (m) => toasts.push(m)
  });
  await aba.render();

  const grande = fakeFile("grande.pdf", "application/pdf");
  grande.size = 20 * 1024 * 1024; // reporta um tamanho grande sem alocar 20MB reais no teste

  await aba.handlers.docModHandleUpload([grande]);
  assert.equal(dataStore.config["documentos_pim"], undefined, "nada deve ter sido gravado — nem sequer uma lista vazia");
  assert.ok(toasts.some((t) => /15MB/.test(t)));
});

test("renomear atualiza o nome tanto na lista gravada como na aba redesenhada", async () => {
  novoAmbiente();
  const { criarAbaDocumentosModulo } = await import("../src/ui/documentos-modulo.js");
  const dataStore = fakeDataStore();
  const aba = criarAbaDocumentosModulo({
    dataStore, chaveConfig: "documentos_pim", prefixoAsset: "documento_modulo_pim",
    containerId: "docTab", showToast: () => {}
  });
  await aba.render();
  await aba.handlers.docModHandleUpload([fakeFile("original.pdf", "application/pdf")]);
  const id = dataStore.config["documentos_pim"][0].id;

  global.window.prompt = () => "renomeado.pdf";
  await aba.handlers.docModRename(id);

  assert.equal(dataStore.config["documentos_pim"][0].name, "renomeado.pdf");
  assert.match(document.getElementById("docTab").innerHTML, /renomeado\.pdf/);
});

test("cancelar o prompt de renomear (null) não altera nada", async () => {
  novoAmbiente();
  const { criarAbaDocumentosModulo } = await import("../src/ui/documentos-modulo.js");
  const dataStore = fakeDataStore();
  const aba = criarAbaDocumentosModulo({
    dataStore, chaveConfig: "documentos_pim", prefixoAsset: "documento_modulo_pim",
    containerId: "docTab", showToast: () => {}
  });
  await aba.render();
  await aba.handlers.docModHandleUpload([fakeFile("original.pdf", "application/pdf")]);
  const id = dataStore.config["documentos_pim"][0].id;

  global.window.prompt = () => null; // utilizador cancelou a caixa de diálogo
  await aba.handlers.docModRename(id);

  assert.equal(dataStore.config["documentos_pim"][0].name, "original.pdf");
});

test("eliminar remove tanto o asset como a entrada na lista, e pede confirmação primeiro", async () => {
  novoAmbiente();
  const { criarAbaDocumentosModulo } = await import("../src/ui/documentos-modulo.js");
  const dataStore = fakeDataStore();
  const aba = criarAbaDocumentosModulo({
    dataStore, chaveConfig: "documentos_pim", prefixoAsset: "documento_modulo_pim",
    containerId: "docTab", showToast: () => {}
  });
  await aba.render();
  await aba.handlers.docModHandleUpload([fakeFile("apagar.pdf", "application/pdf")]);
  const id = dataStore.config["documentos_pim"][0].id;
  const chaveAsset = "documento_modulo_pim:" + id;
  assert.ok(dataStore.assets.has(chaveAsset));

  global.window.confirm = () => false; // utilizador recua
  await aba.handlers.docModDelete(id);
  assert.equal(dataStore.config["documentos_pim"].length, 1, "sem confirmação, nada pode ser eliminado");

  global.window.confirm = () => true;
  await aba.handlers.docModDelete(id);
  assert.equal(dataStore.config["documentos_pim"].length, 0);
  assert.equal(dataStore.assets.has(chaveAsset), false, "o conteúdo do ficheiro tem de ser removido do asset store também");
});

test("dois módulos com chaveConfig/prefixoAsset diferentes nunca partilham documentos, mesmo usando a mesma dataStore", async () => {
  novoAmbiente();
  const { criarAbaDocumentosModulo } = await import("../src/ui/documentos-modulo.js");
  const dataStore = fakeDataStore(); // simula os dois módulos a apontar ao mesmo servidor/farmácia
  const abaPim = criarAbaDocumentosModulo({
    dataStore, chaveConfig: "documentos_pim", prefixoAsset: "documento_modulo_pim",
    containerId: "docTab", showToast: () => {}
  });
  await abaPim.render();
  await abaPim.handlers.docModHandleUpload([fakeFile("so-do-pim.pdf", "application/pdf")]);

  document.getElementById("docTab").innerHTML = ""; // simula trocar de módulo
  const abaAue = criarAbaDocumentosModulo({
    dataStore, chaveConfig: "documentos_aue", prefixoAsset: "documento_modulo_aue",
    containerId: "docTab", showToast: () => {}
  });
  await abaAue.render();

  assert.equal(dataStore.config["documentos_aue"], undefined, "a lista do AUE não pode conter nada só porque o PIM gravou algo");
  assert.match(document.getElementById("docTab").innerHTML, /Sem documentos/);
  // e a chave partilhada do PIM continua intacta (o merge de setConfig não a apagou)
  assert.equal(dataStore.config["documentos_pim"].length, 1);
});

test("descarregar um documento não-imagem cria um <a download> com o dataUrl correto", async () => {
  novoAmbiente();
  const { criarAbaDocumentosModulo } = await import("../src/ui/documentos-modulo.js");
  const dataStore = fakeDataStore();
  const aba = criarAbaDocumentosModulo({
    dataStore, chaveConfig: "documentos_pim", prefixoAsset: "documento_modulo_pim",
    containerId: "docTab", showToast: () => {}
  });
  await aba.render();
  await aba.handlers.docModHandleUpload([fakeFile("fatura.xlsx", "application/vnd.ms-excel")]);
  const id = dataStore.config["documentos_pim"][0].id;

  const originalCreateElement = document.createElement.bind(document);
  let ancoraCriada = null;
  document.createElement = (tag) => {
    const el = originalCreateElement(tag);
    if (tag === "a") ancoraCriada = el;
    return el;
  };

  await aba.handlers.docModDownload(id);

  assert.ok(ancoraCriada, "tem de criar um elemento <a> para descarregar");
  assert.equal(ancoraCriada.download, "fatura.xlsx");
  assert.match(ancoraCriada.href, /^data:application\/vnd\.ms-excel;base64,/);
});
