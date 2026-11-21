/* ai.js — chamadas à IAG (Gemini), todas opcionais.

   A app funciona sem chave: cada função tem um caminho local que produz um
   resultado pior mas utilizável. Isto existe para que a demonstração nunca
   dependa de rede nem de faturação — e para que se veja, lado a lado, o que
   a IAG acrescenta.

   A chave fica em localStorage, no dispositivo. Numa versão de produção
   nunca estaria no cliente: as chamadas passariam por um servidor próprio,
   que é também onde entraria o `custom_vocabulary` do reconhecimento de fala. */

import { store } from "./store.js";
import { extrairTermosLocal, contarOcorrencias } from "./glossary.js";

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

/* Orçamento total de espera. Sem isto, cinco modelos × três tentativas com
   recuo davam mais de meio minuto de ecrã parado antes de desistir — e do
   lado de quem usa, "a pensar muito" e "pendurado" são indistinguíveis. */
const ORCAMENTO_MS = 40000;

/* Recupera os objetos completos de um array JSON cortado a meio.

   O modelo tem um teto de tokens na resposta. Batendo nele, a resposta é
   cortada onde calhar — a meio de uma palavra, muitas vezes — e o JSON.parse
   rejeita tudo, incluindo as dezenas de termos que vieram inteiros antes do
   corte. Deitar fora um glossário quase completo por causa da última entrada
   é o pior resultado possível: a app diz que falhou e o aluno fica sem nada.

   Percorre o texto a contar chavetas, saltando as que estão dentro de
   cadeias (uma explicação com "{" lá dentro desalinhava a contagem), e
   devolve os objetos que fecharam. */
function salvarObjetosDeArray(texto) {
  const inicio = texto.indexOf("[");
  if (inicio < 0) return null;

  const objetos = [];
  let nivel = 0, abertura = -1, emCadeia = false, escapado = false;

  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (emCadeia) {
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === '"') emCadeia = false;
      continue;
    }
    if (c === '"') { emCadeia = true; continue; }
    if (c === "{") { if (nivel === 0) abertura = i; nivel++; }
    else if (c === "}") {
      nivel--;
      if (nivel === 0 && abertura >= 0) {
        try { objetos.push(JSON.parse(texto.slice(abertura, i + 1))); } catch { /* entrada estragada: segue */ }
        abertura = -1;
      }
    }
  }
  return objetos.length ? objetos : null;
}

async function pedir(prompt, { json = true, maxTokens = 2048, temperatura = 0.2, onProgresso, recuperarLista = null } = {}) {
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
  const inicio = performance.now();
  const decorrido = () => performance.now() - inicio;

  for (const modelo of candidatos) {
    if (decorrido() > ORCAMENTO_MS) break;

    for (let tentativa = 0; tentativa < 2; tentativa++) {
      onProgresso && onProgresso({
        modelo, tentativa: tentativa + 1,
        segundos: Math.round(decorrido() / 1000)
      });
      const r = await chamar(modelo, corpo, chave);

      if (r.ok) {
        modeloEmUso = modelo;
        const cand = r.dados?.candidates?.[0];
        const texto = cand?.content?.parts?.map(p => p.text).join("") || "";
        if (!texto) throw new Error("resposta-vazia");
        if (!json) return texto;

        try {
          return JSON.parse(texto);
        } catch (e1) {
          const m = texto.match(/[[{][\s\S]*[\]}]/);   // às vezes vem embrulhado em ```
          if (m) { try { return JSON.parse(m[0]); } catch { /* segue para a recuperação */ } }

          /* Resposta cortada no teto de tokens: aproveitar o que veio inteiro
             vale muito mais do que falhar com o lote todo. */
          if (recuperarLista) {
            const salvados = salvarObjetosDeArray(texto);
            if (salvados) {
              return {
                [recuperarLista]: salvados,
                truncado: cand?.finishReason === "MAX_TOKENS" ? "teto de tokens" : "resposta incompleta"
              };
            }
          }
          if (cand?.finishReason === "MAX_TOKENS") throw new Error("resposta-cortada");
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
      if (decorrido() > ORCAMENTO_MS) break;
      await espera((600 * Math.pow(2, tentativa)) + Math.random() * 300);
    }
  }

  throw ultimoErro || new Error("IAG indisponível");
}

/* ───────────────── glossário (UC07 · RF18) ───────────────── */

export function montarPromptGlossario(recorte, nomeFicheiro = "") {
  return `És um assistente que prepara material de apoio para um estudante surdo numa aula universitária em Portugal.

A partir do texto dos slides abaixo, identifica a TERMINOLOGIA TÉCNICA DA DISCIPLINA — não linguagem corrente, não palavras comuns, não nomes de pessoas, não nomes de docentes.

Para cada termo devolve:
- "termo": o termo tal como aparece no material
- "explicacao": uma explicação curta (máx. 2 frases) em português europeu, em linguagem simples, baseada APENAS no que o material diz
- "slide": o número do slide onde o termo é definido, se for identificável pelos marcadores [slide N]; caso contrário null
- "confianca": entre 0 e 1, o quanto tens a certeza de que isto é terminologia própria desta disciplina e não linguagem corrente

Se um termo for polissémico, desambigua-o no sentido usado nesta disciplina.
Devolve no máximo 40 termos, ordenados pela importância para a aula.

Responde apenas com JSON: {"termos":[{"termo":"...","explicacao":"...","slide":12,"confianca":0.95}]}

MATERIAL (${nomeFicheiro}):
"""
${recorte}
"""`;
}

/**
 * Extrai o glossário do material.
 *
 * Devolve também um `diagnostico`: que caminho correu, o prompt enviado, a
 * resposta em bruto e o tempo. Não é instrumentação por desporto — é o que
 * permite mostrar no relatório COMO o glossário é gerado, em vez de afirmar
 * que é gerado. E quando a extração falha, é por aqui que se vê porquê.
 */
export async function gerarGlossario(textoMaterial, { nomeFicheiro = "", onProgresso } = {}) {
  const recorte = (textoMaterial || "").slice(0, 60000);
  const t0 = performance.now();

  if (!temChave()) {
    const termos = extrairTermosLocal(recorte, { max: 24 }).map(t => ({
      ...t,
      ocorrencias: contarOcorrencias(recorte, t.termo),
      confianca: null
    }));
    return {
      termos,
      origem: "heurística local (sem chave da IAG)",
      diagnostico: {
        caminho: "heurística local",
        porque: "não há chave da IAG configurada",
        prompt: null, respostaBruta: null,
        ms: Math.round(performance.now() - t0),
        caracteres: recorte.length
      }
    };
  }

  const prompt = montarPromptGlossario(recorte, nomeFicheiro);
  /* 8192 e não 4096: 40 termos com explicação de duas frases dão perto de
     8000 caracteres, e o teto anterior cortava a resposta a meio — era isso
     que fazia a extração falhar com materiais grandes. */
  const d = await pedir(prompt, { maxTokens: 8192, onProgresso, recuperarLista: "termos" });

  const termos = (d.termos || []).filter(t => t && t.termo).map(t => {
    const termo = String(t.termo).trim();
    return {
      termo,
      explicacao: String(t.explicacao || "").trim(),
      slide: Number.isFinite(t.slide) ? t.slide : null,
      confianca: (typeof t.confianca === "number" && t.confianca >= 0 && t.confianca <= 1)
        ? t.confianca : null,
      // Contagem feita localmente, sobre o texto: é uma medida objetiva, ao
      // contrário da confiança, que é o modelo a avaliar-se a si próprio.
      ocorrencias: contarOcorrencias(recorte, termo),
      origem: nomeFicheiro || "material da aula"
    };
  });

  return {
    termos,
    origem: nomeFicheiro || "material da aula",
    truncado: d.truncado || null,
    diagnostico: {
      caminho: "IAG",
      modelo: modeloEmUso,
      truncado: d.truncado || null,
      prompt,
      respostaBruta: JSON.stringify(d, null, 2),
      ms: Math.round(performance.now() - t0),
      caracteres: recorte.length
    }
  };
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
