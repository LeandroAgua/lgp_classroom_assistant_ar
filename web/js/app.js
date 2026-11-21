/* app.js — router e ecrãs.
   Os identificadores E01..E10 referem-se ao inventário de ecrãs da Fase II.
   O âmbito acompanha o protótipo: não há reconhecimento de LGP nesta versão,
   a pergunta é escrita. Ver camera.js. */

import { store } from "./store.js";
import { SEED, GUIAO_SIMULACAO } from "./seed.js";
import { indexar, marcar, escapar } from "./glossary.js";
import { criarASR, asrDisponivel, verificarMicrofone, verificarRede } from "./asr.js";
import { falar, parar as pararFala, ttsDisponivel } from "./tts.js";
import * as IA from "./ai.js";
import { criarCamara } from "./camera.js";
import { AMOSTRAS, amostra } from "./amostras.js";
import * as MAT from "./materiais.js";
import * as LGP from "./lgp.js";
import * as IAASL from "./asl.js";

/* Marcador de versão. Serve para responder, sem adivinhar, à pergunta
   "estarei a correr o código novo?" — que é a primeira coisa a confirmar
   quando um botão não faz nada. Aparece no fundo das Definições. */
export const VERSAO = "2026-11-21.7";

/* O que está dentro da app para o ALUNO, e o que está lá para nós.
   Um aluno surdo numa aula precisa de: ver as aulas, iniciar a sessão, ler
   as legendas, tocar num termo, perguntar, e rever depois. Não precisa de
   gravar gestos, importar imagens, escolher modelos de IAG nem inspecionar
   extrações — isso é andaime de desenvolvimento, e andaime à vista é ruído
   para quem só quer acompanhar a aula.

   Liga-se em #/dev, e enquanto está ligado há um indicador permanente. */
const modoDev = () => !!store.config().modoDev;

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
    // Sem saudação com nome: "Olá, Rita" era a persona do relatório fixa no
    // código, e um nome que não é o de quem está a usar lê-se como erro.
    kicker: "", titulo: "Próximas aulas",
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
        <div class="empty">
          <div class="big">&#9707;</div>
          <p>Ainda não tens aulas.<br>Escolhe a aula a que vais assistir.</p>
        </div>`}

      ${/* Sempre visível: é por aqui que o aluno escolhe a aula a que vai
            assistir, de entre as que estão preparadas. Secundário quando já
            há aulas na lista, porque aí a ação principal é abrir uma. */
        `<button class="btn ${aulas.length ? "sec" : ""}" id="btnNova">${modoDev() ? "+ Nova aula" : "+ Escolher aula"}</button>`}
    </div>`);

  $$("[data-aula]").forEach(b => b.onclick = () => location.hash = `#/aula/${b.dataset.aula}`);
  $("#btnCfg") && ($("#btnCfg").onclick = () => location.hash = "#/config");
  $("#btnNova") && ($("#btnNova").onclick = () => location.hash = "#/nova");
}

/* ───────────────── nova aula ───────────────── */

/* ───────────────── seletor de materiais ─────────────────
   Partilhado por «criar aula» e «carregar os slides»: é o mesmo trabalho nos
   dois sítios, e havia dois leitores de PDF diferentes a fazê-lo, cada um a
   buscar o pdf.js por sua conta.

   Rende-se dentro de `raiz` e devolve {lidos}. Chama `aoMudar` sempre que o
   conjunto muda, para quem o usa acertar o botão de avançar. */
function seletorMateriais(raiz, aoMudar) {
  const materiais = [];                   // {nome, bytes, estado, texto, paginas, erro}

  raiz.innerHTML = `
    <div class="dropzone" tabindex="0" role="button">
      <span class="ic">&#128196;</span>
      <b>Escolher ficheiros</b>
      <span class="muted small">PDF ou Word (.docx) · também podes arrastar para aqui</span>
      <input type="file" multiple accept="${MAT.ACEITES}" hidden>
    </div>
    <div class="stack lista-fich" style="margin-top:10px"></div>`;

  const zona = $(".dropzone", raiz), input = $("input[type=file]", raiz), lista = $(".lista-fich", raiz);
  const lidos = () => materiais.filter(m => m.estado === "ok");

  function pintar() {
    lista.innerHTML = materiais.map((m, i) => `
      <div class="ficheiro ${m.estado}">
        <span class="ic">${m.estado === "erro" ? "&#9888;" : "&#128196;"}</span>
        <span class="grow">
          <b>${escapar(m.nome)}</b>
          <span class="muted small">${
            m.estado === "a-ler" ? escapar(m.progresso || "a ler…")
            : m.estado === "erro" ? escapar(m.erro)
            : `${MAT.tamanhoLegivel(m.bytes)}${m.paginas ? ` · ${m.paginas} slides` : ""} · ${m.texto.length.toLocaleString("pt-PT")} caracteres`
          }</span>
        </span>
        <button class="icon-btn" data-remover="${i}" aria-label="Remover ${escapar(m.nome)}" title="Remover">&#10005;</button>
      </div>`).join("");

    $$("[data-remover]", lista).forEach(b => b.onclick = () => {
      materiais.splice(+b.dataset.remover, 1);
      pintar();
    });

    aoMudar && aoMudar({ prontos: lidos().length, aLer: materiais.some(m => m.estado === "a-ler") });
  }

  async function acrescentar(ficheiros) {
    for (const f of ficheiros) {
      if (materiais.some(m => m.nome === f.name && m.bytes === f.size)) continue;
      const m = { nome: f.name, bytes: f.size, estado: "a-ler", texto: "", paginas: 0, erro: "" };
      materiais.push(m);
      pintar();

      const r = await MAT.lerMaterial(f, (pag, tot) => {
        m.progresso = `a ler a página ${pag} de ${tot}…`;
        pintar();
      });

      if (r.ok) Object.assign(m, { estado: "ok", texto: r.texto, paginas: r.paginas });
      else Object.assign(m, { estado: "erro", erro: r.erro });
      pintar();

      if (r.ok) aoMudar && aoMudar({ prontos: lidos().length, aLer: false, acabado: m });
    }
  }

  input.onchange = () => { acrescentar([...input.files]); input.value = ""; };
  zona.onclick = () => input.click();
  zona.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } };
  zona.ondragover = e => { e.preventDefault(); zona.classList.add("sobre"); };
  zona.ondragleave = () => zona.classList.remove("sobre");
  zona.ondrop = e => { e.preventDefault(); zona.classList.remove("sobre"); acrescentar([...e.dataTransfer.files]); };

  pintar();
  return { lidos };
}

function ecraNova() {
  marcarTab("aulas");
  topo({ kicker: "", titulo: modoDev() ? "Criar uma aula" : "Escolher a aula", voltar: "#/aulas" });

  render(`
    <div class="screen">
      <p class="muted">${modoDev()
        ? "Cria uma aula e gera-lhe o glossário. Os materiais de exemplo são texto fixo, o que os torna úteis para comparar a extração com e sem IAG sobre exatamente a mesma entrada."
        : "Escolhe a aula a que vais assistir. O glossário é extraído dos materiais dessa aula, e é ele que vai contextualizar as legendas."}</p>

      <!-- As aulas preparadas aparecem a todos. Escondê-las do aluno obrigava-o
           a colar o texto dos slides à mão antes de poder assistir à aula, o
           que é trabalho de quem prepara, não de quem assiste. O que fica só
           no modo de teste são as contagens de caracteres e termos esperados,
           que servem para medir a extração e nada dizem ao aluno. -->
      <div class="card">
        <b>${modoDev() ? "Material de exemplo" : "Aulas preparadas"}</b>
        <div class="stack" style="margin-top:12px">
          ${AMOSTRAS.map(a => `
            <button class="choice" data-amostra="${a.id}">
              <span class="ic">&#9634;</span>
              <span class="grow">
                <b>${escapar(a.uc)} · ${escapar(a.titulo)}</b>
                <span>${modoDev()
                  ? `${a.texto.length} caracteres · ${(a.texto.match(/\[slide \d+\]/g) || []).length} slides · ~${a.termosEsperados.length} termos esperados`
                  : `${escapar(a.docente)} · ${(a.texto.match(/\[slide \d+\]/g) || []).length} slides`}</span>
              </span>
            </button>`).join("")}
        </div>
      </div>

      <details class="card">
        <summary style="cursor:pointer;font-weight:600">${modoDev() ? "Ou criar de raiz" : "Ou criar outra aula"}</summary>
        <div class="stack" style="margin-top:14px">
          <div class="field"><label for="nUC">Unidade curricular</label><input id="nUC" placeholder="Sistemas Operativos"></div>
          <div class="field"><label for="nTitulo">Título da aula</label><input id="nTitulo" placeholder="Escalonamento de processos"></div>
          <div class="field"><label for="nDocente">Docente</label><input id="nDocente" placeholder="Nome do docente"></div>
          <div class="field">
            <label>Materiais da aula</label>
            <div id="materiais"></div>
            <span class="muted small">Cada página de um PDF conta como um slide, e é assim que a app sabe de que slide veio cada termo.</span>
          </div>
          <button class="btn" id="btnCriar" disabled>Criar e extrair</button>
        </div>
      </details>

      <div id="estado"></div>
    </div>`);

  $$("[data-amostra]").forEach(b => b.onclick = () => {
    const am = amostra(b.dataset.amostra);
    if (!am) return;

    /* Escolher a mesma aula duas vezes abria uma segunda cópia e voltava a
       gastar uma extração. Já estando na lista, escolher é abrir. */
    const ja = store.aulas().find(a => a.uc === am.uc && a.titulo === am.titulo);
    if (ja) { location.hash = `#/aula/${ja.id}`; return; }

    criarAula({ uc: am.uc, titulo: am.titulo, docente: am.docente, texto: am.texto, nome: `${am.id}.pdf` });
  });

  /* ---- materiais: PDF e Word ---- */

  const sel = seletorMateriais($("#materiais"), ({ prontos, aLer, acabado }) => {
    const b = $("#btnCriar");
    b.disabled = !prontos || aLer;
    b.textContent = aLer ? "A ler os ficheiros…"
      : prontos > 1 ? `Criar e extrair de ${prontos} ficheiros` : "Criar e extrair";

    /* Com um só ficheiro vale a pena sugerir o título a partir do nome: poupa
       escrita e acerta quase sempre, porque é assim que os docentes nomeiam os
       ficheiros. Nunca por cima do que já lá está escrito. */
    if (acabado && prontos === 1 && !$("#nTitulo").value.trim()) {
      const sugestao = acabado.nome.replace(/\.(pdf|docx)$/i, "").replace(/[_-]+/g, " ").trim();
      // "slides.pdf" e "aula3.docx" não dão título nenhum: sugerir isso era
      // pior do que deixar o campo vazio, porque parece preenchido.
      const generico = /^(slides?|aulas?|apontamentos?|documento|doc|ficheiro|untitled|sem t[ií]tulo)[\s\d]*$/i;
      if (sugestao.length > 3 && !generico.test(sugestao)) $("#nTitulo").value = sugestao;
    }
  });

  $("#btnCriar").onclick = () => {
    const uc = $("#nUC").value.trim(), titulo = $("#nTitulo").value.trim();
    const lidos = sel.lidos();
    if (!uc || !titulo) return toast("Preenche a unidade curricular e o título.");
    if (!lidos.length) return toast("Escolhe pelo menos um PDF ou .docx.");
    criarAula({
      uc, titulo,
      docente: $("#nDocente").value.trim() || "—",
      texto: MAT.juntar(lidos),
      nome: lidos.length === 1 ? lidos[0].nome : `${lidos.length} ficheiros`
    });
  };
}

async function criarAula({ uc, titulo, docente, texto, nome }) {
  const aula = {
    id: "a" + Date.now().toString(36),
    uc, titulo, docente,
    numero: store.aulas().filter(a => a.uc === uc).length + 1,
    sala: "—",
    quando: "por agendar",
    material: null,
    glossario: null
  };
  store.guardarAula(aula);
  await gerarEGuardar(aula, texto, nome, $("#estado"));
}

/** Gera o glossário e guarda-o com o diagnóstico, para que a extração possa
 *  ser inspecionada depois. Partilhado entre criar aula e submeter material. */
async function gerarEGuardar(aula, texto, nome, caixa) {
  // Mostrar o que está a acontecer, segundo a segundo. Um ecrã parado durante
  // vinte segundos é indistinguível de um ecrã pendurado, e extrair 40 termos
  // de um material inteiro demora mesmo.
  let relogio = null;
  const pintar = (linha) => {
    if (!caixa) return;
    caixa.innerHTML = `<div class="notice info"><strong>A gerar o glossário</strong>${linha}</div>`;
  };

  if (IA.temChave()) {
    const t0 = Date.now();
    let detalhe = "a contactar a IAG…";
    pintar(detalhe);
    relogio = setInterval(() => pintar(`${detalhe} · ${Math.round((Date.now() - t0) / 1000)}s`), 1000);
    var onProgresso = ({ modelo, tentativa }) => {
      detalhe = tentativa > 1
        ? `${modelo} não respondeu — tentativa ${tentativa}`
        : `${modelo} a identificar a terminologia…`;
    };
  } else {
    pintar("Sem chave da IAG: a usar a heurística local.");
  }

  const parar = () => { if (relogio) clearInterval(relogio); };

  try {
    const r = await IA.gerarGlossario(texto, { nomeFicheiro: nome, onProgresso });
    parar();
    if (!r.termos.length) {
      if (caixa) caixa.innerHTML = `<div class="notice warn"><strong>Glossário vazio</strong>Não foi identificada terminologia da disciplina neste material.</div>`;
      return false;
    }
    aula.material = { nome, submetidoPor: "aluno", texto: texto.slice(0, 40000) };
    aula.glossario = { geradoEm: Date.now(), origem: r.origem, termos: r.termos, diagnostico: r.diagnostico };
    store.guardarAula(aula);

    /* A resposta do modelo veio cortada e foi recuperada em parte. O glossário
       serve, mas o aluno tem de saber que pode faltar terminologia — senão um
       termo em falta parece um erro da legendagem. */
    if (r.truncado) {
      toast(`Material grande: ficaram ${r.termos.length} termos, pode faltar algum.`);
    }
    // O inspetor da extração é ferramenta de preparação. Fora do modo de
    // teste o destino natural é a própria aula, pronta a iniciar.
    location.hash = modoDev() ? `#/extracao/${aula.id}` : `#/aula/${aula.id}`;
    return true;
  } catch (e) {
    parar();
    if (caixa) caixa.innerHTML = `<div class="notice danger"><strong>A extração falhou</strong>${escapar(IA.explicarErro(e.message))}</div>`;
    return false;
  }
}

/* ───────────────── E03 · preparar a sessão ───────────────── */

async function ecraPreparar(id) {
  const a = store.aula(id);
  if (!a) return (location.hash = "#/aulas");
  marcarTab("aulas");
  topo({ kicker: `${a.uc} · Aula ${a.numero}`, titulo: a.titulo, voltar: "#/aulas" });

  const cfg = store.config();
  const temGloss = !!a.glossario;

  /* Uma aula dá-se uma vez. Começar outra sessão da mesma aula partia o
     histórico em pedaços e deixava dois resumos da mesma matéria, sem forma
     de saber qual era o bom. Havendo sessão terminada, o caminho passa a ser
     o resumo dela. */
  const terminada = store.sessoes().find(x => x.aulaId === a.id && x.fim);
  const ativa = store.sessoes().find(x => x.aulaId === a.id && !x.fim);
  const jaFoi = !!terminada && !ativa;

  render(`
    <div class="screen">
      <div class="aula-meta">
        <span>${escapar(a.quando)}</span><span>sala ${escapar(a.sala)}</span><span>Doc. ${escapar(a.docente)}</span>
      </div>

      ${modoDev() ? `
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
      </div>` : ""}

      <div id="verificacoes"></div>

      ${jaFoi ? `
        <div class="notice ok">
          <strong>Aula já assistida</strong>
          ${escapar(dataCurta(terminada.inicio))} · ${escapar(duracao(terminada.fim - terminada.inicio))} · ${terminada.linhas.length} linhas de legenda.
        </div>
        <a class="btn" href="#/resumo/${terminada.id}">Ver o resumo</a>
        <a class="btn sec" href="#/revisao/${terminada.id}">Ficha de revisão</a>
        ${modoDev() ? `<button class="btn ghost sm" id="btnRepetir">Assistir outra vez (modo de teste)</button>` : ""}` : ""}

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
          <div class="row" style="gap:12px;margin-top:10px">
            ${a.glossario.termos.length > 6
              ? `<button class="btn ghost sm" id="verTodos" style="padding-left:0">ver todos (${a.glossario.termos.length})</button>` : ""}
            ${modoDev() ? `<a class="btn ghost sm" href="#/extracao/${a.id}" style="padding-left:0">como foi extraído</a>` : ""}
          </div>
        </div>
        ${jaFoi ? "" : `<button class="btn" id="btnIniciar">&#9654; ${ativa ? "Retomar a sessão" : "Iniciar sessão"}</button>`}
      ` : jaFoi ? "" : `
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

      <!-- Discreto e no fim: é destrutivo, e quem abre esta aula vem para
           assistir, não para a apagar. -->
      <div class="rodape-perigo">
        <button class="btn ghost danger" id="btnRemover">Remover esta aula</button>
      </div>
    </div>`);

  $("#simToggle") && ($("#simToggle").onchange = (e) => {
    store.guardarConfig({ simulacao: e.target.checked });
    $("#simDesc").textContent = e.target.checked
      ? "Ligado: legendas de exemplo, sem áudio nem vídeo reais."
      : "Desligado: usa microfone e ficheiros reais.";
    correrVerificacoes();
  });

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
  $("#btnRepetir") && ($("#btnRepetir").onclick = () => iniciarSessao(a.id, { nova: true }));
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

  /* Confirmação em dois passos, e não um confirm() do browser: diz quantas
     sessões vão atrás, que é a parte que o utilizador não está a ver, e não
     bloqueia a app num diálogo nativo dentro da WebView. */
  $("#btnRemover") && ($("#btnRemover").onclick = () => {
    const nSessoes = store.sessoes().filter(s => s.aulaId === a.id).length;
    $(".rodape-perigo").innerHTML = `
      <div class="notice danger" style="margin:0 0 10px">
        <strong>Remover «${escapar(a.titulo)}»?</strong>
        Apaga o glossário e os materiais desta aula${nSessoes ? `, e ${nSessoes} ${nSessoes === 1 ? "sessão gravada" : "sessões gravadas"} com os resumos` : ""}. Não há como voltar atrás.
      </div>
      <div class="row" style="gap:10px">
        <button class="btn sec grow" id="btnCancelar">Cancelar</button>
        <button class="btn danger grow" id="btnConfirmar">Remover</button>
      </div>`;
    $("#btnCancelar").onclick = () => ecraPreparar(a.id);
    $("#btnConfirmar").onclick = () => {
      const r = store.removerAula(a.id);
      location.hash = "#/aulas";
      toast(r ? `«${r.aula.titulo}» removida.` : "Aula já não existia.");
    };
  });
}

function iniciarSessao(aulaId, { nova = false } = {}) {
  const existente = store.sessaoAtiva();
  const s = (!nova && existente && existente.aulaId === aulaId) ? existente : store.criarSessao(aulaId);
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
      <p class="muted">Os slides servem para gerar o glossário da aula. Os ficheiros não saem do dispositivo: só o texto extraído é enviado à IAG, e apenas se tiveres chave configurada.</p>

      <div id="materiais"></div>
      <button class="btn" id="btnUsar" style="margin-top:14px" disabled>Extrair o glossário</button>

      <div id="estado"></div>
    </div>`);

  const sel = seletorMateriais($("#materiais"), ({ prontos, aLer }) => {
    const b = $("#btnUsar");
    b.disabled = !prontos || aLer;
    b.textContent = aLer ? "A ler os ficheiros…"
      : prontos > 1 ? `Extrair o glossário de ${prontos} ficheiros` : "Extrair o glossário";
  });

  $("#btnUsar").onclick = () => {
    const lidos = sel.lidos();
    if (!lidos.length) return toast("Escolhe pelo menos um PDF ou .docx.");
    gerar(MAT.juntar(lidos), lidos.length === 1 ? lidos[0].nome : `${lidos.length} ficheiros`);
  };

  // Segue para o inspetor da extração, que é onde se vê o que saiu e como.
  async function gerar(texto, nome) {
    await gerarEGuardar(a, texto, nome, $("#estado"));
  }
}

/* ───────────────── inspetor da extração ─────────────────
   Mostra COMO o glossário foi gerado, e não só o resultado. É o que permite
   defender o processo em vez de o afirmar: vê-se a entrada, o prompt, a
   resposta em bruto e os termos que daí saíram, com dois sinais lado a lado
   — a confiança que o modelo atribui a si próprio e a contagem objetiva de
   ocorrências no texto. Quando os dois discordam, há ali qualquer coisa. */

function ecraExtracao(id) {
  const a = store.aula(id);
  if (!a || !a.glossario) return (location.hash = "#/aulas");
  marcarTab("aulas");
  topo({ kicker: `${escapar(a.uc)} · ${escapar(a.titulo)}`, titulo: "Extração de termos", voltar: "#/aulas" });

  const g = a.glossario;
  const d = g.diagnostico || {};
  const termos = g.termos || [];
  const comConf = termos.filter(t => typeof t.confianca === "number");
  const media = comConf.length ? comConf.reduce((s, t) => s + t.confianca, 0) / comConf.length : null;
  const semOcorrencia = termos.filter(t => t.ocorrencias === 0);

  render(`
    <div class="screen">
      <div class="card">
        <div class="row between" style="margin-bottom:10px">
          <b>Como foi extraído</b>
          <span class="badge ${d.caminho === "IAG" ? "info" : "warn"}">${escapar(d.caminho || "—")}</span>
        </div>
        <div class="kv">
          ${d.modelo ? `<div><span>modelo</span><code>${escapar(d.modelo)}</code></div>` : ""}
          ${d.porque ? `<div><span>porquê</span>${escapar(d.porque)}</div>` : ""}
          <div><span>entrada</span>${(d.caracteres || 0).toLocaleString("pt-PT")} caracteres</div>
          <div><span>demorou</span>${d.ms != null ? d.ms + " ms" : "—"}</div>
          <div><span>termos</span>${termos.length}</div>
          ${media != null ? `<div><span>confiança média</span>${Math.round(media * 100)}%</div>` : ""}
        </div>
      </div>

      ${semOcorrencia.length ? `
        <div class="notice warn">
          <strong>${semOcorrencia.length} termo${semOcorrencia.length > 1 ? "s" : ""} não aparece${semOcorrencia.length > 1 ? "m" : ""} no material</strong>
          ${semOcorrencia.map(t => escapar(t.termo)).join(", ")}. O modelo pode tê-los inferido do contexto — ou inventado. Vale a pena confirmar.
        </div>` : ""}

      <div class="card">
        <div class="row between" style="margin-bottom:4px">
          <b>Termos</b>
          <span class="muted small">confiança · ocorrências · slide</span>
        </div>
        ${termos.map(t => `
          <div class="termo-linha">
            <div class="row" style="gap:8px;align-items:baseline">
              <b class="grow">${escapar(t.termo)}</b>
              ${typeof t.confianca === "number"
                ? `<span class="conf${t.confianca < 0.9 ? " baixa" : ""}">${Math.round(t.confianca * 100)}%</span>` : ""}
              <span class="chip plain" style="padding:1px 7px;font-size:11px">${t.ocorrencias ?? "?"}×</span>
              ${t.slide ? `<span class="slide-ref">slide ${t.slide}</span>` : `<span class="slide-ref incerto">sem slide</span>`}
            </div>
            ${t.explicacao ? `<div class="muted small" style="margin-top:4px">${escapar(t.explicacao)}</div>`
                           : `<div class="muted small" style="margin-top:4px"><i>sem explicação — a heurística local não gera explicações</i></div>`}
          </div>`).join("")}
      </div>

      <details class="card"><summary style="cursor:pointer;font-weight:600">Texto de entrada</summary>
        <pre class="bruto">${escapar(a.material?.texto || "(não guardado)")}</pre></details>

      ${d.prompt ? `<details class="card"><summary style="cursor:pointer;font-weight:600">Prompt enviado</summary>
        <pre class="bruto">${escapar(d.prompt)}</pre></details>` : ""}

      ${d.respostaBruta ? `<details class="card"><summary style="cursor:pointer;font-weight:600">Resposta em bruto</summary>
        <pre class="bruto">${escapar(d.respostaBruta)}</pre></details>` : ""}

      <div class="row" style="gap:10px">
        <button class="btn sec" id="btnReextrair">Extrair outra vez</button>
        <a class="btn" href="#/aula/${a.id}">Ir para a aula</a>
      </div>
      <div id="estado"></div>
    </div>`);

  // Correr outra vez serve para comparar: com chave e sem chave, ou o mesmo
  // material em modelos diferentes. É o teste A/B que o relatório pede.
  $("#btnReextrair").onclick = async () => {
    const texto = a.material?.texto;
    if (!texto) return toast("O texto de entrada não foi guardado nesta aula.");
    await gerarEGuardar(a, texto, a.material.nome, $("#estado"));
    encaminhar();
  };
}

/* ───────────────── E04 · sessão ao vivo ───────────────── */

function ecraSessao(sid) {
  const s = store.sessao(sid);
  if (!s) return (location.hash = "#/aulas");
  if (s.fim) return (location.hash = `#/resumo/${s.id}`);
  const a = store.aula(s.aulaId);
  marcarTab("sessao");

  const indice = indexar(a?.glossario?.termos || []);
  // A simulação é para demonstrar sem microfone, não para um aluno a sério:
  // fica presa ao modo de teste, mesmo que tenha ficado ligada na configuração.
  const simular = modoDev() && !!store.config().simulacao;

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
      ${simular ? "" : `
      <!-- Medidor de entrada: separa «o microfone não capta» de «o
           reconhecedor não devolve nada», que são problemas diferentes e
           davam exatamente o mesmo ecrã parado. -->
      <div class="nivel-mic" id="nivelMic" hidden>
        <span class="barra"><i id="nivelBarra"></i></span>
        <span class="muted small" id="nivelTxt">a medir o microfone…</span>
      </div>`}
      <div id="avisoAsr"></div>
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
      // Arrancou mesmo: tirar o aviso de uma falha anterior, senão fica no
      // ecrã a contradizer as legendas que já estão a aparecer.
      if (e === "a-ouvir") { const cx = $("#avisoAsr"); if (cx) cx.innerHTML = ""; }
      elEstado.textContent = ({
        "a-ouvir": "A legendar", "a-retomar": "A retomar…",
        "sem-permissao": "Microfone recusado", "parado": "Em pausa"
      })[e] || e;
    },
    onErro: (e) => mostrarErroAsr(e.message)
  });

  function arrancarSimulacao() {
    const guiao = GUIAO_SIMULACAO;
    simTimer = setInterval(() => {
      acrescentar(guiao[simIdx % guiao.length], 0.86 + Math.random() * 0.12);
      simIdx++;
    }, 3200);
  }

  /* Os erros do reconhecedor estavam a ser deitados fora: só o "network" dava
     um toast e os outros desapareciam em silêncio. O resultado era o pior
     possível para quem usa — "A ligar…" para sempre, sem legendas e sem
     nenhuma pista do que fazer. São códigos da Web Speech API; traduzi-los é
     a diferença entre um ecrã parado e um problema que se resolve. */
  const ERROS_ASR = {
    "not-allowed": ["Microfone bloqueado", "O browser não deixa esta página ouvir o microfone. Toca no cadeado ao lado do endereço e permite o microfone."],
    "service-not-allowed": ["Reconhecimento bloqueado", "O browser bloqueou o serviço de reconhecimento de fala. Verifica as permissões do site."],
    "audio-capture": ["Sem microfone", "Não há microfone disponível neste dispositivo, ou está a ser usado por outra aplicação."],
    "network": ["Sem ligação ao reconhecimento", "No Chrome o reconhecimento de fala é feito nos servidores da Google, por isso precisa de internet. A app retoma sozinha quando a ligação voltar."],
    "language-not-supported": ["Português não disponível", "Este browser não reconhece pt-PT. Tenta no Chrome, ou usa o modo de simulação."],
    "sem-suporte": ["Browser sem reconhecimento de fala", "A Web Speech API existe no Chrome e no Edge. No Firefox e no Safari não há. Usa o modo de simulação para ver o fluxo."]
  };

  function mostrarErroAsr(codigo) {
    const cx = $("#avisoAsr");
    if (!cx) return;
    const [titulo, corpo] = ERROS_ASR[codigo] || ["O reconhecimento falhou", `Código devolvido pelo browser: ${codigo}.`];
    cx.innerHTML = `<div class="notice danger" style="margin:0"><strong>${escapar(titulo)}</strong>${escapar(corpo)}</div>`;
  }

  /* Mede o sinal do microfone, em paralelo com o reconhecedor. Sem isto,
     "não capta som" e "capta mas não reconhece" davam o mesmo ecrã, e são
     causas diferentes com soluções diferentes. */
  let pararNivel = null;
  async function medirMicrofone() {
    const cx = $("#nivelMic"), barra = $("#nivelBarra"), txt = $("#nivelTxt");
    if (!cx || !navigator.mediaDevices?.getUserMedia) return;
    cx.hidden = false;
    let ctx, fonte, stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      fonte = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      fonte.connect(an);
      const dados = new Uint8Array(an.frequencyBinCount);
      let houveSom = false, t0 = Date.now();

      const laco = setInterval(() => {
        if (!$("#nivelBarra")) return pararNivel && pararNivel();
        an.getByteTimeDomainData(dados);
        let pico = 0;
        for (const v of dados) pico = Math.max(pico, Math.abs(v - 128));
        const pct = Math.min(100, Math.round((pico / 60) * 100));
        barra.style.width = pct + "%";
        if (pct > 12) houveSom = true;
        txt.textContent = houveSom
          ? "microfone a captar"
          : (Date.now() - t0 > 6000 ? "sem som no microfone — fala ou verifica a entrada" : "a medir o microfone…");
      }, 120);

      pararNivel = () => {
        clearInterval(laco);
        try { fonte.disconnect(); ctx.close(); } catch {}
        stream.getTracks().forEach(t => t.stop());
        pararNivel = null;
      };
    } catch (e) {
      cx.hidden = true;
      mostrarErroAsr(e.name === "NotAllowedError" ? "not-allowed" : "audio-capture");
    }
  }

  if (simular) arrancarSimulacao();
  else if (asrDisponivel) { asr.iniciar(); medirMicrofone(); }
  else {
    elEstado.textContent = "Sem reconhecimento de fala";
    mostrarErroAsr("sem-suporte");
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

  limpezaEcra = () => { asr.parar(); clearInterval(relogio); if (simTimer) clearInterval(simTimer); if (pararNivel) pararNivel(); };
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
    if (corpo) corpo.innerHTML = `<div class="notice danger" style="margin:0"><strong>Não foi possível explicar</strong>${escapar(IA.explicarErro(e.message))}</div>`;
  }
}

/* ───────────────── E06/E07 · pergunta (sobreposição do E04) ───────────────── */

function abrirPergunta(s) {
  const back = document.createElement("div");
  back.className = "sheet-back pergunta";
  // Em ecrã largo isto deixa de ser modal: fica ancorado à direita e a aula
  // continua a legendar à esquerda. Tapar a aula para perguntar sobre a aula
  // era exatamente o problema a evitar.
  back.innerHTML = `
    <div class="sheet alta" role="dialog" aria-label="Fazer uma pergunta">
      <div class="sheet-grip"></div>
      <div id="passo"></div>
    </div>`;
  document.body.appendChild(back);
  document.body.classList.add("com-pergunta");

  const passo = $("#passo", back);
  let camara = null;

  const fechar = () => {
    if (camara) camara.parar();
    back.remove();
    document.body.classList.remove("com-pergunta");
  };
  back.onclick = e => { if (e.target === back) fechar(); };
  /* E06 — enquadramento e reconhecimento.

     Dois modos, e a diferença entre eles é dita ao utilizador:
       · gestos gravados — k-NN sobre as amostras dele (lgp.js)
       · alfabeto ASL    — modelo pré-treinado, PROVISÓRIO e NÃO é LGP (asl.js)

     Sem nenhum dos dois a app não finge: diz que não reconhece e manda
     escrever. E em qualquer dos casos a pergunta é sempre escrita e
     confirmada antes de ser dita em voz alta (RF22). */
  function passoCamara() {
    const st = LGP.estatisticas();
    const temGestos = st.classes > 0;
    // Fora do modo de teste nunca se cai no ASL: o alfabeto americano não
    // tem utilidade nenhuma para um aluno surdo português.
    let modo = (temGestos || !modoDev()) ? "gestos" : "asl";
    let sequencia = [];
    let soletrado = "";

    desenhar();

    function textoRecolhido() {
      return modo === "asl" ? soletrado : sequencia.join(" ");
    }

    function trocarModo(m) {
      if (m === modo) return;
      if (camara) camara.parar();
      modo = m;
      desenhar();
    }

    function desenhar() {
      const asl = modo === "asl";
      const tabs = modoDev();          // sem modo de teste não há escolha a fazer

      passo.innerHTML = `
        <div class="pq-topo">
          <h3>Perguntar</h3>
          ${tabs ? `
          <div class="tabs compacto" role="tablist">
            <button role="tab" data-modo="gestos" aria-selected="${!asl}">Gestos${temGestos ? ` ${st.classes}` : ""}</button>
            <button role="tab" data-modo="asl" aria-selected="${asl}">ASL</button>
          </div>` : ""}
        </div>

        ${asl ? `
          <details class="aviso-linha">
            <summary><b>Alfabeto ASL</b> — não é LGP</summary>
            Não existe modelo público do alfabeto da LGP. Isto demonstra a cadeia completa:
            câmara, pontos da mão, classificador, letra. São 24 letras — o J e o Z precisam
            de movimento e ficam de fora.
          </details>`
        : temGestos ? `
          <div class="aviso-linha plano">Reconhece só os ${st.classes} gesto${st.classes > 1 ? "s" : ""} que gravaste.</div>`
        : `
          <div class="aviso-linha plano">${modoDev()
            ? "Sem gestos gravados. Experimenta o alfabeto ASL, ou escreve."
            : "A câmara não reconhece gestos. Escreve a pergunta antes de a dizer em voz alta."}</div>`}

        <div class="camera-wrap pq">
          <video id="cam" autoplay playsinline muted></video>
          <canvas id="pontos"></canvas>
          <div class="gesto-chip" id="chip" hidden>—</div>
          <div class="camera-hint curta" id="hint">A pedir acesso à câmara…</div>
          <div class="recolhido">
            <div class="grow" id="glosas"></div>
            ${asl ? `<button class="mini" id="btnEspaco" title="Espaço">␣</button>
                     <button class="mini" id="btnApagar" title="Apagar a última">⌫</button>` : ""}
            <button class="mini" id="btnLimpar" title="Limpar tudo">✕</button>
          </div>
        </div>

        <div class="pq-acoes">
          <button class="btn" id="btnEscrever">Continuar e escrever</button>
          <div class="pq-links">
            <button class="ligacao" id="btnCancelar">Cancelar</button>
            ${!temGestos && modoDev() ? `<button class="ligacao" id="btnGravar">Gravar gestos de LGP</button>` : ""}
            <span class="muted">A imagem não sai do dispositivo</span>
          </div>
        </div>`;

      $$("[data-modo]", back).forEach(b => b.onclick = () => trocarModo(b.dataset.modo));
      pintar();
      arrancarCamara();

      $("#btnLimpar", back).onclick = () => { sequencia = []; soletrado = ""; pintar(); };
      if (asl) {
        $("#btnEspaco", back).onclick = () => { soletrado += " "; pintar(); };
        $("#btnApagar", back).onclick = () => { soletrado = soletrado.slice(0, -1); pintar(); };
      }
      $("#btnGravar", back) && ($("#btnGravar", back).onclick = () => { if (camara) camara.parar(); fechar(); location.hash = "#/gestos"; });
      $("#btnEscrever", back).onclick = () => { if (camara) camara.parar(); passoEscrever(textoRecolhido(), modo); };
      $("#btnCancelar", back).onclick = fechar;
    }

    function pintar() {
      const el = $("#glosas", back);
      if (!el) return;
      if (modo === "asl") {
        el.innerHTML = soletrado
          ? escapar(soletrado)
          : `<span class="muted">Faz uma letra e mantém a mão parada</span>`;
      } else {
        el.innerHTML = sequencia.length
          ? sequencia.map(g => `<span class="glosa">${escapar(g)}</span>`).join("")
          : `<span class="muted">Faz um gesto e mantém a mão parada</span>`;
      }
      // Mantém a vista no fim à medida que a palavra cresce — mas só quando há
      // mesmo conteúdo, senão o texto de ajuda aparece cortado ao início.
      const temConteudo = modo === "asl" ? !!soletrado : sequencia.length > 0;
      if (temConteudo) el.scrollLeft = el.scrollWidth;
    }

    async function arrancarCamara() {
      // Suavizador: só aceita quando dez frames seguidos concordam. Serve de
      // confirmação e, de caminho, de segmentação — enquanto a mão se move
      // entre gestos a janela fica dividida e nada é emitido.
      const suave = LGP.criarSuavizador({ janela: 10, limiar: 0.6 });

      if (modo === "asl") {
        const c = await IAASL.carregarModeloASL();
        if (!c.ok) {
          const h = $("#hint", back);
          if (h) h.textContent = "Não foi possível carregar o modelo do alfabeto: " + c.erro;
          return;
        }
      }

      camara = LGP.criarCaptura({
        video: $("#cam", back),
        canvas: $("#pontos", back),
        onResultado: (r) => {
          const chip = $("#chip", back);
          if (!chip) return;
          if (!r) { chip.hidden = true; suave.empurrar(null); return; }

          const previsao = modo === "asl"
            ? IAASL.classificarASL(r.raw, { largura: r.largura, altura: r.altura, mao: r.mao })
            : r.previsao;

          const s = suave.empurrar(previsao);
          chip.hidden = false;
          chip.textContent = s.etiqueta
            ? `${s.etiqueta} · ${Math.round(s.confianca * 100)}%`
            : "mão detetada";

          if (s.pronto && s.novo) {
            if (modo === "asl") soletrado += s.etiqueta;
            else sequencia.push(s.etiqueta);
            suave.confirmar(s.etiqueta);
            pintar();
          }
        },
        onErro: (e) => {
          const h = $("#hint", back);
          if (h) h.textContent = e.message === "camara-recusada"
            ? "A câmara foi recusada. Podes escrever a pergunta."
            : "Não foi possível abrir a câmara. Escreve a pergunta.";
        }
      });

      const ok = await camara.iniciar();
      const h = $("#hint", back);
      if (ok && h) h.textContent = "Mantém a mão parada até ser aceite.";
    }
  }


  /* E07 — confirmar e dizer */
  function passoEscrever(recolhido = "", modo = "gestos") {
    const vol = store.config().volume ?? 1;
    const temRecolha = !!(recolhido || "").trim();
    passo.innerHTML = `
      <h3>Escrever a pergunta</h3>
      ${temRecolha ? `
        <div style="margin-top:10px">
          <div class="small muted" style="margin-bottom:6px">${modo === "asl" ? "letras soletradas (ASL)" : "gestos reconhecidos"}</div>
          <div class="glosas"><span style="font-size:19px;font-weight:600;letter-spacing:.06em">${escapar(recolhido)}</span></div>
          <div class="muted small" style="margin-top:8px">É uma pista, não uma tradução. Escreve a pergunta em português.</div>
        </div>` : ""}
      <textarea id="txtPergunta" class="pergunta-box" style="margin-top:12px" placeholder="Escreve aqui a tua pergunta…" aria-label="Pergunta">${modo === "asl" && temRecolha ? escapar(recolhido.trim()) : ""}</textarea>
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

/* ───────────────── recolha de gestos ───────────────── */

function ecraGestos() {
  marcarTab("aulas");
  topo({ kicker: "LGP", titulo: "Gravar gestos", voltar: () => history.back() });

  render(`
    <div class="screen">
      <div class="notice warn">
        <strong>A app não sabe LGP — aprende o que lhe mostrares</strong>
        Grava cada gesto sob a etiqueta que quiseres. Aprende o gesto correto antes de gravar, senão ensinas-lhe um erro e ela fica confiante nele.
      </div>

      <div class="camera-wrap" style="aspect-ratio:1/1">
        <video id="cam" autoplay playsinline muted></video>
        <canvas id="pontos"></canvas>
        <div class="gesto-chip" id="chip" hidden>—</div>
        <div class="camera-hint" id="hint">A carregar a deteção de mãos…</div>
      </div>
      <div id="falhaGestos"></div>

      <div class="field">
        <label for="etiqueta">Etiqueta do gesto</label>
        <input id="etiqueta" placeholder="SIM, OBRIGADO, REPETIR…" autocomplete="off">
        <div class="chips" style="margin-top:8px">
          ${LGP.VOCABULARIO_SUGERIDO.map(v => `<button class="chip plain" data-sug="${escapar(v)}">${escapar(v)}</button>`).join("")}
        </div>
      </div>
      <button class="btn" id="btnGravar" disabled>Gravar 20 amostras</button>
      <a class="btn sec" href="#/importar">Importar de imagens, sem gravar</a>

      <div class="card" id="statsCard"></div>

      <div class="notice info">
        <strong>Duas limitações a saber</strong>
        Isto distingue <b>formas de mão</b>, não movimento: gestos que dependem de trajetória não funcionam. E um classificador gravado por uma só pessoa aprende essa pessoa — para números defensáveis, gravem os dois, e de preferência com alguém da comunidade surda.
      </div>
    </div>`);

  function pintarStats() {
    const st = LGP.estatisticas();
    $("#statsCard").innerHTML = `
      <div class="row between" style="margin-bottom:10px">
        <b>Gestos gravados</b>
        ${st.classes ? `<span class="muted small">${st.classes} classes · ${st.total} amostras</span>` : ""}
      </div>
      ${st.classes ? `
        <div class="chips">${st.etiquetas.map(([e, n]) =>
          `<span class="chip">${escapar(e)} · ${n}<button class="x" data-apagar="${escapar(e)}" aria-label="Apagar ${escapar(e)}">×</button></span>`).join("")}</div>
        <div class="muted small" style="margin-top:10px">
          Exatidão esperada com ${st.classes} classe${st.classes > 1 ? "s" : ""}: <b>${st.exatidaoEsperada}</b>.
          A curva da literatura: ~94% a 20 gestos, ~46% a 292.
        </div>`
        : `<span class="muted small">Ainda não há gestos gravados.</span>`}`;

    $$("[data-apagar]").forEach(b => b.onclick = (ev) => {
      ev.stopPropagation();
      LGP.removerEtiqueta(b.dataset.apagar);
      pintarStats();
      toast(b.dataset.apagar + " apagado.");
    });
  }
  pintarStats();

  let vec = null;
  const captura = LGP.criarCaptura({
    video: $("#cam"), canvas: $("#pontos"),
    onResultado: (r) => {
      const chip = $("#chip");
      if (!chip) return;
      vec = r ? r.vec : null;
      chip.hidden = !r;
      if (r) chip.textContent = r.previsao
        ? `${r.previsao.etiqueta} · ${Math.round(r.previsao.confianca * 100)}%`
        : "mão detetada";
      const b = $("#btnGravar");
      if (b) b.disabled = !vec || !$("#etiqueta").value.trim();
    },
    /* Dizia sempre "Câmara indisponível", mesmo quando a câmara estava boa e
       o que faltava era o MediaPipe. São problemas diferentes: um resolve-se
       nas permissões, o outro na rede. */
    onErro: (e) => {
      const h = $("#hint");
      if (e.peca) {
        const [titulo, corpo] = LGP.explicarFalha(e.peca);
        if (h) h.textContent = titulo;
        $("#falhaGestos").innerHTML =
          `<div class="notice danger" style="margin:0"><strong>${escapar(titulo)}</strong>${escapar(corpo)}<br><span class="muted small">${escapar(e.message)}</span></div>`;
      } else {
        const recusada = e.message === "camara-recusada";
        if (h) h.textContent = recusada ? "Câmara recusada" : "Câmara indisponível";
        $("#falhaGestos").innerHTML =
          `<div class="notice danger" style="margin:0"><strong>${recusada ? "Câmara recusada" : "Câmara indisponível"}</strong>${
            recusada
              ? "Permite a câmara no cadeado ao lado do endereço e recarrega."
              : "Não há câmara disponível, ou está a ser usada por outra aplicação."
          }</div>`;
      }
    }
  });
  captura.iniciar().then(ok => { const h = $("#hint"); if (ok && h) h.textContent = "Mantém o gesto parado enquanto grava."; });

  $("#etiqueta").oninput = () => { $("#btnGravar").disabled = !vec || !$("#etiqueta").value.trim(); };
  $$("[data-sug]").forEach(b => b.onclick = () => {
    $("#etiqueta").value = b.dataset.sug;
    $("#btnGravar").disabled = !vec;
  });

  $("#btnGravar").onclick = async () => {
    const etq = $("#etiqueta").value.trim().toUpperCase();
    if (!etq) return;
    const b = $("#btnGravar");
    b.disabled = true;
    let gravadas = 0;
    for (let i = 0; i < 20; i++) {
      if (vec) { LGP.adicionarAmostra(etq, vec); gravadas++; }
      b.textContent = `A gravar… ${i + 1}/20`;
      await new Promise(r => setTimeout(r, 110));
    }
    b.textContent = "Gravar 20 amostras";
    b.disabled = false;
    pintarStats();
    toast(gravadas ? `${etq}: ${gravadas} amostras.` : "Nenhuma mão detetada — tenta outra vez.");
  };

  limpezaEcra = () => captura.parar();
}


/* ───────────────── importar alfabeto de imagens ───────────────── */

function ecraImportar() {
  marcarTab("aulas");
  topo({ kicker: "LGP", titulo: "Importar de imagens", voltar: "#/gestos" });

  render(`
    <div class="screen">
      <p class="muted">Arrasta imagens das formas de mão e a app extrai os pontos — sem gravar nada. O nome do ficheiro vira a etiqueta: <code>A.png</code> fica <b>A</b>.</p>

      <div class="notice warn">
        <strong>Fotografias funcionam melhor do que desenhos</strong>
        O MediaPipe foi treinado com fotografias de mãos reais. Em cartas de alfabeto desenhadas a traço, a deteção falha muitas vezes. Se falhar, fotografa as mãos a fazer cada letra — serve o telemóvel.
      </div>

      <div class="dropzone" id="dz">
        <div style="font-size:30px;opacity:.5">&#8681;</div>
        <b>Toca para escolher imagens</b>
        <div class="muted small" style="margin-top:4px">Uma mão por imagem · PNG ou JPG · várias de uma vez</div>
        <input type="file" id="fich" accept="image/*" multiple hidden>
      </div>

      <div class="field">
        <label for="variantes">Variantes por imagem</label>
        <input type="range" id="variantes" min="0" max="30" step="2" value="12">
        <span class="muted small" id="varDesc">12 variantes — uma imagem por letra é pouco para k-NN, por isso gera-se ruído de deteção à volta de cada uma.</span>
      </div>

      <div id="res"></div>
      <div class="card" id="statsCard"></div>
    </div>`);

  function pintarStats() {
    const st = LGP.estatisticas();
    $("#statsCard").innerHTML = `
      <div class="row between" style="margin-bottom:10px">
        <b>Gestos gravados</b>
        ${st.classes ? `<span class="muted small">${st.classes} classes · ${st.total} amostras</span>` : ""}
      </div>
      ${st.classes
        ? `<div class="chips">${st.etiquetas.map(([e, n]) =>
            `<span class="chip">${escapar(e)} · ${n}<button class="x" data-apagar="${escapar(e)}" aria-label="Apagar ${escapar(e)}">×</button></span>`).join("")}</div>
           <div class="muted small" style="margin-top:10px">Exatidão esperada com ${st.classes} classe${st.classes > 1 ? "s" : ""}: <b>${st.exatidaoEsperada}</b></div>`
        : `<span class="muted small">Ainda não há nada importado.</span>`}`;
    $$("[data-apagar]").forEach(b => b.onclick = () => { LGP.removerEtiqueta(b.dataset.apagar); pintarStats(); });
  }
  pintarStats();

  $("#variantes").oninput = e => {
    const n = Number(e.target.value);
    $("#varDesc").textContent = n === 0
      ? "Sem variantes — só a amostra original de cada imagem."
      : `${n} variantes — uma imagem por letra é pouco para k-NN, por isso gera-se ruído de deteção à volta de cada uma.`;
  };

  const dz = $("#dz"), input = $("#fich");
  dz.onclick = () => input.click();
  dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); };
  dz.ondragleave = () => dz.classList.remove("over");
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove("over"); processar([...e.dataTransfer.files]); };
  input.onchange = () => processar([...input.files]);

  async function processar(ficheiros) {
    const imgs = ficheiros.filter(f => f.type.startsWith("image/"));
    if (!imgs.length) return toast("Escolhe ficheiros de imagem.");

    const res = $("#res");
    res.innerHTML = `<div class="notice info"><strong>A carregar o detetor</strong>Primeira vez demora uns segundos.</div>`;
    const c = await LGP.carregarDetetorImagem();
    if (!c.ok) {
      res.innerHTML = `<div class="notice danger"><strong>Não foi possível carregar o detetor</strong>${escapar(c.erro)}</div>`;
      return;
    }

    res.innerHTML = `<div class="card"><b>Resultado</b><div id="linhas" style="margin-top:8px"></div></div>`;
    const linhas = $("#linhas");
    const nVar = Number($("#variantes").value);
    let ok = 0, falhou = 0;

    for (const f of imgs) {
      const etiqueta = f.name.replace(/\.[^.]+$/, "").trim().toUpperCase().slice(0, 20);
      const linha = document.createElement("div");
      linha.className = "modelo-linha";
      linha.innerHTML = `<span class="grow"><code>${escapar(f.name)}</code></span><span class="muted small">a analisar…</span>`;
      linhas.appendChild(linha);

      try {
        const img = await carregarImagem(f);
        const d = LGP.detetarEmImagem(img);
        URL.revokeObjectURL(img.src);

        if (!d) {
          falhou++;
          linha.innerHTML = `<span class="grow"><code class="falhou">${escapar(f.name)}</code></span><span class="conf baixa">sem mão detetada</span>`;
          continue;
        }

        LGP.adicionarAmostra(etiqueta, d.vec);
        let n = 1;
        for (const v of LGP.variantesComRuido(d.vec, nVar)) { LGP.adicionarAmostra(etiqueta, v); n++; }
        ok++;
        linha.innerHTML = `<span class="grow"><code>${escapar(f.name)}</code> → <b>${escapar(etiqueta)}</b></span><span class="conf">${n} amostras</span>`;
      } catch (e) {
        falhou++;
        linha.innerHTML = `<span class="grow"><code class="falhou">${escapar(f.name)}</code></span><span class="conf baixa">${escapar(e.message || "erro")}</span>`;
      }
      await new Promise(r => setTimeout(r, 0));   // deixa a interface respirar
    }

    pintarStats();
    const resumo = document.createElement("div");
    resumo.className = falhou && !ok ? "notice danger" : falhou ? "notice warn" : "notice ok";
    resumo.style.marginTop = "12px";
    resumo.innerHTML = ok
      ? `<strong>${ok} imagem${ok > 1 ? "ns" : ""} importada${ok > 1 ? "s" : ""}</strong>${falhou ? `${falhou} sem mão detetada — se forem desenhos, tenta fotografias.` : "Podes já usar no ecrã de perguntar."}`
      : `<strong>Nenhuma mão detetada</strong>Se as imagens são desenhos a traço, o MediaPipe não as reconhece. Fotografa as mãos a fazer cada letra.`;
    $("#res").appendChild(resumo);
  }

  function carregarImagem(f) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("imagem ilegível"));
      img.src = URL.createObjectURL(f);
    });
  }
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
        <span class="muted small">Obtém-se em <b>aistudio.google.com</b>, na conta Google. Fica guardada só neste dispositivo.</span>
      </div>
      ${modoDev() ? `
      <div class="field">
        <label for="modelo">Modelo</label>
        <div class="row" style="gap:8px">
          <input id="modelo" class="grow" value="${escapar(c.modelo)}" placeholder="gemini-3.8-flash" autocomplete="off" list="listaModelos">
          <datalist id="listaModelos"></datalist>
          <button class="btn sec sm" id="procurar" style="flex:0 0 auto">Procurar</button>
        </div>
        <span class="muted small">«Procurar» lista os modelos que a tua chave consegue chamar. «Testar todos» experimenta cada um e diz quais respondem agora.</span>
      </div>
      <button class="btn sec sm" id="testarTodos" style="width:100%">Testar todos os modelos</button>
      <div id="modelos"></div>` : `
      <input type="hidden" id="modelo" value="${escapar(c.modelo)}">`}

      <div class="row" style="gap:10px">
        <button class="btn" id="guardar">Guardar</button>
        <button class="btn sec" id="testar">Testar</button>
      </div>
      <div id="res"></div>

      <div class="notice warn">
        <strong>A chave fica neste dispositivo</strong>
        Numa versão de produção as chamadas passariam por um servidor próprio — é lá que entraria também o vocabulário personalizado do reconhecimento de fala, que a Web Speech API não suporta.
      </div>

      ${modoDev() ? `<a class="btn sec" href="#/gestos">Gravar gestos de LGP</a>` : ""}

      <button class="btn ghost" id="apagar">Apagar todos os dados locais</button>

      <div class="muted small" style="text-align:center;padding-top:4px">
        ConTexto · versão <b>${VERSAO}</b><br>
        <span id="diag"></span>
      </div>
    </div>`);

  // Diagnóstico de uma linha: responde ao que costuma estar errado quando
  // "não acontece nada" — contexto inseguro, sem rede, sem chave.
  function diagnostico() {
    const d = $("#diag");
    if (!d) return;
    const partes = [];
    partes.push(window.isSecureContext ? "contexto seguro ✓" : "contexto INSEGURO ✗");
    partes.push(navigator.onLine === false ? "sem rede ✗" : "rede ✓");
    partes.push(store.config().geminiKey ? "chave guardada ✓" : "sem chave ✗");
    d.textContent = partes.join(" · ");
  }
  diagnostico();

  $("#guardar").onclick = () => {
    store.guardarConfig({ geminiKey: $("#key").value.trim(), modelo: $("#modelo").value.trim() || "gemini-3.8-flash" });
    // Repintar: a linha é lida a seguir a guardar, e continuar a dizer «sem
    // chave» faz parecer que não guardou.
    diagnostico();
    toast("Guardado.");
  };

  $("#procurar") && ($("#procurar").onclick = async () => {
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
  });
  /* Testa cada modelo candidato com um pedido mínimo. Distingue o que
     importa distinguir: 404 é um nome que não serve, 503 é um nome que
     serve mas está cheio. Sem isto, ambos pareciam «não funciona». */
  $("#testarTodos") && ($("#testarTodos").onclick = async () => {
    const chave = $("#key").value.trim();
    if (!chave) return toast("Põe a chave primeiro.");
    store.guardarConfig({ geminiKey: chave });

    const escolhido = $("#modelo").value.trim();
    const lista = [...new Set([escolhido, ...IA.ALTERNATIVAS].filter(Boolean))];

    $("#modelos").innerHTML = `<div class="card"><b>A testar ${lista.length} modelos</b>
      <div id="linhas" style="margin-top:10px"></div></div>`;

    const linhas = $("#linhas");
    for (const id of lista) {
      const row = document.createElement("div");
      row.className = "modelo-linha";
      row.innerHTML = `<span class="grow"><code>${escapar(id)}</code></span><span class="muted small">a testar…</span>`;
      linhas.appendChild(row);

      const r = await IA.testarModelo(id);
      if (!linhas.isConnected) return;               // o utilizador saiu do ecrã
      row.innerHTML = r.ok
        ? `<span class="grow"><code>${escapar(id)}</code></span>
           <span class="conf">${r.ms} ms</span>
           <button class="btn ghost sm" data-usar="${escapar(id)}" style="padding:2px 8px">usar</button>`
        : `<span class="grow"><code class="falhou">${escapar(id)}</code></span>
           <span class="conf baixa">${escapar(r.motivo)}</span>`;
    }

    $$("[data-usar]").forEach(b => b.onclick = () => {
      $("#modelo").value = b.dataset.usar;
      store.guardarConfig({ modelo: b.dataset.usar });
      toast(b.dataset.usar + " escolhido.");
    });
  });

  $("#testar").onclick = async () => {
    store.guardarConfig({ geminiKey: $("#key").value.trim(), modelo: $("#modelo").value.trim() || "gemini-3.8-flash" });
    $("#res").innerHTML = `<div class="notice info">A testar…</div>`;
    const r = await IA.testarChave();
    if (!r.ok) {
      $("#res").innerHTML = `<div class="notice danger"><strong>Falhou</strong>${escapar(IA.explicarErro(r.erro))}</div>`;
      return;
    }
    // Dizer qual respondeu: se um modelo estiver sobrecarregado, a app desce
    // para outro sozinha, e sem isto não haveria forma de perceber porquê.
    const pedido = $("#modelo").value.trim();
    const usado = IA.modeloEmUso;
    $("#res").innerHTML = (usado && usado !== pedido)
      ? `<div class="notice warn"><strong>A chave funciona, com outro modelo</strong>O <b>${escapar(pedido)}</b> não respondeu, por isso foi usado o <b>${escapar(usado)}</b>.</div>`
      : `<div class="notice ok"><strong>A chave funciona</strong>Respondeu o ${escapar(usado || pedido)}.</div>`;
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
  [/^#\/nova$/,             () => ecraNova()],
  [/^#\/extracao\/(.+)$/,   m => ecraExtracao(m[1])],
  [/^#\/material\/(.+)$/,   m => ecraMaterial(m[1])],
  [/^#\/sessao$/,           () => { const s = store.sessaoAtiva(); location.hash = s ? `#/sessao/${s.id}` : "#/aulas"; }],
  [/^#\/sessao\/(.+)$/,     m => ecraSessao(m[1])],
  [/^#\/resumo\/(.+)$/,     m => ecraResumo(m[1])],
  [/^#\/revisao\/(.+)$/,    m => ecraRevisao(m[1])],
  [/^#\/historico$/,        () => ecraHistorico()],
  [/^#\/gestos$/,           () => ecraGestos()],
  [/^#\/importar$/,         () => ecraImportar()],
  [/^#\/config$/,           () => ecraConfig()],
  [/^#\/dev$/,              () => {
    store.guardarConfig({ modoDev: true });
    indicadorDev();
    toast("Modo de teste ligado.");
    location.hash = "#/config";
  }]
];

/* Rotas que só existem em modo de teste. Fora dele devolvem à lista de
   aulas, para que um atalho antigo ou um recarregar não abra ferramentas.

   #/nova não está aqui: escolher a aula a que se vai assistir é do aluno.
   #/config também não: a chave da IAG é o que a app precisa para funcionar,
   e escondê-la atrás do modo de teste deixava a app inutilizável para quem
   não soubesse do atalho. O que lá dentro é ferramenta — escolher e testar
   modelos — continua escondido.

   O que o modo de teste guarda é o que vem depois — a extração passo a passo
   (#/extracao) e a importação de materiais (#/importar). */
const ROTAS_DEV = [/^#\/gestos/, /^#\/importar/, /^#\/extracao/];

function indicadorDev() {
  const existe = $("#devChip");
  if (!modoDev()) { existe && existe.remove(); return; }
  if (existe) return;
  const el = document.createElement("button");
  el.id = "devChip";
  el.innerHTML = `<span>modo de teste</span> <b>&times;</b>`;
  el.title = "Sair do modo de teste";
  el.onclick = () => {
    store.guardarConfig({ modoDev: false });
    indicadorDev();
    // Mudar o hash para onde já se está não dispara hashchange: redesenhar
    // à mão, senão as ferramentas ficavam à vista até à navegação seguinte.
    if (location.hash === "#/aulas") encaminhar(); else location.hash = "#/aulas";
    toast("Modo de teste desligado.");
  };
  document.body.appendChild(el);
}

function encaminhar() {
  if (limpezaEcra) { try { limpezaEcra(); } catch (e) { console.error(e); } limpezaEcra = null; }
  $$(".sheet-back").forEach(el => el.remove());
  document.body.classList.remove("com-pergunta");
  pararFala();
  const h = location.hash || "#/aulas";

  if (!modoDev() && ROTAS_DEV.some(re => re.test(h))) { location.hash = "#/aulas"; return; }
  indicadorDev();

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
