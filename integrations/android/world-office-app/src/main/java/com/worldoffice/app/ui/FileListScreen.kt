package com.worldoffice.app.ui

import android.content.Context
import android.util.AttributeSet
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.material.card.MaterialCardView
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.worldoffice.app.R
import com.worldoffice.app.model.Document
import com.worldoffice.app.model.DocumentCategory
import com.worldoffice.app.model.FileListResponse
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.TimeUnit

class FileListScreen constructor(
    context: Context,
    attrs: AttributeSet? = null
) : LinearLayout(context, attrs) {

    companion object {
        private const val TAG = "FileListScreen"
    }

    private var toolbar: com.google.android.material.appbar.MaterialToolbar
    private var serverTagline: TextView
    private var swipeRefresh: SwipeRefreshLayout
    private var fileRecycler: RecyclerView
    private var emptyState: View
    private var loadingProgress: ProgressBar
    private var errorState: View
    private var errorMessage: TextView
    private var retryButton: com.google.android.material.button.MaterialButton

    private val gson = Gson()
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val original = chain.request()
            val builder = original.newBuilder()
                .header("Accept", "application/json")
            authToken?.let {
                builder.header("Authorization", "Bearer $it")
            }
            chain.proceed(builder.build())
        }
        .build()

    private var serverUrl: String = ""
    private var authToken: String? = null
    private var fileAdapter: FileAdapter? = null
    private var onFileSelectedListener: ((Document) -> Unit)? = null
    private var onLogoutRequestedListener: (() -> Unit)? = null
    private var onSettingsRequestedListener: (() -> Unit)? = null
    private var isLoading: Boolean = false

    constructor(context: Context) : this(context, null)

    init {
        orientation = VERTICAL
        LayoutInflater.from(context).inflate(R.layout.view_file_list, this, true)

        toolbar = findViewById(R.id.toolbar)
        serverTagline = findViewById(R.id.server_tagline)
        swipeRefresh = findViewById(R.id.swipe_refresh)
        fileRecycler = findViewById(R.id.file_recycler)
        emptyState = findViewById(R.id.empty_state)
        loadingProgress = findViewById(R.id.loading_progress)
        errorState = findViewById(R.id.error_state)
        errorMessage = findViewById(R.id.error_message)
        retryButton = findViewById(R.id.retry_button)

        setupViews()
    }

    fun configure(serverUrl: String, authToken: String?) {
        this.serverUrl = serverUrl
        this.authToken = authToken
        serverTagline.text = serverUrl
        serverTagline.visibility = View.VISIBLE
        loadFiles()
    }

    fun setOnFileSelectedListener(listener: (Document) -> Unit) {
        onFileSelectedListener = listener
    }

    fun setOnLogoutRequestedListener(listener: () -> Unit) {
        onLogoutRequestedListener = listener
    }

    fun setOnSettingsRequestedListener(listener: () -> Unit) {
        onSettingsRequestedListener = listener
    }

    fun refresh() {
        loadFiles()
    }

    private fun setupViews() {
        fileAdapter = FileAdapter { document ->
            onFileSelectedListener?.invoke(document)
        }
        fileRecycler.layoutManager = LinearLayoutManager(context)
        fileRecycler.adapter = fileAdapter

        swipeRefresh.setOnRefreshListener {
            loadFiles()
        }

        retryButton.setOnClickListener {
            loadFiles()
        }

        toolbar.setOnMenuItemClickListener { menuItem ->
            when (menuItem.itemId) {
                R.id.action_refresh -> {
                    loadFiles()
                    true
                }
                R.id.action_settings -> {
                    onSettingsRequestedListener?.invoke()
                    true
                }
                R.id.action_logout -> {
                    showLogoutConfirmation()
                    true
                }
                else -> false
            }
        }
    }

    private fun loadFiles() {
        if (isLoading) return
        isLoading = true

        showLoading()
        swipeRefresh.isRefreshing = true

        CoroutineScope(Dispatchers.Main).launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    performLoadFiles()
                }
                isLoading = false
                swipeRefresh.isRefreshing = false
                handleFileListResult(result)
            } catch (e: Exception) {
                isLoading = false
                swipeRefresh.isRefreshing = false
                Log.e(TAG, "Failed to load files", e)
                showError("${e.message ?: "Network error"}")
            }
        }
    }

    private fun performLoadFiles(): FileListResponse {
        val url = "$serverUrl/api/files"
        val request = Request.Builder()
            .url(url)
            .get()
            .build()

        val response = client.newCall(request).execute()
        val body = response.body?.string() ?: "[]"

        return if (response.isSuccessful) {
            // Handle both array and object responses
            val type = object : TypeToken<List<Document>>() {}.type
            val files: List<Document> = try {
                gson.fromJson(body, type)
            } catch (e: Exception) {
                // Try object wrapper format
                try {
                    gson.fromJson(body, FileListResponse::class.java).files
                } catch (e2: Exception) {
                    emptyList()
                }
            }
            FileListResponse(files = files)
        } else {
            throw Exception("HTTP ${response.code}: ${response.message}")
        }
    }

    private fun handleFileListResult(result: FileListResponse) {
        swipeRefresh.isRefreshing = false
        loadingProgress.visibility = View.GONE

        if (result.files.isEmpty()) {
            emptyState.visibility = View.VISIBLE
            fileRecycler.visibility = View.GONE
            errorState.visibility = View.GONE
        } else {
            emptyState.visibility = View.GONE
            fileRecycler.visibility = View.VISIBLE
            errorState.visibility = View.GONE
            fileAdapter?.submitList(result.files.sortedByDescending { it.modifiedAt })
        }
    }

    private fun showLoading() {
        loadingProgress.visibility = View.VISIBLE
        emptyState.visibility = View.GONE
        fileRecycler.visibility = View.GONE
        errorState.visibility = View.GONE
    }

    private fun showError(message: String) {
        loadingProgress.visibility = View.GONE
        emptyState.visibility = View.GONE
        fileRecycler.visibility = View.GONE
        errorState.visibility = View.VISIBLE
        errorMessage.text = message
    }

    private fun showLogoutConfirmation() {
        MaterialAlertDialogBuilder(context)
            .setTitle(R.string.logout)
            .setMessage(R.string.logout_confirm)
            .setPositiveButton(R.string.logout) { _, _ ->
                onLogoutRequestedListener?.invoke()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    class FileAdapter(
        private val onFileClick: (Document) -> Unit
    ) : RecyclerView.Adapter<FileAdapter.FileViewHolder>() {

        private var files: List<Document> = emptyList()

        fun submitList(newFiles: List<Document>) {
            val diffResult = DiffUtil.calculateDiff(
                FileDiffCallback(files, newFiles)
            )
            files = newFiles
            diffResult.dispatchUpdatesTo(this)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): FileViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_file, parent, false)
            return FileViewHolder(view, onFileClick)
        }

        override fun onBindViewHolder(holder: FileViewHolder, position: Int) {
            holder.bind(files[position])
        }

        override fun getItemCount(): Int = files.size

        class FileViewHolder(
            itemView: View,
            private val onFileClick: (Document) -> Unit
        ) : RecyclerView.ViewHolder(itemView) {

            private val card: MaterialCardView = itemView.findViewById(R.id.file_card)
            private val fileIcon: ImageView = itemView.findViewById(R.id.file_icon)
            private val fileName: TextView = itemView.findViewById(R.id.file_name)
            private val fileType: TextView = itemView.findViewById(R.id.file_type)
            private val fileSize: TextView = itemView.findViewById(R.id.file_size)
            private val fileDate: TextView = itemView.findViewById(R.id.file_date)

            fun bind(document: Document) {
                fileName.text = document.name
                fileType.text = getFileTypeLabel(document)
                fileSize.text = formatFileSize(document.size)
                fileDate.text = formatDate(document.modifiedAt)
                fileIcon.setImageDrawable(
                    ContextCompat.getDrawable(
                        itemView.context,
                        getFileIcon(document.getDocumentCategory())
                    )
                )
                fileIcon.imageTintList = ContextCompat.getColorStateList(
                    itemView.context,
                    getFileColor(document.getDocumentCategory())
                )
                card.setOnClickListener {
                    onFileClick(document)
                }
            }

            private fun getFileTypeLabel(document: Document): String {
                val res = itemView.resources
                return when (document.getDocumentCategory()) {
                    DocumentCategory.DOCUMENT -> res.getString(R.string.file_type_document)
                    DocumentCategory.SPREADSHEET -> res.getString(R.string.file_type_spreadsheet)
                    DocumentCategory.PRESENTATION -> res.getString(R.string.file_type_presentation)
                    else -> document.type.uppercase()
                }
            }

            private fun getFileIcon(category: DocumentCategory): Int {
                return when (category) {
                    DocumentCategory.DOCUMENT -> R.drawable.ic_file_document
                    DocumentCategory.SPREADSHEET -> R.drawable.ic_file_spreadsheet
                    DocumentCategory.PRESENTATION -> R.drawable.ic_file_presentation
                    DocumentCategory.PDF -> R.drawable.ic_file_pdf
                    DocumentCategory.UNKNOWN -> R.drawable.ic_file_generic
                }
            }

            private fun getFileColor(category: DocumentCategory): Int {
                return when (category) {
                    DocumentCategory.DOCUMENT -> R.color.file_type_document
                    DocumentCategory.SPREADSHEET -> R.color.file_type_spreadsheet
                    DocumentCategory.PRESENTATION -> R.color.file_type_presentation
                    else -> R.color.outline
                }
            }

            private fun formatFileSize(bytes: Long): String {
                return when {
                    bytes < 1024 -> "$bytes B"
                    bytes < 1024 * 1024 -> String.format("%.1f KB", bytes / 1024.0)
                    bytes < 1024 * 1024 * 1024 -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
                    else -> String.format("%.1f GB", bytes / (1024.0 * 1024.0 * 1024.0))
                }
            }

            private fun formatDate(dateStr: String): String {
                return try {
                    val inputFormats = listOf(
                        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US),
                        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US),
                        SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US),
                        SimpleDateFormat("yyyy-MM-dd", Locale.US)
                    )
                    val outputFormat = SimpleDateFormat("MMM dd, yyyy HH:mm", Locale.US)

                    for (fmt in inputFormats) {
                        try {
                            val date = fmt.parse(dateStr)
                            if (date != null) {
                                return outputFormat.format(date)
                            }
                        } catch (_: Exception) {}
                    }
                    dateStr
                } catch (_: Exception) {
                    dateStr
                }
            }
        }

        class FileDiffCallback(
            private val oldList: List<Document>,
            private val newList: List<Document>
        ) : DiffUtil.Callback() {
            override fun getOldListSize(): Int = oldList.size
            override fun getNewListSize(): Int = newList.size

            override fun areItemsTheSame(oldPos: Int, newPos: Int): Boolean {
                return oldList[oldPos].id == newList[newPos].id
            }

            override fun areContentsTheSame(oldPos: Int, newPos: Int): Boolean {
                return oldList[oldPos] == newList[newPos]
            }
        }
    }
}
