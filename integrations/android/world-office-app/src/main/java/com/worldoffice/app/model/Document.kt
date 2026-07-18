package com.worldoffice.app.model

import com.google.gson.annotations.SerializedName

/**
 * Data model representing a document on the World Office server.
 */
data class Document(
    @SerializedName("id")
    val id: String,

    @SerializedName("name")
    val name: String,

    @SerializedName("type")
    val type: String,

    @SerializedName("size")
    val size: Long,

    @SerializedName("modified_at")
    val modifiedAt: String,

    @SerializedName("created_at")
    val createdAt: String? = null,

    @SerializedName("mime_type")
    val mimeType: String? = null,

    @SerializedName("description")
    val description: String? = null
) {
    /**
     * Returns the document type category for UI display and editor selection.
     */
    fun getDocumentCategory(): DocumentCategory {
        return when (type.lowercase()) {
            "document", "docx", "odt", "doc", "rtf", "txt", "md" -> DocumentCategory.DOCUMENT
            "spreadsheet", "xlsx", "ods", "xls", "csv" -> DocumentCategory.SPREADSHEET
            "presentation", "pptx", "odp", "ppt" -> DocumentCategory.PRESENTATION
            "pdf" -> DocumentCategory.PDF
            else -> {
                // Fallback: check mime type
                when {
                    mimeType == null -> DocumentCategory.UNKNOWN
                    mimeType.contains("word") || mimeType.contains("document") -> DocumentCategory.DOCUMENT
                    mimeType.contains("spreadsheet") || mimeType.contains("excel") -> DocumentCategory.SPREADSHEET
                    mimeType.contains("presentation") || mimeType.contains("powerpoint") -> DocumentCategory.PRESENTATION
                    mimeType.contains("pdf") -> DocumentCategory.PDF
                    else -> DocumentCategory.UNKNOWN
                }
            }
        }
    }

    /**
     * Returns the editor app path to use for this document type.
     */
    fun getEditorAppPath(): String {
        return when (getDocumentCategory()) {
            DocumentCategory.DOCUMENT -> "documenteditor-react"
            DocumentCategory.SPREADSHEET -> "spreadsheeteditor-react"
            DocumentCategory.PRESENTATION -> "presentationeditor-react"
            DocumentCategory.PDF -> "documenteditor-react" // PDF viewer fallback
            DocumentCategory.UNKNOWN -> "documenteditor-react"
        }
    }
}

/**
 * Categories of documents for UI display.
 */
enum class DocumentCategory {
    DOCUMENT,
    SPREADSHEET,
    PRESENTATION,
    PDF,
    UNKNOWN
}

/**
 * API response wrapper for file listing.
 */
data class FileListResponse(
    @SerializedName("files")
    val files: List<Document>,

    @SerializedName("total")
    val total: Int? = null,

    @SerializedName("page")
    val page: Int? = null
)

/**
 * API response wrapper for single file operations.
 */
data class FileResponse(
    @SerializedName("file")
    val file: Document? = null,

    @SerializedName("content")
    val content: String? = null,

    @SerializedName("error")
    val error: String? = null
)

/**
 * Request body for saving a document.
 */
data class SaveDocumentRequest(
    @SerializedName("content")
    val content: String,

    @SerializedName("filename")
    val filename: String,

    @SerializedName("mime_type")
    val mimeType: String? = null
)

/**
 * API response for save operations.
 */
data class SaveDocumentResponse(
    @SerializedName("id")
    val id: String? = null,

    @SerializedName("success")
    val success: Boolean,

    @SerializedName("error")
    val error: String? = null
)

/**
 * Server connection test result.
 */
data class ServerInfo(
    @SerializedName("name")
    val name: String? = null,

    @SerializedName("version")
    val version: String? = null,

    @SerializedName("authenticated")
    val authenticated: Boolean = false,

    @SerializedName("message")
    val message: String? = null
)

/**
 * Simple wrapper for connection test response.
 */
data class ConnectionTestResult(
    val success: Boolean,
    val message: String,
    val serverInfo: ServerInfo? = null
)
