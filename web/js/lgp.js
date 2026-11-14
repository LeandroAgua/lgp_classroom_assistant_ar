/* lgp.js — captação do gesto no dispositivo (UC05 · RF20).

   Duas camadas:

   1. MediaPipe Hand/Gesture Landmarker extrai 21 pontos tridimensionais da
      mão, em cada frame, dentro do browser. O vídeo NUNCA sai do
      dispositivo — resolve ao mesmo tempo o custo e a privacidade de ter uma
      câmara apontada a uma pessoa durante uma aula inteira.

   2. Um classificador k-NN sobre esses pontos, treinado pelo próprio
      utilizador. Não há modelo de LGP pronto a usar, e a literatura mostra
      que a exatidão cai a pique com o tamanho do vocabulário (~94% com 20
      gestos, ~46% com 292). Por isso o vocabulário aqui é restrito e
      recolhido pelo próprio: é o que permite um número honesto.

   Os pontos são normalizados (translação pelo pulso, escala pela distância
   pulso→nó do médio, rotação para a vertical), o que torna o classificador
   invariante à posição, ao tamanho da mão e à inclinação. */

const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODELO = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task";
const CHAVE_AMOSTRAS = "contexto.lgp.amostras.v1";

export const GESTOS_PRE_TREINADOS = {
  Closed_Fist: "Punho fechado",
  Open_Palm: "Mão aberta",
  Pointing_Up: "Dedo para cima",
  Thumb_Down: "Polegar para baixo",
  Thumb_Up: "Polegar para cima",
  Victory: "V de vitória",
  ILoveYou: "«Amo-te» (ASL)",
  None: "—"
};

let mod = null;            // { GestureRecognizer, FilesetResolver, DrawingUtils }
let recon = null;
let erroCarregamento = null;

/** Carrega o MediaPipe por import dinâmico. Um import estático que falhe
 *  derruba o módulo inteiro — aqui a app continua a funcionar sem câmara. */
export async function carregarModelo() {
  if (recon) return { ok: true };
  if (erroCarregamento) return { ok: false, erro: erroCarregamento };
  try {
    mod = await import(/* @vite-ignore */ CDN);
    const vision = await mod.FilesetResolver.forVisionTasks(CDN + "/wasm");
    recon = await mod.GestureRecognizer.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODELO, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 1
    });
    return { ok: true };
  } catch (e) {
    erroCarregamento = e.message || String(e);
    return { ok: false, erro: erroCarregamento };
  }
}

export function modeloCarregado() { return !!recon; }

/* ───────────────── normalização ───────────────── */

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

/* ───────────────── amostras e k-NN ───────────────── */

let amostras = [];   // [{ etiqueta, vec:number[] }]

export function carregarAmostras() {
  try {
    const cru = localStorage.getItem(CHAVE_AMOSTRAS);
    amostras = cru ? JSON.parse(cru) : [];
  } catch { amostras = []; }
  return amostras;
}

function gravarAmostras() {
  try { localStorage.setItem(CHAVE_AMOSTRAS, JSON.stringify(amostras)); } catch {}
}

export function adicionarAmostra(etiqueta, vec) {
  amostras.push({ etiqueta, vec: Array.from(vec) });
  gravarAmostras();
  return amostras.length;
}

export function removerEtiqueta(etiqueta) {
  amostras = amostras.filter(a => a.etiqueta !== etiqueta);
  gravarAmostras();
}

export function limparAmostras() { amostras = []; gravarAmostras(); }

export function estatisticas() {
  const porEtiqueta = new Map();
  for (const a of amostras) porEtiqueta.set(a.etiqueta, (porEtiqueta.get(a.etiqueta) || 0) + 1);
  return {
    total: amostras.length,
    etiquetas: [...porEtiqueta.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  };
}

/** k-NN por distância euclidiana. A confiança é a fração de vizinhos que
 *  votaram no vencedor — grosseira, mas é uma medida real e explicável. */
export function classificar(vec, k = 5) {
  if (!amostras.length) return null;
  const dists = amostras.map(a => {
    let s = 0;
    for (let i = 0; i < 63; i++) { const d = vec[i] - a.vec[i]; s += d * d; }
    return { etiqueta: a.etiqueta, d: s };
  });
  dists.sort((x, y) => x.d - y.d);

  const kk = Math.min(k, dists.length);
  const votos = new Map();
  for (let i = 0; i < kk; i++) votos.set(dists[i].etiqueta, (votos.get(dists[i].etiqueta) || 0) + 1);

  let melhor = null, n = 0;
  for (const [e, c] of votos) if (c > n) { melhor = e; n = c; }
  return { etiqueta: melhor, confianca: n / kk, distancia: Math.sqrt(dists[0].d) };
}

/* ───────────────── captura ───────────────── */

export function criarCaptura({ video, canvas, onResultado, onErro }) {
  let stream = null, aCorrer = false, ultimoT = -1, raf = null;
  const ctx = canvas ? canvas.getContext("2d") : null;
  let desenho = null;

  async function iniciar() {
    const c = await carregarModelo();
    if (!c.ok) { onErro && onErro(new Error(c.erro)); return false; }
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
        const res = recon.recognizeForVideo(video, performance.now());
        const maos = res.landmarks || [];
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          for (const lm of maos) {
            desenho?.drawConnectors(lm, mod.GestureRecognizer.HAND_CONNECTIONS, { color: "#7FE3A4", lineWidth: 3 });
            desenho?.drawLandmarks(lm, { color: "#FFF0BF", lineWidth: 1, radius: 4 });
          }
        }
        if (maos.length) {
          const vec = normalizarPontos(maos[0]);
          onResultado && onResultado({
            vec,
            gestoPreTreinado: res.gestures?.[0]?.[0] || null,
            propria: classificar(vec)
          });
        } else {
          onResultado && onResultado(null);
        }
      } catch (e) { /* um frame falhado não interrompe a sessão */ }
    }
    raf = requestAnimationFrame(ciclo);
  }

  function parar() {
    aCorrer = false;
    if (raf) cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if (video) video.srcObject = null;
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { iniciar, parar, ativo: () => aCorrer };
}

export async function verificarCamara() {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, motivo: "sem-api" };
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true });
    s.getTracks().forEach(t => t.stop());
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e.name === "NotAllowedError" ? "recusado" : "indisponivel" };
  }
}

carregarAmostras();
