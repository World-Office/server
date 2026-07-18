# World Office Android App ProGuard Rules

# Keep WebView JavascriptInterface methods
-keepclassmembers class com.worldoffice.app.webview.WebAppInterface {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Gson serialization classes
-keep class com.worldoffice.app.model.** { *; }

# Keep OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# Keep Kotlin coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}

# Keep Material 3
-keep class com.google.android.material.** { *; }

# General Android rules
-keep class * extends android.app.Activity { *; }
-keep class * extends android.webkit.WebView { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
