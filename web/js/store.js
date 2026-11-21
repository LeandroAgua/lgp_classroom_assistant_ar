/* store.js — estado da aplicação, persistido em localStorage.
   Não há servidor: tudo o que o utilizador produz fica no dispositivo.
   É uma decisão de privacidade, não só de arquitetura — ver README. */

/* A chave sobe de versão quando o estado inicial muda de forma incompatível.
   Aqui, v1 guardava as três aulas de demonstração: quem já abriu a app tem-nas
   no armazenamento do browser, e mudar o seed não as removeria. Subir a chave
   faz essas instalações arrancarem limpas. */
const CHAVE = "contexto.v2";

const vazio = () => ({
  aulas: [],
  sessoes: [],
  config: { geminiKey: "", modelo: "gemini-3.8-flash", limiarConfianca: 0.9, simulacao: false, volume: 1 }
});

let estado = vazio();
const ouvintes = new Set();

function ler() {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) return null;
    const d = JSON.parse(cru);
    return (d && Array.isArray(d.aulas)) ? d : null;
  } catch {
    return null;              // modo privado, armazenamento cheio ou dados corrompidos
  }
}

function gravar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch {
    /* sem armazenamento a app continua a funcionar, só não sobrevive ao recarregar */
  }
}

function notificar() {
  gravar();
  ouvintes.forEach(fn => { try { fn(estado); } catch (e) { console.error(e); } });
}

export const store = {
  init(seed) {
    estado = ler() || Object.assign(vazio(), seed || {});
    return estado;
  },
  get estado() { return estado; },
  subscrever(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },

  /* ---- aulas ---- */
  aulas() { return estado.aulas; },
  aula(id) { return estado.aulas.find(a => a.id === id) || null; },
  guardarAula(aula) {
    const i = estado.aulas.findIndex(a => a.id === aula.id);
    if (i >= 0) estado.aulas[i] = aula; else estado.aulas.push(aula);
    notificar();
    return aula;
  },
  /* Remover a aula leva as sessões dela atrás. Deixá-las ficaria com sessões
     órfãs no histórico, a apontar para uma aula que já não existe — e o ecrã
     do resumo lê o título a partir dela. Devolve o que foi apagado, para a
     interface poder dizer o que desapareceu. */
  removerAula(id) {
    const i = estado.aulas.findIndex(a => a.id === id);
    if (i < 0) return null;
    const aula = estado.aulas[i];
    const sessoes = estado.sessoes.filter(s => s.aulaId === id).length;
    estado.aulas.splice(i, 1);
    estado.sessoes = estado.sessoes.filter(s => s.aulaId !== id);
    notificar();
    return { aula, sessoes };
  },

  /* ---- sessões ---- */
  sessoes() {
    return [...estado.sessoes].sort((a, b) => (b.inicio || 0) - (a.inicio || 0));
  },
  sessao(id) { return estado.sessoes.find(s => s.id === id) || null; },
  sessaoAtiva() { return estado.sessoes.find(s => !s.fim) || null; },
  criarSessao(aulaId) {
    const s = {
      id: "s" + Date.now().toString(36),
      aulaId, inicio: Date.now(), fim: null,
      linhas: [], consultas: [], perguntas: [],
      resumo: null, ficha: null
    };
    estado.sessoes.push(s);
    notificar();
    return s;
  },
  guardarSessao(s) {
    const i = estado.sessoes.findIndex(x => x.id === s.id);
    if (i >= 0) estado.sessoes[i] = s; else estado.sessoes.push(s);
    notificar();
    return s;
  },

  /* ---- config ---- */
  config() { return estado.config; },
  guardarConfig(parcial) {
    Object.assign(estado.config, parcial);
    notificar();
    return estado.config;
  },

  limpar() {
    estado = vazio();
    notificar();
  }
};
