/* app.js — router e ecrãs.
   Os identificadores E01..E10 referem-se ao inventário de ecrãs da Fase II. */

import { store } from "./store.js";
import { SEED, SIMULACAO } from "./seed.js";
import { indexar, marcar, escapar, normalizar } from "./glossary.js";
import { criarASR, asrDisponivel, verificarMicrofone, verificarRede } from "./asr.js";
import { falar, parar as pararFala, ttsDisponivel } from "./tts.js";
import * as IA from "./ai.js";
import * as LGP from "./lgp.js";

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

function render(html) { app.innerHTML = html; app.scrollTop = 0; window.scrollTo(0, 0); }

const horas = ts => new Date(ts).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
const dataCurta = ts => new Date(ts).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
function duracao(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}min`;
}

/* ───────────────── E01 · lista de aulas ───────────────── */

function ecraAulas() {
  marcarTab("aulas");
  topo({ kicker: "Olá, Rita", titulo: "Próximas aulas", direita: `<button class="icon-btn" id="btnCfg" aria-label="Definições">&#9881;</button>` });

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

      <button class="btn ghost" id="btnTreino">Treinar gestos de LGP</button>
    </div>`);

  $$("[data-aula]").forEach(b => b.onclick = () => location.hash = `#/aula/${b.dataset.aula}`);
  $("#btnCfg").onclick = () => location.hash = "#/config";
  $("#btnTreino").onclick = () => location.hash = "#/treino";
}

/* ───────────────── E03 · preparar a sessão ───────────────── */

async function ecraPreparar(id) {
  const a = store.aula(id);
  if (!a) return (location.hash = "#/aulas");
  marcarTab("aulas");
  topo({ kicker: `${a.uc} · Aula ${a.numero}`, titulo: a.titulo, voltar: "#/aulas" });

  const temGloss = !!a.glossario;
  render(`
    <div class="screen">
      <div class="aula-meta">
        <span>${escapar(a.quando)}</span><span>sala ${escapar(a.sala)}</span><span>Doc. ${escapar(a.docente)}</span>
      </div>

      <div id="verificacoes" class="notice info"><strong>A verificar</strong>Microfone e ligação à rede…</div>

      ${temGloss ? `
        <div class="notice ok">
          <strong>Glossário pronto</strong>
          Extraído de ${escapar(a.glossario.origem)}. A legendagem já conhece estes termos.
        </div>
        <div class="card">
          <div class="row between" style="margin-bottom:10px">
            <b>Termos extraídos</b>
            <span class="muted">${a.glossario.termos.length}</span>
          </div>
          <div class="chips">
            ${a.glossario.termos.slice(0, 8).map(t => `<span class="chip">${escapar(t.termo)}</span>`).join("")}
          </div>
          ${a.glossario.termos.length > 8 ? `<button class="btn ghost sm" id="verTodos" style="margin-top:10px;padding-left:0">ver todos (${a.glossario.termos.length})</button>` : ""}
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

  // RF02 — verificação de microfone e rede antes de entrar na sessão
  const [mic, rede] = await Promise.all([verificarMicrofone(), Promise.resolve(verificarRede())]);
  const box = $("#verificacoes");
  if (!box) return;
  const falhas = [];
  if (!mic.ok) falhas.push(mic.motivo === "recusado" ? "o microfone foi recusado" : "não há microfone disponível");
  if (!rede.ok) falhas.push("não há ligação à rede");
  if (falhas.length) {
    box.className = "notice warn";
    box.innerHTML = `<strong>Atenção antes de começar</strong>Neste dispositivo ${falhas.join(" e ")}. Podes entrar na sessão e usar o modo de simulação para ver o fluxo.`;
  } else {
    box.className = "notice ok";
    box.innerHTML = `<strong>Microfone e rede verificados</strong>Está tudo pronto para legendar.`;
  }

  $("#btnIniciar") && ($("#btnIniciar").onclick = () => iniciarSessao(a.id));
  $("#opSubmeter") && ($("#opSubmeter").onclick = () => location.hash = `#/material/${a.id}`);
  $("#opSem") && ($("#opSem").onclick = () => iniciarSessao(a.id));
  $("#opPedir") && ($("#opPedir").onclick = () => {
    toast("Pedido enviado ao docente (simulado)");
    setTimeout(() => iniciarSessao(a.id), 900);
  });
  $("#verTodos") && ($("#verTodos").onclick = () => {
    $(".chips").innerHTML = a.glossario.termos.map(t => `<span class="chip">${escapar(t.termo)}</span>`).join("");
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
      a.material = { nome, paginas: null, submetidoPor: "aluno" };
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

let ctxSessao = null;

function ecraSessao(sid) {
  const s = store.sessao(sid);
  if (!s) return (location.hash = "#/aulas");
  const a = store.aula(s.aulaId);
  marcarTab("sessao");

  if (s.fim) return (location.hash = `#/resumo/${s.id}`);

  const indice = indexar(a?.glossario?.termos || []);
  const limiar = store.config().limiarConfianca;

  topo({
    kicker: `${a?.uc || ""} · Aula ${a?.numero || ""}`,
    titulo: a?.titulo || "Sessão",
    voltar: "#/aulas",
    direita: `<button class="icon-btn" id="btnSim" aria-label="Modo de simulação" title="Modo de simulação">&#9655;</button>`
  });

  render(`
    <div class="screen">
      <div class="sess-status"><span class="pulse"></span><span id="estadoSess">A ligar…</span><span class="right" id="relogio"></span></div>
      ${a?.glossario ? "" : `<div class="notice warn"><strong>Aula sem glossário</strong>Os termos técnicos não são contextualizados. Segmentos pouco seguros ficam assinalados.</div>`}
      <div id="legenda"></div>
      <div id="parcial" class="linha parcial" hidden><span class="t"></span><span class="txt"></span></div>
      <div style="height:80px"></div>
    </div>
    <div class="sess-actions">
      <button class="btn sec" id="btnPerguntar">&#9995; Perguntar</button>
      <button class="btn danger" id="btnTerminar">Terminar</button>
    </div>`);

  const elLegenda = $("#legenda"), elParcial = $("#parcial"), elEstado = $("#estadoSess");

  function pintar() {
    elLegenda.innerHTML = s.linhas.map(l => `
      <div class="linha${l.confianca < limiar ? " incerta" : ""}">
        <span class="t">${horas(l.t)}</span>
        <span class="txt">${marcar(l.texto, indice)}</span>
      </div>`).join("");
    window.scrollTo(0, document.body.scrollHeight);
  }
  pintar();

  const relogio = setInterval(() => {
    const el = $("#relogio");
    if (el) el.textContent = duracao(Date.now() - s.inicio);
  }, 10000);
  $("#relogio").textContent = duracao(Date.now() - s.inicio);

  function acrescentar(texto, confianca) {
    if (!texto) return;
    s.linhas.push({ t: Date.now(), texto, confianca });
    store.guardarSessao(s);
    pintar();
  }

  /* --- fonte: microfone real --- */
  const asr = criarASR({
    lingua: "pt-PT",
    onParcial: (t) => { elParcial.hidden = false; $(".txt", elParcial).textContent = t; },
    onFinal: ({ texto, confianca }) => { elParcial.hidden = true; acrescentar(texto, confianca); },
    onEstado: (e) => {
      if (simTimer) return;          // em simulação o estado é da simulação
      elEstado.textContent = ({
        "a-ouvir": "A legendar", "a-retomar": "A retomar…",
        "sem-permissao": "Microfone recusado", "parado": "Em pausa"
      })[e] || e;
    },
    onErro: (e) => {
      if (e.message === "network") toast("Ligação perdida. A app retoma sozinha.");
    }
  });

  /* --- fonte: simulação, para demonstrar sem microfone --- */
  let simTimer = null, simIdx = 0;
  function alternarSimulacao() {
    if (simTimer) {
      clearInterval(simTimer); simTimer = null;
      elEstado.textContent = "Simulação parada";
      return;
    }
    const guiao = SIMULACAO[s.aulaId] || SIMULACAO["a-prog-06"];
    simTimer = -1;                   // marcar ANTES de parar o ASR, para o onEstado o ignorar
    asr.parar();
    elEstado.textContent = "Simulação";
    simTimer = setInterval(() => {
      const f = guiao[simIdx % guiao.length];
      simIdx++;
      acrescentar(f, 0.6 + Math.random() * 0.4);
    }, 3200);
  }

  if (asrDisponivel) asr.iniciar();
  else { elEstado.textContent = "Sem reconhecimento de fala"; toast("Este browser não suporta reconhecimento de fala. Usa o modo de simulação (▷)."); }

  $("#btnSim").onclick = alternarSimulacao;

  /* --- consulta de termo: abre sobre a legenda, não é ecrã autónomo --- */
  elLegenda.addEventListener("click", (ev) => {
    const el = ev.target.closest(".termo");
    if (el) abrirTermo(el.dataset.termo, s, a);
  });

  $("#btnPerguntar").onclick = () => location.hash = `#/pergunta/${s.id}`;
  $("#btnTerminar").onclick = () => {
    s.fim = Date.now();
    store.guardarSessao(s);
    location.hash = `#/resumo/${s.id}`;
  };

  limpezaEcra = () => { asr.parar(); clearInterval(relogio); if (simTimer) clearInterval(simTimer); };
}

/* --- folha de explicação do termo (estado do E04) --- */

async function abrirTermo(termo, s, a) {
  const back = document.createElement("div");
  back.className = "sheet-back";
  back.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Significado de ${escapar(termo)}">
      <div class="sheet-grip"></div>
      <h3>${escapar(termo)}</h3>
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
      corpo.innerHTML = `<div class="notice warn" style="margin:0"><strong>Sem informação suficiente</strong>Os materiais desta aula não explicam este termo. ${IA.temChave() ? "" : "Configura uma chave da IAG nas definições para gerar explicações."}</div>`;
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

/* ───────────────── E06 · pergunta em LGP ───────────────── */

function ecraPergunta(sid) {
  const s = store.sessao(sid);
  if (!s) return (location.hash = "#/aulas");
  marcarTab("sessao");
  topo({ kicker: "Perguntar", titulo: "Faz a tua pergunta em LGP", voltar: `#/sessao/${s.id}` });

  render(`
    <div class="screen">
      <div class="camera-wrap">
        <video id="cam" autoplay playsinline muted></video>
        <canvas id="pontos"></canvas>
        <div class="gesto-chip" id="gesto" hidden>—</div>
        <div class="camera-hint" id="hint">A pedir acesso à câmara…</div>
      </div>

      <div>
        <div class="row between" style="margin-bottom:7px">
          <b class="small">Glosas reconhecidas</b>
          <button class="btn ghost sm" id="btnLimpar" style="padding:2px 0">limpar</button>
        </div>
        <div class="glosas" id="glosas"><span class="muted small">Faz um gesto que tenhas treinado e toca em «Adicionar».</span></div>
      </div>

      <div class="row" style="gap:10px">
        <button class="btn sec" id="btnAdd" disabled>+ Adicionar gesto</button>
        <button class="btn" id="btnPronto" disabled>Terminei</button>
      </div>

      <button class="btn ghost" id="btnEscrever">Prefiro escrever a pergunta</button>
      <p class="muted small">O vídeo é processado no dispositivo e nunca é enviado nem guardado. Só a sequência de glosas segue para o passo seguinte.</p>
    </div>`);

  const glosas = [];
  let ultimo = null;

  const captura = LGP.criarCaptura({
    video: $("#cam"),
    canvas: $("#pontos"),
    onResultado: (r) => {
      const chip = $("#gesto"), add = $("#btnAdd");
      if (!chip) return;
      if (!r) { chip.hidden = true; ultimo = null; add.disabled = true; return; }
      chip.hidden = false;
      if (r.propria && r.propria.confianca >= 0.6) {
        ultimo = r.propria.etiqueta;
        chip.textContent = `${r.propria.etiqueta} · ${Math.round(r.propria.confianca * 100)}%`;
      } else if (r.gestoPreTreinado && r.gestoPreTreinado.categoryName !== "None") {
        ultimo = LGP.GESTOS_PRE_TREINADOS[r.gestoPreTreinado.categoryName] || r.gestoPreTreinado.categoryName;
        chip.textContent = `${ultimo} · ${Math.round(r.gestoPreTreinado.score * 100)}%`;
      } else {
        ultimo = null;
        chip.textContent = "mão detetada";
      }
      add.disabled = !ultimo;
    },
    onErro: (e) => {
      const hint = $("#hint");
      if (hint) hint.innerHTML = e.message === "camara-recusada"
        ? "A câmara foi recusada. Podes escrever a pergunta em alternativa."
        : "Não foi possível usar a câmara neste dispositivo.";
    }
  });

  captura.iniciar().then(ok => { if (ok) $("#hint").textContent = "Enquadra a mão dentro dos cantos."; });

  function pintarGlosas() {
    const el = $("#glosas");
    el.innerHTML = glosas.length
      ? glosas.map(g => `<span class="glosa">${escapar(g)}</span>`).join("")
      : `<span class="muted small">Faz um gesto que tenhas treinado e toca em «Adicionar».</span>`;
    $("#btnPronto").disabled = !glosas.length;
  }

  $("#btnAdd").onclick = () => { if (ultimo) { glosas.push(ultimo); pintarGlosas(); } };
  $("#btnLimpar").onclick = () => { glosas.length = 0; pintarGlosas(); };
  $("#btnEscrever").onclick = () => irParaConfirmar(s, "", []);
  $("#btnPronto").onclick = async () => {
    $("#btnPronto").disabled = true;
    $("#btnPronto").textContent = "A converter…";
    const r = await IA.glosasParaPortugues(glosas).catch(() => ({ texto: glosas.join(" ") }));
    irParaConfirmar(s, r.texto, glosas);
  };

  limpezaEcra = () => captura.parar();
}

let rascunhoPergunta = { texto: "", glosas: [] };
function irParaConfirmar(s, texto, glosas) {
  rascunhoPergunta = { texto, glosas };
  location.hash = `#/confirmar/${s.id}`;
}

/* ───────────────── E07 · confirmar e dizer ───────────────── */

function ecraConfirmar(sid) {
  const s = store.sessao(sid);
  if (!s) return (location.hash = "#/aulas");
  marcarTab("sessao");
  topo({ kicker: "Perguntar", titulo: "Confirma antes de enviar", voltar: `#/pergunta/${s.id}` });

  render(`
    <div class="screen">
      ${rascunhoPergunta.glosas.length ? `
        <div>
          <div class="small muted" style="margin-bottom:6px">glosas reconhecidas</div>
          <div class="glosas">${rascunhoPergunta.glosas.map(g => `<span class="glosa">${escapar(g)}</span>`).join("")}</div>
        </div>` : ""}

      <div class="field">
        <label for="txtPergunta">A pergunta, em português</label>
        <textarea id="txtPergunta" class="pergunta-box" placeholder="Escreve aqui a tua pergunta…">${escapar(rascunhoPergunta.texto)}</textarea>
      </div>

      <div class="notice warn">
        <strong>Isto vai ser dito em voz alta na sala</strong>
        Confirma o texto antes de enviar. Nada é reproduzido sem a tua confirmação.
      </div>

      <button class="btn" id="btnDizer">&#128266; Dizer em voz alta</button>
      <button class="btn ghost" id="btnCancelar">Cancelar</button>
    </div>`);

  $("#txtPergunta").focus();
  $("#btnCancelar").onclick = () => location.hash = `#/sessao/${s.id}`;
  $("#btnDizer").onclick = async () => {
    const texto = $("#txtPergunta").value.trim();
    if (!texto) return toast("Escreve a pergunta primeiro.");
    if (!ttsDisponivel) return toast("Este dispositivo não tem síntese de voz.");

    render(`
      <div class="screen">
        <div class="speaking">
          <div class="bars"><i></i><i></i><i></i><i></i><i></i></div>
          <div class="pergunta-box" style="text-align:center;border:0;background:transparent">«${escapar(texto)}»</div>
          <div class="muted" id="estadoFala">A dizer em voz alta…</div>
        </div>
      </div>`);

    s.perguntas.push({ t: Date.now(), texto, glosas: rascunhoPergunta.glosas });
    store.guardarSessao(s);

    await falar(texto, { lingua: "pt-PT" });
    const el = $("#estadoFala");
    if (el) {
      el.textContent = "A pergunta foi dita.";
      app.insertAdjacentHTML("beforeend", `<button class="btn" id="voltarAula" style="margin-top:10px">Voltar à aula</button>`);
      $("#voltarAula").onclick = () => location.hash = `#/sessao/${s.id}`;
    }
    rascunhoPergunta = { texto: "", glosas: [] };
  };

  limpezaEcra = () => pararFala();
}

/* ───────────────── E08/E09 · resumo, ficha e transcrição ───────────────── */

async function ecraResumo(sid) {
  const s = store.sessao(sid);
  if (!s) return (location.hash = "#/aulas");
  const a = store.aula(s.aulaId);
  marcarTab("historico");
  topo({ kicker: `${a?.uc || ""} · Aula ${a?.numero || ""}`, titulo: a?.titulo || "Resumo", voltar: "#/historico" });

  const indice = indexar(a?.glossario?.termos || []);
  const transcricao = s.linhas.map(l => l.texto).join(" ");

  render(`
    <div class="screen">
      <div class="muted small">${dataCurta(s.inicio)} · ${duracao((s.fim || Date.now()) - s.inicio)} · ${s.linhas.length} linhas</div>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected="true"  data-vista="resumo">Resumo</button>
        <button role="tab" aria-selected="false" data-vista="ficha">Ficha</button>
        <button role="tab" aria-selected="false" data-vista="transcricao">Transcrição</button>
      </div>
      <div id="vista"></div>
    </div>`);

  $$("[data-vista]").forEach(b => b.onclick = () => {
    $$("[data-vista]").forEach(x => x.setAttribute("aria-selected", String(x === b)));
    pintarVista(b.dataset.vista);
  });

  if (!s.resumo) {
    $("#vista").innerHTML = `<div class="notice info"><strong>A gerar o material de revisão</strong>${IA.temChave() ? "A IAG está a resumir a aula…" : "Sem chave da IAG: a usar a heurística local, que é pobre."}</div>`;
    try {
      const r = await IA.gerarResumoEFicha(transcricao, { material: "", titulo: a?.titulo || "" });
      s.resumo = { pontos: r.pontos, origem: r.origem };
      s.ficha = r.perguntas;
      store.guardarSessao(s);
    } catch (e) {
      s.resumo = { pontos: [], origem: "falhou: " + e.message };
      s.ficha = [];
      store.guardarSessao(s);
    }
  }
  pintarVista("resumo");

  function pintarVista(qual) {
    const v = $("#vista");
    if (!v) return;

    if (qual === "resumo") {
      const pontos = s.resumo?.pontos || [];
      v.innerHTML = `
        <div class="card">
          <b>Pontos principais</b>
          ${pontos.length ? pontos.map((p, i) => `
            <div class="ponto">
              <span class="n">${i + 1}</span>
              <span class="corpo">${escapar(p.texto)}
                ${p.slide ? `<span class="slide-ref">slide ${p.slide}</span>` : ""}
                ${p.incerto ? `<span class="slide-ref" style="background:var(--low);border-color:var(--low-line);color:inherit">incerto</span>` : ""}
              </span>
            </div>`).join("") : `<p class="muted" style="margin-top:10px">Não foi possível gerar pontos a partir desta sessão.</p>`}
          <div class="muted small" style="margin-top:12px">origem: ${escapar(s.resumo?.origem || "—")}</div>
        </div>
        ${a?.glossario ? `<div class="card"><b>Termos desta aula</b>
          <div class="chips" style="margin-top:10px">${a.glossario.termos.map(t =>
            `<span class="chip${s.consultas.includes(t.termo) ? "" : " plain"}">${escapar(t.termo)}</span>`).join("")}</div>
          <div class="muted small" style="margin-top:10px">a amarelo, os termos que consultaste durante a aula</div></div>` : ""}
        <div class="notice info"><strong>Não foi guardado áudio nem vídeo desta aula</strong>Só o texto da transcrição e os indicadores de confiança.</div>`;
      return;
    }

    if (qual === "ficha") {
      const qs = s.ficha || [];
      v.innerHTML = qs.length ? `<div class="card">${qs.map((q, i) => `
        <div class="qa">
          <div class="q">${i + 1}. ${escapar(q.pergunta)} ${q.slide ? `<span class="slide-ref">slide ${q.slide}</span>` : ""}</div>
          <button class="btn ghost sm" data-resp="${i}" style="padding-left:0">Mostrar resposta</button>
          <div class="a" id="resp${i}" hidden>${escapar(q.resposta)}</div>
        </div>`).join("")}</div>`
        : `<div class="empty"><div class="big">&#9634;</div><p>Sem ficha de revisão para esta sessão.${IA.temChave() ? "" : " Configura uma chave da IAG para a gerar."}</p></div>`;
      $$("[data-resp]").forEach(b => b.onclick = () => {
        const d = $("#resp" + b.dataset.resp);
        d.hidden = !d.hidden;
        b.textContent = d.hidden ? "Mostrar resposta" : "Esconder resposta";
      });
      return;
    }

    v.innerHTML = s.linhas.length ? `<div class="card">${s.linhas.map(l => `
      <div class="linha" style="padding:6px 0">
        <span class="t">${horas(l.t)}</span>
        <span class="txt">${marcar(l.texto, indice, { confianca: l.confianca, limiar: store.config().limiarConfianca })}</span>
      </div>`).join("")}</div>`
      : `<div class="empty"><p>Esta sessão não registou fala.</p></div>`;
  }
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

/* ───────────────── treino de gestos ───────────────── */

function ecraTreino() {
  marcarTab("aulas");
  topo({ kicker: "LGP", titulo: "Treinar gestos", voltar: "#/aulas" });

  render(`
    <div class="screen">
      <p class="muted">Não existe modelo de LGP pronto a usar. Este treino recolhe exemplos teus e classifica por k-vizinhos sobre os pontos da mão. Com poucos gestos a exatidão é alta; quanto maior o vocabulário, mais cai.</p>

      <div class="camera-wrap" style="aspect-ratio:1/1">
        <video id="cam" autoplay playsinline muted></video>
        <canvas id="pontos"></canvas>
        <div class="gesto-chip" id="gesto" hidden>—</div>
        <div class="camera-hint" id="hint">A pedir acesso à câmara…</div>
      </div>

      <div class="field">
        <label for="etiqueta">Gesto a treinar</label>
        <input id="etiqueta" placeholder="por exemplo: A, B, SIM, OBRIGADO" autocomplete="off">
      </div>
      <button class="btn" id="btnGravar" disabled>Gravar 20 amostras</button>

      <div class="card">
        <div class="row between"><b>Amostras recolhidas</b><button class="btn ghost sm" id="btnLimparTudo" style="padding:0">apagar tudo</button></div>
        <div id="stats" class="chips" style="margin-top:10px"></div>
      </div>
    </div>`);

  function pintarStats() {
    const st = LGP.estatisticas();
    $("#stats").innerHTML = st.total
      ? st.etiquetas.map(([e, n]) => `<span class="chip">${escapar(e)} · ${n}</span>`).join("")
      : `<span class="muted small">Ainda não há amostras.</span>`;
  }
  pintarStats();

  let vecAtual = null;
  const captura = LGP.criarCaptura({
    video: $("#cam"), canvas: $("#pontos"),
    onResultado: (r) => {
      const chip = $("#gesto");
      if (!chip) return;
      vecAtual = r ? r.vec : null;
      chip.hidden = !r;
      if (r) chip.textContent = r.propria ? `${r.propria.etiqueta} · ${Math.round(r.propria.confianca * 100)}%` : "mão detetada";
      $("#btnGravar").disabled = !r || !$("#etiqueta").value.trim();
    },
    onErro: (e) => { const h = $("#hint"); if (h) h.textContent = "Câmara indisponível: " + e.message; }
  });
  captura.iniciar().then(ok => { if (ok) $("#hint").textContent = "Mantém o gesto parado enquanto grava."; });

  $("#etiqueta").oninput = () => { $("#btnGravar").disabled = !vecAtual || !$("#etiqueta").value.trim(); };

  $("#btnGravar").onclick = async () => {
    const etq = $("#etiqueta").value.trim().toUpperCase();
    if (!etq) return;
    const btn = $("#btnGravar");
    btn.disabled = true;
    for (let i = 0; i < 20; i++) {
      if (vecAtual) LGP.adicionarAmostra(etq, vecAtual);
      btn.textContent = `A gravar… ${i + 1}/20`;
      await new Promise(r => setTimeout(r, 110));
    }
    btn.textContent = "Gravar 20 amostras";
    btn.disabled = false;
    pintarStats();
    toast(`${etq} gravado.`);
  };

  $("#btnLimparTudo").onclick = () => { LGP.limparAmostras(); pintarStats(); toast("Amostras apagadas."); };

  limpezaEcra = () => captura.parar();
}

/* ───────────────── definições ───────────────── */

function ecraConfig() {
  marcarTab("aulas");
  topo({ kicker: "Definições", titulo: "IAG e privacidade", voltar: "#/aulas" });
  const c = store.config();

  render(`
    <div class="screen">
      <div class="notice info">
        <strong>A app funciona sem chave</strong>
        Sem IAG, o glossário usa uma heurística local e o resumo fica pobre. A legendagem, a marcação de termos e a captação de gesto funcionam sempre.
      </div>

      <div class="field">
        <label for="key">Chave da API Gemini</label>
        <input id="key" type="password" value="${escapar(c.geminiKey)}" placeholder="AIza…" autocomplete="off">
      </div>
      <div class="field">
        <label for="modelo">Modelo</label>
        <input id="modelo" value="${escapar(c.modelo)}" placeholder="gemini-flash-latest" autocomplete="off">
      </div>

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
  $("#testar").onclick = async () => {
    store.guardarConfig({ geminiKey: $("#key").value.trim(), modelo: $("#modelo").value.trim() || "gemini-flash-latest" });
    $("#res").innerHTML = `<div class="notice info">A testar…</div>`;
    const r = await IA.testarChave();
    $("#res").innerHTML = r.ok
      ? `<div class="notice ok"><strong>A chave funciona</strong></div>`
      : `<div class="notice danger"><strong>Falhou</strong>${escapar(r.erro)}</div>`;
  };
  $("#apagar").onclick = () => {
    if (!confirm("Apagar aulas, sessões e amostras de gestos deste dispositivo?")) return;
    store.limpar(); LGP.limparAmostras();
    store.init(SEED);
    location.hash = "#/aulas";
    toast("Dados apagados.");
  };
}

/* ───────────────── router ───────────────── */

const rotas = [
  [/^#\/aulas$/,              () => ecraAulas()],
  [/^#\/aula\/(.+)$/,         m => ecraPreparar(m[1])],
  [/^#\/material\/(.+)$/,     m => ecraMaterial(m[1])],
  [/^#\/sessao$/,             () => { const s = store.sessaoAtiva(); location.hash = s ? `#/sessao/${s.id}` : "#/aulas"; }],
  [/^#\/sessao\/(.+)$/,       m => ecraSessao(m[1])],
  [/^#\/pergunta\/(.+)$/,     m => ecraPergunta(m[1])],
  [/^#\/confirmar\/(.+)$/,    m => ecraConfirmar(m[1])],
  [/^#\/resumo\/(.+)$/,       m => ecraResumo(m[1])],
  [/^#\/historico$/,          () => ecraHistorico()],
  [/^#\/treino$/,             () => ecraTreino()],
  [/^#\/config$/,             () => ecraConfig()]
];

function encaminhar() {
  if (limpezaEcra) { try { limpezaEcra(); } catch (e) { console.error(e); } limpezaEcra = null; }
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
