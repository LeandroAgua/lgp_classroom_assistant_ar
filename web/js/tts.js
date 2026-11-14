/* tts.js — leitura da pergunta em voz alta (RF23).
   O aluno surdo não ouve o resultado, por isso a interface tem de mostrar
   visualmente que a fala está a decorrer e quando termina. */

let vozesCache = null;

function vozes() {
  if (vozesCache) return vozesCache;
  vozesCache = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  return vozesCache;
}

if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => { vozesCache = null; vozes(); };
}

export const ttsDisponivel = !!window.speechSynthesis;

function escolherVoz(lingua) {
  const vs = vozes();
  if (!vs.length) return null;
  return vs.find(v => v.lang === lingua)
      || vs.find(v => v.lang && v.lang.replace("_", "-").startsWith(lingua.split("-")[0]))
      || null;
}

/** Lê o texto. Resolve quando a fala termina (ou falha). */
export function falar(texto, { lingua = "pt-PT", volume = 1, taxa = 0.95, onInicio, onFim } = {}) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis || !texto) { onFim && onFim(); return resolve({ ok: false, motivo: "sem-api" }); }

    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = lingua;
    u.volume = Math.max(0, Math.min(1, volume));
    u.rate = taxa;
    const v = escolherVoz(lingua);
    if (v) u.voice = v;

    let terminou = false;
    const acabar = (r) => { if (terminou) return; terminou = true; onFim && onFim(); resolve(r); };

    u.onstart = () => onInicio && onInicio();
    u.onend = () => acabar({ ok: true });
    u.onerror = () => acabar({ ok: false, motivo: "erro-sintese" });

    window.speechSynthesis.speak(u);

    // Alguns browsers não disparam onend de forma fiável; rede de segurança
    // proporcional ao comprimento do texto.
    setTimeout(() => acabar({ ok: true, aviso: "timeout" }), 2500 + texto.length * 90);
  });
}

export function parar() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

export function temVozPortuguesa() {
  return !!escolherVoz("pt-PT");
}
