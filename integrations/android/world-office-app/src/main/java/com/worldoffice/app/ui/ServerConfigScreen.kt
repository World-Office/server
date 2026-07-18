package com.worldoffice.app.ui

import android.content.Context
import android.text.Editable
import android.text.TextWatcher
import android.util.AttributeSet
import android.util.Log
import android.util.Patterns
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputLayout
import com.google.gson.Gson
import com.worldoffice.app.R
import com.worldoffice.app.model.ConnectionTestResult
import com.worldoffice.app.model.ServerInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Server configuration screen view.
 * Allows users to enter a server URL, test the connection, and save the configuration.
 */
class ServerConfigScreen constructor(
    context: Context,
    attrs: AttributeSet? = null
) : LinearLayout(context, attrs) {

    companion object {
        private const val TAG = "ServerConfigScreen"
        private const val PREFS_NAME = "world_office_server_prefs"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_SERVER_INFO = "server_info"
    }

    private var serverUrlInput: EditText
    private var serverUrlLayout: TextInputLayout
    private var testConnectionButton: Button
    private var saveButton: Button
    private var connectionProgress: ProgressBar
    private var connectionStatus: TextView
    private var statusIcon: View

    private val gson = Gson()
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            chain.proceed(
                chain.request().newBuilder()
                    .header("Accept", "application/json")
                    .build()
            )
        }
        .build()

    private var onConfiguredListener: ((ConnectionTestResult) -> Unit)? = null
    private var isTestingConnection: Boolean = false

    constructor(context: Context) : this(context, null)

    init {
        orientation = VERTICAL
        LayoutInflater.from(context).inflate(R.layout.view_server_config, this, true)

        serverUrlLayout = findViewById(R.id.server_url_layout)
        serverUrlInput = findViewById(R.id.server_url_input)
        testConnectionButton = findViewById(R.id.test_connection_button)
        saveButton = findViewById(R.id.save_config_button)
        connectionProgress = findViewById(R.id.connection_progress)
        connectionStatus = findViewById(R.id.connection_status)
        statusIcon = findViewById(R.id.status_icon)

        setupListeners()
        loadSavedUrl()
    }

    /**
     * Sets a listener that fires when the server configuration is saved.
     */
    fun setOnConfiguredListener(listener: (ConnectionTestResult) -> Unit) {
        onConfiguredListener = listener
    }

    /**
     * Returns the currently entered server URL.
     */
    fun getServerUrl(): String {
        return serverUrlInput.text?.toString()?.trim()?.trimEnd('/') ?: ""
    }

    /**
     * Returns the stored auth token, if any.
     */
    fun getStoredAuthToken(): String? {
        return getEncryptedPrefs().getString(KEY_AUTH_TOKEN, null)
    }

    /**
     * Checks if a server URL is already configured.
     */
    fun isConfigured(): Boolean {
        return getEncryptedPrefs().contains(KEY_SERVER_URL)
    }

    /**
     * Performs a quick connection test without UI interaction.
     * Returns the current server URL regardless.
     */
    fun getSavedServerUrl(): String {
        return getEncryptedPrefs().getString(KEY_SERVER_URL, "") ?: ""
    }

    private fun setupListeners() {
        serverUrlInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                validateUrl()
                updateSaveButtonState()
            }
        })

        testConnectionButton.setOnClickListener {
            if (!isTestingConnection) {
                testConnection()
            }
        }

        saveButton.setOnClickListener {
            saveConfiguration()
        }
    }

    private fun validateUrl(): Boolean {
        val url = getServerUrl()
        return if (url.isNotEmpty() && !Patterns.WEB_URL.matcher(url).matches()) {
            serverUrlLayout.error = context.getString(R.string.invalid_url)
            false
        } else {
            serverUrlLayout.error = null
            true
        }
    }

    private fun updateSaveButtonState() {
        val url = getServerUrl()
        saveButton.isEnabled = url.isNotEmpty() && Patterns.WEB_URL.matcher(url).matches()
    }

    private fun testConnection() {
        val url = getServerUrl()
        if (url.isEmpty() || !Patterns.WEB_URL.matcher(url).matches()) {
            serverUrlLayout.error = context.getString(R.string.invalid_url)
            return
        }

        isTestingConnection = true
        testConnectionButton.isEnabled = false
        connectionProgress.visibility = View.VISIBLE
        connectionStatus.text = context.getString(R.string.connecting)
        connectionStatus.visibility = View.VISIBLE
        statusIcon.visibility = View.GONE

        CoroutineScope(Dispatchers.Main).launch {
            val result = withContext(Dispatchers.IO) {
                performConnectionTest(url)
            }
            handleTestResult(result)
        }
    }

    private fun performConnectionTest(url: String): ConnectionTestResult {
        return try {
            // Try to fetch server info
            val request = Request.Builder()
                .url("$url/api/info")
                .get()
                .build()

            val response = client.newCall(request).execute()
            val body = response.body?.string()

            if (response.isSuccessful && body != null) {
                val serverInfo = gson.fromJson(body, ServerInfo::class.java)
                ConnectionTestResult(
                    success = true,
                    message = serverInfo.message ?: "Connected to ${serverInfo.name ?: "World Office"}",
                    serverInfo = serverInfo
                )
            } else if (response.code == 404) {
                // Server might not have /api/info endpoint - check /api/health or root
                val healthRequest = Request.Builder()
                    .url("$url/api/health")
                    .get()
                    .build()

                val healthResponse = client.newCall(healthRequest).execute()
                if (healthResponse.isSuccessful) {
                    ConnectionTestResult(
                        success = true,
                        message = "Connected successfully"
                    )
                } else {
                    ConnectionTestResult(
                        success = true,
                        message = "Server reachable (HTTP ${response.code})"
                    )
                }
            } else {
                ConnectionTestResult(
                    success = false,
                    message = "HTTP ${response.code}: ${response.message}"
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Connection test failed", e)
            ConnectionTestResult(
                success = false,
                message = e.message ?: "Connection failed"
            )
        }
    }

    private fun handleTestResult(result: ConnectionTestResult) {
        isTestingConnection = false
        testConnectionButton.isEnabled = true
        connectionProgress.visibility = View.GONE
        connectionStatus.visibility = View.VISIBLE
        statusIcon.visibility = View.VISIBLE

        if (result.success) {
            connectionStatus.text = result.message
            connectionStatus.setTextColor(
                androidx.core.content.ContextCompat.getColor(context, R.color.primary)
            )
            serverUrlLayout.error = null
            saveButton.isEnabled = true
        } else {
            connectionStatus.text = "${context.getString(R.string.connection_failed)} ${result.message}"
            connectionStatus.setTextColor(
                androidx.core.content.ContextCompat.getColor(context, R.color.error)
            )
            saveButton.isEnabled = false
        }
    }

    private fun saveConfiguration() {
        val url = getServerUrl()
        if (url.isEmpty()) return

        val prefs = getEncryptedPrefs()
        prefs.edit {
            putString(KEY_SERVER_URL, url)
        }

        Log.d(TAG, "Server configuration saved: $url")
        onConfiguredListener?.invoke(
            ConnectionTestResult(success = true, message = "Configuration saved")
        )
    }

    private fun loadSavedUrl() {
        val prefs = getEncryptedPrefs()
        val savedUrl = prefs.getString(KEY_SERVER_URL, "")
        if (!savedUrl.isNullOrEmpty()) {
            serverUrlInput.setText(savedUrl)
            updateSaveButtonState()
        }
    }

    private fun getEncryptedPrefs(): EncryptedSharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        return EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        ) as EncryptedSharedPreferences
    }

    /**
     * Clears the stored server configuration.
     */
    fun clearConfiguration() {
        getEncryptedPrefs().edit {
            remove(KEY_SERVER_URL)
            remove(KEY_AUTH_TOKEN)
            remove(KEY_SERVER_INFO)
        }
        serverUrlInput.text?.clear()
        connectionStatus.visibility = View.GONE
        statusIcon.visibility = View.GONE
    }

    /**
     * Shows a confirmation dialog before clearing the configuration.
     */
    fun showLogoutConfirmation(callback: (Boolean) -> Unit) {
        MaterialAlertDialogBuilder(context)
            .setTitle(R.string.logout)
            .setMessage(R.string.logout_confirm)
            .setPositiveButton(R.string.logout) { _, _ ->
                clearConfiguration()
                callback(true)
            }
            .setNegativeButton(R.string.cancel) { _, _ ->
                callback(false)
            }
            .show()
    }
}
