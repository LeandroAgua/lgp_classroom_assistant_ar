/* seed.js — estado inicial da aplicação.

   A aplicação arranca SEM aulas. Não há dados de demonstração: uma app de
   acessibilidade que abre com aulas de outra pessoa lá dentro confunde quem a
   usa pela primeira vez, e numa demonstração dá a impressão de que o conteúdo
   é falso.

   Para experimentar sem preparar nada, o modo de teste (#/dev) tem materiais
   de exemplo em amostras.js, que criam aulas reais com glossário extraído. */

export const SEED = {
  aulas: [],
  sessoes: [],
  config: { geminiKey: "", modelo: "gemini-3.8-flash", limiarConfianca: 0.9, simulacao: false, volume: 1 }
};

/* Guião do modo de simulação: legendas de exemplo, sem áudio real. Serve para
   demonstrar o fluxo em dispositivos sem microfone, e para a defesa não
   depender de o reconhecimento correr bem à primeira.

   É uma lista única, e não um guião por aula: as aulas passaram a ser criadas
   pelo utilizador, com identificadores gerados, por isso não havia por onde
   indexar. */
export const GUIAO_SIMULACAO = [
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
];
