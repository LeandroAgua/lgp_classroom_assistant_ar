# LGP Classroom Assistant

Assistente de sala de aula para estudantes surdos.

O telemóvel legenda em tempo real o que o professor diz, contextualizado pelo
glossário extraído dos materiais da própria aula. O aluno toca num termo
técnico para ver o significado, pode colocar uma pergunta que a app diz em voz
alta à turma, e no fim recebe um resumo e uma ficha de revisão.

As legendas assinalam o que foi mal ouvido: um segmento reconhecido abaixo do
limiar de confiança fica sublinhado a tracejado e com a percentagem à vista.
É esta a incerteza que importa a quem está a ler.

A confiança que acompanha cada termo do glossário mede outra coisa — o quanto
a IAG tem a certeza de que aquilo é terminologia da disciplina e não linguagem
corrente — e por isso aparece só onde se inspeciona o glossário, nunca colada
a uma palavra na legenda.

## Estrutura

```
web/       app em HTML/CSS/JS, sem passo de build
android/   invólucro WebView em Kotlin
```

## Correr

```bash
cd web && python3 -m http.server 8000
```

Abrir **http://localhost:8000** em Chrome ou Edge. Tem de ser servido e tem de
ser `localhost`: a câmara e o microfone só funcionam em contexto seguro.

### Android

No Android Studio: **Open**, escolher a pasta `android/` (não a raiz do
repositório — o projeto Gradle é essa), esperar pela sincronização e correr
com ▶.

Ou pela linha de comandos, com JDK 17 e Android SDK 34:

```bash
cd android && ./gradlew assembleDebug
```

Notas que poupam tempo:

- Os ficheiros de `web/` são copiados para os assets pela tarefa `copiarWeb`
  antes de cada compilação. Não há cópia no repositório e não se editam os
  assets: edita-se `web/` e volta-se a correr.
- Num emulador, usar **API 33 ou superior**. A WebView das imagens antigas é
  anterior ao que o leitor de PDF e o reconhecimento de fala precisam.
- Microfone e câmara são pedidos à primeira utilização. No emulador, o
  microfone tem de estar ligado em *Extended controls → Microphone*.
- O reconhecimento de fala é do sistema, não da WebView: numa imagem de
  emulador sem Google Play não existe. Para ver o fluxo sem microfone, usar o
  modo de simulação (ver abaixo).

## Modo de teste

A app mostra ao aluno apenas o que ele precisa: as aulas, a sessão com
legendas, perguntar e rever. As ferramentas de preparação e de depuração
estão escondidas.

Para as ver, abrir **`#/dev`**. Fica um indicador permanente no canto
inferior esquerdo e sai-se num toque. Ligado, aparecem:

- escolher e testar modelos da IAG, dentro das definições
- materiais de exemplo ao criar uma aula (`#/nova`)
- inspetor da extração de termos (`#/extracao/<aula>`)
- gravar gestos (`#/gestos`) e importar de imagens (`#/importar`)
- modo de simulação da legendagem, e o alfabeto ASL no ecrã de perguntar

A chave da IAG **não** está aqui: configura-se na roda dentada da lista de
aulas, sem modo de teste nenhum. É o que a app precisa para funcionar, e
escondê-la deixava-a inutilizável para quem não soubesse do atalho.

## Licença

MIT — ver [LICENSE](LICENSE).
