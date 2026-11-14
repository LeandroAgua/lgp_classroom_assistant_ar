/* amostras.js — materiais de aula de exemplo.

   Servem dois fins. O primeiro é prático: permitem criar uma aula e ver a
   extração a funcionar sem andar à procura de um PDF.

   O segundo interessa ao relatório. Como o texto é fixo, é um corpus de
   teste: corre-se a extração com e sem IAG sobre exatamente a mesma entrada
   e comparam-se os resultados. Sem entrada fixa não há comparação que se
   aproveite.

   Os marcadores [slide N] imitam o que o pdf.js produz ao ler um PDF de
   slides, para que a atribuição de origem seja exercitada da mesma maneira. */

export const AMOSTRAS = [
  {
    id: "poo",
    uc: "Programação",
    titulo: "Polimorfismo e interfaces",
    docente: "Miguel Antunes",
    termosEsperados: [
      "polimorfismo", "classe", "superclasse", "subclasse", "herança",
      "interface", "override", "sobrecarga", "assinatura", "instância",
      "encapsulamento", "classe abstrata", "upcasting", "ligação dinâmica"
    ],
    texto: `
[slide 1] Programação Orientada a Objetos — Aula 6
Polimorfismo e interfaces. Docente: Miguel Antunes.

[slide 2] Revisão da aula anterior
Na aula passada vimos classes e objetos. Uma classe é um molde. Um objeto é
uma instância dessa classe. Hoje vamos ver o que acontece quando as classes
se relacionam entre si.

[slide 4] Classe
Uma classe define o estado e o comportamento de um conjunto de objetos. O
estado vive nos atributos, o comportamento nos métodos. Criar um objeto a
partir de uma classe chama-se instanciar, e o resultado é uma instância.

[slide 6] Encapsulamento
Encapsulamento é esconder o estado interno de um objeto e expor apenas as
operações necessárias. Os atributos ficam privados e o acesso faz-se por
métodos públicos. Isto permite mudar a implementação sem partir quem usa a
classe.

[slide 8] Herança
A herança permite que uma classe reutilize o que está definido noutra. A
classe de onde se herda chama-se superclasse. A classe que herda chama-se
subclasse. A subclasse recebe os atributos e os métodos da superclasse e
pode acrescentar os seus.

[slide 10] Upcasting
Uma referência do tipo da superclasse pode apontar para um objeto de uma
subclasse. A isto chama-se upcasting, e é seguro porque toda a subclasse é
também uma superclasse. O contrário, o downcasting, exige verificação.

[slide 12] Polimorfismo
Polimorfismo é a capacidade de o mesmo método se comportar de forma
diferente consoante a classe que o implementa. Quando se chama um método
sobre uma referência da superclasse, é a classe concreta do objeto que
decide qual a implementação executada. Isto chama-se ligação dinâmica, e
acontece em tempo de execução, não em tempo de compilação.

[slide 14] Override
Fazer override é redefinir, numa subclasse, um método que já existe na
superclasse. A assinatura mantém-se igual; muda o corpo. É isto que torna o
polimorfismo possível.

[slide 15] Sobrecarga não é polimorfismo
Sobrecarga é ter vários métodos com o mesmo nome mas assinaturas diferentes
na mesma classe. A assinatura de um método é o nome mais a lista de tipos
dos parâmetros. A escolha do método sobrecarregado acontece em tempo de
compilação, e por isso sobrecarga não é polimorfismo. É um erro comum.

[slide 17] Interface
Uma interface é um contrato: lista os métodos que uma classe se compromete a
implementar, sem dizer como. Uma classe pode implementar várias interfaces,
ao contrário da herança, que em Java é simples.

[slide 19] Classe abstrata
Uma classe abstrata não pode ser instanciada e serve de base a outras. Pode
ter métodos já implementados, ao contrário da interface clássica. Usa-se
quando há comportamento comum a partilhar entre subclasses.

[slide 21] Resumo
Herança reutiliza. Polimorfismo permite tratar objetos diferentes de forma
uniforme. Interfaces definem contratos. Encapsulamento protege o estado.
`.trim()
  },

  {
    id: "bd",
    uc: "Bases de Dados",
    titulo: "Normalização",
    docente: "Ana Ribeiro",
    termosEsperados: [
      "normalização", "dependência funcional", "dependência transitiva",
      "chave primária", "chave candidata", "chave estrangeira", "atributo",
      "primeira forma normal", "segunda forma normal", "terceira forma normal",
      "redundância", "anomalia de atualização", "decomposição"
    ],
    texto: `
[slide 1] Bases de Dados — Aula 5
Normalização. Docente: Ana Ribeiro.

[slide 2] O problema
Uma tabela mal desenhada repete informação. Essa redundância causa
anomalias: anomalia de inserção, anomalia de remoção e anomalia de
atualização. Mudar a morada de um cliente obriga a mudá-la em vinte linhas,
e basta falhar uma para a base de dados ficar inconsistente.

[slide 4] Atributos e chaves
Um atributo é uma coluna da tabela. Uma chave candidata é um conjunto de
atributos que identifica univocamente cada linha. Entre as chaves
candidatas escolhe-se uma para chave primária. Uma chave estrangeira é um
atributo que referencia a chave primária de outra tabela.

[slide 6] Dependência funcional
Diz-se que B depende funcionalmente de A quando, para cada valor de A, há um
só valor de B. Escreve-se A → B. A dependência funcional é a ferramenta com
que se raciocina sobre normalização: todas as formas normais se definem a
partir dela.

[slide 8] Primeira forma normal
Uma tabela está na primeira forma normal quando todos os atributos são
atómicos, isto é, não contêm listas nem grupos repetidos. Uma coluna com
"telefone1, telefone2" viola a primeira forma normal.

[slide 10] Segunda forma normal
Uma tabela está na segunda forma normal se está na primeira e se nenhum
atributo não chave depende apenas de parte da chave primária. Esta forma só
tem interesse quando a chave primária é composta.

[slide 12] Dependência transitiva
Há dependência transitiva quando A → B e B → C, e portanto A → C de forma
indireta. O código postal determina a localidade; o cliente determina o
código postal; logo o cliente determina a localidade por via indireta.

[slide 14] Terceira forma normal
Uma tabela está na terceira forma normal quando está na segunda e não existe
dependência transitiva entre atributos não chave. Na prática, é a forma
normal que a maior parte dos sistemas procura.

[slide 16] Decomposição
Normalizar faz-se por decomposição: parte-se a tabela em tabelas mais
pequenas ligadas por chaves estrangeiras. A decomposição deve preservar as
dependências e ser sem perdas, para que a junção devolva exatamente a
informação original.

[slide 18] Até onde normalizar
Existem formas normais mais exigentes, como a forma normal de Boyce-Codd.
Normalizar demais multiplica as junções e pode custar desempenho. A terceira
forma normal é quase sempre o compromisso certo.
`.trim()
  },

  {
    id: "redes",
    uc: "Redes de Computadores",
    titulo: "A camada de transporte",
    docente: "Rui Faria",
    termosEsperados: [
      "TCP", "UDP", "porto", "socket", "handshake", "datagrama", "segmento",
      "controlo de fluxo", "controlo de congestão", "janela deslizante",
      "multiplexagem", "latência", "largura de banda", "encapsulamento"
    ],
    texto: `
[slide 1] Redes de Computadores — Aula 7
A camada de transporte. Docente: Rui Faria.

[slide 2] Onde estamos
A camada de rede entrega pacotes entre máquinas. A camada de transporte
entrega dados entre processos. A diferença é essencial: o IP sabe chegar ao
computador, não sabe a que programa entregar.

[slide 4] Portos e sockets
Um porto é um número de 16 bits que identifica um processo dentro da
máquina. A combinação de endereço IP e porto chama-se socket. É o socket
que permite a multiplexagem: muitas conversas em simultâneo sobre a mesma
ligação física.

[slide 6] Encapsulamento
Cada camada acrescenta o seu cabeçalho aos dados da camada de cima. A este
processo chama-se encapsulamento. Na camada de transporte, a unidade do TCP
chama-se segmento e a do UDP chama-se datagrama.

[slide 8] UDP
O UDP não estabelece ligação, não garante entrega, não garante ordem e não
retransmite. Em troca tem muito pouca sobrecarga e latência baixa. Usa-se
onde chegar depressa importa mais do que chegar tudo: voz, vídeo em direto,
jogos, DNS.

[slide 10] TCP
O TCP é orientado à ligação e garante entrega fiável e ordenada. Antes de
trocar dados há um handshake de três passos: SYN, SYN-ACK, ACK. Cada
segmento recebido é confirmado por um ACK, e o que não for confirmado é
retransmitido.

[slide 12] Controlo de fluxo
O controlo de fluxo impede que o emissor afogue o recetor. O recetor anuncia
uma janela, que diz quantos bytes ainda consegue aceitar. O emissor nunca
envia mais do que a janela permite. A técnica chama-se janela deslizante.

[slide 14] Controlo de congestão
O controlo de congestão protege a rede, e não o recetor. O emissor aumenta o
ritmo devagar e recua bruscamente quando deteta perdas, porque interpreta
uma perda como sinal de congestionamento. As fases chamam-se arranque lento
e prevenção de congestionamento.

[slide 16] Latência e largura de banda
Latência é o tempo que um bit demora a atravessar a rede. Largura de banda é
quantos bits passam por segundo. São independentes: uma ligação por satélite
pode ter largura de banda alta e latência péssima, e o handshake do TCP
custa um tempo de ida e volta antes de qualquer dado útil.

[slide 18] Escolher
Precisa de fiabilidade e ordem, TCP. Precisa de latência mínima e tolera
perdas, UDP.
`.trim()
  }
];

export function amostra(id) {
  return AMOSTRAS.find(a => a.id === id) || null;
}
