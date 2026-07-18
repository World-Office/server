package com.worldoffice.app.webview

import android.content.Context
import android.util.Log
import android.widget.Toast
import com.google.gson.Gson
import com.worldoffice.app.model.FileResponse
import com.worldoffice.app.model.SaveDocumentRequest
import com.worldoffice.app.model.SaveDocumentResponse
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * JavaScript interface exposed to the WebView editor.
 * Provides file operations, toast notifications, and server communication.
 */
class WebAppInterface(
    private val context: Context,
    private val serverUrl: String,
    private val authToken: String?,
    private val fileId: String?,
    private val onSaveResult: ((Boolean, String) -> Unit)? = null
) {
    companion object {
        private const val TAG = "WebAppInterface"
        private const val JS_INTERFACE_NAME = "WorldOfficeBridge"
    }

    private val gson = Gson()
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val original = chain.request()
            val builder = original.newBuilder()
                .header("Accept", "application/json")
            if (authToken != null) {
                builder.header("Authorization", "Bearer $authToken")
            }
            chain.proceed(builder.build())
        }
        .build()

    /**
     * Returns the JavaScript interface name used in the WebView.
     */
    fun getInterfaceName(): String = JS_INTERFACE_NAME

    /**
     * Saves document content back to the server.
     * Called from JavaScript: WorldOfficeBridge.saveDocument(content, filename)
     */
    @JavascriptInterface
    fun saveDocument(content: String, filename: String) {
        Log.d(TAG, "saveDocument called: filename=$filename, contentLength=${content.length}")

        CoroutineScope(Dispatchers.Main).launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    performSaveDocument(content, filename)
                }
                val json = gson.toJson(result)
                onSaveResult?.invoke(result.success, result.error ?: "")
                if (result.success) {
                    showToastInternal("Document saved successfully")
                } else {
                    showToastInternal("Save failed: ${result.error}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Save failed", e)
                val result = SaveDocumentResponse(success = false, error = e.message)
                onSaveResult?.invoke(false, e.message ?: "Unknown error")
                showToastInternal("Save failed: ${e.message}")
            }
        }
    }

    /**
     * Gets file content from the server.
     * Called from JavaScript: WorldOfficeBridge.getFile(fileId)
     */
    @JavascriptInterface
    fun getFile(fileId: String): String {
        Log.d(TAG, "getFile called: fileId=$fileId")

        return try {
            val url = "${serverUrl}/api/files/${fileId}/content"
            val request = Request.Builder()
                .url(url)
                .get()
                .build()

            val response = client.newCall(request).execute()
            val body = response.body?.string() ?: ""

            if (response.isSuccessful) {
                val fileResponse = FileResponse(content = body)
                gson.toJson(fileResponse)
            } else {
                val fileResponse = FileResponse(error = "HTTP ${response.code}: ${response.message}")
                gson.toJson(fileResponse)
            }
        } catch (e: Exception) {
            Log.e(TAG, "getFile failed", e)
            val fileResponse = FileResponse(error = e.message ?: "Network error")
            gson.toJson(fileResponse)
        }
    }

    /**
     * Shows an Android toast notification.
     * Called from JavaScript: WorldOfficeBridge.showToast(message)
     */
    @JavascriptInterface
    fun showToast(message: String) {
        showToastInternal(message)
    }

    /**
     * Returns the configured server URL to the JavaScript editor.
     * Called from JavaScript: WorldOfficeBridge.getServerUrl()
     */
    @JavascriptInterface
    fun getServerUrl(): String {
        return serverUrl
    }

    /**
     * Returns the current file ID to the JavaScript editor.
     * Called from JavaScript: WorldOfficeBridge.getFileId()
     */
    @JavascriptInterface
    fun getFileId(): String {
        return fileId ?: ""
    }

    /**
     * Returns the auth token to the JavaScript editor for API calls.
     * Called from JavaScript: WorldOfficeBridge.getAuthToken()
     */
    @JavascriptInterface
    fun getAuthToken(): String {
        return authToken ?: ""
    }

    /**
     * Logs a message from JavaScript (for debugging).
     * Called from JavaScript: WorldOfficeBridge.log(message)
     */
    @JavascriptInterface
    fun log(message: String) {
        Log.d(TAG, "[JS] $message")
    }

    private fun showToastInternal(message: String) {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
    }

    private fun performSaveDocument(content: String, filename: String): SaveDocumentResponse {
        val url = "${serverUrl}/api/files"

        val requestBody = SaveDocumentRequest(
            content = content,
            filename = filename,
            mimeType = "application/octet-stream"
        )

        val jsonBody = gson.toJson(requestBody)
        val mediaType = "application/json".toMediaType()
        val body = jsonBody.toRequestBody(mediaType)

        // If we have a file ID, update existing file; otherwise create new
        val requestUrl = if (fileId != null) {
            "$url/$fileId"
        } else {
            url
        }

        val request = Request.Builder()
            .url(requestUrl)
            .method(if (fileId != null) "PUT" else "POST", body)
            .build()

        val response = client.newCall(request).execute()
        val responseBody = response.body?.string() ?: "{}"

        return if (response.isSuccessful) {
            gson.fromJson(responseBody, SaveDocumentResponse::class.java)
                .copy(success = true)
        } else {
            SaveDocumentResponse(
                success = false,
                error = "HTTP ${response.code}: ${response.message}"
            )
        }
    }
}
