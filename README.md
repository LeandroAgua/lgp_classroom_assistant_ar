# ConTexto — LGP Classroom Assistant

Assistente de sala de aula para estudantes surdos. O telemóvel legenda o que o
professor diz, **contextualizado pelo glossário extraído dos materiais da
própria aula**, deixa tocar num termo técnico para ver o significado, converte
uma pergunta em LGP para voz, e gera resumo e ficha de revisão no fim.

Projeto académico — Análise de Requisitos, Mestrado em Engenharia Informática,
ISEC / Politécnico de Coimbra. Grupo 1 · Leandro D'Água, Hugo Gil.

---

## O que é real e o que não é

Isto não é uma maqueta clicável: a maior parte funciona mesmo.

| Funcionalidade | Estado |
|---|---|
| Legendagem ao vivo em pt-PT | **Real** — Web Speech API no browser, reconhecedor nativo na app Android |
| Deteção de termos do glossário na legenda | **Real** — correspondência tolerante a erros (Levenshtein) |
| Extração do glossário a partir de PDF | **Real** — pdf.js + IAG, ou heurística local sem chave |
| Explicação de um termo técnico | **Real** — glossário em cache, ou IAG com indicação da origem |
| Enquadramento da câmara para a pergunta | **Real** — a imagem não sai do dispositivo |
| Reconhecimento de LGP | **Não implementado**, e a app di-lo ao utilizador. A pergunta é escrita |
| Pergunta dita em voz alta | **Real** — síntese de voz pt-PT |
| Resumo e ficha de revisão | **Real** com chave da IAG; heurística pobre sem ela |
| Submissão pelo docente, histórico partilhado, contas | **Não implementado** — não há servidor |

A app **funciona sem chave da IAG**. Cada funcionalidade que depende dela tem um
caminho local que produz um resultado pior mas utilizável, e a interface diz
qual dos dois está a ser usado. Há ainda um **modo de simulação**, no ecrã de
preparação da sessão, que alimenta a legenda a partir de um guião — serve para
demonstrar o fluxo em dispositivos sem microfone, e para a defesa não depender
de o reconhecimento correr bem à primeira.

Cada termo do glossário leva o seu **grau de confiança** ao lado, na legenda e
no ecrã de preparação. É o OBJ05 — tornar visível a incerteza do sistema — e é
o que permite ao aluno saber onde não deve confiar.

---

## Estrutura

```
web/          app completa, HTML/CSS/JS sem dependências de build
  js/asr.js       legendagem (Web Speech API ou ponte nativa)
  js/glossary.js  normalização, Levenshtein, marcação de termos e confiança
  js/camera.js    enquadramento da câmara — sem reconhecimento, de propósito
  js/ai.js        chamadas à IAG, todas opcionais
android/      invólucro WebView em Kotlin
  MainActivity.kt   WebView, permissões, seletor de ficheiros
  SpeechBridge.kt   reconhecimento de fala nativo exposto ao JavaScript
```

Os ficheiros de `web/` são copiados para os assets do Android durante o build
(tarefa `copiarWeb`), para não existirem duas cópias a divergir.

---

## Correr a app web

`getUserMedia` exige contexto seguro, por isso abrir o ficheiro com duplo
clique **não funciona** — tem de ser servido.

```bash
cd web
python3 -m http.server 8000
```

Abrir **http://localhost:8000** (e não `http://0.0.0.0:8000`, que não conta como
contexto seguro). Em Chrome ou Edge; o Firefox não implementa a Web Speech API,
e aí só funciona o modo de simulação.

Para publicar: qualquer alojamento estático serve. Em GitHub Pages, apontar a
pasta `web/`.

## Compilar a app Android

```bash
cd android
./gradlew assembleDebug
# app/build/outputs/apk/debug/app-debug.apk
```

Requer JDK 17 e o Android SDK 34. Por omissão a app carrega os ficheiros
embutidos; para apontar a um site publicado, mudar `REMOTE_URL` em
`app/build.gradle.kts`.

---

## Duas armadilhas que este invólucro resolve

São as duas razões por que um WebView ingénuo não serviria aqui.

**1. `file://` não é contexto seguro.** Carregar os assets com
`file:///android_asset/...` faz `getUserMedia` falhar — sem erro visível, a
câmara e o microfone simplesmente não abrem. O conteúdo é servido por
`WebViewAssetLoader` em `https://appassets.androidplatform.net/`, que conta como
origem segura. Além disso, `WebChromeClient.onPermissionRequest` tem de conceder
explicitamente os recursos: ter a permissão no manifesto não chega.

**2. O WebView do Android não tem Web Speech API.** A legendagem ao vivo —
a funcionalidade principal — morreria dentro da app, funcionando só no Chrome.
`SpeechBridge.kt` expõe o `SpeechRecognizer` nativo como `window.ContextoSpeech`,
e `asr.js` prefere-a quando existe. Nos dois lados há reinício com recuo
progressivo, porque ambos os reconhecedores desistem ao fim de algum silêncio e
numa aula de duas horas isso acontece dezenas de vezes.

---

## Privacidade

Tudo fica no dispositivo: aulas, transcrições, resumos e amostras de gestos em
`localStorage`; nenhum servidor nosso recebe seja o que for.

A imagem da câmara **nunca sai do dispositivo** e não é processada por nada:
serve só para o aluno se enquadrar. Não é guardado áudio nem vídeo em momento
nenhum. Com chave configurada, vai texto para a API da Gemini: o texto dos
slides, o termo a explicar e a transcrição para o resumo.

A chave fica em `localStorage`. **Numa versão de produção isto não se faz:** as
chamadas passariam por um servidor próprio, que é também onde entraria o
`custom_vocabulary` do reconhecimento de fala.

---

## Limitações assumidas

**Nenhum reconhecedor aqui aceita vocabulário personalizado.** A tese do produto
é injetar o glossário da aula no reconhecedor de fala (`custom_vocabulary`), e
nem a Web Speech API nem o `SpeechRecognizer` do Android o permitem. O glossário
entra depois, na correspondência tolerante: não evita que o reconhecedor erre o
termo, mas recupera-o quando o erro é pequeno. É uma aproximação, não a
arquitetura final.

**Não há reconhecimento de LGP, e isso é uma decisão.** Não existe modelo de LGP
pronto a usar, e a literatura mostra a exatidão a cair com o tamanho do
vocabulário — cerca de 94% com 20 gestos, cerca de 46% com 292. Um classificador
treinado com um ou dois gestuantes aprende essas pessoas, não a língua. Prometer
reconhecimento e entregar adivinhação seria pior do que não prometer nada, por
isso a app mostra o enquadramento, diz com todas as letras que não reconhece o
gesto, e o aluno escreve a pergunta. É também o que o protótipo faz.

**Nenhum utilizador surdo validou isto.** É a limitação mais séria, e nenhum
número medido com colegas ouvintes a substitui.

---

## Ecrãs

Correspondem ao inventário da Fase II:

| | |
|---|---|
| E01 | Lista de aulas |
| E02 | Submeter material da aula |
| E03 | Pré-sessão: verificação de microfone e rede, aviso de aula sem glossário |
| E04 | Sessão ao vivo, com explicação do termo sobreposta |
| E05 | Estados de erro |
| E06 | Perguntar: captar o gesto |
| E07 | Confirmar a pergunta e reproduzir em áudio |
| E08 | Fim de sessão e transcrição |
| E09 | Resumo e ficha de revisão |
| E10 | Histórico de sessões |

---

## Licença

MIT — ver [LICENSE](LICENSE).
