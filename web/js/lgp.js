/* lgp.js — reconhecimento de gestos no dispositivo (UC05 · RF20).

   O QUE ISTO É, E O QUE NÃO É
   ---------------------------
   Isto não traduz Língua Gestual Portuguesa. Reconhece um conjunto pequeno
   de gestos que o próprio utilizador gravou, e nada mais. A app não sabe LGP:
   aprende o que lhe mostrarem, sob a etiqueta que lhe derem.

   A decisão de manter o vocabulário pequeno não é modéstia, é o que os
   números obrigam. A exatidão cai a pique com o tamanho do vocabulário —
   ~94% a 20 gestos, ~46% a 292 — e um classificador treinado por uma ou duas
   pessoas aprende essas pessoas, não a língua.

   PRECEDENTE
   ----------
   github.com/khomy86/lgp-sign-recognition chegou a esta mesma arquitetura de
   forma independente, para LGP: MediaPipe, landmarks normalizados pelo pulso,
   classificador pequeno a correr no dispositivo. Reporta 94,1% com quatro
   formas de mão, e 82,5% se decidir frame a frame em vez de suavizar. Essa
   diferença — doze pontos só por suavizar — é a razão do suavizador aqui
   em baixo. Dois gestos foram deixados de fora desse projeto por se
   confundirem com os outros, o que também diz alguma coisa sobre a escolha
   do vocabulário.

   TEMPORAL
   --------
   Isto classifica FORMAS DE MÃO, não trajetórias. Gestos que dependem de
   movimento — a maior parte dos verbos — não são distinguíveis assim. É
   outra razão para o vocabulário restrito. */

const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODELO = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const CHAVE_AMOSTRAS = "contexto.lgp.amostras.v2";

/** Sugestões de etiquetas úteis numa aula. São só etiquetas: o gesto que
 *  fica associado a cada uma é o que o utilizador gravar. Aprendam o gesto
 *  correto antes de gravar, ou ensinam-se erros à app com toda a confiança. */
/* O alfabeto manual da LGP, para o assistente de gravação.

   O J, o X e o Z levam movimento e não se distinguem por forma de mão — o
   classificador aqui é de formas paradas. Ficam na lista para quem quiser
   tentar, mas marcados, porque gravá-los ensina ao classificador um instante
   arbitrário do movimento e ele fica confiante num erro. */
export const ALFABETO_LGP = [
  "A","B","C","D","E","F","G","H","I","J","K","L","M",
  "N","O","P","Q","R","S","T","U","V","W","X","Y","Z"
];
export const LETRAS_COM_MOVIMENTO = new Set(["J", "X", "Z"]);

export const VOCABULARIO_SUGERIDO = [
  "SIM", "NÃO", "OBRIGADO", "REPETIR",
  "NÃO-PERCEBI", "MAIS-DEVAGAR", "PORQUÊ", "EXEMPLO"
];

let mod = null, detetor = null, erroCarregamento = null;

/* Três peças externas, e cada uma falha de maneira diferente: a biblioteca
   (jsDelivr), o wasm (jsDelivr), e o modelo treinado (storage.googleapis.com,
   da Google). Antes, qualquer uma delas dava a mesma mensagem em inglês e o
   ecrã dizia "Câmara indisponível" — com a câmara perfeitamente boa.

   Ao contrário do pdf.js, estas não estão no repositório: são mais de 10 MB,
   e este ecrã está fora do âmbito da app. A consequência é que precisam de
   internet, e numa rede que bloqueie o storage.googleapis.com — o que algumas
   redes institucionais fazem — não há volta a dar. Dizê-lo é o mínimo. */
export async function carregarModelo() {
  if (detetor) return { ok: true };
  if (erroCarregamento) return { ok: false, erro: erroCarregamento, peca: pecaEmFalta };

  try {
    pecaEmFalta = "biblioteca";
    mod = await import(/* @vite-ignore */ CDN);

    pecaEmFalta = "wasm";
    const vision = await mod.FilesetResolver.forVisionTasks(CDN + "/wasm");

    pecaEmFalta = "modelo";
    /* GPU primeiro, CPU a seguir. A delegação GPU falha em WebViews e em
       máquinas sem WebGL2, e nesses casos corre em CPU — mais devagar, mas
       corre, que é melhor do que não haver ecrã nenhum. */
    const opcoes = (delegate) => ({
      baseOptions: { modelAssetPath: MODELO, delegate },
      runningMode: "VIDEO",
      numHands: 1
    });
    try {
      detetor = await mod.HandLandmarker.createFromOptions(vision, opcoes("GPU"));
    } catch {
      detetor = await mod.HandLandmarker.createFromOptions(vision, opcoes("CPU"));
    }

    pecaEmFalta = null;
    return { ok: true };
  } catch (e) {
    erroCarregamento = e.message || String(e);
    return { ok: false, erro: erroCarregamento, peca: pecaEmFalta };
  }
}

/** Qual das peças externas ficou por carregar, para a interface poder dizer
 *  o que é preciso em vez de mostrar a mensagem do browser. */
export let pecaEmFalta = null;

export function explicarFalha(peca) {
  return ({
    biblioteca: ["Não foi possível carregar o MediaPipe",
      "A biblioteca de deteção de mãos vem de cdn.jsdelivr.net e precisa de internet. Se a rede a bloquear, este ecrã não funciona."],
    wasm: ["Não foi possível carregar o motor de deteção",
      "O módulo WebAssembly do MediaPipe não chegou. Normalmente é rede, ou um browser antigo demais."],
    modelo: ["Não foi possível carregar o modelo de mãos",
      "O modelo vem de storage.googleapis.com. Algumas redes institucionais bloqueiam esse domínio — testa noutra rede ou com dados móveis."]
  })[peca] || ["A deteção de mãos não arrancou", "Nenhuma das peças externas respondeu."];
}

export const modeloCarregado = () => !!detetor;

/* ───────────────── deteção em imagem parada ─────────────────
   Para importar o alfabeto a partir de fotografias ou cartas, em vez de
   gravar. Precisa de um detetor em modo IMAGE: o de VIDEO exige marcas
   temporais crescentes e recusa imagens soltas.

   Aviso: o MediaPipe foi treinado com fotografias. Em desenhos de linha,
   que é o que a maior parte das cartas de alfabeto são, a deteção falha
   com frequência. Fotografias de mãos reais funcionam muito melhor. */

let detetorImagem = null;

export async function carregarDetetorImagem() {
  if (detetorImagem) return { ok: true };
  try {
    if (!mod) mod = await import(/* @vite-ignore */ CDN);
    const vision = await mod.FilesetResolver.forVisionTasks(CDN + "/wasm");
    detetorImagem = await mod.HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODELO, delegate: "GPU" },
      runningMode: "IMAGE",
      numHands: 1,
      // Limiares baixos: numa carta desenhada vale a pena arriscar a deteção
      // e deixar a pessoa confirmar, em vez de recusar tudo em silêncio.
      minHandDetectionConfidence: 0.2,
      minHandPresenceConfidence: 0.2
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message || String(e) };
  }
}

/** Deteta uma mão numa imagem já carregada. Devolve os pontos em bruto e o
 *  vetor normalizado, ou null se não encontrar mão nenhuma. */
export function detetarEmImagem(elementoImagem) {
  if (!detetorImagem) return null;
  const res = detetorImagem.detect(elementoImagem);
  const lm = res?.landmarks?.[0];
  if (!lm) return null;
  return {
    raw: lm,
    vec: normalizarPontos(lm),
    mao: (res.handedness?.[0]?.[0]?.categoryName || "Right").toLowerCase()
  };
}

/* Uma imagem por letra dá uma amostra por classe, o que é pouco para k-NN.
   Gerar variantes com ruído nos pontos simula a imprecisão da deteção e
   torna o classificador tolerante a ela.

   Note-se o que NÃO se ganha aqui: rodar, escalar ou deslocar não serve de
   nada, porque a normalização remove exatamente isso. O único eixo de
   variação que sobra é o ruído de deteção — e é esse que se imita. */
export function variantesComRuido(vec, n = 12, sigma = 0.03) {
  const saida = [];
  for (let k = 0; k < n; k++) {
    const v = new Float32Array(63);
    for (let i = 0; i < 63; i++) {
      // Box-Muller para ruído gaussiano
      const u = Math.random() || 1e-9, w = Math.random();
      const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
      v[i] = vec[i] + g * sigma;
    }
    saida.push(v);
  }
  return saida;
}

/* ───────────────── normalização ─────────────────
   Translação para o pulso, escala pela distância pulso→nó do médio, e
   rotação para a vertical. O que sobra é a forma da mão, independente de
   onde está no enquadramento, do tamanho da mão e da inclinação do pulso.
   É isto que permite treinar com poucas amostras: a maior parte da variação
   foi removida antes de o classificador a ver. */

export function normalizarPontos(lm) {
  const w = lm[0], m = lm[9];
  const dx = m.x - w.x, dy = m.y - w.y;
  const escala = Math.hypot(dx, dy) || 1e-6;
  const ang = Math.atan2(dy, dx) + Math.PI / 2;
  const cos = Math.cos(-ang), sin = Math.sin(-ang);

  const out = new Float32Array(63);
  for (let i = 0; i < 21; i++) {
    const x = (lm[i].x - w.x) / escala;
    const y = (lm[i].y - w.y) / escala;
    const z = ((lm[i].z || 0) - (w.z || 0)) / escala;
    out[i * 3]     = x * cos - y * sin;
    out[i * 3 + 1] = x * sin + y * cos;
    out[i * 3 + 2] = z;
  }
  return out;
}

/* ───────────────── amostras ───────────────── */

let amostras = [];

export function carregarAmostras() {
  try {
    const cru = localStorage.getItem(CHAVE_AMOSTRAS);
    amostras = cru ? JSON.parse(cru) : [];
  } catch { amostras = []; }
  return amostras;
}

function gravar() {
  try { localStorage.setItem(CHAVE_AMOSTRAS, JSON.stringify(amostras)); } catch {}
}

export function adicionarAmostra(etiqueta, vec) {
  amostras.push({ etiqueta, vec: Array.from(vec) });
  gravar();
  return amostras.length;
}

export function removerEtiqueta(etiqueta) {
  amostras = amostras.filter(a => a.etiqueta !== etiqueta);
  gravar();
}

export function limparAmostras() { amostras = []; gravar(); }

export function estatisticas() {
  const por = new Map();
  for (const a of amostras) por.set(a.etiqueta, (por.get(a.etiqueta) || 0) + 1);
  const etiquetas = [...por.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return {
    total: amostras.length,
    etiquetas,
    classes: etiquetas.length,
    // A curva da literatura, para que o número apresentado seja honesto.
    exatidaoEsperada: etiquetas.length === 0 ? null
      : etiquetas.length <= 5 ? "~94%"
      : etiquetas.length <= 20 ? "~90–94%"
      : etiquetas.length <= 60 ? "~85–91%"
      : "bem abaixo de 85%"
  };
}

/* ───────────────── classificação ─────────────────
   k-NN por distância euclidiana. Escolhido por cima de uma rede pequena
   porque não tem passo de treino: grava-se uma amostra e ela conta já. Para
   dezenas de amostras e menos de vinte classes, a diferença de exatidão não
   justifica o aparato de treinar. */

export function classificar(vec, k = 5) {
  if (!amostras.length) return null;
  const d = amostras.map(a => {
    let s = 0;
    for (let i = 0; i < 63; i++) { const t = vec[i] - a.vec[i]; s += t * t; }
    return { etiqueta: a.etiqueta, d: s };
  });
  d.sort((x, y) => x.d - y.d);

  const kk = Math.min(k, d.length);
  const votos = new Map();
  for (let i = 0; i < kk; i++) votos.set(d[i].etiqueta, (votos.get(d[i].etiqueta) || 0) + 1);

  let melhor = null, n = 0;
  for (const [e, c] of votos) if (c > n) { melhor = e; n = c; }
  return { etiqueta: melhor, confianca: n / kk, distancia: Math.sqrt(d[0].d) };
}

/* ───────────────── suavizador temporal ─────────────────
   Decidir a cada frame treme e erra. O projeto de referência mede 82,5%
   frame a frame contra 94,1% com média de dez — doze pontos de graça, só
   por não decidir à pressa. Além disso exige que o gesto esteja parado:
   enquanto a mão se move entre gestos, a janela fica dividida e nada é
   emitido, o que serve de segmentação pobre mas funcional. */

export function criarSuavizador({ janela = 10, limiar = 0.6 } = {}) {
  let hist = [];
  let ultimoEmitido = null;

  return {
    empurrar(previsao) {
      hist.push(previsao ? previsao.etiqueta : null);
      if (hist.length > janela) hist.shift();
      if (hist.length < janela) return { pronto: false, etiqueta: null, confianca: 0 };

      const votos = new Map();
      for (const e of hist) if (e) votos.set(e, (votos.get(e) || 0) + 1);

      let melhor = null, n = 0;
      for (const [e, c] of votos) if (c > n) { melhor = e; n = c; }

      const confianca = n / janela;
      const estavel = melhor && confianca >= limiar;
      return {
        pronto: !!estavel,
        etiqueta: estavel ? melhor : null,
        confianca,
        novo: estavel && melhor !== ultimoEmitido
      };
    },
    confirmar(etiqueta) { ultimoEmitido = etiqueta; },
    limpar() { hist = []; ultimoEmitido = null; }
  };
}

/* ───────────────── captura ───────────────── */

export function criarCaptura({ video, canvas, onResultado, onErro }) {
  let stream = null, aCorrer = false, ultimoT = -1, raf = null, desenho = null;
  const ctx = canvas ? canvas.getContext("2d") : null;

  async function iniciar() {
    const c = await carregarModelo();
    if (!c.ok) {
      const e = new Error(c.erro);
      e.peca = c.peca;            // qual das peças externas faltou
      onErro && onErro(e);
      return false;
    }
    if (ctx && mod?.DrawingUtils && !desenho) desenho = new mod.DrawingUtils(ctx);

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 1280 } },
        audio: false
      });
    } catch (e) {
      onErro && onErro(new Error(e.name === "NotAllowedError" ? "camara-recusada" : "camara-indisponivel"));
      return false;
    }

    video.srcObject = stream;
    await video.play().catch(() => {});
    aCorrer = true;
    raf = requestAnimationFrame(ciclo);
    return true;
  }

  function ciclo() {
    if (!aCorrer) return;
    if (canvas && video.videoWidth && canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    if (video.currentTime !== ultimoT && video.readyState >= 2) {
      ultimoT = video.currentTime;
      try {
        const res = detetor.detectForVideo(video, performance.now());
        const maos = res.landmarks || [];
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          for (const lm of maos) {
            desenho?.drawConnectors(lm, mod.HandLandmarker.HAND_CONNECTIONS, { color: "#7FE3A4", lineWidth: 3 });
            desenho?.drawLandmarks(lm, { color: "#FFF0BF", lineWidth: 1, radius: 4 });
          }
        }
        if (maos.length) {
          const vec = normalizarPontos(maos[0]);
          // Os landmarks em bruto, a lateralidade e o tamanho do frame seguem
          // também: o modelo do alfabeto ASL tem a sua própria normalização,
          // diferente desta, e precisa deles. Ver asl.js.
          const cat = res.handedness?.[0]?.[0]?.categoryName || "Right";
          onResultado && onResultado({
            vec,
            previsao: classificar(vec),
            raw: maos[0],
            mao: cat.toLowerCase(),
            largura: video.videoWidth,
            altura: video.videoHeight
          });
        } else {
          onResultado && onResultado(null);
        }
      } catch { /* um frame falhado não interrompe a sessão */ }
    }
    raf = requestAnimationFrame(ciclo);
  }

  function parar() {
    aCorrer = false;
    if (raf) cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if (video) video.srcObject = null;
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { iniciar, parar, ativo: () => aCorrer };
}

carregarAmostras();
