# ConTexto — LGP Classroom Assistant

Assistente de sala de aula para estudantes surdos.

O telemóvel legenda em tempo real o que o professor diz, contextualizado pelo
glossário extraído dos materiais da própria aula. O aluno toca num termo
técnico para ver o significado, pode colocar uma pergunta que a app diz em voz
alta à turma, e no fim recebe um resumo e uma ficha de revisão.

Cada termo do glossário aparece com o seu grau de confiança, para que o aluno
saiba onde não deve confiar na transcrição.

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

Para a app Android, com JDK 17 e Android SDK 34:

```bash
cd android && ./gradlew assembleDebug
```

## Licença

MIT — ver [LICENSE](LICENSE).
