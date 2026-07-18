package com.worldoffice.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.worldoffice.app.model.Document
import com.worldoffice.app.webview.EditorWebView
import com.worldoffice.app.webview.WebAppInterface

/**
 * Activity that hosts the World Office React editor in a fullscreen WebView.
 * Receives server URL, file ID, and auth token via Intent extras.
 */
class EditorActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "EditorActivity"

        private const val EXTRA_SERVER_URL = "server_url"
        private const val EXTRA_FILE_ID = "file_id"
        private const val EXTRA_AUTH_TOKEN = "auth_token"
        private const val EXTRA_FILE_NAME = "file_name"
        private const val EXTRA_EDITOR_PATH = "editor_path"

        fun createIntent(
            context: Context,
            serverUrl: String,
            fileId: String,
            authToken: String?,
            fileName: String,
            editorPath: String
        ): Intent {
            return Intent(context, EditorActivity::class.java).apply {
                putExtra(EXTRA_SERVER_URL, serverUrl)
                putExtra(EXTRA_FILE_ID, fileId)
                putExtra(EXTRA_AUTH_TOKEN, authToken)
                putExtra(EXTRA_FILE_NAME, fileName)
                putExtra(EXTRA_EDITOR_PATH, editorPath)
            }
        }
    }

    private lateinit var editorWebView: EditorWebView
    private lateinit var progressBar: ProgressBar
    private lateinit var loadingOverlay: View
    private lateinit var loadingText: TextView
    private lateinit var webViewContainer: FrameLayout

    private var serverUrl: String = ""
    private var fileId: String = ""
    private var authToken: String? = null
    private var fileName: String = ""
    private var editorPath: String = ""
    private var webAppInterface: WebAppInterface? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportActionBar?.hide()
        enableFullscreen()

        setContentView(R.layout.activity_editor)

        editorWebView = findViewById(R.id.editor_webview)
        progressBar = findViewById(R.id.editor_progress)
        loadingOverlay = findViewById(R.id.loading_overlay)
        loadingText = findViewById(R.id.loading_text)
        webViewContainer = findViewById(R.id.webview_container)

        extractExtras()
        setupWebView()
        setupBackPressHandler()

        loadEditor()
    }

    override fun onDestroy() {
        webAppInterface = null
        editorWebView.cleanup()
        super.onDestroy()
    }

    override fun onResume() {
        super.onResume()
        enableFullscreen()
    }

    private fun extractExtras() {
        serverUrl = intent.getStringExtra(EXTRA_SERVER_URL) ?: ""
        fileId = intent.getStringExtra(EXTRA_FILE_ID) ?: ""
        authToken = intent.getStringExtra(EXTRA_AUTH_TOKEN)
        fileName = intent.getStringExtra(EXTRA_FILE_NAME) ?: ""
        editorPath = intent.getStringExtra(EXTRA_EDITOR_PATH) ?: ""
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        editorWebView.configure(progressBar)

        webAppInterface = WebAppInterface(
            context = this,
            serverUrl = serverUrl,
            authToken = authToken,
            fileId = fileId,
            onSaveResult = { success, error ->
                runOnUiThread {
                    if (!success && error.isNotEmpty()) {
                        showErrorToast("Save failed: $error")
                    }
                }
            }
        )

        editorWebView.registerBridge(webAppInterface!!)
        editorWebView.enableChangeTracking()

        editorWebView.setOnLoadStateChanged { isLoaded ->
            if (isLoaded) {
                loadingOverlay.animate()
                    .alpha(0f)
                    .setDuration(300)
                    .withEndAction {
                        loadingOverlay.visibility = View.GONE
                    }
                    .start()
            }
        }
    }

    private fun loadEditor() {
        val editorUrl = buildEditorUrl()
        if (editorUrl == null) {
            showErrorAndFinish("Could not determine editor URL")
            return
        }

        loadingText.text = getString(R.string.editor_loading)
        loadingOverlay.visibility = View.VISIBLE
        loadingOverlay.alpha = 1f

        editorWebView.loadEditorUrl(editorUrl)
    }

    private fun buildEditorUrl(): String? {
        if (serverUrl.isEmpty() || fileId.isEmpty()) return null

        val baseUrl = serverUrl.trimEnd('/')
        val appPath = editorPath.ifEmpty { "documenteditor-react" }

        return buildString {
            append("$baseUrl/apps/$appPath/index.html")
            append("?file=$fileId")
            authToken?.let { append("&token=$it") }
        }
    }

    private fun setupBackPressHandler() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                handleBackPress()
            }
        })
    }

    private fun handleBackPress() {
        if (editorWebView.canGoBackInEditor()) {
            editorWebView.goBack()
        } else {
            showSaveConfirmationDialog()
        }
    }

    private fun showSaveConfirmationDialog() {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.confirm_discard)
            .setMessage(R.string.confirm_discard_message)
            .setPositiveButton(R.string.save_and_exit) { _, _ ->
                saveAndExit()
            }
            .setNeutralButton(R.string.discard) { _, _ ->
                finish()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun saveAndExit() {
        // Trigger save in the WebView editor
        editorWebView.evaluateJavascript(
            """
            (function() {
                if (window.saveDocument) {
                    window.saveDocument();
                }
                setTimeout(function() { 
                    window.finishEditing();
                }, 500);
            })();
            """.trimIndent(),
            null
        )
        // Delay exit to allow save to process
        editorWebView.postDelayed({
            finish()
        }, 1000)
    }

    private fun enableFullscreen() {
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private fun showErrorToast(message: String) {
        runOnUiThread {
            com.google.android.material.snackbar.Snackbar.make(
                webViewContainer,
                message,
                com.google.android.material.snackbar.Snackbar.LENGTH_LONG
            ).show()
        }
    }

    private fun showErrorAndFinish(message: String) {
        MaterialAlertDialogBuilder(this)
            .setTitle("Error")
            .setMessage(message)
            .setPositiveButton("OK") { _, _ -> finish() }
            .setCancelable(false)
            .show()
    }
}
