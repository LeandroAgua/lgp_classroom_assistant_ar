/* seed.js — dados de demonstração.
   Reproduzem o cenário da persona Rita usado na Fase II, para que a app
   abra com conteúdo e se possa percorrer o fluxo sem submeter nada. */

const g = (termo, explicacao, slide) => ({ termo, explicacao, slide, origem: "aula06.pdf" });

export const SEED = {
  aulas: [
    {
      id: "a-prog-06",
      uc: "Programação",
      numero: 6,
      titulo: "Polimorfismo e interfaces",
      docente: "Miguel Antunes",
      sala: "B2.5",
      quando: "hoje · 14h00",
      material: { nome: "aula06.pdf", paginas: 28, submetidoPor: "docente" },
      glossario: {
        geradoEm: Date.now() - 36e5,
        origem: "aula06.pdf",
        termos: [
          g("polimorfismo", "Capacidade de o mesmo método se comportar de forma diferente consoante a classe que o implementa.", 12),
          g("classe", "Molde que define os dados e o comportamento de um objeto.", 4),
          g("superclasse", "Classe de onde outra herda os atributos e os métodos.", 8),
          g("subclasse", "Classe que herda de outra e pode redefinir o comportamento herdado.", 8),
          g("herança", "Mecanismo que permite a uma classe reutilizar o que já está definido noutra.", 8),
          g("interface", "Contrato que lista métodos que uma classe se compromete a implementar, sem dizer como.", 17),
          g("override", "Redefinir, numa subclasse, um método que já existe na superclasse.", 14),
          g("sobrecarga", "Ter vários métodos com o mesmo nome mas assinaturas diferentes. Não é polimorfismo.", 15),
          g("assinatura do método", "Nome do método e a lista de tipos dos seus parâmetros.", 15),
          g("instância", "Objeto concreto criado a partir de uma classe.", 5),
          g("encapsulamento", "Esconder o estado interno de um objeto e expor apenas o que é necessário.", 6),
          g("classe abstrata", "Classe que não pode ser instanciada e serve de base a outras.", 19)
        ]
      }
    },
    {
      id: "a-bd-05",
      uc: "Bases de Dados",
      numero: 5,
      titulo: "Normalização",
      docente: "Ana Ribeiro",
      sala: "A1.2",
      quando: "amanhã · 10h00",
      material: null,
      glossario: null
    },
    {
      id: "a-alg-07",
      uc: "Algoritmos",
      numero: 7,
      titulo: "Complexidade assintótica",
      docente: "Rui Faria",
      sala: "B3.1",
      quando: "quinta · 16h00",
      material: { nome: "aula07.pdf", paginas: 34, submetidoPor: "docente" },
      glossario: {
        geradoEm: Date.now() - 864e5,
        origem: "aula07.pdf",
        termos: [
          g("complexidade assintótica", "Forma de descrever como o custo de um algoritmo cresce à medida que a entrada aumenta.", 3),
          g("notação O grande", "Notação que indica o limite superior do crescimento de um algoritmo.", 5),
          g("caso médio", "Custo esperado do algoritmo sobre entradas típicas.", 9),
          g("pior caso", "Custo do algoritmo na entrada que lhe é mais desfavorável.", 8),
          g("tempo constante", "O custo não depende do tamanho da entrada.", 6),
          g("tempo logarítmico", "O custo cresce muito devagar: duplicar a entrada acrescenta um passo.", 11),
          g("tempo quadrático", "O custo cresce com o quadrado da entrada. Duplicar a entrada quadruplica o trabalho.", 14),
          g("recorrência", "Equação que define o custo de um algoritmo em função de si próprio.", 21)
        ]
      }
    }
  ],
  sessoes: [],
  config: { geminiKey: "", modelo: "gemini-flash-latest", limiarConfianca: 0.72 }
};

/* Frases usadas pelo modo de simulação, quando não há microfone disponível
   (emulador, revisão em computador de secretária, demonstração sem som).
   Estão escritas para exercitar a deteção de termos do glossário. */
export const SIMULACAO = {
  "a-prog-06": [
    "Bom, vamos continuar de onde ficámos na semana passada.",
    "Já vimos que uma classe pode herdar de outra.",
    "A isso chamamos herança.",
    "Hoje interessa-me outra coisa, que é o polimorfismo.",
    "Reparem nesta superclasse Animal.",
    "Cada subclasse faz override do método emitirSom.",
    "Isto chama-se polimorfismo e permite que o mesmo método tenha implementações diferentes.",
    "Atenção que sobrecarga não é polimorfismo: na sobrecarga muda a assinatura do método.",
    "Uma interface define o contrato, mas não diz como se implementa.",
    "Quando criamos uma instância, é a classe concreta que decide o comportamento."
  ],
  "a-alg-07": [
    "Vamos falar de complexidade assintótica.",
    "A notação O grande descreve o limite superior do crescimento.",
    "Se duplicar a entrada e o trabalho quadruplicar, estamos perante tempo quadrático.",
    "O pior caso é a entrada mais desfavorável ao algoritmo.",
    "Já o caso médio diz respeito a entradas típicas.",
    "Uma pesquisa binária corre em tempo logarítmico."
  ],
  "a-bd-05": [
    "Uma tabela está na terceira forma normal quando não há dependência transitiva.",
    "Normal quando não há dependências entre atributos não chave.",
    "A chave candidata identifica univocamente cada linha.",
    "Vamos ver um exemplo de dependência funcional."
  ]
};
