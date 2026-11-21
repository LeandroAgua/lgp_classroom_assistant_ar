# pdf.js (pdfjs-dist 4.7.76)

Biblioteca da Mozilla usada para ler o texto dos slides em PDF. É a mesma que
o Firefox usa para mostrar PDFs.

Está aqui dentro, e não num CDN, de propósito. A criação de uma aula depende
dela: sem conseguir ler os ficheiros não há glossário, e sem glossário a
legendagem perde aquilo que o projeto defende. Um CDN acrescenta a isso duas
formas de falhar que não controlamos — a rede da sala e os bloqueios de rede
de instituições — e no invólucro Android as páginas são servidas de
`appassets.androidplatform.net`, por isso um CDN exige internet a sério.

Ficheiros: `pdf.min.mjs` (API) e `pdf.worker.min.mjs` (o worker que faz o
trabalho). Não trazemos os `cmaps` nem as `standard_fonts`: servem para PDFs
com escritas CJK e para desenhar páginas, e aqui só extraímos texto.

Licença Apache-2.0, em `LICENSE`. Atualizar com:

    npm pack pdfjs-dist@<versão>
    tar xzf pdfjs-dist-<versão>.tgz
    cp package/build/pdf.min.mjs package/build/pdf.worker.min.mjs web/vendor/pdfjs/
