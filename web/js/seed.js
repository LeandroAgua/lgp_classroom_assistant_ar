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
   indexar.

   Os termos vão em português, os mesmos que saem dos materiais em amostras.js.
   Antes estavam em inglês — "class", "inheritance", "polymorphism" — e isso
   fazia o realce falhar: o glossário é extraído de slides em português, por
   isso não havia nada na legenda que casasse com ele. */
export const GUIAO_SIMULACAO = [
  "Bom, vamos continuar de onde ficámos na semana passada.",
  "Já vimos que uma classe pode herdar de outra.",
  "A isso chamamos herança.",
  "Hoje interessa-me outra coisa, que é o polimorfismo.",
  "Reparem nesta superclasse Animal.",
  "Cada subclasse faz a sua própria redefinição do método emitirSom.",
  "A isto chama-se ligação dinâmica: é a classe concreta do objeto que decide qual a implementação corre.",
  "Atenção que a sobrecarga não é polimorfismo: aí o que muda é a assinatura do método.",
  "Uma interface define o contrato, mas não diz como se implementa.",
  "Quando criamos uma instância, é a classe concreta que decide o comportamento."
];
