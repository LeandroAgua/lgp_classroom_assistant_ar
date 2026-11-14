/* camera.js — enquadramento da câmara para a pergunta em LGP.

   ESCOPO DELIBERADO: isto mostra a câmara, e mais nada.
   Não há reconhecimento de língua gestual nesta versão.

   Não é uma simplificação por preguiça, é o que se consegue defender. Não
   existe modelo de LGP pronto a usar, e a literatura mostra a exatidão a cair
   com o tamanho do vocabulário — cerca de 94% com 20 gestos, cerca de 46% com
   292. Um classificador treinado com um ou dois gestuantes aprende essas
   pessoas, não a língua. Prometer reconhecimento e entregar adivinhação seria
   pior do que não prometer nada.

   O que fica: o aluno enquadra-se, a app diz-lhe com todas as letras que não
   reconhece o gesto, e ele escreve a pergunta. A imagem não sai do
   dispositivo nem é gravada. */

export function criarCamara({ video, onErro } = {}) {
  let stream = null;

  async function iniciar() {
    if (!navigator.mediaDevices?.getUserMedia) {
      onErro && onErro(new Error("sem-api"));
      return false;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 1280 } },
        audio: false
      });
    } catch (e) {
      onErro && onErro(new Error(
        e.name === "NotAllowedError" ? "camara-recusada" : "camara-indisponivel"
      ));
      return false;
    }
    if (video) {
      video.srcObject = stream;
      await video.play().catch(() => {});
    }
    return true;
  }

  function parar() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if (video) video.srcObject = null;
  }

  return { iniciar, parar, ativa: () => !!stream };
}

export async function verificarCamara() {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, motivo: "sem-api" };
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true });
    s.getTracks().forEach(t => t.stop());
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e.name === "NotAllowedError" ? "recusado" : "indisponivel" };
  }
}
