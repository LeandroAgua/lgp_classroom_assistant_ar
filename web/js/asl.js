/* asl.js — alfabeto ASL, PROVISÓRIO.
   ================================================================
   ISTO NÃO É LGP. É o alfabeto manual AMERICANO.
   ================================================================

   Está aqui por uma razão prática: não existe modelo nem dataset público do
   alfabeto da LGP. O artigo de 2025 na Electronics (MDPI) que construiu um
   sistema de alfabeto LGP diz, com todas as letras, que teve de fazer o
   dataset próprio porque «no suitable public dataset for LGP alphabet
   gestures was available», e os dados deles só estão disponíveis a pedido.

   E os alfabetos NÃO são intercambiáveis. O alfabeto manual português vem
   da tradição sueca, ao passo que o ASL e a LIBRAS descendem ambos da
   francesa — são parecidos um com o outro e estranhos à LGP. Por isso isto
   serve para demonstrar a cadeia completa (câmara → pontos → classificador
   → letra), e nada mais. Qualquer ecrã que o use tem de dizer ASL.

   Para passar a LGP: gravar as 26 formas de mão portuguesas com o ecrã de
   recolha e usar o classificador k-NN de lgp.js. A cadeia é a mesma.

   ---------------------------------------------------------------
   MODELO: regressão logística sobre 63 números, 24 letras (sem J e
   Z, que precisam de movimento). Ficheiro de pesos em
   web/models/asl-letters.json, de github.com/lanixiligan/sema (MIT),
   treinado sobre os datasets ASL-HG e ASLYset, ambos CC BY 4.0.
   Ver ATTRIBUTION.md. O ficheiro tem só pesos: nenhuma fotografia.

   A NORMALIZAÇÃO tem de ser exatamente a do treino, senão o modelo
   devolve lixo com toda a confiança. Em particular NÃO há rotação,
   ao contrário da normalização em lgp.js: a orientação da mão
   carrega significado, e sem ela o H e o U ficam iguais.
   --------------------------------------------------------------- */

const CAMINHO = "models/asl-letters.json";

let modelo = null, aCarregar = null, erro = null;

export async function carregarModeloASL() {
  if (modelo) return { ok: true };
  if (erro) return { ok: false, erro };
  if (!aCarregar) {
    aCarregar = (async () => {
      const r = await fetch(CAMINHO);
      if (!r.ok) throw new Error(`modelo ASL: HTTP ${r.status}`);
      const d = await r.json();
      if (!d.layers?.[0]?.weights || !d.mean || !d.scale) throw new Error("modelo ASL com formato inesperado");
      return d;
    })();
  }
  try {
    modelo = await aCarregar;
    return { ok: true };
  } catch (e) {
    erro = e.message || String(e);
    aCarregar = null;
    return { ok: false, erro };
  }
}

export const modeloASLCarregado = () => !!modelo;
export const letrasASL = () => modelo ? modelo.letters.slice() : [];

/**
 * Converte 21 landmarks do MediaPipe em 63 números que descrevem só a forma
 * da mão. Reimplementação fiel de normalizeHand.js do Sema (MIT) — ver o
 * comentário no topo sobre por que não há rotação.
 *
 * @param raw     21 pontos {x,y,z} como o MediaPipe os devolve (x e y são
 *                frações da largura e da altura; z está à escala de x)
 * @param largura,altura  dimensões do frame, para corrigir a proporção
 * @param mao     "left" ou "right", da deteção de lateralidade
 */
export function normalizarASL(raw, { largura, altura, mao }) {
  if (!raw || raw.length < 21 || !largura || !altura) return null;

  // 1. Unidades iguais nos dois eixos, senão um frame 640×480 estica a mão.
  const p = raw.map(q => ({ x: q.x * largura, y: q.y * altura, z: (q.z || 0) * largura }));

  // 2. Pulso na origem.
  const w = p[0];
  const m = p.map(q => ({ x: q.x - w.x, y: q.y - w.y, z: q.z - w.z }));

  // 3. Escala pelo comprimento da palma — pulso até à base do médio, que não
  //    muda quando os dedos dobram.
  const base = m[9];
  const palma = Math.hypot(base.x, base.y, base.z);
  if (!(palma > 1e-6)) return null;

  // 4. Mãos esquerdas espelhadas para parecerem direitas: um modelo serve as duas.
  const flip = mao === "left" ? -1 : 1;

  const out = new Float32Array(63);
  for (let i = 0; i < 21; i++) {
    out[i * 3]     = (flip * m[i].x) / palma;
    out[i * 3 + 1] = m[i].y / palma;
    out[i * 3 + 2] = m[i].z / palma;
  }
  return out;
}

/** Regressão logística com softmax. Devolve null abaixo do limiar do modelo,
 *  que é o «não tenho a certeza» — preferível a adivinhar uma letra. */
export function preverLetra(vec) {
  if (!modelo || !vec) return null;

  const { mean, scale, letters, threshold } = modelo;
  const { weights, biases } = modelo.layers[0];

  // Padronização com a média e o desvio do treino.
  const x = new Float64Array(63);
  for (let i = 0; i < 63; i++) {
    const s = scale[i] || 1;
    x[i] = (vec[i] - mean[i]) / s;
  }

  const logits = new Float64Array(letters.length);
  let maxLogit = -Infinity;
  for (let c = 0; c < letters.length; c++) {
    const wc = weights[c];
    let s = biases[c];
    for (let i = 0; i < 63; i++) s += wc[i] * x[i];
    logits[c] = s;
    if (s > maxLogit) maxLogit = s;
  }

  // Softmax estável.
  let soma = 0;
  for (let c = 0; c < logits.length; c++) { logits[c] = Math.exp(logits[c] - maxLogit); soma += logits[c]; }

  let melhor = 0;
  for (let c = 1; c < logits.length; c++) if (logits[c] > logits[melhor]) melhor = c;
  const confianca = logits[melhor] / (soma || 1);

  return {
    etiqueta: letters[melhor],
    confianca,
    certo: confianca >= (threshold ?? 0.6)
  };
}

/** Classifica direto a partir dos landmarks em bruto. */
export function classificarASL(raw, meta) {
  const vec = normalizarASL(raw, meta);
  if (!vec) return null;
  const p = preverLetra(vec);
  if (!p || !p.certo) return null;        // abaixo do limiar: não arrisca
  return { etiqueta: p.etiqueta, confianca: p.confianca };
}
