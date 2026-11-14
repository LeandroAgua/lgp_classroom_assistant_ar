/* seed.js — dados de demonstração.
   Reproduzem o cenário da persona Rita usado na Fase II, para que a app
   abra com conteúdo e se possa percorrer o fluxo sem submeter nada.

   A `confianca` de cada termo é a certeza com que o reconhecimento o
   identificou. É ela que alimenta a marca ao lado do termo na legenda, e o
   OBJ05 — tornar visível a incerteza do sistema. */

const g = (termo, confianca, explicacao, slide) =>
  ({ termo, confianca, explicacao, slide, origem: "aula06.pdf" });

export const SEED = {
  aulas: [
    {
      id: "prog-6",
      uc: "Programação",
      numero: 6,
      titulo: "Polimorfismo e interfaces",
      docente: "Miguel Antunes",
      sala: "B2.5",
      quando: "hoje 14h00",
      material: { nome: "aula06.pdf", submetidoPor: "docente" },
      glossario: {
        geradoEm: Date.now() - 36e5,
        origem: "slides do docente",
        termos: [
          g("polymorphism", 0.88, "Capacidade de o mesmo método se comportar de forma diferente consoante a classe que o implementa.", 12),
          g("class", 0.88, "Molde que define os dados e o comportamento de um objeto.", 4),
          g("superclass", 0.98, "Classe de onde outra herda os atributos e os métodos.", 8),
          g("subclass", 0.94, "Classe que herda de outra e pode redefinir o comportamento herdado.", 8),
          g("inheritance", 0.91, "Mecanismo que permite a uma classe reutilizar o que já está definido noutra.", 8),
          g("interface", 0.88, "Contrato que lista métodos que uma classe se compromete a implementar, sem dizer como.", 17),
          g("override", 0.93, "Redefinir, numa subclasse, um método que já existe na superclasse.", 14),
          g("overloading", 0.86, "Ter vários métodos com o mesmo nome mas assinaturas diferentes. Não é polimorfismo.", 15),
          g("method signature", 0.90, "Nome do método e a lista de tipos dos seus parâmetros.", 15),
          g("instance", 0.95, "Objeto concreto criado a partir de uma classe.", 5),
          g("encapsulation", 0.92, "Esconder o estado interno de um objeto e expor apenas o que é necessário.", 6),
          g("abstract class", 0.89, "Classe que não pode ser instanciada e serve de base a outras.", 19)
        ]
      }
    },
    {
      id: "bd-5",
      uc: "Bases de Dados",
      numero: 5,
      titulo: "Normalização",
      docente: "Ana Ribeiro",
      sala: "A1.2",
      quando: "amanhã 10h00",
      material: null,
      glossario: null
    },
    {
      id: "alg-7",
      uc: "Algoritmos",
      numero: 7,
      titulo: "Complexidade assintótica",
      docente: "Rui Faria",
      sala: "B3.1",
      quando: "quinta 16h00",
      material: { nome: "aula07.pdf", submetidoPor: "docente" },
      glossario: {
        geradoEm: Date.now() - 864e5,
        origem: "slides do docente",
        termos: [
          g("complexidade assintótica", 0.92, "Forma de descrever como o custo de um algoritmo cresce à medida que a entrada aumenta.", 3),
          g("notação O grande", 0.87, "Notação que indica o limite superior do crescimento de um algoritmo.", 5),
          g("caso médio", 0.95, "Custo esperado do algoritmo sobre entradas típicas.", 9),
          g("pior caso", 0.96, "Custo do algoritmo na entrada que lhe é mais desfavorável.", 8),
          g("tempo constante", 0.94, "O custo não depende do tamanho da entrada.", 6),
          g("tempo logarítmico", 0.89, "O custo cresce muito devagar: duplicar a entrada acrescenta um passo.", 11),
          g("tempo quadrático", 0.90, "O custo cresce com o quadrado da entrada. Duplicar a entrada quadruplica o trabalho.", 14),
          g("recorrência", 0.84, "Equação que define o custo de um algoritmo em função de si próprio.", 21)
        ]
      }
    }
  ],
  sessoes: [],
  config: { geminiKey: "", modelo: "gemini-3.8-flash", limiarConfianca: 0.9, simulacao: false, volume: 1 }
};

/* Guião do modo de simulação: legendas de exemplo, sem áudio real. Serve para
   demonstrar o fluxo em dispositivos sem microfone, e para a defesa não
   depender de o reconhecimento correr bem à primeira. */
export const SIMULACAO = {
  "prog-6": [
    "Bom, vamos continuar de onde ficámos na semana passada.",
    "Já vimos que uma class pode herdar de outra.",
    "A isso chamamos inheritance.",
    "Hoje interessa-me outra coisa, que é o polymorphism.",
    "Reparem nesta superclass Animal.",
    "Cada subclass faz override do método emitirSom.",
    "Isto chama-se polymorphism e permite que o mesmo método tenha implementações diferentes.",
    "Atenção que overloading não é polimorfismo: aí muda a method signature.",
    "Uma interface define o contrato, mas não diz como se implementa.",
    "Quando criamos uma instance, é a classe concreta que decide o comportamento."
  ],
  "alg-7": [
    "Vamos falar de complexidade assintótica.",
    "A notação O grande descreve o limite superior do crescimento.",
    "Se duplicar a entrada e o trabalho quadruplicar, estamos perante tempo quadrático.",
    "O pior caso é a entrada mais desfavorável ao algoritmo.",
    "Já o caso médio diz respeito a entradas típicas.",
    "Uma pesquisa binária corre em tempo logarítmico."
  ],
  "bd-5": [
    "Uma tabela está na terceira forma normal quando não há dependência transitiva.",
    "Normal quando não há dependências entre atributos não chave.",
    "A chave candidata identifica univocamente cada linha.",
    "Vamos ver um exemplo de dependência funcional."
  ]
};
