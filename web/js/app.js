/* app.js — router e ecrãs.
   Os identificadores E01..E10 referem-se ao inventário de ecrãs da Fase II.
   O âmbito acompanha o protótipo: não há reconhecimento de LGP nesta versão,
   a pergunta é escrita. Ver camera.js. */

import { store } from "./store.js";
import { SEED, SIMULACAO } from "./seed.js";
import { indexar, marcar, escapar } from "./glossary.js";
import { criarASR, asrDisponivel, verificarMicrofone, verificarRede } from "./asr.js";
import { falar, parar as pararFala, ttsDisponivel } from "./tts.js";
import * as IA from "./ai.js";
import { criarCamara } from "./camera.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $("#app");

store.init(SEED);

/* ───────────────── chrome ───────────────── */

let limpezaEcra = null;

function topo({ kicker = "", titulo = "", voltar = null, direita = "" } = {}) {
  const bar = $("#topbar");
  if (!titulo) { bar.hidden = true; return; }
  bar.hidden = false;
  $("#topbarKicker").textContent = kicker;
  $("#topbarTitle").textContent = titulo;
  $("#btnBack").style.visibility = voltar ? "visible" : "hidden";
  $("#btnBack").onclick = () => { if (typeof voltar === "function") voltar(); else location.hash = voltar; };
  $("#topbarRight").innerHTML = direita;
}

let toastTimer = null;
function toast(msg, ms = 2600) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

function marcarTab(nome) {
  $$(".tab").forEach(t => t.removeAttribute("aria-current"));
  const t = $(`.tab[data-tab="${nome}"]`);
  if (t) t.setAttribute("aria-current", "page");
}

function render(html) { app.innerHTML = html; window.scrollTo(0, 0); }

const horas = ts => new Date(ts).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
const dataCurta = ts => new Date(ts).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
function duracao(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "menos de 1 min";
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}min`;
}
const pct = c => typeof c === "number" ? Math.round(c * 100) + "%" : "";

/* ───────────────── E01 · lista de aulas ───────────────── */

function ecraAulas() {
  marcarTab("aulas");
  topo({
    kicker: "Olá, Rita", titulo: "Próximas aulas",
    direita: `<button class="icon-btn" id="btnCfg" aria-label="Definições" title="Definições">&#9881;</button>`
  });

  const aulas = store.aulas();
  const ativa = store.sessaoAtiva();

  render(`
    <div class="screen">
      ${ativa ? `
        <a class="notice info" href="#/sessao/${ativa.id}" style="display:block">
          <strong>Sessão a decorrer</strong>
          ${escapar(store.aula(ativa.aulaId)?.titulo || "Aula")} · começou às ${horas(ativa.inicio)}. Toca para voltar.
        </a>` : ""}

      ${aulas.length ? aulas.map(a => `
        <button class="card tappable" data-aula="${a.id}">
          <span class="aula-uc">${escapar(a.uc)} · Aula ${a.numero}</span>
          <div class="aula-titulo">${escapar(a.titulo)}</div>
          <div class="aula-meta">
            <span>${escapar(a.quando)}</span>
            <span>sala ${escapar(a.sala)}</span>
            <span>Doc. ${escapar(a.docente)}</span>
          </div>
          ${a.glossario
            ? `<span class="badge ok dot">Glossário pronto · ${a.glossario.termos.length} termos</span>`
            : `<span class="badge warn dot">Sem materiais submetidos</span>`}
        </button>`).join("") : `
        <div class="empty"><div class="big">&#9707;</div><p>Ainda não há aulas.</p></div>`}
    </div>`);

  $$("[data-aula]").forEach(b => b.onclick = () => location.hash = `#/aula/${b.dataset.aula}`);
  $("#btnCfg").onclick = () => location.hash = "#/config";
}

/* ───────────────── E03 · preparar a sessão ───────────────── */

async function ecraPreparar(id) {
  const a = store.aula(id);
  if (!a) return (location.hash = "#/aulas");
  marcarTab("aulas");
  topo({ kicker: `${a.uc} · Aula ${a.numero}`, titulo: a.titulo, voltar: "#/aulas" });

  const cfg = store.config();
  const temGloss = !!a.glossario;

  render(`
    <div class="screen">
      <div class="aula-meta">
        <span>${escapar(a.quando)}</span><span>sala ${escapar(a.sala)}</span><span>Doc. ${escapar(a.docente)}</span>
      </div>

      <div class="card">
        <label class="switch-row" for="simToggle">
          <span class="grow">
            <b>Modo de simulação</b>
            <span class="muted small" id="simDesc">${cfg.simulacao
              ? "Ligado: legendas de exemplo, sem áudio nem vídeo reais."
              : "Desligado: usa microfone e ficheiros reais."}</span>
          </span>
          <input type="checkbox" id="simToggle" role="switch" ${cfg.simulacao ? "checked" : ""}>
          <span class="switch" aria-hidden="true"></span>
        </label>
      </div>

      <div id="verificacoes"></div>

      ${temGloss ? `
        <div class="notice ok">
          <strong>Glossário pronto</strong>
          Extraído dos ${escapar(a.glossario.origem)}. A legendagem já conhece estes termos.
        </div>
        <div class="card">
          <div class="row between" style="margin-bottom:10px">
            <b>Termos extraídos</b>
            <span class="muted">${a.glossario.termos.length}</span>
          </div>
          <div class="chips" id="chips">
            ${a.glossario.termos.slice(0, 6).map(t =>
              `<span class="chip">${escapar(t.termo)}<i class="conf${t.confianca < 0.9 ? " baixa" : ""}">${pct(t.confianca)}</i></span>`).join("")}
          </div>
          ${a.glossario.termos.length > 6
            ? `<button class="btn ghost sm" id="verTodos" style="margin-top:10px;padding-left:0">ver todos (${a.glossario.termos.length})</button>` : ""}
        </div>
        <button class="btn" id="btnIniciar">&#9654; Iniciar sessão</button>
      ` : `
        <div class="notice warn">
          <strong>Sem materiais desta aula</strong>
          A legendagem vai funcionar, mas a precisão nos termos técnicos fica reduzida.
        </div>
        <h3 style="margin-top:4px">O que queres fazer?</h3>
        <div class="stack">
          <button class="choice" id="opSubmeter">
            <span class="ic">&#8681;</span>
            <span class="grow"><b>Carregar eu os slides</b><span>Se os tiveres no Moodle ou no email da turma</span></span>
            <span class="pill">recomendado</span>
          </button>
          <button class="choice" id="opPedir">
            <span class="ic">&#9993;</span>
            <span class="grow"><b>Pedir ao docente</b><span>Envia um pedido num toque</span></span>
          </button>
          <button class="choice" id="opSem">
            <span class="ic">&#9211;</span>
            <span class="grow"><b>Continuar sem glossário</b><span>Os termos técnicos ficam marcados como incertos</span></span>
          </button>
        </div>
      `}
    </div>`);

  $("#simToggle").onchange = (e) => {
    store.guardarConfig({ simulacao: e.target.checked });
    $("#simDesc").textContent = e.target.checked
      ? "Ligado: legendas de exemplo, sem áudio nem vídeo reais."
      : "Desligado: usa microfone e ficheiros reais.";
    correrVerificacoes();
  };

  // RF02 — verificação de microfone e rede antes de entrar na sessão.
  async function correrVerificacoes() {
    const box = $("#verificacoes");
    if (!box) return;
    if (store.config().simulacao) { box.innerHTML = ""; return; }
    box.innerHTML = `<div class="notice info" style="margin:0"><strong>A verificar</strong>Microfone e ligação à rede…</div>`;
    const [mic, rede] = await Promise.all([verificarMicrofone(), Promise.resolve(verificarRede())]);
    if (!$("#verificacoes")) return;
    const falhas = [];
    if (!mic.ok) falhas.push(mic.motivo === "recusado" ? "o microfone foi recusado" : "não há microfone disponível");
    if (!rede.ok) falhas.push("não há ligação à rede");
    $("#verificacoes").innerHTML = falhas.length
      ? `<div class="notice warn" style="margin:0"><strong>Atenção antes de começar</strong>Neste dispositivo ${falhas.join(" e ")}. Liga o modo de simulação para ver o fluxo.</div>`
      : `<div class="notice ok" style="margin:0"><strong>Microfone e rede verificados</strong>Está tudo pronto para legendar.</div>`;
  }
  correrVerificacoes();

  $("#btnIniciar") && ($("#btnIniciar").onclick = () => iniciarSessao(a.id));
  $("#opSubmeter") && ($("#opSubmeter").onclick = () => location.hash = `#/material/${a.id}`);
  $("#opSem") && ($("#opSem").onclick = () => iniciarSessao(a.id));
  $("#opPedir") && ($("#opPedir").onclick = () => {
    toast("Pedido enviado ao docente (simulado)");
    setTimeout(() => iniciarSessao(a.id), 900);
  });
  $("#verTodos") && ($("#verTodos").onclick = () => {
    $("#chips").innerHTML = a.glossario.termos.map(t =>
      `<span class="chip">${escapar(t.termo)}<i class="conf${t.confianca < 0.9 ? " baixa" : ""}">${pct(t.confianca)}</i></span>`).join("");
    $("#verTodos").remove();
  });
}

function iniciarSessao(aulaId) {
  const existente = store.sessaoAtiva();
  const s = (existente && existente.aulaId === aulaId) ? existente : store.criarSessao(aulaId);
  location.hash = `#/sessao/${s.id}`;
}

/* ───────────────── E02 · submeter material ───────────────── */

function ecraMaterial(id) {
  const a = store.aula(id);
  if (!a) return (location.hash = "#/aulas");
  marcarTab("aulas");
  topo({ kicker: `${a.uc} · Aula ${a.numero}`, titulo: "Carregar os slides", voltar: `#/aula/${a.id}` });

  render(`
    <div class="screen">
      <p class="muted">O texto dos slides serve para gerar o glossário da aula. O ficheiro não sai do dispositivo: só o texto extraído é enviado à IAG, e apenas se tiveres chave configurada.</p>

      <div class="dropzone" id="dz">
        <div style="font-size:30px;opacity:.5">&#8681;</div>
        <b>Toca para escolher um ficheiro</b>
        <div class="muted small" style="margin-top:4px">PDF, TXT ou Markdown</div>
        <input type="file" id="ficheiro" accept=".pdf,.txt,.md,text/plain" hidden>
      </div>

      <details class="card">
        <summary style="cursor:pointer;font-weight:600">Ou colar o texto diretamente</summary>
        <textarea id="colar" class="pergunta-box" style="margin-top:12px;font-size:15px;font-weight:400;min-height:160px" placeholder="Cola aqui o texto dos slides…"></textarea>
        <button class="btn sm" id="btnColar" style="margin-top:10px;width:100%">Usar este texto</button>
      </details>

      <div id="estado"></div>
    </div>`);

  const dz = $("#dz"), input = $("#ficheiro");
  dz.onclick = () => input.click();
  dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); };
  dz.ondragleave = () => dz.classList.remove("over");
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) processar(e.dataTransfer.files[0]); };
  input.onchange = () => input.files[0] && processar(input.files[0]);
  $("#btnColar").onclick = () => {
    const t = $("#colar").value.trim();
    if (t.length < 50) return toast("Cola pelo menos um parágrafo de texto.");
    gerar(t, "texto colado");
  };

  async function processar(f) {
    const estado = $("#estado");
    estado.innerHTML = `<div class="notice info"><strong>A ler ${escapar(f.name)}</strong>A extrair o texto…</div>`;
    try {
      const texto = f.name.toLowerCase().endsWith(".pdf") ? await lerPDF(f) : await f.text();
      if (!texto || texto.trim().length < 50) {
        // RF17 — material sem texto extraível
        estado.innerHTML = `<div class="notice warn"><strong>Sem texto extraível</strong>Este ficheiro parece ser só imagens. Usa a opção de colar o texto, ou pede ao docente uma versão com texto.</div>`;
        return;
      }
      gerar(texto, f.name);
    } catch (e) {
      estado.innerHTML = `<div class="notice danger"><strong>Não foi possível ler o ficheiro</strong>${escapar(e.message || "erro desconhecido")}. Podes colar o texto em alternativa.</div>`;
    }
  }

  async function gerar(texto, nome) {
    const estado = $("#estado");
    estado.innerHTML = `<div class="notice info"><strong>A gerar o glossário</strong>${IA.temChave() ? "A IAG está a identificar a terminologia da disciplina…" : "Sem chave da IAG: a usar a heurística local."}</div>`;
    try {
      const { termos, origem } = await IA.gerarGlossario(texto, { nomeFicheiro: nome });
      if (!termos.length) {
        estado.innerHTML = `<div class="notice warn"><strong>Glossário vazio</strong>Não foi identificada terminologia da disciplina neste material.</div>`;
        return;
      }
      a.material = { nome, submetidoPor: "aluno" };
      a.glossario = { geradoEm: Date.now(), origem, termos };
      store.guardarAula(a);
      estado.innerHTML = `
        <div class="notice ok"><strong>Glossário gerado · ${termos.length} termos</strong>Origem: ${escapar(origem)}</div>
        <div class="card" style="margin-top:12px"><div class="chips">${termos.slice(0, 12).map(t => `<span class="chip">${escapar(t.termo)}</span>`).join("")}</div></div>
        <button class="btn" id="irAula" style="margin-top:14px">Continuar</button>`;
      $("#irAula").onclick = () => location.hash = `#/aula/${a.id}`;
    } catch (e) {
      estado.innerHTML = `<div class="notice danger"><strong>A IAG falhou</strong>${escapar(e.message)}. O glossário local foi usado em alternativa.</div>`;
    }
  }
}

async function lerPDF(f) {
  const V = "4.0.379";
  const pdfjs = await import(/* @vite-ignore */ `https://cdn.jsdelivr.net/npm/pdfjs-dist@${V}/build/pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${V}/build/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const tc = await p.getTextContent();
    out += `\n[slide ${i}] ` + tc.items.map(it => it.str).join(" ");
  }
  return out;
}

/* ───────────────── E04 · sessão ao vivo ───────────────── */

function ecraSessao(sid) {
  const s = store.sessao(sid);
  if (!s) return (location.hash = "#/aulas");
  if (s.fim) return (location.hash = `#/resumo/${s.id}`);
  const a = store.aula(s.aulaId);
  marcarTab("sessao");

  const indice = indexar(a?.glossario?.termos || []);
  const simular = !!store.config().simulacao;

  topo({
    kicker: `${a?.uc || ""} · Aula ${a?.numero || ""}`,
    titulo: a?.titulo || "Sessão",
    voltar: "#/aulas",
    direita: `<button class="icon-btn" id="btnAjustes" aria-label="Ajustes da legenda" title="Ajustes da legenda">&#9881;</button>`
  });

  render(`
    <div class="screen">
      <div class="sess-status">
        <span class="pulse" id="pulso"></span>
        <span id="estadoSess">${simular ? "Simulação · a legendar" : "A ligar…"}</span>
        <span class="right" id="relogio">00:00</span>
      </div>
      <div class="sess-sub">${escapar(a?.uc || "")} · ${escapar(a?.titulo || "")}</div>
      ${simular ? `<div class="notice warn" style="margin:0">Modo de simulação — legendas de exemplo, sem áudio nem vídeo reais.</div>` : ""}
      ${a?.glossario ? "" : `<div class="notice warn" style="margin:0"><strong>Aula sem glossário</strong>Os termos técnicos não são contextualizados.</div>`}
      <div id="legenda"></div>
      <div id="parcial" class="linha parcial" hidden><span class="t"></span><span class="txt"></span></div>
      <div style="height:90px"></div>
    </div>
    <div class="sess-actions">
      <button class="act" id="btnPausar"><span class="ico">&#10073;&#10073;</span><span>Pausar</span></button>
      <button class="act fab" id="btnPerguntar"><span class="ico">&#9995;</span><span>Fazer uma<br>pergunta</span></button>
      <button class="act danger" id="btnTerminar"><span class="ico">&#9632;</span><span>Terminar</span></button>
    </div>`);

  const elLegenda = $("#legenda"), elParcial = $("#parcial"), elEstado = $("#estadoSess");

  function pintar() {
    elLegenda.innerHTML = s.linhas.map(l => `
      <div class="linha">
        <span class="t">${horas(l.t)}</span>
        <span class="txt">${marcar(l.texto, indice)}</span>
      </div>`).join("");
    window.scrollTo(0, document.body.scrollHeight);
  }
  pintar();

  const relogio = setInterval(tick, 1000); tick();
  function tick() {
    const el = $("#relogio");
    if (!el) return;
    const d = Math.floor((Date.now() - s.inicio) / 1000);
    el.textContent = `${String(Math.floor(d / 60)).padStart(2, "0")}:${String(d % 60).padStart(2, "0")}`;
  }

  function acrescentar(texto, confianca) {
    if (!texto) return;
    s.linhas.push({ t: Date.now(), texto, confianca });
    store.guardarSessao(s);
    pintar();
  }

  /* --- fontes: microfone real ou simulação --- */
  let simTimer = null, simIdx = 0, emPausa = false;

  const asr = criarASR({
    lingua: "pt-PT",
    onParcial: (t) => { elParcial.hidden = false; $(".txt", elParcial).textContent = t; },
    onFinal: ({ texto, confianca }) => { elParcial.hidden = true; acrescentar(texto, confianca); },
    onEstado: (e) => {
      if (simular || emPausa) return;
      elEstado.textContent = ({
        "a-ouvir": "A legendar", "a-retomar": "A retomar…",
        "sem-permissao": "Microfone recusado", "parado": "Em pausa"
      })[e] || e;
    },
    onErro: (e) => { if (e.message === "network") toast("Ligação perdida. A app retoma sozinha."); }
  });

  function arrancarSimulacao() {
    const guiao = SIMULACAO[s.aulaId] || SIMULACAO["prog-6"];
    simTimer = setInterval(() => {
      acrescentar(guiao[simIdx % guiao.length], 0.86 + Math.random() * 0.12);
      simIdx++;
    }, 3200);
  }

  if (simular) arrancarSimulacao();
  else if (asrDisponivel) asr.iniciar();
  else {
    elEstado.textContent = "Sem reconhecimento de fala";
    toast("Este browser não suporta reconhecimento de fala. Liga o modo de simulação.");
  }

  $("#btnPausar").onclick = () => {
    emPausa = !emPausa;
    const b = $("#btnPausar");
    if (emPausa) {
      if (simTimer) { clearInterval(simTimer); simTimer = null; } else asr.parar();
      elEstado.textContent = "Em pausa";
      $("#pulso").classList.add("parado");
      b.querySelector("span:last-child").textContent = "Retomar";
      b.querySelector(".ico").innerHTML = "&#9654;";
    } else {
      if (simular) arrancarSimulacao(); else asr.iniciar();
      elEstado.textContent = simular ? "Simulação · a legendar" : "A legendar";
      $("#pulso").classList.remove("parado");
      b.querySelector("span:last-child").textContent = "Pausar";
      b.querySelector(".ico").innerHTML = "&#10073;&#10073;";
    }
  };

  elLegenda.addEventListener("click", (ev) => {
    const el = ev.target.closest(".termo");
    if (el) abrirTermo(el.dataset.termo, s, a);
  });

  $("#btnAjustes").onclick = () => location.hash = "#/config";
  $("#btnPerguntar").onclick = () => abrirPergunta(s);
  $("#btnTerminar").onclick = () => {
    s.fim = Date.now();
    store.guardarSessao(s);
    location.hash = `#/resumo/${s.id}`;
  };

  limpezaEcra = () => { asr.parar(); clearInterval(relogio); if (simTimer) clearInterval(simTimer); };
}

/* --- folha de explicação do termo (estado do E04) --- */

async function abrirTermo(termo, s, a) {
  const dados = (a?.glossario?.termos || []).find(t => t.termo === termo);
  const back = document.createElement("div");
  back.className = "sheet-back";
  back.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Significado de ${escapar(termo)}">
      <div class="sheet-grip"></div>
      <div class="row between" style="margin-bottom:8px">
        <h3 style="margin:0">${escapar(termo)}</h3>
        ${dados && typeof dados.confianca === "number"
          ? `<span class="badge ${dados.confianca < 0.9 ? "warn" : "ok"}">${pct(dados.confianca)} de confiança</span>` : ""}
      </div>
      <div class="corpo" id="corpoTermo"><span class="muted">A procurar…</span></div>
      <button class="btn sec" id="fecharTermo" style="margin-top:20px">Fechar</button>
    </div>`;
  document.body.appendChild(back);

  const fechar = () => back.remove();
  $("#fecharTermo", back).onclick = fechar;
  back.onclick = e => { if (e.target === back) fechar(); };

  if (!s.consultas.includes(termo)) { s.consultas.push(termo); store.guardarSessao(s); }

  const contexto = s.linhas.slice(-6).map(l => l.texto).join(" ");
  try {
    const r = await IA.explicarTermo(termo, { contexto, material: "" });
    const corpo = $("#corpoTermo", back);
    if (!corpo) return;
    if (!r.texto) {
      corpo.innerHTML = `<div class="notice warn" style="margin:0"><strong>Sem informação suficiente</strong>Os materiais desta aula não explicam este termo.${IA.temChave() ? "" : " Configura uma chave da IAG nas definições."}</div>`;
      return;
    }
    corpo.innerHTML = escapar(r.texto)
      + (r.slide ? `<div><span class="origem">&#9633; origem: slide ${r.slide} da aula</span></div>` : "")
      + (r.origem ? `<div class="muted small" style="margin-top:8px">${escapar(r.origem)}</div>` : "");
  } catch (e) {
    const corpo = $("#corpoTermo", back);
    if (corpo) corpo.innerHTML = `<div class="notice danger" style="margin:0"><strong>Não foi possível explicar</strong>${escapar(e.message)}</div>`;
  }
}

/* ───────────────── E06/E07 · pergunta (sobreposição do E04) ───────────────── */

function abrirPergunta(s) {
  const back = document.createElement("div");
  back.className = "sheet-back pergunta";
  back.innerHTML = `
    <div class="sheet alta" role="dialog" aria-modal="true" aria-label="Fazer uma pergunta">
      <div class="sheet-grip"></div>
      <div id="passo"></div>
    </div>`;
  document.body.appendChild(back);

  const passo = $("#passo", back);
  let camara = null;

  const fechar = () => { if (camara) camara.parar(); back.remove(); };
  back.onclick = e => { if (e.target === back) fechar(); };

  /* E06 — enquadramento. A app diz com todas as letras que não reconhece
     o gesto: prometer reconhecimento e entregar adivinhação era pior. */
  function passoCamara() {
    passo.innerHTML = `
      <h3>Faz a tua pergunta em LGP</h3>
      <div class="notice warn" style="margin:10px 0 12px">
        A câmara não reconhece LGP. Escreve a pergunta antes de a dizer em voz alta.
      </div>
      <div class="camera-wrap">
        <video id="cam" autoplay playsinline muted></video>
        <div class="camera-hint" id="hint">A pedir acesso à câmara…</div>
      </div>
      <p class="muted small" style="margin-top:10px">A imagem fica no teu dispositivo e não é gravada.</p>
      <button class="btn" id="btnEscrever" style="margin-top:6px">Escrever a pergunta</button>
      <button class="btn ghost" id="btnCancelar">Cancelar</button>`;

    camara = criarCamara({
      video: $("#cam", back),
      onErro: () => {
        const h = $("#hint", back);
        if (h) h.textContent = "Não foi possível abrir a câmara. Verifica as permissões ou escreve a pergunta.";
      }
    });
    camara.iniciar().then(ok => { const h = $("#hint", back); if (ok && h) h.textContent = "Enquadra-te dentro do rectângulo."; });

    $("#btnEscrever", back).onclick = () => { camara.parar(); passoEscrever(); };
    $("#btnCancelar", back).onclick = fechar;
  }

  /* E07 — confirmar e dizer */
  function passoEscrever() {
    const vol = store.config().volume ?? 1;
    passo.innerHTML = `
      <h3>Escrever a pergunta</h3>
      <textarea id="txtPergunta" class="pergunta-box" style="margin-top:12px" placeholder="Escreve aqui a tua pergunta…" aria-label="Pergunta"></textarea>
      <div class="notice warn" style="margin:14px 0 12px">
        Isto vai ser dito em voz alta na sala. Confirma antes de enviar.
      </div>
      <div class="field" style="margin-bottom:12px">
        <label for="vol">Volume</label>
        <input type="range" id="vol" min="0" max="1" step="0.05" value="${vol}">
      </div>
      <button class="btn" id="btnDizer">&#128266; Dizer em voz alta</button>
      <button class="btn ghost" id="btnCancelar2">Cancelar</button>`;

    $("#txtPergunta", back).focus();
    $("#vol", back).oninput = e => store.guardarConfig({ volume: Number(e.target.value) });
    $("#btnCancelar2", back).onclick = fechar;
    $("#btnDizer", back).onclick = async () => {
      const texto = $("#txtPergunta", back).value.trim();
      if (!texto) return toast("Escreve a pergunta primeiro.");
      if (!ttsDisponivel) return toast("Este dispositivo não tem síntese de voz.");

      s.perguntas.push({ t: Date.now(), texto });
      store.guardarSessao(s);

      passo.innerHTML = `
        <div class="speaking">
          <div class="bars"><i></i><i></i><i></i><i></i><i></i></div>
          <div style="font-size:20px;font-weight:600;text-align:center">«${escapar(texto)}»</div>
          <div class="muted" id="estadoFala">A dizer em voz alta…</div>
        </div>`;

      await falar(texto, { lingua: "pt-PT", volume: store.config().volume ?? 1 });
      const el = $("#estadoFala", back);
      if (el) {
        el.textContent = "A pergunta foi dita.";
        passo.insertAdjacentHTML("beforeend", `<button class="btn" id="voltarAula">Voltar à aula</button>`);
        $("#voltarAula", back).onclick = fechar;
      }
    };
  }

  passoCamara();
}

/* ───────────────── E08/E09 · resumo ───────────────── */

async function ecraResumo(sid) {
  const s = store.sessao(sid);
  if (!s) return (location.hash = "#/aulas");
  const a = store.aula(s.aulaId);
  marcarTab("historico");
  topo({ kicker: `${a?.uc || ""} · Aula ${a?.numero || ""}`, titulo: a?.titulo || "Resumo", voltar: "#/historico" });

  const transcricao = s.linhas.map(l => l.texto).join(" ");

  render(`
    <div class="screen">
      <div class="muted small">${dataCurta(s.inicio)} · ${duracao((s.fim || Date.now()) - s.inicio)}</div>
      <div id="vista"></div>
    </div>`);

  if (!s.resumo) {
    $("#vista").innerHTML = `<div class="notice info"><strong>A gerar o material de revisão</strong>${IA.temChave() ? "A IAG está a resumir a aula…" : "Sem chave da IAG: a usar a heurística local, que é pobre."}</div>`;
    try {
      const r = await IA.gerarResumoEFicha(transcricao, { material: "", titulo: a?.titulo || "" });
      s.resumo = { pontos: r.pontos, origem: r.origem };
      s.ficha = r.perguntas;
    } catch (e) {
      s.resumo = { pontos: [], origem: "falhou: " + e.message };
      s.ficha = [];
    }
    store.guardarSessao(s);
  }

  const pontos = s.resumo?.pontos || [];
  $("#vista").innerHTML = `
    <div class="card">
      <b>Pontos principais</b>
      ${pontos.length ? pontos.map((p, i) => `
        <div class="ponto">
          <span class="n">${i + 1}</span>
          <span class="corpo">${escapar(p.texto)}
            ${p.slide ? `<span class="slide-ref">slide ${p.slide}</span>` : ""}
            ${p.incerto ? `<span class="slide-ref incerto">incerto</span>` : ""}
          </span>
        </div>`).join("") : `<p class="muted" style="margin-top:10px">Não foi possível gerar pontos a partir desta sessão.</p>`}
      <div class="muted small" style="margin-top:12px">origem: ${escapar(s.resumo?.origem || "—")}</div>
    </div>

    ${a?.glossario ? `<div class="card"><b>Termos desta aula</b>
      <div class="chips" style="margin-top:10px">${a.glossario.termos.map(t =>
        `<span class="chip${s.consultas.includes(t.termo) ? "" : " plain"}">${escapar(t.termo)}</span>`).join("")}</div>
      <div class="muted small" style="margin-top:10px">a amarelo, os termos que consultaste durante a aula</div></div>` : ""}

    <div class="row" style="gap:10px">
      <a class="btn sec" href="#/revisao/${s.id}">Ficha de revisão</a>
      <button class="btn sec" id="btnExportar">Exportar</button>
    </div>

    <div class="notice info">Não foi guardado áudio nem vídeo desta aula.</div>`;

  $("#btnExportar").onclick = () => exportar(s, a);
}

/** Exportar leva o resumo, a ficha e a transcrição completa — é aqui que o
 *  E08 (transcrição guardada) chega às mãos do aluno. */
function exportar(s, a) {
  const L = [];
  L.push(`# ${a?.uc || "Aula"} · Aula ${a?.numero || ""} — ${a?.titulo || ""}`);
  L.push(`${new Date(s.inicio).toLocaleString("pt-PT")} · ${duracao((s.fim || Date.now()) - s.inicio)}`, "");
  L.push("## Pontos principais", "");
  (s.resumo?.pontos || []).forEach((p, i) =>
    L.push(`${i + 1}. ${p.texto}${p.slide ? ` (slide ${p.slide})` : ""}${p.incerto ? " [incerto]" : ""}`));
  if (s.ficha?.length) {
    L.push("", "## Ficha de revisão", "");
    s.ficha.forEach((q, i) => L.push(`${i + 1}. ${q.pergunta}`, `   R: ${q.resposta}`, ""));
  }
  if (a?.glossario) {
    L.push("", "## Termos da aula", "");
    a.glossario.termos.forEach(t => L.push(`- ${t.termo}${t.explicacao ? `: ${t.explicacao}` : ""}`));
  }
  L.push("", "## Transcrição", "");
  s.linhas.forEach(l => L.push(`[${horas(l.t)}] ${l.texto}`));
  L.push("", "_Não foi guardado áudio nem vídeo desta aula._");

  const blob = new Blob([L.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url;
  el.download = `${(a?.uc || "aula").toLowerCase().replace(/\s+/g, "-")}-aula${a?.numero || ""}.md`;
  el.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast("Exportado.");
}

/* ───────────────── ficha de revisão ───────────────── */

function ecraRevisao(sid) {
  const s = store.sessao(sid);
  if (!s) return (location.hash = "#/aulas");
  const a = store.aula(s.aulaId);
  marcarTab("historico");
  topo({ kicker: "Ficha de revisão", titulo: a?.titulo || "Revisão", voltar: `#/resumo/${s.id}` });

  const qs = s.ficha || [];
  render(`
    <div class="screen">
      ${qs.length ? `<div class="card">${qs.map((q, i) => `
        <div class="qa">
          <div class="q">${i + 1}. ${escapar(q.pergunta)} ${q.slide ? `<span class="slide-ref">slide ${q.slide}</span>` : ""}</div>
          <button class="btn ghost sm" data-resp="${i}" style="padding-left:0">Mostrar resposta</button>
          <div class="a" id="resp${i}" hidden>${escapar(q.resposta)}</div>
        </div>`).join("")}</div>`
      : `<div class="empty"><div class="big">&#9634;</div><p>Sem ficha de revisão para esta sessão.${IA.temChave() ? "" : " Configura uma chave da IAG para a gerar."}</p></div>`}
    </div>`);

  $$("[data-resp]").forEach(b => b.onclick = () => {
    const d = $("#resp" + b.dataset.resp);
    d.hidden = !d.hidden;
    b.textContent = d.hidden ? "Mostrar resposta" : "Esconder resposta";
  });
}

/* ───────────────── E10 · histórico ───────────────── */

function ecraHistorico() {
  marcarTab("historico");
  topo({ kicker: "Sessões anteriores", titulo: "Histórico" });

  const ss = store.sessoes().filter(s => s.fim);
  render(`
    <div class="screen">
      ${ss.length ? ss.map(s => {
        const a = store.aula(s.aulaId);
        return `<button class="card tappable" data-sessao="${s.id}">
          <div class="muted small">${dataCurta(s.inicio)} · ${duracao(s.fim - s.inicio)}</div>
          <div class="aula-titulo" style="margin:4px 0 4px">${escapar(a?.uc || "Sessão")}</div>
          <div class="muted small">${escapar((s.resumo?.pontos?.[0]?.texto || a?.titulo || "").slice(0, 90))}</div>
        </button>`;
      }).join("") : `<div class="empty"><div class="big">&#8635;</div><p>Ainda não terminaste nenhuma sessão.</p></div>`}
    </div>`);

  $$("[data-sessao]").forEach(b => b.onclick = () => location.hash = `#/resumo/${b.dataset.sessao}`);
}

/* ───────────────── definições ───────────────── */

function ecraConfig() {
  topo({ kicker: "Definições", titulo: "IAG e privacidade", voltar: () => history.back() });
  const c = store.config();

  render(`
    <div class="screen">
      <div class="notice info">
        <strong>A app funciona sem chave</strong>
        Sem IAG, o glossário usa uma heurística local e o resumo fica pobre. A legendagem e a marcação de termos funcionam sempre.
      </div>

      <div class="field">
        <label for="key">Chave da API Gemini</label>
        <input id="key" type="password" value="${escapar(c.geminiKey)}" placeholder="AIza…" autocomplete="off">
      </div>
      <div class="field">
        <label for="modelo">Modelo</label>
        <div class="row" style="gap:8px">
          <input id="modelo" class="grow" value="${escapar(c.modelo)}" placeholder="gemini-flash-latest" autocomplete="off" list="listaModelos">
          <datalist id="listaModelos"></datalist>
          <button class="btn sec sm" id="procurar" style="flex:0 0 auto">Procurar</button>
        </div>
        <span class="muted small">«Procurar» pergunta à API que modelos a tua chave consegue chamar.</span>
      </div>
      <div id="modelos"></div>

      <div class="row" style="gap:10px">
        <button class="btn" id="guardar">Guardar</button>
        <button class="btn sec" id="testar">Testar</button>
      </div>
      <div id="res"></div>

      <div class="notice warn">
        <strong>A chave fica neste dispositivo</strong>
        Numa versão de produção as chamadas passariam por um servidor próprio — é lá que entraria também o vocabulário personalizado do reconhecimento de fala, que a Web Speech API não suporta.
      </div>

      <button class="btn ghost" id="apagar">Apagar todos os dados locais</button>
    </div>`);

  $("#guardar").onclick = () => {
    store.guardarConfig({ geminiKey: $("#key").value.trim(), modelo: $("#modelo").value.trim() || "gemini-flash-latest" });
    toast("Guardado.");
  };

  $("#procurar").onclick = async () => {
    const chave = $("#key").value.trim();
    if (!chave) return toast("Põe a chave primeiro.");
    store.guardarConfig({ geminiKey: chave });
    $("#modelos").innerHTML = `<div class="notice info" style="margin:0">A perguntar à API…</div>`;
    try {
      const ms = await IA.listarModelos();
      if (!ms.length) {
        $("#modelos").innerHTML = `<div class="notice warn" style="margin:0"><strong>Nenhum modelo disponível</strong>A chave é válida mas não tem modelos com generateContent.</div>`;
        return;
      }
      $("#listaModelos").innerHTML = ms.map(m => `<option value="${escapar(m.id)}">${escapar(m.nome)}</option>`).join("");
      $("#modelos").innerHTML = `
        <div class="card">
          <div class="row between" style="margin-bottom:10px"><b>Modelos disponíveis</b><span class="muted">${ms.length}</span></div>
          <div class="chips">${ms.map(m => `<button class="chip plain" data-modelo="${escapar(m.id)}">${escapar(m.id)}</button>`).join("")}</div>
          <div class="muted small" style="margin-top:10px">Toca num para o escolher. Para esta app serve qualquer «flash» — é mais barato e rápido do que os «pro».</div>
        </div>`;
      $$("[data-modelo]").forEach(b => b.onclick = () => {
        $("#modelo").value = b.dataset.modelo;
        store.guardarConfig({ modelo: b.dataset.modelo });
        toast(b.dataset.modelo + " escolhido.");
      });
    } catch (e) {
      $("#modelos").innerHTML = `<div class="notice danger" style="margin:0"><strong>Não foi possível listar</strong>${escapar(e.message)}</div>`;
    }
  };
  $("#testar").onclick = async () => {
    store.guardarConfig({ geminiKey: $("#key").value.trim(), modelo: $("#modelo").value.trim() || "gemini-flash-latest" });
    $("#res").innerHTML = `<div class="notice info">A testar…</div>`;
    const r = await IA.testarChave();
    $("#res").innerHTML = r.ok
      ? `<div class="notice ok"><strong>A chave funciona</strong></div>`
      : `<div class="notice danger"><strong>Falhou</strong>${escapar(r.erro)}</div>`;
  };
  $("#apagar").onclick = () => {
    if (!confirm("Apagar aulas e sessões deste dispositivo?")) return;
    store.limpar();
    store.init(SEED);
    location.hash = "#/aulas";
    toast("Dados apagados.");
  };
}

/* ───────────────── router ───────────────── */

const rotas = [
  [/^#\/aulas$/,            () => ecraAulas()],
  [/^#\/aula\/(.+)$/,       m => ecraPreparar(m[1])],
  [/^#\/material\/(.+)$/,   m => ecraMaterial(m[1])],
  [/^#\/sessao$/,           () => { const s = store.sessaoAtiva(); location.hash = s ? `#/sessao/${s.id}` : "#/aulas"; }],
  [/^#\/sessao\/(.+)$/,     m => ecraSessao(m[1])],
  [/^#\/resumo\/(.+)$/,     m => ecraResumo(m[1])],
  [/^#\/revisao\/(.+)$/,    m => ecraRevisao(m[1])],
  [/^#\/historico$/,        () => ecraHistorico()],
  [/^#\/config$/,           () => ecraConfig()]
];

function encaminhar() {
  if (limpezaEcra) { try { limpezaEcra(); } catch (e) { console.error(e); } limpezaEcra = null; }
  $$(".sheet-back").forEach(el => el.remove());
  pararFala();
  const h = location.hash || "#/aulas";
  for (const [re, fn] of rotas) {
    const m = h.match(re);
    if (m) return fn(m);
  }
  location.hash = "#/aulas";
}

window.addEventListener("hashchange", encaminhar);
window.addEventListener("beforeunload", () => { if (limpezaEcra) limpezaEcra(); });
if (!location.hash) location.hash = "#/aulas";
encaminhar();
