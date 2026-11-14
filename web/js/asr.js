/* asr.js — legendagem ao vivo através da Web Speech API.

   LIMITAÇÃO IMPORTANTE, assumida de propósito:
   a Web Speech API não aceita vocabulário personalizado. O produto descrito
   na Fase II depende de injetar o glossário da aula no reconhecedor
   (`custom_vocabulary`), e isso exige um serviço do lado do servidor.
   Aqui o glossário entra depois, na correspondência tolerante a erros de
   glossary.js: não evita que o reconhecedor erre o termo, mas recupera-o
   quando o erro é pequeno. É uma aproximação, e está documentada como tal. */

const Reconhecedor = window.SpeechRecognition || window.webkitSpeechRecognition;

/* Dentro da app Android não existe Web Speech API. O invólucro expõe o
   reconhecedor nativo como `ContextoSpeech` — ver android/SpeechBridge.kt.
   Quando a ponte existe, é preferida: é a única que funciona lá dentro. */
const ponte = (() => {
  try {
    return (window.ContextoSpeech && window.ContextoSpeech.disponivel())
      ? window.ContextoSpeech : null;
  } catch { return null; }
})();

export const asrDisponivel = !!(ponte || Reconhecedor);
export const asrNativo = !!ponte;

function criarASRNativo({ lingua, onParcial, onFinal, onErro, onEstado }) {
  let ativo = false;
  window.__contextoSpeech = (tipo, d) => {
    if (tipo === "parcial") onParcial && onParcial(d.texto);
    else if (tipo === "final") onFinal && onFinal({ texto: d.texto, confianca: d.confianca });
    else if (tipo === "estado") { ativo = d.estado === "a-ouvir"; onEstado && onEstado(d.estado); }
    else if (tipo === "erro") onErro && onErro(new Error(d.erro));
  };
  return {
    disponivel: true, nativo: true,
    iniciar() { try { ponte.iniciar(lingua); } catch (e) { onErro && onErro(e); } },
    parar() { try { ponte.parar(); } catch {} },
    ativo: () => ativo
  };
}

export function criarASR({ lingua = "pt-PT", onParcial, onFinal, onErro, onEstado } = {}) {
  if (ponte) return criarASRNativo({ lingua, onParcial, onFinal, onErro, onEstado });

  if (!Reconhecedor) {
    return {
      disponivel: false,
      iniciar() { onErro && onErro(new Error("sem-suporte")); },
      parar() {}, ativo: () => false
    };
  }

  let rec = null;
  let aCorrer = false;
  let paradoPeloUtilizador = false;
  let reinicios = 0;

  function construir() {
    const r = new Reconhecedor();
    r.lang = lingua;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => { aCorrer = true; reinicios = 0; onEstado && onEstado("a-ouvir"); };

    r.onresult = (ev) => {
      let parcial = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const alt = res[0];
        if (res.isFinal) {
          const conf = typeof alt.confidence === "number" && alt.confidence > 0
            ? alt.confidence
            : 0.9;                                  // alguns browsers não preenchem
          onFinal && onFinal({ texto: alt.transcript.trim(), confianca: conf });
        } else {
          parcial += alt.transcript;
        }
      }
      if (parcial) onParcial && onParcial(parcial.trim());
    };

    r.onerror = (ev) => {
      // "no-speech" e "aborted" são ruído normal, não falhas de verdade
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      onErro && onErro(new Error(ev.error || "erro-desconhecido"));
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        paradoPeloUtilizador = true;
        onEstado && onEstado("sem-permissao");
      }
    };

    r.onend = () => {
      aCorrer = false;
      if (paradoPeloUtilizador) { onEstado && onEstado("parado"); return; }
      // O Chrome termina sozinho ao fim de algum silêncio. Numa aula de duas
      // horas isso acontece muitas vezes, por isso reinicia-se com recuo.
      reinicios++;
      const espera = Math.min(250 * reinicios, 3000);
      onEstado && onEstado("a-retomar");
      setTimeout(() => {
        if (paradoPeloUtilizador) return;
        try { r.start(); } catch { /* já em curso */ }
      }, espera);
    };

    return r;
  }

  return {
    disponivel: true,
    iniciar() {
      paradoPeloUtilizador = false;
      if (!rec) rec = construir();
      try { rec.start(); } catch { /* já iniciado */ }
    },
    parar() {
      paradoPeloUtilizador = true;
      if (rec) { try { rec.stop(); } catch {} }
      onEstado && onEstado("parado");
    },
    ativo: () => aCorrer
  };
}

/** Pede a permissão do microfone antes de entrar na sessão, para que a
 *  verificação prévia (RF02) diga alguma coisa de útil em vez de falhar
 *  silenciosamente a meio da aula. */
export async function verificarMicrofone() {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, motivo: "sem-api" };
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach(t => t.stop());
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e.name === "NotAllowedError" ? "recusado" : "indisponivel" };
  }
}

export function verificarRede() {
  return { ok: navigator.onLine !== false };
}
