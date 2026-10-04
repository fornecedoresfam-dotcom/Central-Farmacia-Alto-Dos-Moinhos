/**
 * sw.js — cache do "app shell" para carregamentos instantâneos em visitas
 * repetidas e alguma tolerância offline. Estratégia:
 *   - HTML: network-first (garante conteúdo atualizado quando há rede,
 *     cai para a cópia em cache quando offline).
 *   - CSS/JS/ícones: stale-while-revalidate (serve imediatamente do cache
 *     e atualiza em segundo plano para a próxima visita).
 *
 * Sobe a versão de CACHE_VERSION sempre que o conteúdo de assets/ ou src/
 * mudar substancialmente, para invalidar caches antigas.
 */
// Ponto 57: a versão não tinha sido subida quando src/db.js mudou (bug
// crítico de gravações concorrentes) — um browser com o service worker já
// instalado continua a servir "./src/db.js" (na lista de APP_SHELL, cache
// "stale-while-revalidate") da cache ANTIGA em cada visita até a versão
// mudar, mesmo depois de o ficheiro novo estar publicado no servidor. Subida
// agora para forçar todos os browsers já com a app aberta a apanhar o
// código corrigido logo na próxima visita, em vez de ficarem presos ao
// comportamento antigo indefinidamente.
// Ponto 58: src/actions.js mudou substancialmente outra vez (o botão
// "Atualizar" podia apagar um serviço acabado de criar) — mesma lógica,
// subida de novo.
// Ponto 60 (FARMA -> HYGEA): mudou tudo de uma vez — nomes de ficheiros de
// src/, o módulo da IA, o manifesto, os ícones e o ecrã de apresentação. Um
// browser com a versão antiga em cache serviria ficheiros que já não
// existem, por isso a versão sobe para uma nova série (v5).
// Ponto 60 (continuação): a apresentação não aparecia em alguns computadores
// da farmácia. Parte da resposta é ter o vídeo já guardado localmente a
// partir da 2ª visita, para não depender da rede no momento exato em que a
// app abre — ver MEDIA_OPCIONAL abaixo.
// v5.2.0 — pontos 62/63/64: cópia completa, módulo Vacinação e rótulo do PIM
// em A5. Mexeu-se em src/ e acrescentou-se um módulo novo, por isso a versão
// sobe (ver a nota no topo deste ficheiro): sem isto, um computador que já
// tenha a Central instalada continuaria a servir os ficheiros antigos da sua
// própria cache e não veria nada do que mudou.
const CACHE_VERSION = "central-hygea-v5.2.0";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/styles.css",
  "./assets/dev-logo.png",
  "./assets/hygea/hygea-icon-192.png",
  "./assets/hygea/hygea-icon-512.png",
  "./src/app.js",
  "./src/store.js",
  "./src/db.js",
  "./src/actions.js",
  "./src/migracaoHygea.js",
  "./src/events.js",
  "./src/utils.js",
  "./src/icons.js",
  "./src/domain.js",
  "./src/vdom.js",
  "./src/ui/sidebar.js",
  "./src/ui/main-content.js",
  "./src/ui/toast.js",
  "./src/ui/palette.js",
  "./src/ui/modals.js"
];
// Os vídeos ficam FORA da lista acima de propósito: são os ficheiros mais
// pesados do conjunto e, dentro de `cache.addAll`, bastava um falhar para a
// instalação inteira do service worker ir abaixo — deixando a app sem cache
// nenhuma. Ficam nesta segunda lista, guardada à parte e à prova de falhas:
// cada um por sua conta, sem nunca comprometer a instalação. A partir da 2ª
// visita a apresentação já não depende da rede para arrancar depressa.
const MEDIA_OPCIONAL = [
  "./assets/hygea/hygea-apresentacao.webm",
  "./assets/hygea/hygea-apresentacao.mp4",
  "./assets/hygea/hygea-apresentacao-poster.jpg",
  "./assets/hygea/hygea-a-pensar.webm",
  "./assets/hygea/hygea-a-pensar.mp4"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      await cache.addAll(APP_SHELL); // essencial: se falhar, a instalação falha (e tenta outra vez)
      // opcional: cada ficheiro por sua conta, e um erro aqui não trava nada
      await Promise.allSettled(MEDIA_OPCIONAL.map((u) => cache.add(u)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;

  // A API do estado partilhado nunca passa pelo cache do service worker —
  // tem de ir sempre à rede, senão os computadores "veem" dados antigos.
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/functions/")) return;

  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) caches.open(CACHE_VERSION).then((cache) => cache.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
