package com.worldoffice.app

import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.snackbar.Snackbar
import com.worldoffice.app.model.ConnectionTestResult
import com.worldoffice.app.model.Document
import com.worldoffice.app.ui.FileListScreen
import com.worldoffice.app.ui.ServerConfigScreen
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MainActivity"
    }

    private lateinit var contentContainer: FrameLayout
    private var serverConfigScreen: ServerConfigScreen? = null
    private var fileListScreen: FileListScreen? = null

    private var currentServerUrl: String = ""
    private var currentAuthToken: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        contentContainer = findViewById(R.id.content_container)

        lifecycleScope.launch {
            checkAndShowScreen()
        }
    }

    override fun onResume() {
        super.onResume()
        // Refresh file listing when returning from editor
        fileListScreen?.refresh()
    }

    private fun checkAndShowScreen() {
        val configScreen = ServerConfigScreen(this)
        if (configScreen.isConfigured()) {
            currentServerUrl = configScreen.getSavedServerUrl()
            currentAuthToken = configScreen.getStoredAuthToken()
            showFileListScreen()
        } else {
            showServerConfigScreen()
        }
    }

    private fun showServerConfigScreen() {
        contentContainer.removeAllViews()
        serverConfigScreen = ServerConfigScreen(this).apply {
            setOnConfiguredListener { result ->
                handleConfigurationResult(result)
            }
        }
        contentContainer.addView(serverConfigScreen)
        fileListScreen = null
    }

    private fun showFileListScreen() {
        contentContainer.removeAllViews()
        fileListScreen = FileListScreen(this).apply {
            configure(currentServerUrl, currentAuthToken)
            setOnFileSelectedListener { document ->
                openEditor(document)
            }
            setOnLogoutRequestedListener {
                handleLogout()
            }
            setOnSettingsRequestedListener {
                showServerConfigScreen()
            }
        }
        contentContainer.addView(fileListScreen)
        serverConfigScreen = null
    }

    private fun handleConfigurationResult(result: ConnectionTestResult) {
        if (result.success) {
            currentServerUrl = serverConfigScreen?.getServerUrl() ?: ""
            currentAuthToken = serverConfigScreen?.getStoredAuthToken()
            showFileListScreen()
            Snackbar.make(
                contentContainer,
                result.message,
                Snackbar.LENGTH_SHORT
            ).show()
        } else {
            Snackbar.make(
                contentContainer,
                result.message,
                Snackbar.LENGTH_LONG
            ).show()
        }
    }

    private fun openEditor(document: Document) {
        val editorPath = document.getEditorAppPath()
        val intent = EditorActivity.createIntent(
            context = this,
            serverUrl = currentServerUrl,
            fileId = document.id,
            authToken = currentAuthToken,
            fileName = document.name,
            editorPath = editorPath
        )
        startActivity(intent)
    }

    private fun handleLogout() {
        currentServerUrl = ""
        currentAuthToken = null
        fileListScreen = null
        showServerConfigScreen()
        Snackbar.make(
            contentContainer,
            "Disconnected from server",
            Snackbar.LENGTH_SHORT
        ).show()
    }
}
