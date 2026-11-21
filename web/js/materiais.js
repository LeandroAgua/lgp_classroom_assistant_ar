/* materiais.js — ler o texto dos materiais da aula.

   O que entra são os ficheiros que o docente já tem: os slides em PDF e os
   apontamentos em Word. Pedir ao aluno que colasse o texto à mão era pedir-lhe
   que fizesse o trabalho que a app existe para fazer.

   Tudo é lido no dispositivo. Nenhum ficheiro sai daqui: o que vai à IAG é só
   o texto, e só quando há chave configurada. É a mesma decisão de privacidade
   que mantém o resto do estado em localStorage.

   PDF e DOCX são formatos diferentes de resolver:

   - PDF não se lê sem uma biblioteca. O conteúdo é um fluxo comprimido de
     operadores de desenho, e o texto lá dentro vem codificado pela fonte de
     cada bloco, não em Unicode. Usamos o pdf.js, que é o que o próprio Firefox
     usa, servido daqui e não de um CDN: criar uma aula depende dele, e um CDN
     acrescenta a rede da sala e os bloqueios institucionais à lista de coisas
     que podem correr mal na defesa. Ver vendor/pdfjs/LEIA-ME.md.

   - DOCX é um ZIP com XML lá dentro, e isso o browser já sabe fazer: a
     DecompressionStream descomprime, e o texto está em word/document.xml.
     Não vale a pena uma dependência para o ler.

   O .doc antigo (binário, pré-2007) fica de fora: é um formato OLE que não se
   lê com nada que o browser traga, e qualquer Word o grava como .docx. */

const PDFJS = new URL("../vendor/pdfjs/pdf.min.mjs", import.meta.url).href;
const PDFJS_WORKER = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

export const ACEITES = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** O tipo de um ficheiro, pela extensão. O type do browser não é de confiança:
 *  vem do sistema e em Windows aparece vazio com frequência. */
export function tipoDe(ficheiro) {
  const n = (ficheiro.name || "").toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".docx")) return "docx";
  if (n.endsWith(".doc")) return "doc-antigo";
  return "outro";
}

export function tamanhoLegivel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ───────────────── PDF ───────────────── */

let pdfjs = null;

async function carregarPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import(/* @vite-ignore */ PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return pdfjs;
}

async function lerPdf(ficheiro, onProgresso) {
  const lib = await carregarPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await ficheiro.arrayBuffer()) }).promise;
  const partes = [];

  for (let p = 1; p <= doc.numPages; p++) {
    onProgresso && onProgresso(p, doc.numPages);
    const pag = await doc.getPage(p);
    const conteudo = await pag.getTextContent();

    /* Os itens vêm na ordem em que foram desenhados, não na ordem em que se
       leem, e sem separadores. hasEOL marca onde o PDF quebrou a linha; sem
       isso, títulos e corpo colavam-se numa palavra só. */
    let txt = "";
    for (const it of conteudo.items) {
      if (typeof it.str !== "string") continue;
      txt += it.str;
      if (it.hasEOL) txt += "\n";
      else if (it.str && !it.str.endsWith(" ")) txt += " ";
    }

    /* Uma página de PDF de slides é um slide. É isto que faz a atribuição de
       origem funcionar sem o docente ter de marcar nada à mão. */
    partes.push(`[slide ${p}]\n${limpar(txt)}`);
  }

  await doc.destroy();
  return { texto: partes.join("\n\n"), paginas: doc.numPages };
}

/* ───────────────── DOCX ───────────────── */

/** Lê um ficheiro do ZIP pelo nome. Percorre o diretório central, que é o
 *  índice fiável — os cabeçalhos locais podem ter os tamanhos a zero quando o
 *  ZIP foi escrito em fluxo, que é o caso do que sai do Word. */
async function extrairDoZip(buf, nome) {
  const dv = new DataView(buf), n = buf.byteLength;

  let eocd = -1;
  for (let i = n - 22; i >= 0 && i > n - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("não parece um ficheiro .docx válido");

  let off = dv.getUint32(eocd + 16, true);
  const total = dv.getUint16(eocd + 10, true);

  for (let e = 0; e < total; e++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(off + 10, true);
    const comprimido = dv.getUint32(off + 20, true);
    const nomeLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const comentLen = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const esteNome = new TextDecoder().decode(new Uint8Array(buf, off + 46, nomeLen));

    if (esteNome === nome) {
      const lNomeLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const inicio = localOff + 30 + lNomeLen + lExtraLen;
      const dados = new Uint8Array(buf, inicio, comprimido);
      if (metodo === 0) return new TextDecoder().decode(dados);
      if (metodo !== 8) throw new Error("compressão do .docx não suportada");
      const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return await new Response(fluxo).text();
    }
    off += 46 + nomeLen + extraLen + comentLen;
  }
  throw new Error("não encontrei o documento dentro do .docx");
}

async function lerDocx(ficheiro) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("este browser não descomprime .docx — exporta os apontamentos para PDF");
  }
  const xml = await extrairDoZip(await ficheiro.arrayBuffer(), "word/document.xml");

  /* As quebras têm de sair antes de as etiquetas desaparecerem: num DOCX a
     estrutura é só etiquetas, e sem isto o documento inteiro vinha numa linha,
     o que estraga a extração de termos e qualquer leitura do material. */
  const texto = xml
    .replace(/<w:br\s*\/?>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

  return { texto: limpar(texto), paginas: 0 };
}

/* ───────────────── comum ───────────────── */

function limpar(t) {
  return t
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Lê um ficheiro e devolve {ok, texto, paginas} ou {ok:false, erro}.
 *  Nunca lança: a falha de um ficheiro não pode levar a lista toda atrás. */
export async function lerMaterial(ficheiro, onProgresso) {
  const tipo = tipoDe(ficheiro);
  try {
    if (tipo === "doc-antigo") {
      throw new Error("o .doc antigo não se lê aqui — grava como .docx ou exporta para PDF");
    }
    if (tipo === "outro") throw new Error("só PDF e Word (.docx) por agora");

    const r = tipo === "pdf" ? await lerPdf(ficheiro, onProgresso) : await lerDocx(ficheiro);
    if (r.texto.replace(/\[slide \d+\]/g, "").trim().length < 40) {
      /* Slides digitalizados ou exportados como imagem: o PDF abre, tem
         páginas, e não tem uma única letra de texto. Sem OCR não há nada a
         fazer, e dizê-lo é melhor do que extrair um glossário vazio. */
      throw new Error("não tem texto — se são slides digitalizados, seria preciso reconhecimento ótico");
    }
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, erro: e.message || String(e) };
  }
}

/** Junta os materiais lidos num só texto, identificando cada ficheiro. Com
 *  mais do que um, a numeração dos slides recomeça em cada PDF, por isso o
 *  nome do ficheiro tem de ficar à vista para a origem continuar a ler-se. */
export function juntar(lidos) {
  if (lidos.length === 1) return lidos[0].texto;
  return lidos.map(m => `=== ${m.nome} ===\n${m.texto}`).join("\n\n");
}
