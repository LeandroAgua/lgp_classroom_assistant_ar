package pt.isec.contexto

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject

/**
 * Reconhecimento de fala nativo, exposto ao JavaScript como `ContextoSpeech`.
 *
 * O WebView do Android não implementa a Web Speech API: sem esta ponte, a
 * legendagem ao vivo — que é a funcionalidade principal — não funcionaria
 * dentro da app, apenas no Chrome. O lado web deteta `window.ContextoSpeech`
 * e prefere-a quando existe.
 *
 * Tal como no browser, o reconhecedor do Android pára sozinho ao fim de
 * algum silêncio. Numa aula de duas horas isso acontece dezenas de vezes,
 * por isso reinicia-se com recuo progressivo enquanto o utilizador não mandar
 * parar.
 *
 * Nota honesta: este reconhecedor também não aceita vocabulário
 * personalizado. O glossário continua a entrar na correspondência tolerante
 * do lado web. Injetar o glossário no reconhecedor exige um serviço próprio.
 */
class SpeechBridge(private val activity: Activity, private val webView: WebView) {

    private var recognizer: SpeechRecognizer? = null
    private var aCorrer = false
    private var pedidoDeParagem = false
    private var reinicios = 0
    private var lingua = "pt-PT"

    @JavascriptInterface
    fun disponivel(): Boolean = SpeechRecognizer.isRecognitionAvailable(activity)

    @JavascriptInterface
    fun iniciar(lang: String) {
        lingua = if (lang.isBlank()) "pt-PT" else lang
        pedidoDeParagem = false
        reinicios = 0
        activity.runOnUiThread { arrancar() }
    }

    @JavascriptInterface
    fun parar() {
        pedidoDeParagem = true
        activity.runOnUiThread {
            try { recognizer?.stopListening() } catch (_: Exception) {}
            aCorrer = false
            emitir("estado", JSONObject().put("estado", "parado"))
        }
    }

    fun libertar() {
        pedidoDeParagem = true
        activity.runOnUiThread {
            try { recognizer?.destroy() } catch (_: Exception) {}
            recognizer = null
        }
    }

    private fun arrancar() {
        if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
            emitir("erro", JSONObject().put("erro", "indisponivel"))
            return
        }
        if (recognizer == null) {
            recognizer = SpeechRecognizer.createSpeechRecognizer(activity).apply {
                setRecognitionListener(ouvinte)
            }
        }
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, lingua)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            // Mantém a escuta aberta durante as pausas naturais do discurso.
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
        }
        try {
            recognizer?.startListening(i)
            aCorrer = true
        } catch (e: Exception) {
            emitir("erro", JSONObject().put("erro", e.message ?: "falha-arranque"))
        }
    }

    private fun reagendar() {
        if (pedidoDeParagem) return
        reinicios++
        val espera = (250L * reinicios).coerceAtMost(3000L)
        emitir("estado", JSONObject().put("estado", "a-retomar"))
        webView.postDelayed({ if (!pedidoDeParagem) arrancar() }, espera)
    }

    private val ouvinte = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
            reinicios = 0
            emitir("estado", JSONObject().put("estado", "a-ouvir"))
        }

        override fun onPartialResults(partialResults: Bundle?) {
            val t = primeiro(partialResults) ?: return
            if (t.isNotBlank()) emitir("parcial", JSONObject().put("texto", t))
        }

        override fun onResults(results: Bundle?) {
            val t = primeiro(results)
            val conf = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)?.firstOrNull()
            if (!t.isNullOrBlank()) {
                emitir("final", JSONObject()
                    .put("texto", t)
                    .put("confianca", if (conf != null && conf > 0f) conf.toDouble() else 0.9))
            }
            aCorrer = false
            reagendar()
        }

        override fun onError(error: Int) {
            aCorrer = false
            when (error) {
                // Silêncio e timeout são normais numa aula: retomar sem alarmar.
                SpeechRecognizer.ERROR_NO_MATCH,
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> reagendar()

                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                    pedidoDeParagem = true
                    emitir("erro", JSONObject().put("erro", "sem-permissao"))
                }
                SpeechRecognizer.ERROR_NETWORK,
                SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> {
                    emitir("erro", JSONObject().put("erro", "rede"))
                    reagendar()
                }
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> reagendar()
                else -> { emitir("erro", JSONObject().put("erro", "codigo-$error")); reagendar() }
            }
        }

        override fun onEndOfSpeech() {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private fun primeiro(b: Bundle?): String? =
        b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim()

    /** Entrega o evento ao JavaScript. O payload vai como literal JSON, por
     *  isso não há concatenação de texto do utilizador dentro do script. */
    private fun emitir(tipo: String, dados: JSONObject) {
        val js = "window.__contextoSpeech && window.__contextoSpeech(" +
                JSONObject.quote(tipo) + "," + dados.toString() + ");"
        webView.post { webView.evaluateJavascript(js, null) }
    }
}
