package com.worldoffice.app.webview

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.util.AttributeSet
import android.util.Log
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar

/**
 * Custom WebView configured for the World Office editor.
 * Handles loading progress, back-button navigation, and proper WebView configuration.
 */
class EditorWebView constructor(
    context: Context,
    attrs: AttributeSet? = null
) : WebView(context, attrs) {

    companion object {
        private const val TAG = "EditorWebView"
    }

    private var progressBar: ProgressBar? = null
    private var loadError: Boolean = false
    private var onLoadStateChanged: ((Boolean) -> Unit)? = null

    /**
     * Initializes the WebView with optimal settings for the editor.
     */
    @SuppressLint("SetJavaScriptEnabled")
    fun configure(progressBar: ProgressBar? = null) {
        this.progressBar = progressBar
        loadError = false

        settings.apply {
            javaScriptEnabled = true
            javaScriptCanOpenWindowsAutomatically = false
            domStorageEnabled = true
            databaseEnabled = true
            setSupportMultipleWindows(false)

            // File access
            allowFileAccess = true
            allowContentAccess = true
            setAllowFileAccessFromFileURLs(true)
            setAllowUniversalAccessFromFileURLs(true)

            // Cache and performance
            cacheMode = WebSettings.LOAD_DEFAULT
            setAppCacheEnabled(true)
            layoutAlgorithm = WebSettings.LayoutAlgorithm.NARROW_COLUMNS
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = true
            displayZoomControls = false
            setSupportZoom(true)

            // Rendering
            blockNetworkImage = false
            loadsImagesAutomatically = true
            mediaPlaybackRequiresUserGesture = false

            // Mixed content (might have HTTP assets on HTTPS page)
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE

            // User agent
            userAgentString = "${settings.userAgentString} WorldOffice-Android/1.0"
        }

        webViewClient = createWebViewClient()
        webChromeClient = createWebChromeClient()

        // Enable remote debugging for development builds
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
    }

    /**
     * Registers the JavaScript interface bridge.
     */
    fun registerBridge(bridge: WebAppInterface) {
        addJavascriptInterface(bridge, bridge.getInterfaceName())
    }

    /**
     * Sets a callback for load state changes.
     */
    fun setOnLoadStateChanged(listener: (Boolean) -> Unit) {
        onLoadStateChanged = listener
    }

    /**
     * Checks if the WebView can go back (for the back button handler).
     */
    fun canGoBackInEditor(): Boolean {
        return canGoBack() && !loadError
    }

    /**
     * Injects a JavaScript callback for when the document content changes.
     */
    fun enableChangeTracking() {
        evaluateJavascript(
            """
            (function() {
                var dirty = false;
                document.addEventListener('DOMContentLoaded', function() {
                    if (window.Asc && window.Asc.plugin) {
                        var oldOnSave = window.Asc.plugin.prototype.onSave || function(){};
                        window.Asc.plugin.prototype.onSave = function() {
                            dirty = true;
                            oldOnSave.call(this);
                        };
                    }
                });
                window.isDocumentDirty = function() { return dirty; };
                window.clearDirtyFlag = function() { dirty = false; };
            })();
            """.trimIndent(),
            null
        )
    }

    /**
     * Loads the editor with the given URL.
     */
    fun loadEditorUrl(url: String) {
        loadError = false
        loadUrl(url)
    }

    /**
     * Cleans up resources when the view is destroyed.
     */
    fun cleanup() {
        onLoadStateChanged = null
        progressBar = null
        stopLoading()
        destroy()
    }

    private fun createWebViewClient(): WebViewClient {
        return object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                Log.d(TAG, "Loading: $url")
                loadError = false
                progressBar?.visibility = View.VISIBLE
                onLoadStateChanged?.invoke(false)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                Log.d(TAG, "Finished: $url")
                progressBar?.visibility = View.GONE
                onLoadStateChanged?.invoke(true)
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    Log.e(TAG, "Load error: ${error?.description}")
                    loadError = true
                    progressBar?.visibility = View.GONE
                    onLoadStateChanged?.invoke(true)
                }
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                return false // Allow all URLs to load in this WebView
            }
        }
    }

    private fun createWebChromeClient(): WebChromeClient {
        return object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                super.onProgressChanged(view, newProgress)
                progressBar?.progress = newProgress
                if (newProgress == 100) {
                    progressBar?.visibility = View.GONE
                }
            }

            override fun onReceivedTitle(view: WebView?, title: String?) {
                super.onReceivedTitle(view, title)
                Log.d(TAG, "Page title: $title")
            }
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        cleanup()
    }
}
