/* glossary.js — correspondência entre o que foi transcrito e o glossário da aula.

   O reconhecimento de fala erra nos termos técnicos: devolve "polimorfismo"
   como "poli morfismo", "heap" como "hip". Comparar strings exatas perde
   esses casos, por isso a correspondência é tolerante:
     1. normaliza (minúsculas, sem acentos, sem pontuação)
     2. tenta igualdade exata
     3. cai para distância de Levenshtein com limiar proporcional ao tamanho

   Termos com mais de uma palavra são procurados por janela deslizante. */

export function normalizar(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // tira acentos
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let ant = new Array(b.length + 1);
  let atual = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) ant[j] = j;
  for (let i = 1; i <= a.length; i++) {
    atual[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(atual[j - 1] + 1, ant[j] + 1, ant[j - 1] + custo);
    }
    [ant, atual] = [atual, ant];
  }
  return ant[b.length];
}

/** Tolerância em função do tamanho: palavras curtas não admitem erro,
 *  longas admitem até 20% dos caracteres. Sem isto, "casa"/"caso" colidem. */
function tolerancia(n) {
  if (n <= 4) return 0;
  if (n <= 7) return 1;
  return Math.floor(n * 0.2);
}

export function parecidos(a, b) {
  if (a === b) return true;
  const t = tolerancia(Math.max(a.length, b.length));
  if (t === 0) return false;
  if (Math.abs(a.length - b.length) > t) return false;
  return levenshtein(a, b) <= t;
}

/** Indexa o glossário por número de palavras, para a janela deslizante. */
export function indexar(termos) {
  const idx = new Map();
  for (const t of termos || []) {
    const norm = normalizar(t.termo);
    if (!norm) continue;
    const n = norm.split(" ").length;
    if (!idx.has(n)) idx.set(n, []);
    idx.get(n).push({ ...t, norm });
  }
  return { idx, maxPalavras: Math.max(1, ...idx.keys()) };
}

/**
 * Encontra ocorrências do glossário num texto.
 * Devolve [{inicio, fim, termo, original}] em índices de *token*, sem
 * sobreposições — o termo mais longo ganha.
 */
export function encontrar(texto, indice) {
  if (!indice || !indice.idx.size) return [];
  const brutos = (texto || "").split(/(\s+)/).filter(x => x.trim().length);
  const tokens = brutos.map(normalizar);
  const achados = [];
  const ocupado = new Set();

  for (let n = indice.maxPalavras; n >= 1; n--) {
    const candidatos = indice.idx.get(n);
    if (!candidatos) continue;
    for (let i = 0; i + n <= tokens.length; i++) {
      if (ocupado.has(i)) continue;
      const janela = tokens.slice(i, i + n).join(" ");
      if (!janela) continue;
      const hit = candidatos.find(c => parecidos(janela, c.norm));
      if (hit) {
        for (let k = i; k < i + n; k++) ocupado.add(k);
        achados.push({ inicio: i, fim: i + n, termo: hit, original: brutos.slice(i, i + n).join(" ") });
      }
    }
  }
  return achados.sort((a, b) => a.inicio - b.inicio);
}

/** Converte um texto em HTML com os termos do glossário marcados.
 *  A baixa confiança NÃO é marcada aqui: assinalar palavra a palavra torna a
 *  legenda ilegível, que é precisamente o contrário do objetivo. O segmento
 *  inteiro é assinalado pela classe da linha, em app.js. */
export function marcar(texto, indice) {
  const brutos = (texto || "").split(/(\s+)/).filter(x => x.length);
  const palavras = [];
  const mapa = [];                              // índice de palavra → índice em brutos
  brutos.forEach((b, i) => { if (b.trim().length) { mapa.push(i); palavras.push(b); } });

  const achados = encontrar(texto, indice);
  const marcaInicio = new Map(), marcaFim = new Set();
  for (const a of achados) { marcaInicio.set(a.inicio, a); for (let k = a.inicio + 1; k < a.fim; k++) marcaFim.add(k); }

  let out = "";
  let p = 0;
  for (let i = 0; i < brutos.length; i++) {
    const b = brutos[i];
    if (!b.trim().length) { out += b; continue; }
    const idxPalavra = p++;
    if (marcaFim.has(idxPalavra)) continue;                 // já incluído no termo anterior
    const hit = marcaInicio.get(idxPalavra);
    if (hit) {
      const txt = palavras.slice(hit.inicio, hit.fim).join(" ");
      out += `<span class="termo" role="button" tabindex="0" data-termo="${escapar(hit.termo.termo)}">${escapar(txt)}</span>`;
    } else {
      out += escapar(b);
    }
  }
  return out;
}

export function escapar(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ─────────────────────────────────────────────────────────────
   Extração local de termos, usada quando não há chave da IAG.
   Heurística deliberadamente simples e explicável: candidata-se
   o que aparece repetido e não é palavra corrente do português.
   Não substitui a IAG — serve para a app funcionar sem rede.
   ───────────────────────────────────────────────────────────── */

const CORRENTES = new Set(`a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sob sobre
entre ate apos antes e ou mas que se quando onde como porque qual quais quanto quantos este esta estes estas esse
essa esses essas aquele aquela isto isso aquilo seu sua seus suas meu minha nosso nossa ser estar ter haver fazer
poder dever ir vir dar ver saber querer dizer pode deve vai vem da ve sabe quer diz foi era sao esta estao tem tinha
mais menos muito pouco todo toda todos todas outro outra outros outras mesmo mesma cada qualquer algum alguma nenhum
nao sim tambem ja ainda sempre nunca talvez entao assim ainda bem mal agora hoje ontem amanha aqui ali la lado
exemplo exemplos caso casos forma formas parte partes vez vezes tipo tipos modo modos coisa coisas aula aulas slide
slides capitulo seccao pagina figura tabela nota notas introducao conclusao resumo objetivo objetivos`.split(/\s+/));

export function extrairTermosLocal(texto, { max = 30 } = {}) {
  const limpo = normalizar(texto);
  if (!limpo) return [];
  const freq = new Map();
  const originais = new Map();

  // conserva a grafia original mais frequente de cada forma normalizada
  const brutos = (texto || "").split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
  for (const b of brutos) {
    const n = normalizar(b);
    if (n.length < 5 || CORRENTES.has(n) || /^\d+$/.test(n)) continue;
    freq.set(n, (freq.get(n) || 0) + 1);
    if (!originais.has(n)) originais.set(n, b);
  }

  // bigramas repetidos valem mais do que palavras isoladas
  const toks = limpo.split(" ");
  const bi = new Map();
  for (let i = 0; i + 1 < toks.length; i++) {
    const a = toks[i], b = toks[i + 1];
    if (a.length < 4 || b.length < 4 || CORRENTES.has(a) || CORRENTES.has(b)) continue;
    const k = a + " " + b;
    bi.set(k, (bi.get(k) || 0) + 1);
  }

  const pontuar = (n, f) => f * (1 + Math.min(n.length, 16) / 16);
  const candidatos = [
    ...[...bi.entries()].filter(([, f]) => f >= 2).map(([n, f]) => ({ n, s: pontuar(n, f) * 1.6, orig: n })),
    ...[...freq.entries()].filter(([, f]) => f >= 2).map(([n, f]) => ({ n, s: pontuar(n, f), orig: originais.get(n) || n }))
  ];

  const vistos = new Set();
  return candidatos
    .sort((a, b) => b.s - a.s)
    .filter(c => { if (vistos.has(c.n)) return false; vistos.add(c.n); return true; })
    .slice(0, max)
    .map(c => ({
      termo: c.orig,
      explicacao: "",
      slide: null,
      origem: "heurística local"
    }));
}
