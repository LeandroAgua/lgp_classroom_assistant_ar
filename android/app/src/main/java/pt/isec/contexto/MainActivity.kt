package pt.isec.contexto

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.*
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Invólucro WebView da app ConTexto.
 *
 * Duas decisões que não são detalhe:
 *
 * 1. O conteúdo é servido por [WebViewAssetLoader], em
 *    https://appassets.androidplatform.net/, e NÃO por file:///android_asset/.
 *    `getUserMedia` exige um contexto seguro; `file://` não é um, por isso a
 *    câmara e o microfone falhariam silenciosamente. É o erro mais comum em
 *    apps WebView que precisam de media.
 *
 * 2. O WebView do Android não implementa a Web Speech API. A legendagem ao
 *    vivo morreria aqui. Por isso a app expõe o [SpeechBridge], que usa o
 *    reconhecedor nativo do Android e devolve os resultados ao JavaScript.
 *    O lado web deteta a ponte e prefere-a à API do browser.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var pedidoFicheiro: ValueCallback<Array<Uri>>? = null
    private var permissaoWebPendente: PermissionRequest? = null
    private lateinit var ponte: SpeechBridge

    private val escolherFicheiro =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
            val cb = pedidoFicheiro ?: return@registerForActivityResult
            pedidoFicheiro = null
            cb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res.resultCode, res.data))
        }

    private val pedirPermissoes =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { concedidas ->
            val pedido = permissaoWebPendente
            permissaoWebPendente = null
            if (pedido == null) return@registerForActivityResult
            val ok = pedido.resources.filter { recurso ->
                when (recurso) {
                    PermissionRequest.RESOURCE_VIDEO_CAPTURE -> concedidas[Manifest.permission.CAMERA] == true
                    PermissionRequest.RESOURCE_AUDIO_CAPTURE -> concedidas[Manifest.permission.RECORD_AUDIO] == true
                    else -> false
                }
            }.toTypedArray()
            if (ok.isNotEmpty()) pedido.grant(ok) else pedido.deny()
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        setContentView(webView)

        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true                 // a app guarda tudo em localStorage
            mediaPlaybackRequiresUserGesture = false // a câmara arranca sem segundo toque
            allowFileAccess = false
            allowContentAccess = false
            cacheMode = WebSettings.LOAD_DEFAULT
            useWideViewPort = true
            loadWithOverviewMode = true
            textZoom = 100                           // a app já controla o tamanho do texto
        }

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(req.url)

            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                val url = req.url.toString()
                // Navegação interna fica no WebView; tudo o resto vai para o browser.
                if (url.startsWith(BASE) || url.startsWith(BuildConfig.REMOTE_URL)) return false
                return try {
                    startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, req.url)); true
                } catch (_: Exception) { true }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            /** Sem isto, getUserMedia é recusado pelo WebView, mesmo com as
             *  permissões do manifesto concedidas. */
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val emFalta = mutableListOf<String>()
                    request.resources.forEach { r ->
                        when (r) {
                            PermissionRequest.RESOURCE_VIDEO_CAPTURE ->
                                if (!temPermissao(Manifest.permission.CAMERA)) emFalta += Manifest.permission.CAMERA
                            PermissionRequest.RESOURCE_AUDIO_CAPTURE ->
                                if (!temPermissao(Manifest.permission.RECORD_AUDIO)) emFalta += Manifest.permission.RECORD_AUDIO
                        }
                    }
                    if (emFalta.isEmpty()) {
                        request.grant(request.resources)
                    } else {
                        permissaoWebPendente = request
                        pedirPermissoes.launch(emFalta.toTypedArray())
                    }
                }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                if (permissaoWebPendente == request) permissaoWebPendente = null
            }

            override fun onShowFileChooser(
                view: WebView, callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                pedidoFicheiro?.onReceiveValue(null)
                pedidoFicheiro = callback
                return try {
                    escolherFicheiro.launch(params.createIntent()); true
                } catch (_: Exception) {
                    pedidoFicheiro = null; false
                }
            }
        }

        ponte = SpeechBridge(this, webView)
        webView.addJavascriptInterface(ponte, "ContextoSpeech")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
            }
        })

        if (savedInstanceState == null) {
            val url = BuildConfig.REMOTE_URL.ifBlank { "$BASE/assets/web/index.html" }
            webView.loadUrl(url)
        } else {
            webView.restoreState(savedInstanceState)
        }

        // Pedir à cabeça evita o aluno descobrir a meio da aula que falta a permissão.
        val pedir = listOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA)
            .filterNot { temPermissao(it) }
        if (pedir.isNotEmpty()) pedirPermissoes.launch(pedir.toTypedArray())
    }

    private fun temPermissao(p: String) =
        ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onPause() { super.onPause(); webView.onPause(); ponte.parar() }
    override fun onResume() { super.onResume(); webView.onResume() }

    override fun onDestroy() {
        ponte.libertar()
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        const val BASE = "https://appassets.androidplatform.net"
    }
}
