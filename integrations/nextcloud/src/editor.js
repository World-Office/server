/**
 *
 * (c) Copyright Ascensio System SIA 2026
 *
 * This program is a free software product.
 * You can redistribute it and/or modify it under the terms of the GNU Affero General Public License
 * (AGPL) version 3 as published by the Free Software Foundation.
 * In accordance with Section 7(a) of the GNU AGPL its Section 15 shall be amended to the effect
 * that Ascensio System SIA expressly excludes the warranty of non-infringement of any third-party rights.
 *
 * This program is distributed WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * For details, see the GNU AGPL at: http://www.gnu.org/licenses/agpl-3.0.html
 *
 * The interactive user interfaces in modified source and object code versions of the Program
 * must display Appropriate Legal Notices, as required under Section 5 of the GNU AGPL version 3.
 *
 * All the Product's GUI elements, including illustrations and icon sets, as well as technical
 * writing content are licensed under the terms of the Creative Commons Attribution-ShareAlike 4.0 International.
 * See the License terms at http://creativecommons.org/licenses/by-sa/4.0/legalcode
 *
 */

/* global _, DocsAPI, jQuery, moment, oc_defaults */

/**
 * @param {object} $ JQueryStatic object
 * @param {object} OCA Nextcloud OCA object
 */
(function($, OCA) {

	OCA.WorldOffice = _.extend({
		AppName: 'worldoffice',
		inframe: false,
		inviewer: false,
		fileId: null,
		shareToken: null,
		insertImageType: null,
	}, OCA.WorldOffice)

	OCA.WorldOffice.InitEditor = function() {

		OCA.WorldOffice.fileId = $('#iframeEditor').data('id')
		OCA.WorldOffice.shareToken = $('#iframeEditor').data('sharetoken')
		OCA.WorldOffice.directToken = $('#iframeEditor').data('directtoken')
		OCA.WorldOffice.template = $('#iframeEditor').data('template')
		OCA.WorldOffice.inframe = !!$('#iframeEditor').data('inframe')
		OCA.WorldOffice.inviewer = !!$('#iframeEditor').data('inviewer')
		OCA.WorldOffice.filePath = $('#iframeEditor').data('path')
		OCA.WorldOffice.anchor = $('#iframeEditor').attr('data-anchor')

		OCA.WorldOffice.useWopi = !!$('#iframeEditor').data('usewopi')
		OCA.WorldOffice.wopiAccessToken = $('#iframeEditor').data('wopiaccesstoken')
		OCA.WorldOffice.wopiFileId = $('#iframeEditor').data('wopifileid')
		OCA.WorldOffice.wopiHostUrl = $('#iframeEditor').data('wopihosturl')
		OCA.WorldOffice.editorType = $('#iframeEditor').data('editortype')
		OCA.WorldOffice.embedded = !!$('#iframeEditor').data('embedded')
		OCA.WorldOffice.wopiUserId = $('#iframeEditor').data('userid')
		OCA.WorldOffice.wopiUserName = $('#iframeEditor').data('username')

		OCA.WorldOffice.currentWindow = window
		OCA.WorldOffice.currentUser = OC.getCurrentUser()

		if (OCA.WorldOffice.inframe) {
			OCA.WorldOffice.currentWindow = window.parent
			OCA.WorldOffice.currentUser = OCA.WorldOffice.currentWindow.OC.getCurrentUser()
		}

		if (!OCA.WorldOffice.fileId && !OCA.WorldOffice.shareToken && !OCA.WorldOffice.directToken) {
			OCA.WorldOffice.showMessage(t(OCA.WorldOffice.AppName, 'FileId is empty'), 'error', { timeout: -1 })
			return
		}

		if (OCA.WorldOffice.useWopi) {
			OCA.WorldOffice.initWopiEditor()
			return
		}

		const configUrl = OCA.WorldOffice.getConfigUrl()

		$.ajax({
			url: configUrl,
			success: function onSuccess(config) {
				if (config) {
					OCA.WorldOffice.device = config.type
					if (OCA.WorldOffice.device === 'mobile') {
						OCA.WorldOffice.resizeEvents()
					}

					if (config.redirectUrl) {
						location.href = config.redirectUrl
						return
					}

					if (config.error != null) {
						OCA.WorldOffice.showMessage(config.error, 'error', { timeout: -1 })
						return
					}

					if (!config.documentServerUrl) {
						OCA.WorldOffice.showMessage('WORLDOFFICE cannot be reached. Please contact admin', 'error', { timeout: -1 })
						return
					}

					const script = document.createElement('script')
					script.src = config.documentServerUrl + 'web-apps/apps/api/documents/api.js?shardKey=' + config.document.key
					script.setAttribute('nonce', btoa(OC.requestToken))
					script.onerror = function() {
						OCA.WorldOffice.showMessage(t(OCA.WorldOffice.AppName, 'word-office cannot be reached. Please contact admin'), 'error', { timeout: -1 })
					}
					script.onload = function() {
						if (typeof DocsAPI === 'undefined') {
							OCA.WorldOffice.showMessage(t(OCA.WorldOffice.AppName, 'word-office cannot be reached. Please contact admin'), 'error', { timeout: -1 })
							return
						}

						const docsVersion = DocsAPI.DocEditor.version().split('.')
						if ((docsVersion[0] < 6)
							|| (parseInt(docsVersion[0]) === 6 && parseInt(docsVersion[1]) === 0)) {
							OCA.WorldOffice.showMessage(t(OCA.WorldOffice.AppName, 'Not supported version'), 'error', { timeout: -1 })
							return
						}

						let docIsChanged = null
						let docIsChangedTimeout = null

						const setPageTitle = function(event) {
							clearTimeout(docIsChangedTimeout)

							if (docIsChanged !== event.data) {
								const titleChange = function() {
									OCA.WorldOffice.currentWindow.document.title = config.document.title + (event.data ? ' *' : '') + ' - ' + oc_defaults.title
									docIsChanged = event.data
								}

								if (event === false || event.data) {
									titleChange()
								} else {
									docIsChangedTimeout = setTimeout(titleChange, 500)
								}
							}
						}
						setPageTitle(false)

						OCA.WorldOffice.documentType = config.documentType

						config.events = {
							onDocumentStateChange: setPageTitle,
							onDocumentReady: OCA.WorldOffice.onDocumentReady,
							onMakeActionLink: OCA.WorldOffice.onMakeActionLink,
						}

						if (config.editorConfig.tenant) {
							config.events.onAppReady = function() {
								OCA.WorldOffice.docEditor.showMessage(t(OCA.WorldOffice.AppName, 'You are using public demo word-office server. Please do not store private sensitive data.'))
							}
						}

						if ((OCA.WorldOffice.inframe && !OCA.WorldOffice.shareToken)
							|| (OCA.WorldOffice.currentUser.uid)) {
							config.events.onRequestSaveAs = OCA.WorldOffice.onRequestSaveAs
							config.events.onRequestInsertImage = OCA.WorldOffice.onRequestInsertImage
							config.events.onRequestMailMergeRecipients = OCA.WorldOffice.onRequestMailMergeRecipients
							config.events.onRequestCompareFile = OCA.WorldOffice.onRequestSelectDocument // todo: remove (for editors 7.4)
							config.events.onRequestSelectDocument = OCA.WorldOffice.onRequestSelectDocument
							config.events.onRequestSendNotify = OCA.WorldOffice.onRequestSendNotify
							config.events.onRequestReferenceData = OCA.WorldOffice.onRequestReferenceData
							config.events.onRequestOpen = OCA.WorldOffice.onRequestOpen
							config.events.onRequestReferenceSource = OCA.WorldOffice.onRequestReferenceSource
							config.events.onMetaChange = OCA.WorldOffice.onMetaChange
							config.events.onRequestRefreshFile = OCA.WorldOffice.onRequestRefreshFile

							if (OCA.WorldOffice.currentUser.uid) {
								config.events.onRequestUsers = OCA.WorldOffice.onRequestUsers
							}

							if (!OCA.WorldOffice.filePath) {
								OCA.WorldOffice.filePath = config._file_path
							}

							if (!OCA.WorldOffice.template) {
								config.events.onRequestHistory = OCA.WorldOffice.onRequestHistory
								config.events.onRequestHistoryData = OCA.WorldOffice.onRequestHistoryData
								config.events.onRequestRestore = OCA.WorldOffice.onRequestRestore
								config.events.onRequestHistoryClose = OCA.WorldOffice.onRequestHistoryClose
							}
						}

						if (OCA.WorldOffice.directEditor || OCA.WorldOffice.inframe) {
							config.events.onRequestClose = OCA.WorldOffice.onRequestClose
						}

						if (OCA.WorldOffice.inframe
							&& config._files_sharing && !OCA.WorldOffice.shareToken
							&& window.parent.OCA.WorldOffice.context) {
							config.events.onRequestSharingSettings = OCA.WorldOffice.onRequestSharingSettings
						}

						OCA.WorldOffice.docEditor = new DocsAPI.DocEditor('iframeEditor', config)

						if (OCA.WorldOffice.directEditor) {
							OCA.WorldOffice.directEditor.loaded()
						}

						if (!OCA.WorldOffice.directEditor
							&& config.type === 'mobile' && $('#app > iframe').css('position') === 'fixed') {
							$('#app > iframe').css('height', 'calc(100% - 50px)')
						}

						const favicon = OC.filePath(OCA.WorldOffice.AppName, 'img', OCA.WorldOffice.documentType + '.ico')
						if (OCA.WorldOffice.inframe) {
							window.parent.postMessage({
								method: 'changeFavicon',
								param: favicon,
							},
							'*')
						} else {
							$('link[rel="icon"]').attr('href', favicon)
						}
					}
					document.head.appendChild(script)
				}
			},
		})
	}

	OCA.WorldOffice.onRequestHistory = function(version) {
		$.get(OC.generateUrl('apps/' + OCA.WorldOffice.AppName + '/ajax/history?fileId={fileId}',
			{
				fileId: OCA.WorldOffice.fileId || 0,
			}),
		function onSuccess(response) {
			OCA.WorldOffice.refreshHistory(response, version)
		})
	}

	OCA.WorldOffice.onRequestHistoryData = function(event) {
		const version = event.data

		$.get(OC.generateUrl('apps/' + OCA.WorldOffice.AppName + '/ajax/version?fileId={fileId}&version={version}',
			{
				fileId: OCA.WorldOffice.fileId || 0,
				version,
			}),
		function onSuccess(response) {
			if (response.error) {
				response = {
					error: response.error,
					version,
				}
			}
			OCA.WorldOffice.docEditor.setHistoryData(response)
		})
	}

	OCA.WorldOffice.onRequestRestore = function(event) {
		const version = event.data.version

		$.ajax({
			method: 'PUT',
			url: OC.generateUrl('apps/' + OCA.WorldOffice.AppName + '/ajax/restore'),
			data: {
				fileId: OCA.WorldOffice.fileId || 0,
				version,
			},
			success: function onSuccess(response) {
				OCA.WorldOffice.refreshHistory(response, response.at(-1).version)

				if (OCA.WorldOffice.inframe) {
					window.parent.postMessage({
						method: 'onRefreshVersionsDialog',
					},
					'*')
				}
			},
		})
	}

	OCA.WorldOffice.onRequestHistoryClose = function() {
		location.reload(true)
	}

	OCA.WorldOffice.onDocumentReady = function() {
		if (OCA.WorldOffice.inframe) {
			window.parent.postMessage({
				method: 'onDocumentReady',
				param: {},
			},
			'*')
		}

		OCA.WorldOffice.resize()
		OCA.WorldOffice.setViewport()
	}

	OCA.WorldOffice.onRequestSaveAs = function(event) {
		const saveData = {
			name: event.data.title,
			url: event.data.url,
		}

		if (OCA.WorldOffice.filePath) {
			const arrayPath = OCA.WorldOffice.filePath.split('/')
			arrayPath.pop()
			arrayPath.shift()
			saveData.dir = '/' + arrayPath.join('/')
		}

		if (OCA.WorldOffice.inframe) {
			window.parent.postMessage({
				method: 'editorRequestSaveAs',
				param: saveData,
			},
			'*')
		} else {
			OC.dialogs.filepicker(t(OCA.WorldOffice.AppName, 'Save as'),
				function(fileDir) {
					saveData.dir = fileDir
					OCA.WorldOffice.editorSaveAs(saveData)
				},
				false,
				'httpd/unix-directory',
				true,
				OC.dialogs.FILEPICKER_TYPE_CHOOSE,
				saveData.dir)
		}
	}

	OCA.WorldOffice.editorSaveAs = function(saveData) {
		$.post(OC.generateUrl('apps/' + OCA.WorldOffice.AppName + '/ajax/save'),
			saveData,
			function onSuccess(response) {
				if (response.error) {
					OCA.WorldOffice.showMessage(response.error, 'error')
					return
				}

				OCA.WorldOffice.showMessage(t(OCA.WorldOffice.AppName, 'File saved') + ' (' + response.name + ')')
			})
	}

	OCA.WorldOffice.onRequestInsertImage = function(event) {
		const imageMimes = [
			'image/bmp', 'image/x-bmp', 'image/x-bitmap', 'application/bmp',
			'image/gif', 'image/tiff',
			'image/jpeg', 'image/jpg', 'application/jpg', 'application/x-jpg',
			'image/png', 'image/x-png', 'application/png', 'application/x-png',
			'image/svg+xml',
		]

		if (event.data) {
			OCA.WorldOffice.insertImageType = event.data.c
		}

		if (OCA.WorldOffice.inframe) {
			window.parent.postMessage({
				method: 'editorRequestInsertImage',
				param: imageMimes,
			},
			'*')
		} else {
			OC.dialogs.filepicker(t(OCA.WorldOffice.AppName, 'Insert image'),
				OCA.WorldOffice.editorInsertImage,
				false,
				imageMimes,
				true)
		}
	}

	OCA.WorldOffice.editorInsertImage = function(filePath) {
		$.get(OC.generateUrl('apps/' + OCA.WorldOffice.AppName + '/ajax/url?filePath={filePath}',
			{
				filePath,
			}),
		function onSuccess(response) {
			if (response.error) {
				OCA.WorldOffice.showMessage(response.error, 'error')
				return
			}

			if (OCA.WorldOffice.insertImageType) {
				response.c = OCA.WorldOffice.insertImageType
			}

			OCA.WorldOffice.docEditor.insertImage(response)
		})
	}

	OCA.WorldOffice.onRequestMailMergeRecipients = function() {
		const recipientMimes = [
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		]

		if (OCA.WorldOffice.inframe) {
			window.parent.postMessage({
				method: 'editorRequestMailMergeRecipients',
				param: recipientMimes,
			},
			'*')
		} else {
			OC.dialogs.filepicker(t(OCA.WorldOffice.AppName, 'Select recipients'),
				OCA.WorldOffice.editorSetRecipient,
				false,
				recipientMimes,
				true)
		}
	}

	OCA.WorldOffice.editorSetRecipient = function(filePath) {
		$.get(OC.generateUrl('apps/' + OCA.WorldOffice.AppName + '/ajax/url?filePath={filePath}',
			{
				filePath,
			}),
		function onSuccess(response) {
			if (response.error) {
				OCA.WorldOffice.showMessage(response.error, 'error')
				return
			}

			OCA.WorldOffice.docEditor.setMailMergeRecipients(response)
		})
	}

	OCA.WorldOffice.editorReferenceSource = function(filePath) {
		if (filePath === OCA.WorldOffice.filePath) {
			OCA.WorldOffice.showMessage(t(OCA.WorldOffice.AppName, 'The data source must not be the current document'), 'error')
			return
		}

		$.post(OC.generateUrl('apps/' + OCA.WorldOffice.AppName + '/ajax/reference'),
			{
				path: filePath,
			},
			function onSuccess(response) {
				if (response.error) {
					OCA.WorldOffice.showMessage(response.error, 'error')
					return
				}
				OCA.WorldOffice.docEditor.setReferenceSource(response)
			})
	}

	OCA.WorldOffice.onRequestClose = OCA.WorldOffice.onRequestClose || function() {}

	var _origRequestClose = OCA.WorldOffice.onRequestClose

	OCA.WorldOffice.onRequestClose = function() {
		if (OCA.WorldOffice.useWopi) {
			OCA.WorldOffice.sendToWopiEditor({ type: 'save' })
			setTimeout(function() {
				if (OCA.WorldOffice.inframe) {
					window.parent.postMessage({ method: 'onClose', param: {} }, '*')
				} else {
					OCA.WorldOffice.currentWindow.close()
				}
			}, 1000)
			return
		}

		if (OCA.WorldOffice.directEditor) {
			OCA.WorldOffice.directEditor.close()
			return
		}

		OCA.WorldOffice.docEditor.destroyEditor()

		window.parent.postMessage({
			method: 'editorRequestClose',
		},
		'*')
	}

	OCA.WorldOffice.onRequestSharingSettings = function() {
		window.parent.postMessage({
			method: 'editorRequestSharingSettings',
		},
		'*')
	}

	OCA.WorldOffice.onRequestSelectDocument = function(event) {
		const revisedMimes = [
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		]

		if (OCA.WorldOffice.inframe) {
			window.parent.postMessage({
				method: 'editorRequestSelectDocument',
				param: revisedMimes,
				documentSelectionType: event.data.c,
			},
			'*')
		} else {
			let title
			switch (event.data.c) {
			case 'combine':
				title = t(OCA.WorldOffice.AppName, 'Select file to combine')
				break
			case 'compare':
				title = t(OCA.WorldOffice.AppName, 'Select file to compare')
				break
			case 'insert-text':
				title = t(OCA.WorldOffice.AppName, 'Select file to insert text')
				break
			default:
				title = t(OCA.WorldOffice.AppName, 'Select file')
			}
			OC.dialogs.filepicker(title,
				OCA.WorldOffice.editorSetRequested.bind({ documentSelectionType: event.data.c }),
				false,
				revisedMimes,
				true)
		}
	}

	OCA.WorldOffice.editorSetRequested = function(filePath) {
		const documentSelectionType = this.documentSelectionType
		$.get(OC.generateUrl('apps/' + OCA.WorldOffice.AppName + '/ajax/url?filePath={filePath}',
			{
				filePath,
			}),
		function onSuccess(response) {
			if (response.error) {
				OCP.Toast.error(response.error)
				return
			}
			response.c = documentSelectionType

			OCA.WorldOffice.docEditor.setRequestedDocument(response)
		})
	}

	OCA.WorldOffice.onMakeActionLink = function(event) {
		let url = location.href
		if (event && event.data) {
			const indexAnchor = url.indexOf('#')
			if (parseInt(indexAnchor) !== -1) {
				url = url.substring(0, indexAnchor)
			}

			let data = JSON.stringify(event.data)
			data = 'anchor=' + encodeURIComponent(data)

			const inframeRegex = /inframe=([^&]*&?)/g
			if (inframeRegex.test(url)) {
				url = url.replace(inframeRegex, data)
			}

			const anchorRegex = /anchor=([^&]*)/g
			if (anchorRegex.test(url)) {
				url = url.replace(anchorRegex, data)
			} else {
				url += (url.indexOf('?') === -1) ? '?' : '&'
				url += data
			}
		}

		OCA.WorldOffice.docEditor.setActionLink(url)
	}

	OCA.WorldOffice.onRequestUsers = function(event) {
		const operationType = typeof (event.data.c) !== 'undefined' ? event.data.c : null
		switch (operationType) {
		case 'info': {
			$.get(OC.generateUrl('apps/' + OCA.WorldOffice.AppName + '/ajax/userInfo?userIds={userIds}',
				{
					userIds: JSON.stringify(event.data.id),
				}),
			function onSuccess(response) {
				OCA.WorldOffice.docEditor.setUsers({
					c: operationType,
					users: response,
				})
			})
			break
		}
		default: {
			let requestString = 'apps/' + OCA.WorldOffice.AppName + '/ajax/users?fileId={fileId}&operationType=' + operationType
			if (typeof (event.data.search) !== 'undefined') {
				requestString += '&from=' + event.data.from + '&count=' + event.data.count + '&search=' + encodeURIComponent(event.data.search)
			}
			$.get(OC.generateUrl(requestString,
				{
					fileId: OCA.WorldOffice.fileId || 0,
				}),
			function onSuccess(response) {
				OCA.WorldOffice.docEditor.setUsers({
					c: operationType,
					users: response,
					// support v9.0
					total: 1 + (!event.data.count || response.length < event.data.count ? 0 : (event.data.from + event.data.count)),
					// since v9.0.1
					isPaginated: true,
				})
			})
		}
		}
	}

	OCA.WorldOffice.onRequestSendNotify = function(event) {
		const actionLink = event.data.actionLink
		const comment = event.data.message
		const emails = event.data.emails

		const fileId = OCA.WorldOffice.fileId

		$.post(OC.generateUrl('apps/' + OCA.WorldOffice.AppName + '/ajax/mention'),
			{
				fileId,
				anchor: JSON.stringify(actionLink),
				comment,
				emails,
			},
			function onSuccess(response) {
				if (response.error) {
					OCA.WorldOffice.showMessage(response.error, 'error')
					return
				}

				OCA.WorldOffice.showMessage(response.message)
			})
	}

	OCA.WorldOffice.onRequestReferenceData = function(event) {
		const link = event.data.link
		const referenceData = event.data.referenceData
		const path = event.data.path

		$.post(OC.generateUrl('apps/' + OCA.WorldOffice.AppName + '/ajax/reference'),
			{
				referenceData,
				path,
				link,
			},
			function onSuccess(response) {
				if (response.error) {
					OCA.WorldOffice.showMessage(response.error, 'error')
					return
				}

				OCA.WorldOffice.docEditor.setReferenceData(response)
			})
	}

	OCA.WorldOffice.onRequestOpen = function(event) {
		const filePath = event.data.path
		const fileId = event.data.referenceData.fileKey
		const windowName = event.data.windowName
		const sourceUrl = OC.generateUrl(`apps/${OCA.WorldOffice.AppName}/${fileId}?filePath=${OC.encodePath(filePath)}`)
		window.open(sourceUrl, windowName)
	}

	OCA.WorldOffice.onRequestReferenceSource = function(event) {
		const referenceSourceMimes = [
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		]
		if (OCA.WorldOffice.inframe) {
			window.parent.postMessage({
				method: 'editorRequestReferenceSource',
				param: referenceSourceMimes,
			},
			'*')
		} else {
			OC.dialogs.filepicker(t(OCA.WorldOffice.AppName, 'Select data source'),
				OCA.WorldOffice.editorReferenceSource,
				false,
				referenceSourceMimes,
				true)
		}
	}

	OCA.WorldOffice.onMetaChange = function(event) {
		if (event.data.favorite !== undefined) {
			$.ajax({
				url: OC.generateUrl('apps/files/api/v1/files' + OC.encodePath(OCA.WorldOffice.filePath)),
				type: 'post',
				data: JSON.stringify({
					tags: event.data.favorite ? [OC.TAG_FAVORITE] : [],
				}),
				contentType: 'application/json',
				dataType: 'json',
				success() {
					OCA.WorldOffice.docEditor.setFavorite(event.data.favorite)
				},
			})
		}
	}

	OCA.WorldOffice.onRequestRefreshFile = function() {
		const configUrl = OCA.WorldOffice.getConfigUrl()
		$.ajax({
			url: configUrl,
			success: function onSuccess(config) {
				OCA.WorldOffice.docEditor.refreshFile(config)
			},
		})
	}

	OCA.WorldOffice.showMessage = function(message, type = 'success', props = null) {
		if (OCA.WorldOffice.directEditor) {
			OCA.WorldOffice.directEditor.loaded()
		}

		if (OCA.WorldOffice.inframe) {
			window.parent.postMessage({
				method: 'onShowMessage',
				param: {
					message,
					type,
					props,
				},
			},
			'*')
			return
		}

		switch (type) {
		case 'success':
			OCP.Toast.success(message, props)
			break
		case 'error':
			OCP.Toast.error(message, props)
			break
		}
	}

	OCA.WorldOffice.refreshHistory = function(response, version) {
		let data = {}
		if (response.error) {
			data = { error: response.error }
		} else {
			let currentVersion = 0
			$.each(response, function(i, fileVersion) {
				if (fileVersion.version >= currentVersion) {
					currentVersion = fileVersion.version
				}

				fileVersion.created = moment(fileVersion.created * 1000).format('L LTS')
				if (fileVersion.changes) {
					$.each(fileVersion.changes, function(j, change) {
						change.created = moment(change.created + '+00:00').format('L LTS')
					})
				}
			})

			if (version) {
				currentVersion = Math.min(currentVersion, version)
			}

			data = {
				currentVersion,
				history: response,
			}
		}
		OCA.WorldOffice.docEditor.refreshHistory(data)
	}

	OCA.WorldOffice.resize = function() {
		if (OCA.WorldOffice.device !== 'mobile') {
			return
		}

		const headerHeight = $('#header').length > 0 ? $('#header').height() : 50
		const wrapEl = $('#app>iframe')
		if (wrapEl.length > 0) {
			wrapEl[0].style.height = (screen.availHeight - headerHeight) + 'px'
			window.scrollTo(0, -1)
			wrapEl[0].style.height = (window.top.innerHeight - headerHeight) + 'px'
		}
	}

	OCA.WorldOffice.resizeEvents = function() {
		if (window.addEventListener) {
			if (/Android/i.test(navigator.userAgent)) {
				window.addEventListener('resize', OCA.WorldOffice.resize)
			}
			if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
				window.addEventListener('orientationchange', OCA.WorldOffice.resize)
			}
		}
	}

	OCA.WorldOffice.setViewport = function() {
		document.querySelector('meta[name="viewport"]').setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0')
	}

	OCA.WorldOffice.getConfigUrl = function() {
		const guestName = localStorage.getItem('nick')
		let configUrl = OC.linkToOCS('apps/' + OCA.WorldOffice.AppName + '/api/v1/config', 2) + (OCA.WorldOffice.fileId || 0)

		const params = []
		if (OCA.WorldOffice.filePath) {
			params.push('filePath=' + encodeURIComponent(OCA.WorldOffice.filePath))
		}
		if (OCA.WorldOffice.shareToken) {
			params.push('shareToken=' + encodeURIComponent(OCA.WorldOffice.shareToken))
		}
		if (OCA.WorldOffice.directToken) {
			$('html').addClass('world-office-full-page')
			params.push('directToken=' + encodeURIComponent(OCA.WorldOffice.directToken))
		}
		if (OCA.WorldOffice.template) {
			params.push('template=true')
		}
		if (guestName && guestName !== 'null') {
			params.push('guestName=' + encodeURIComponent(guestName))
		}
		if (OCA.WorldOffice.anchor) {
			params.push('anchor=' + encodeURIComponent(OCA.WorldOffice.anchor))
		}

		if (OCA.WorldOffice.inframe || OCA.WorldOffice.directToken) {
			params.push('inframe=true')
		}

		if (OCA.WorldOffice.inviewer) {
			params.push('inviewer=true')
		}

		if (OCA.WorldOffice.Desktop) {
			params.push('desktop=true')
		}
		if (params.length) {
			configUrl += '?' + params.join('&')
		}

		return configUrl
	}

	OCA.WorldOffice.initWopiEditor = function() {
		var container = document.getElementById('iframeEditor')
		container.innerHTML = ''

		var editorUrl = OCA.WorldOffice.wopiHostUrl
			+ '/editors/' + OCA.WorldOffice.editorType + '/'
			+ '?access_token=' + encodeURIComponent(OCA.WorldOffice.wopiAccessToken)
			+ '&file_id=' + encodeURIComponent(OCA.WorldOffice.wopiFileId)
			+ '&embedded=true'
			+ '&docserverBase=' + encodeURIComponent(OCA.WorldOffice.wopiHostUrl)

		var iframe = document.createElement('iframe')
		iframe.id = 'wopiEditorFrame'
		iframe.src = editorUrl
		iframe.style.width = '100%'
		iframe.style.height = '100%'
		iframe.style.border = 'none'
		iframe.setAttribute('allowfullscreen', '')
		container.appendChild(iframe)

		OCA.WorldOffice.wopiIframe = iframe

		window.addEventListener('message', function(event) {
			var data = event.data
			if (!data || data.source !== 'worldoffice-editor') return

			switch (data.type) {
			case 'app_ready':
				break

			case 'document_ready':
				OCA.WorldOffice.onWopiDocumentReady()
				break

			case 'document_modified':
				OCA.WorldOffice.onWopiDocumentModified()
				break

			case 'document_saved':
				OCA.WorldOffice.onWopiDocumentSaved(data.version)
				break

			case 'error':
				OCA.WorldOffice.showMessage(data.message, 'error', { timeout: -1 })
				break

			case 'request_close':
				OCA.WorldOffice.onRequestClose()
				break
			}
		})

		OCA.WorldOffice.sendToWopiEditor = function(command) {
			if (OCA.WorldOffice.wopiIframe && OCA.WorldOffice.wopiIframe.contentWindow) {
				OCA.WorldOffice.wopiIframe.contentWindow.postMessage({
					source: 'worldoffice-nextcloud',
					...command,
				}, '*')
			}
		}

		if (OCA.WorldOffice.inframe) {
			window.parent.postMessage({
				method: 'onDocumentReady',
				param: {},
			}, '*')
		}
	}

	OCA.WorldOffice.onWopiDocumentReady = function() {
		var favicon = OC.filePath(OCA.WorldOffice.AppName, 'img', OCA.WorldOffice.editorType + '.ico')
		if (OCA.WorldOffice.inframe) {
			window.parent.postMessage({
				method: 'changeFavicon',
				param: favicon,
			}, '*')
		} else {
			$('link[rel="icon"]').attr('href', favicon)
		}

		OCA.WorldOffice.currentWindow.document.title = OCA.WorldOffice.filePath
			? OCA.WorldOffice.filePath.split('/').pop() + ' - ' + oc_defaults.title
			: oc_defaults.title
	}

	OCA.WorldOffice.onWopiDocumentModified = function() {
		var title = OCA.WorldOffice.currentWindow.document.title
		if (title.indexOf(' *') === -1) {
			OCA.WorldOffice.currentWindow.document.title = title.replace(' - ', ' * - ')
		}

		if (OCA.WorldOffice.inframe) {
			window.parent.postMessage({
				method: 'onDocumentStateChange',
				param: true,
			}, '*')
		}
	}

	OCA.WorldOffice.onWopiDocumentSaved = function(version) {
		var title = OCA.WorldOffice.currentWindow.document.title
		OCA.WorldOffice.currentWindow.document.title = title.replace(' * ', ' ').replace(' *-', ' -')

		if (OCA.WorldOffice.inframe) {
			window.parent.postMessage({
				method: 'onDocumentStateChange',
				param: false,
			}, '*')
		}
	}

	OCA.WorldOffice.InitEditor()

})(jQuery, OCA)
