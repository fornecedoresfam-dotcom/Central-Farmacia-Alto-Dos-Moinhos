/**
 * documentos-modulo.js — aba "Documentos" reutilizável, usada de forma
 * INDEPENDENTE dentro de cada módulo (PIM, Manipulados, AUE — ponto 59):
 * permite carregar PDF, Word, Excel, HTML, imagens e outros ficheiros,
 * guardados só para esse módulo (o mesmo ficheiro carregado no PIM não
 * aparece no de Manipulados, nem no módulo geral "Documentos" já existente
 * — modulos/documentos.html —, que é uma ferramenta à parte, com pastas).
 *
 * Segue exatamente o mesmo padrão já usado em pim.html (RECEITAS) e em
 * modulos/documentos.html (DOCS): os METADADOS (nome, tipo, tamanho, data)
 * ficam numa lista pequena gravada com dataStore.setConfig/getConfig — que
 * faz sempre um MERGE seguro sob escritas concorrentes (ver o comentário
 * longo em src/db.js sobre o ponto 57: duas escritas a chaves diferentes
 * nunca se apagam uma à outra) — e o CONTEÚDO pesado de cada ficheiro vive
 * à parte em dataStore.setAsset/getAsset/deleteAsset (com fragmentação
 * automática para ficheiros grandes), para nunca aproximar o limite de 6MB
 * por pedido das funções do Netlify.
 *
 * Cada módulo que usa esta aba passa a SUA própria dataStore (já criada
 * por si via makeDataStore()), uma chaveConfig e um prefixoAsset ÚNICOS
 * (ex.: "documentos_pim" / "documento_modulo_pim"), para que as listas e os
 * conteúdos de cada módulo nunca se misturem entre si.
 */

function uid() {
  return "docm_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(s) {
  return (s == null ? "" : String(s)).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtBytes(n) {
  if (n == null) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

function fmtDataHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function iconePorTipo(tipo, nome) {
  const t = (tipo || "").toLowerCase();
  const ext = (nome || "").split(".").pop().toLowerCase();
  if (t.startsWith("image/")) return "🖼️";
  if (t === "application/pdf" || ext === "pdf") return "📕";
  if (t.includes("word") || ["doc", "docx"].includes(ext)) return "📘";
  if (t.includes("sheet") || t.includes("excel") || ["xls", "xlsx", "csv"].includes(ext)) return "📗";
  if (t === "text/html" || ["html", "htm"].includes(ext)) return "🌐";
  return "📄";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Generoso para PDFs/Word/Excel — dentro do que dataStore.setAsset já sabe
// fragmentar automaticamente para ficheiros maiores que 2MB (ver src/db.js).
const TAMANHO_MAX = 15 * 1024 * 1024;

/**
 * Cria uma instância da aba "Documentos" para UM módulo.
 *
 * @param {object} opts
 * @param {object} opts.dataStore    - instância de makeDataStore() já usada pelo módulo chamador
 * @param {string} opts.chaveConfig  - chave única desta aba na config partilhada (ex.: "documentos_pim")
 * @param {string} opts.prefixoAsset - prefixo único para as chaves de conteúdo (ex.: "documento_modulo_pim")
 * @param {string} opts.containerId  - id do elemento onde a aba é desenhada
 * @param {function} opts.showToast  - função de aviso já usada pelo módulo chamador
 * @param {function} [opts.onChange] - chamado depois de qualquer alteração (upload/remoção/renomear)
 */
export function criarAbaDocumentosModulo(opts) {
  const { dataStore, chaveConfig, prefixoAsset, containerId, showToast } = opts;
  const onChange = opts.onChange || function () {};
  let docs = [];
  let carregado = false;

  function assetKey(id) { return `${prefixoAsset}:${id}`; }

  async function carregar() {
    if (carregado) return docs;
    let guardado = null;
    try { guardado = await dataStore.getConfig(chaveConfig); } catch (e) { guardado = null; }
    docs = Array.isArray(guardado) ? guardado : [];
    carregado = true;
    return docs;
  }

  async function gravarLista() {
    await dataStore.setConfig(chaveConfig, docs);
  }

  function cardHtml(d) {
    return `
      <div class="doc-row">
        <div class="dicon">${iconePorTipo(d.type, d.name)}</div>
        <div class="dinfo"><b>${escapeHtml(d.name)}</b><span>${fmtBytes(d.size)} · carregado a ${fmtDataHora(d.addedAt)}</span></div>
        <div class="dactions">
          <button class="icon-btn" title="Ver/Descarregar" onclick="docModDownload('${d.id}')">⬇</button>
          <button class="icon-btn" title="Renomear" onclick="docModRename('${d.id}')">✎</button>
          <button class="icon-btn danger" title="Eliminar" onclick="docModDelete('${d.id}')">🗑</button>
        </div>
      </div>`;
  }

  async function render() {
    const el = document.getElementById(containerId);
    if (!el) return;
    await carregar();
    const ordenados = docs.slice().sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || ""));
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
        <span style="font-family:'Manrope',sans-serif;font-weight:800;color:var(--brand-deep,#1f543e);font-size:14.5px;">Documentos deste módulo</span>
        <label class="btn-primary" style="margin-left:auto;cursor:pointer;">+ Carregar ficheiro
          <input type="file" id="${containerId}_input" multiple style="display:none;" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.html,.htm,image/*" onchange="docModHandleUpload(this.files)">
        </label>
      </div>
      <p style="font-size:12px;color:var(--ink-soft);margin:-6px 0 14px;max-width:640px;">PDF, Word, Excel, HTML, imagens e outros ficheiros — ficam guardados apenas neste módulo, independentes dos outros separadores da Central.</p>
      ${ordenados.length
        ? `<div class="doc-list">${ordenados.map(cardHtml).join("")}</div>`
        : `<div class="empty"><b>Sem documentos</b>Carregue o primeiro ficheiro deste módulo.</div>`}
    `;
  }

  function triggerUpload() {
    const input = document.getElementById(`${containerId}_input`);
    if (input) input.click();
  }

  async function handleUpload(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const grandesDemais = files.filter((f) => f.size > TAMANHO_MAX);
    const validos = files.filter((f) => f.size <= TAMANHO_MAX);
    if (grandesDemais.length) showToast(`${grandesDemais.length} ficheiro(s) ultrapassam 15MB e não foram carregados.`);
    if (!validos.length) return;
    showToast(`A carregar ${validos.length} ficheiro(s)…`);
    await carregar();
    try {
      for (const file of validos) {
        const dataUrl = await readFileAsDataUrl(file);
        const id = uid();
        await dataStore.setAsset(assetKey(id), dataUrl);
        docs.push({ id, name: file.name, type: file.type, size: file.size, addedAt: new Date().toISOString() });
      }
      await gravarLista();
      showToast("Documento(s) carregado(s).");
    } catch (err) {
      showToast("Não foi possível carregar um dos documentos agora.");
    }
    await render();
    onChange();
  }

  async function download(id) {
    await carregar();
    const d = docs.find((x) => x.id === id);
    if (!d) return;
    let dataUrl;
    try { dataUrl = await dataStore.getAsset(assetKey(id)); }
    catch (err) { showToast("Não foi possível obter este documento agora."); return; }
    if (!dataUrl) { showToast("Conteúdo do documento não encontrado."); return; }
    if ((d.type || "").startsWith("image/")) {
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(`<title>${escapeHtml(d.name)}</title><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${dataUrl}" style="max-width:100%;max-height:100vh;"></body>`);
        w.document.close();
      } else {
        showToast("Autorize pop-ups para ver a imagem.");
      }
      return;
    }
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = d.name;
    a.click();
  }

  async function rename(id) {
    await carregar();
    const d = docs.find((x) => x.id === id);
    if (!d) return;
    const novo = window.prompt("Novo nome do documento:", d.name);
    if (novo == null) return; // cancelado
    const limpo = novo.trim();
    if (!limpo || limpo === d.name) return;
    d.name = limpo;
    await gravarLista();
    await render();
    onChange();
  }

  async function remove(id) {
    if (!window.confirm("Eliminar este documento? Esta ação não pode ser desfeita.")) return;
    await carregar();
    const idx = docs.findIndex((x) => x.id === id);
    if (idx === -1) return;
    docs.splice(idx, 1);
    await gravarLista();
    dataStore.deleteAsset(assetKey(id)).catch(() => {}); // limpeza best-effort do conteúdo
    await render();
    showToast("Documento eliminado.");
    onChange();
  }

  return {
    render,
    handlers: {
      docModTriggerUpload: triggerUpload,
      docModHandleUpload: handleUpload,
      docModDownload: download,
      docModRename: rename,
      docModDelete: remove
    }
  };
}
