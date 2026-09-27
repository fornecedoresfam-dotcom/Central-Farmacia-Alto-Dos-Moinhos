/**
 * Identidade HYGEA (ponto 60) — cobertura e2e real (browser) das três peças
 * novas que só se conseguem verificar com a app mesmo a correr:
 *
 *  1. o ecrã de apresentação antes do login — aparece, o vídeo REPRODUZ
 *     mesmo (não basta o <video> existir no HTML), sai sozinho no fim, um
 *     clique salta-o, e uma navegação vinda de dentro (voltar de um módulo)
 *     não o repete;
 *  2. o ícone/manifesto que dá cara a um atalho no ecrã principal — em
 *     qualquer página, não só na inicial;
 *  3. a animação "a pensar" no cantinho esquerdo da caixa da pergunta,
 *     no mini-chat da Central e no módulo completo da HYGEA IA.
 *
 * Nota sobre codecs: o Chromium usado nesta bateria não traz o
 * descodificador de MP4/H.264 (é licenciado), por isso é o WebM que toca
 * aqui — exatamente a razão de cada vídeo ser publicado nos dois formatos.
 * Um teste que só verificasse "o elemento existe" passaria mesmo com o
 * vídeo partido; por isso verifica-se `currentTime`/`videoWidth`.
 */
import { BASE, ok, novaPaginaComSessao, signupFarmacia, coletarErros, viewports } from '../helpers.mjs';

async function estadoDoVideo(locatorHandleFn) {
  return await locatorHandleFn();
}

export async function run(browser) {
  // ---------- 1. ecrã de apresentação ----------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const erros = coletarErros(page);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });

    ok('Apresentação: aparece assim que a aplicação abre',
      await page.locator('#hygeaIntro').isVisible(), '');

    await page.waitForTimeout(1200);
    const v = await page.evaluate(() => {
      const el = document.getElementById('hygeaIntroVideo');
      return el ? { t: el.currentTime, w: el.videoWidth, h: el.videoHeight, pausado: el.paused, erro: !!el.error } : null;
    });
    ok('Apresentação: o vídeo está mesmo a reproduzir (não é só um <video> parado)',
      !!v && v.t > 0.2 && !v.pausado && !v.erro, JSON.stringify(v));
    ok('Apresentação: o vídeo abre na resolução publicada (1600x900)',
      !!v && v.w === 1600 && v.h === 900, JSON.stringify(v));

    await page.waitForSelector('#hygeaIntro', { state: 'detached', timeout: 12000 });
    ok('Apresentação: sai sozinha quando o vídeo acaba e dá lugar ao ecrã de entrada',
      await page.locator('#loginGate').isVisible(), '');
    ok('Apresentação: o ecrã de entrada já usa o nome novo',
      (await page.locator('#loginGate h2').innerText()).includes('HYGEA'), '');
    ok('Apresentação: nenhum erro de página/consola no arranque', erros.length === 0, erros.join(' | '));
    await ctx.close();
  }

  // ---------- 2. saltar com um clique e não repetir ao voltar de um módulo ----------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(400);
    await page.locator('#hygeaIntro').click();
    await page.waitForSelector('#hygeaIntro', { state: 'detached', timeout: 4000 });
    ok('Apresentação: um clique salta-a de imediato', await page.locator('#loginGate').isVisible(), '');

    // "← Voltar à Central HYGEA" dentro de um módulo é navegação DENTRO da
    // app: o referrer é da mesma origem e começa por /modulos/. Usa-se o
    // referrer da navegação (é o sinal que o código observa) em vez de
    // simular o percurso completo com sessão.
    const p2 = await ctx.newPage();
    await p2.goto(`${BASE}/`, { referer: `${BASE}/modulos/reservas.html`, waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(300);
    ok('Apresentação: voltar de um módulo para a Central NÃO a repete',
      (await p2.locator('#hygeaIntro').count()) === 0, '');

    const p3 = await ctx.newPage();
    await p3.goto(`${BASE}/`, { referer: 'https://www.google.com/', waitUntil: 'domcontentloaded' });
    await p3.waitForTimeout(300);
    ok('Apresentação: quem chega de fora (ex.: motor de busca) vê a apresentação',
      (await p3.locator('#hygeaIntro').count()) === 1, '');
    await ctx.close();
  }

  // ---------- 3. ícone do atalho (favicon/manifesto) ----------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const manifesto = await page.request.get(`${BASE}/manifest.webmanifest`);
    const man = await manifesto.json().catch(() => ({}));
    ok('Atalho: o manifesto identifica a aplicação como "Central HYGEA"',
      manifesto.status() === 200 && man.name === 'Central HYGEA' && man.short_name === 'HYGEA', JSON.stringify(man).slice(0, 160));
    ok('Atalho: o manifesto traz ícone normal e ícone "maskable" (Android recorta o ícone à sua maneira)',
      Array.isArray(man.icons) && man.icons.some(i => i.purpose === 'any') && man.icons.some(i => i.purpose === 'maskable'), '');

    for (const ficheiro of ['hygea-icon-192.png', 'hygea-icon-512.png', 'hygea-icon-180.png', 'favicon.ico']) {
      const r = await page.request.get(`${BASE}/assets/hygea/${ficheiro}`);
      ok(`Atalho: ${ficheiro} está publicado`, r.status() === 200 && (await r.body()).length > 400, `status ${r.status()}`);
    }

    // um atalho pode ser criado a partir de qualquer página, não só da inicial
    await page.goto(`${BASE}/modulos/reservas.html`, { waitUntil: 'domcontentloaded' });
    ok('Atalho: um módulo também declara o ícone HYGEA (atalho feito de lá dentro fica com a mesma cara)',
      (await page.locator('link[rel="apple-touch-icon"]').count()) > 0 &&
      (await page.locator('link[rel="icon"]').count()) > 0, '');
    await ctx.close();
  }

  // ---------- 4. animação "a pensar" no mini-chat e no módulo ----------
  {
    const { token, perfil } = await signupFarmacia('Hygea60');
    const { ctx, page } = await novaPaginaComSessao(browser, token, perfil, viewports.desktop);
    const erros = coletarErros(page);
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(600);

    await page.click('.hygea-mini-bolha');
    await page.waitForTimeout(200);
    ok('A pensar (mini-chat): o indicador existe ao lado da caixa de escrita, escondido enquanto não há pergunta',
      (await page.locator('.hygea-mini-form .hygea-pensar').count()) === 1 &&
      !(await page.locator('.hygea-mini-form .hygea-pensar').isVisible()), '');

    // apanha o indicador NO MOMENTO em que a resposta está a ser preparada:
    // regista-se o estado a cada frame, porque a resposta pode chegar
    // depressa de mais para um waitFor normal a ver.
    await page.evaluate(() => {
      window.__hygeaVisto = { visivel: false, tempoVideo: 0 };
      const obs = () => {
        const ind = document.querySelector('.hygea-mini-form .hygea-pensar');
        if (ind && ind.getAttribute('data-visivel') === '1') {
          window.__hygeaVisto.visivel = true;
          const vid = ind.querySelector('video');
          if (vid) window.__hygeaVisto.tempoVideo = Math.max(window.__hygeaVisto.tempoVideo, vid.currentTime);
        }
        requestAnimationFrame(obs);
      };
      obs();
    });
    await page.fill('.hygea-mini-form input', 'quantos utentes tenho no pim');
    await page.click('.hygea-mini-form button[type="submit"]');
    await page.waitForTimeout(1500);
    const visto = await page.evaluate(() => window.__hygeaVisto);
    ok('A pensar (mini-chat): a animação aparece enquanto a HYGEA prepara a resposta',
      visto.visivel === true, JSON.stringify(visto));
    ok('A pensar (mini-chat): a animação desaparece assim que a resposta chega',
      !(await page.locator('.hygea-mini-form .hygea-pensar').isVisible()), '');
    ok('A pensar (mini-chat): nenhum erro de página/consola', erros.length === 0, erros.join(' | '));
    await ctx.close();
  }

  {
    const { token, perfil } = await signupFarmacia('Hygea61');
    const { ctx, page } = await novaPaginaComSessao(browser, token, perfil, viewports.desktop);
    const erros = coletarErros(page);
    await page.goto(`${BASE}/modulos/hygea-ia.html`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(800);

    // o módulo abre noutra vista; o chat vive no pilar "assistente"
    const abriu = await page.evaluate(() => {
      const alvo = [...document.querySelectorAll('[data-view], .nav-link, button')]
        .find(b => /assistente|pergunt/i.test(b.textContent || ''));
      if (alvo) { alvo.click(); return true; }
      return false;
    });
    await page.waitForTimeout(400);
    ok('A pensar (módulo): o indicador está montado no formulário da pergunta',
      (await page.locator('#formPergunta .hygea-pensar').count()) === 1, `abriu a vista: ${abriu}`);

    await page.evaluate(() => {
      window.__hygeaVisto2 = false;
      const obs = () => {
        const ind = document.querySelector('#formPergunta .hygea-pensar');
        if (ind && ind.getAttribute('data-visivel') === '1') window.__hygeaVisto2 = true;
        requestAnimationFrame(obs);
      };
      obs();
    });
    await page.fill('#inputPergunta', 'quantos utentes tenho no pim');
    await page.click('#formPergunta button[type="submit"]');
    await page.waitForTimeout(1800);
    ok('A pensar (módulo): a animação aparece durante a preparação da resposta',
      await page.evaluate(() => window.__hygeaVisto2) === true, '');
    ok('A pensar (módulo): a animação pára quando a resposta aparece',
      !(await page.locator('#formPergunta .hygea-pensar').isVisible()), '');
    ok('A pensar (módulo): nenhum erro de página/consola', erros.length === 0, erros.join(' | '));
    await ctx.close();
  }
}
