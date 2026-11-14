# Atribuição

## Modelo do alfabeto ASL

`web/models/asl-letters.json` — regressão logística sobre 63 pontos da mão,
24 letras estáticas do alfabeto manual americano.

**Este modelo não é de Língua Gestual Portuguesa.** Está no projeto a título
provisório, para demonstrar a cadeia completa — câmara, pontos da mão,
classificador, letra. O alfabeto manual português vem da tradição sueca,
enquanto o ASL e a LIBRAS descendem ambos da francesa: não são
intercambiáveis. Qualquer ecrã que use este modelo di-lo ao utilizador.

- **Origem:** [lanixiligan/sema](https://github.com/lanixiligan/sema), sob a
  [Licença MIT](https://opensource.org/licenses/MIT).
- **Ficheiro usado:** `public/models/asl-letters.json`, copiado sem alterações.
  Contém apenas pesos aprendidos: nenhuma fotografia, nenhum ponto de mão.
- **Alterações nossas:** a inferência e a normalização foram reimplementadas
  em `web/js/asl.js`, a partir de `src/vision/landmarks/normalizeHand.js` do
  Sema. O ficheiro de pesos não foi modificado.

### Dados de treino do modelo

O modelo foi treinado pelo Sema sobre pontos de mão extraídos das fotografias
de dois conjuntos de dados, ambos sob
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

**ASL-HG: American Sign Language Hand Gesture Image Dataset**, versão 1,
Mendeley Data, 11 de novembro de 2025.
Md. Famidul Islam Pranto, Md. Rifatul Islam, Md. Ali Akbor, Nabonita Ghosh,
Md. Rahatun Alam, Sudipto Chaki, Md Masudul Islam.
<https://data.mendeley.com/datasets/j4y5w2c8w9/1> (doi:10.17632/j4y5w2c8w9.1)

**ASLYset**, versão 1, Mendeley Data, 31 de outubro de 2019.
Miguel Rivera.
<https://data.mendeley.com/datasets/xs6mvhx6rh/1> (doi:10.17632/xs6mvhx6rh.1)

*Alterações:* nem o Sema nem este projeto incluem ou redistribuem as
fotografias. As imagens foram passadas pelo modelo de mão do MediaPipe e pela
normalização do Sema, foram mantidas as 24 letras estáticas e descartadas as
amostras inutilizáveis, e sobre os pontos resultantes foi treinado o modelo.

Os autores dos conjuntos de dados e do Sema não subscrevem este projeto.

## Pontos da mão

[MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)
(`@mediapipe/tasks-vision`), Apache-2.0, carregado a partir de CDN em tempo
de execução.

## Trabalho relacionado consultado

Não foi reutilizado código destes, mas informaram decisões do projeto e estão
citados no relatório.

- **[khomy86/lgp-sign-recognition](https://github.com/khomy86/lgp-sign-recognition)** —
  reconhecimento de formas de mão em LGP no browser e em Android, com a mesma
  arquitetura que usamos: MediaPipe, normalização pelo pulso, classificador
  pequeno no dispositivo. Reporta 94,1% com quatro gestos, contra 82,5% a
  decidir frame a frame — essa diferença é a razão do suavizador temporal em
  `web/js/lgp.js`. **O repositório não declara licença**, pelo que nada dele
  foi copiado.
- **Real-Time Mobile Application for Translating Portuguese Sign Language to
  Text Using Machine Learning**, *Electronics* 14(12):2351, 2025.
  <https://doi.org/10.3390/electronics14122351> — alfabeto LGP com 27 classes
  e 9 voluntários, 77% no teste. É a fonte da afirmação de que não existe
  conjunto de dados público do alfabeto da LGP: os autores tiveram de criar o
  seu, e disponibilizam-no apenas a pedido.
