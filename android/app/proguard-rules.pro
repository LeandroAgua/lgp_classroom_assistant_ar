# A ponte de reconhecimento de fala é chamada por nome a partir do JavaScript.
-keepclassmembers class pt.isec.contexto.SpeechBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class pt.isec.contexto.SpeechBridge { *; }
