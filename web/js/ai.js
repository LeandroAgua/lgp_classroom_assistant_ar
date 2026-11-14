/* ai.js — chamadas à IAG (Gemini), todas opcionais.

   A app funciona sem chave: cada função tem um caminho local que produz um
   resultado pior mas utilizável. Isto existe para que a demonstração nunca
   dependa de rede nem de faturação — e para que se veja, lado a lado, o que
   a IAG acrescenta.

   A chave fica em localStorage, no dispositivo. Numa versão de produção
   nunca estaria no cliente: as chamadas passariam por um servidor próprio,
   que é também onde entraria o `custom_vocabulary` do reconhecimento de fala. */

import { store } from "./store.js";
import { extrairTermosLocal } from "./glossary.js";

const RAIZ = "https://generativelanguage.googleapis.com/v1beta/models";

export function temChave() {
  return !!(store.config().geminiKey || "").trim();
}

/* Modelos de recurso, por ordem. Um 503 UNAVAILABLE não quer dizer que o
   modelo não exista: quer dizer que está sobrecarregado naquele instante, o
   que acontece com frequência nos modelos mais procurados. Repetir com recuo
   resolve a maior parte dos casos; quando não resolve, vale mais descer para
   um modelo menos concorrido do que falhar a meio de uma aula. */
export const MODELO_OMISSAO = "gemini-3.8-flash";
export const ALTERNATIVAS = [
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite"
];

const TRANSITORIO = new Set([429, 500, 502, 503, 504]);
const espera = ms => new Promise(r => setTimeout(r, ms));

/** O último modelo que respondeu, para a interface poder dizer qual foi. */
export let modeloEmUso = null;

async function chamar(modelo, corpo, chave) {
  const url = `${RAIZ}/${encodeURIComponent(modelo)}:generateContent?key=${encodeURIComponent(chave)}`;
  let r;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo)
    });
  } catch (e) {
    // O pedido não chegou a ter resposta: sem rede, bloqueado por CORS, ou
    // cortado. "Failed to fetch" sozinho não diz nada a quem usa a app.
    return {
      ok: false, estado: 0,
      texto: "o pedido não chegou ao servidor — verifica a ligação à Internet "
           + "e se a página está a ser servida (http://localhost, não file://). "
           + `Detalhe do browser: ${e.message || e}`
    };
  }
  if (r.ok) return { ok: true, dados: await r.json() };
  const t = await r.text().catch(() => "");
  return { ok: false, estado: r.status, texto: t.slice(0, 200) };
}

async function pedir(prompt, { json = true, maxTokens = 2048, temperatura = 0.2 } = {}) {
  const cfg = store.config();
  const chave = (cfg.geminiKey || "").trim();
  if (!chave) throw new Error("sem-chave");

  const corpo = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: temperatura,
      maxOutputTokens: maxTokens,
      ...(json ? { responseMimeType: "application/json" } : {})
    }
  };

  // O modelo escolhido primeiro, depois os de recurso que ainda não foram tentados.
  const escolhido = (cfg.modelo || MODELO_OMISSAO).trim();
  const candidatos = [escolhido, ...ALTERNATIVAS.filter(m => m !== escolhido)];

  let ultimoErro = null;

  for (const modelo of candidatos) {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const r = await chamar(modelo, corpo, chave);

      if (r.ok) {
        modeloEmUso = modelo;
        const texto = r.dados?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
        if (!texto) throw new Error("resposta-vazia");
        if (!json) return texto;
        try {
          return JSON.parse(texto);
        } catch {
          const m = texto.match(/[[{][\s\S]*[\]}]/);   // às vezes vem embrulhado em ```
          if (m) return JSON.parse(m[0]);
          throw new Error("json-invalido");
        }
      }

      ultimoErro = new Error(`IAG ${r.estado}: ${r.texto}`);

      // Chave inválida ou sem permissão: repetir não ajuda, e trocar de
      // modelo também não. Falhar já, com a mensagem da API.
      if (r.estado === 400 || r.estado === 401 || r.estado === 403) throw ultimoErro;

      // Modelo inexistente para esta chave: passar ao seguinte sem esperar.
      if (r.estado === 404) break;

      if (!TRANSITORIO.has(r.estado)) throw ultimoErro;

      // Recuo exponencial com um pouco de aleatoriedade, para que vários
      // pedidos em curso não voltem todos ao mesmo tempo.
      await espera((700 * Math.pow(2, tentativa)) + Math.random() * 400);
    }
  }

  throw ultimoErro || new Error("IAG indisponível");
}

/* ───────────────── glossário (UC07 · RF18) ───────────────── */

export async function gerarGlossario(textoMaterial, { nomeFicheiro = "" } = {}) {
  const recorte = textoMaterial.slice(0, 60000);
  if (!temChave()) {
    return {
      termos: extrairTermosLocal(recorte, { max: 24 }),
      origem: "heurística local (sem chave da IAG)"
    };
  }

  const prompt = `És um assistente que prepara material de apoio para um estudante surdo numa aula universitária em Portugal.

A partir do texto dos slides abaixo, identifica a TERMINOLOGIA TÉCNICA DA DISCIPLINA — não linguagem corrente, não palavras comuns, não nomes de pessoas.

Para cada termo devolve:
- "termo": o termo tal como aparece no material
- "explicacao": uma explicação curta (máx. 2 frases) em português europeu, em linguagem simples, baseada APENAS no que o material diz
- "slide": o número do slide ou secção onde aparece, se for identificável; caso contrário null

Se um termo for polissémico, desambigua-o no sentido usado nesta disciplina.
Devolve no máximo 40 termos, ordenados pela importância para a aula.

Responde apenas com JSON: {"termos":[{"termo":"...","explicacao":"...","slide":12}]}

MATERIAL (${nomeFicheiro}):
"""
${recorte}
"""`;

  const d = await pedir(prompt, { maxTokens: 4096 });
  const termos = (d.termos || []).filter(t => t && t.termo).map(t => ({
    termo: String(t.termo).trim(),
    explicacao: String(t.explicacao || "").trim(),
    slide: Number.isFinite(t.slide) ? t.slide : null,
    origem: nomeFicheiro || "material da aula"
  }));
  return { termos, origem: nomeFicheiro || "material da aula" };
}

/* ───────────────── significado do termo (UC09 · RF15) ───────────────── */

export async function explicarTermo(termo, { contexto = "", material = "" } = {}) {
  const cache = store.aulas()
    .flatMap(a => a.glossario?.termos || [])
    .find(t => t.termo.toLowerCase() === termo.toLowerCase() && t.explicacao);
  if (cache) return { texto: cache.explicacao, slide: cache.slide, origem: "glossário" };

  if (!temChave()) {
    return {
      texto: "",
      slide: null,
      origem: "indisponível",
      insuficiente: true
    };
  }

  const prompt = `Explica o termo técnico "${termo}" a um estudante surdo, em português europeu, em linguagem simples, no máximo 3 frases.

Usa APENAS a informação dos materiais e da transcrição abaixo. Se não houver informação suficiente, diz-o em vez de inventar.

Responde apenas com JSON: {"explicacao":"...","slide":12,"suficiente":true}

MATERIAIS:
"""${material.slice(0, 20000)}"""

O QUE O PROFESSOR DISSE À VOLTA DO TERMO:
"""${contexto.slice(0, 3000)}"""`;

  const d = await pedir(prompt, { maxTokens: 600 });
  return {
    texto: String(d.explicacao || "").trim(),
    slide: Number.isFinite(d.slide) ? d.slide : null,
    origem: "IAG + materiais da aula",
    insuficiente: d.suficiente === false
  };
}

/* ───────────────── resumo e ficha (UC08 · RF25, RF26) ───────────────── */

export async function gerarResumoEFicha(transcricao, { material = "", titulo = "" } = {}) {
  if (!temChave()) return resumoLocal(transcricao);

  const prompt = `A partir da transcrição de uma aula e dos materiais, produz material de revisão para um estudante surdo, em português europeu.

1. "pontos": 4 a 8 pontos principais da aula. Cada um com "texto" (1-2 frases), "slide" (número do slide de origem, ou null) e "incerto" (true se a transcrição nesse ponto for ambígua).
2. "perguntas": 4 a 6 perguntas de revisão sobre o que foi efetivamente dito na aula, cada uma com "pergunta", "resposta" (curta) e "slide".

Responde apenas com JSON: {"pontos":[{"texto":"...","slide":12,"incerto":false}],"perguntas":[{"pergunta":"...","resposta":"...","slide":12}]}

AULA: ${titulo}

MATERIAIS:
"""${material.slice(0, 20000)}"""

TRANSCRIÇÃO:
"""${transcricao.slice(0, 40000)}"""`;

  const d = await pedir(prompt, { maxTokens: 3000, temperatura: 0.3 });
  return {
    pontos: (d.pontos || []).map(p => ({
      texto: String(p.texto || "").trim(),
      slide: Number.isFinite(p.slide) ? p.slide : null,
      incerto: !!p.incerto
    })).filter(p => p.texto),
    perguntas: (d.perguntas || []).map(q => ({
      pergunta: String(q.pergunta || "").trim(),
      resposta: String(q.resposta || "").trim(),
      slide: Number.isFinite(q.slide) ? q.slide : null
    })).filter(q => q.pergunta),
    origem: "IAG"
  };
}

/** Sem chave: parte a transcrição e escolhe as frases mais densas em termos
 *  do glossário. É pobre, e a interface diz que é pobre. */
function resumoLocal(transcricao) {
  const frases = (transcricao || "")
    .split(/(?<=[.!?])\s+/)
    .map(f => f.trim())
    .filter(f => f.split(" ").length >= 6);

  const pontuar = f => f.split(" ").filter(w => w.length > 7).length + f.length / 200;
  const pontos = frases
    .map(f => ({ f, s: pontuar(f) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 6)
    .map(x => ({ texto: x.f, slide: null, incerto: true }));

  return { pontos, perguntas: [], origem: "heurística local (sem chave da IAG)" };
}

/**
 * Lista os modelos a que a chave tem acesso.
 *
 * Os nomes dos modelos da Gemini mudam com frequência, e um nome escrito à
 * mão num ficheiro envelhece. Em vez de adivinhar, pergunta-se à API: o que
 * aparece aqui é exatamente o que esta chave consegue chamar, hoje.
 */
export async function listarModelos() {
  const chave = (store.config().geminiKey || "").trim();
  if (!chave) throw new Error("sem-chave");

  const r = await fetch(`${RAIZ}?key=${encodeURIComponent(chave)}&pageSize=200`);
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`${r.status}: ${t.slice(0, 180)}`);
  }
  const d = await r.json();

  return (d.models || [])
    .filter(m => {
      // A referência REST diz supportedGenerationMethods; alguns SDK devolvem
      // supportedActions. Aceitar os dois evita uma lista vazia sem razão.
      const met = m.supportedGenerationMethods || m.supportedActions || [];
      return met.includes("generateContent");
    })
    .map(m => ({
      id: (m.name || "").replace(/^models\//, ""),
      nome: m.displayName || "",
      entrada: m.inputTokenLimit || null
    }))
    .filter(m => m.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Testa um modelo com um pedido mínimo e devolve o que aconteceu.
 *
 * Distingue o que o utilizador precisa de distinguir: 404 quer dizer que
 * aquele nome não existe para esta chave, e deve ser abandonado; 503 quer
 * dizer que existe mas está sobrecarregado, e vale a pena voltar mais tarde.
 */
export async function testarModelo(id) {
  const chave = (store.config().geminiKey || "").trim();
  if (!chave) return { id, ok: false, estado: 0, motivo: "sem chave" };

  const corpo = {
    contents: [{ parts: [{ text: 'Responde apenas com JSON: {"ok":true}' }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 20, responseMimeType: "application/json" }
  };

  const t0 = performance.now();
  try {
    const r = await chamar(id, corpo, chave);
    const ms = Math.round(performance.now() - t0);
    if (r.ok) return { id, ok: true, estado: 200, ms };
    return {
      id, ok: false, estado: r.estado, ms,
      motivo: ({
        404: "não existe para esta chave",
        503: "sobrecarregado — tenta mais tarde",
        429: "limite de pedidos atingido",
        403: "sem permissão",
        400: "pedido recusado"
      })[r.estado] || `erro ${r.estado}`
    };
  } catch (e) {
    return { id, ok: false, estado: 0, motivo: e.message || "falha de rede" };
  }
}

export async function testarChave() {
  try {
    await pedir('Responde apenas com JSON: {"ok":true}', { maxTokens: 20 });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}
