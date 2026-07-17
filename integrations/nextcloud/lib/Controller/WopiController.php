<?php
/**
 *
 * (c) Copyright World Office Contributors 2026
 *
 * This program is a free software product.
 * You can redistribute it and/or modify it under the terms of the GNU Affero General Public License
 * (AGPL) version 3 as published by the Free Software Foundation.
 *
 * This program is distributed WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * For details, see the GNU AGPL at: http://www.gnu.org/licenses/agpl-3.0.html
 *
 * The interactive user interfaces in modified source and object code versions of the Program
 * must display Appropriate Legal Notices, as required under Section 5 of the GNU AGPL version 3.
 *
 */

declare(strict_types=1);

namespace OCA\WorldOffice\Controller;

use OCA\WorldOffice\AppConfig;
use OCA\WorldOffice\Crypt;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\StreamResponse;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\Files\NotPermittedException;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * WOPI host controller — serves files via the WOPI protocol.
 *
 * Enables World-Office React editors to load/save documents
 * from Nextcloud storage through the standard WOPI interface.
 */
class WopiController extends Controller {

	/**
	 * In-memory lock store keyed by file ID.
	 * Token values are the X-WOPI-Lock strings sent by clients.
	 *
	 * @var array<int, string>
	 */
	private static array $locks = [];

	public function __construct(
		string $appName,
		IRequest $request,
		private readonly IRootFolder $rootFolder,
		private readonly IUserSession $userSession,
		private readonly AppConfig $appConfig,
		private readonly Crypt $crypt,
		private readonly IL10N $l10n,
		private readonly ?string $userId = null
	) {
		parent::__construct($appName, $request);
	}

	// ---- helpers ----------------------------------------------------------

	/**
	 * Validate a WOPI access token.
	 *
	 * Decodes the JWT, checks file ID and action match.
	 *
	 * @param string $token          Raw JWT from the request
	 * @param int    $fileId         Expected file ID
	 * @param string $expectedAction Expected action (view|edit)
	 *
	 * @return array{0: object|null, 1: string|null}
	 *               [payload, null] on success
	 *               [null, error]   on failure
	 */
	private function validateToken(string $token, int $fileId, string $expectedAction): array {
		if ($token === '') {
			return [null, $this->l10n->t('Access token is missing')];
		}

		[$payload, $error] = $this->crypt->readHash($token);
		if ($error !== null) {
			return [null, $this->l10n->t('Invalid access token') . ': ' . $error];
		}

		if ((int)$payload->fileId !== $fileId) {
			return [null, $this->l10n->t('Access token file ID mismatch')];
		}

		if ($payload->action !== $expectedAction) {
			return [null, $this->l10n->t('Access token action mismatch')];
		}

		return [$payload, null];
	}

	/**
	 * Resolve a File node by ID inside the given user's home folder.
	 *
	 * @param string $userId
	 * @param int    $fileId
	 *
	 * @return array{0: File|null, 1: string|null}
	 *               [File, null] on success
	 *               [null, error] on failure
	 */
	private function resolveFile(string $userId, int $fileId): array {
		try {
			$userFolder = $this->rootFolder->getUserFolder($userId);
			$files = $userFolder->getById($fileId);
		} catch (\Exception $e) {
			return [null, $this->l10n->t('File not found')];
		}

		if (empty($files)) {
			return [null, $this->l10n->t('File not found')];
		}

		$node = $files[0];

		if (!$node instanceof File) {
			return [null, $this->l10n->t('Not a file')];
		}

		if (!$node->isReadable()) {
			return [null, $this->l10n->t('You do not have enough permissions to view the file')];
		}

		return [$node, null];
	}

	/**
	 * Add standard WOPI headers to a response.
	 *
	 * @param \OCP\AppFramework\Http\Response $response
	 */
	private function addWopiHeaders(\OCP\AppFramework\Http\Response $response): void {
		$response->addHeader('X-WOPI-ServerVersion', '1.0');
	}

	// ---- WOPI: CheckFileInfo ---------------------------------------------

	/**
	 * Return file metadata for the WOPI CheckFileInfo request.
	 *
	 * @param int $fileId
	 *
	 * @return DataResponse
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	#[PublicPage]
	public function checkFileInfo(int $fileId): DataResponse {
		$token = $_GET['access_token'] ?? '';
		[$payload, $error] = $this->validateToken($token, $fileId, 'view');
		if ($error !== null) {
			$response = new DataResponse(['error' => $error], 401);
			$this->addWopiHeaders($response);
			return $response;
		}

		$userId = $payload->userId ?? $this->userId ?? '';
		if ($userId === '') {
			$response = new DataResponse(['error' => $this->l10n->t('User not found')], 401);
			$this->addWopiHeaders($response);
			return $response;
		}

		[$file, $fileError] = $this->resolveFile($userId, $fileId);
		if ($fileError !== null) {
			$response = new DataResponse(['error' => $fileError], 404);
			$this->addWopiHeaders($response);
			return $response;
		}

		$owner = $file->getOwner();
		$ownerId = $owner !== null ? $owner->getUID() : $userId;

		$userName = $payload->userName ?? '';
		if ($userName === '' && $owner !== null) {
			$userName = $owner->getDisplayName();
		}

		$userCanWrite = $file->isUpdateable();

		$result = [
			'BaseFileName'     => $file->getName(),
			'Size'             => $file->getSize(),
			'Version'          => $file->getEtag(),
			'UserId'           => $userId,
			'UserName'         => $userName,
			'UserCanWrite'     => $userCanWrite,
			'SupportsUpdate'   => true,
			'SupportsLocks'    => true,
			'UserFriendlyName' => $userName,
			'OwnerId'          => $ownerId,
		];

		$response = new DataResponse($result);
		$this->addWopiHeaders($response);
		return $response;
	}

	/**
	 * GetFileInfo — alias for checkFileInfo.
	 *
	 * @param int $fileId
	 *
	 * @return DataResponse
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	#[PublicPage]
	public function getFileInfo(int $fileId): DataResponse {
		return $this->checkFileInfo($fileId);
	}

	// ---- WOPI: GetFileContent --------------------------------------------

	/**
	 * Stream raw file bytes for the WOPI GetFileContent request.
	 *
	 * @param int $fileId
	 *
	 * @return StreamResponse|DataResponse
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	#[PublicPage]
	public function getContents(int $fileId): StreamResponse|DataResponse {
		$token = $_GET['access_token'] ?? '';
		[$payload, $error] = $this->validateToken($token, $fileId, 'view');
		if ($error !== null) {
			$response = new DataResponse(['error' => $error], 401);
			$this->addWopiHeaders($response);
			return $response;
		}

		$userId = $payload->userId ?? $this->userId ?? '';
		if ($userId === '') {
			$response = new DataResponse(['error' => $this->l10n->t('User not found')], 401);
			$this->addWopiHeaders($response);
			return $response;
		}

		[$file, $fileError] = $this->resolveFile($userId, $fileId);
		if ($fileError !== null) {
			$response = new DataResponse(['error' => $fileError], 404);
			$this->addWopiHeaders($response);
			return $response;
		}

		try {
			$handle = $file->fopen('rb');
			if ($handle === false || $handle === null) {
				$response = new DataResponse(['error' => $this->l10n->t('Failed to read file')], 500);
				$this->addWopiHeaders($response);
				return $response;
			}
		} catch (\Exception $e) {
			$response = new DataResponse(['error' => $this->l10n->t('Failed to read file')], 500);
			$this->addWopiHeaders($response);
			return $response;
		}

		$response = new StreamResponse($handle);
		$response->addHeader('Content-Type', 'application/octet-stream');
		$this->addWopiHeaders($response);
		return $response;
	}

	// ---- WOPI: PutFileContent --------------------------------------------

	/**
	 * Accept raw file bytes from the WOPI PutFileContent request.
	 *
	 * @param int $fileId
	 *
	 * @return DataResponse
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	#[PublicPage]
	public function putContents(int $fileId): DataResponse {
		$token = $_GET['access_token'] ?? '';
		[$payload, $error] = $this->validateToken($token, $fileId, 'edit');
		if ($error !== null) {
			$response = new DataResponse(['error' => $error], 401);
			$this->addWopiHeaders($response);
			return $response;
		}

		$userId = $payload->userId ?? $this->userId ?? '';
		if ($userId === '') {
			$response = new DataResponse(['error' => $this->l10n->t('User not found')], 401);
			$this->addWopiHeaders($response);
			return $response;
		}

		[$file, $fileError] = $this->resolveFile($userId, $fileId);
		if ($fileError !== null) {
			$response = new DataResponse(['error' => $fileError], 404);
			$this->addWopiHeaders($response);
			return $response;
		}

		if (!$file->isUpdateable()) {
			$response = new DataResponse(['error' => $this->l10n->t('You do not have enough permissions to save the file')], 403);
			$this->addWopiHeaders($response);
			return $response;
		}

		$body = file_get_contents('php://input');
		if ($body === false) {
			$response = new DataResponse(['error' => $this->l10n->t('Failed to read request body')], 500);
			$this->addWopiHeaders($response);
			return $response;
		}

		try {
			$file->putContent($body);
		} catch (NotPermittedException $e) {
			$response = new DataResponse(['error' => $this->l10n->t('Cannot save file')], 500);
			$this->addWopiHeaders($response);
			return $response;
		}

		$response = new DataResponse(null, Http::STATUS_OK);
		$response->addHeader('X-WOPI-ItemVersion', $file->getEtag());
		$this->addWopiHeaders($response);
		return $response;
	}

	// ---- WOPI: Lock / Unlock / RefreshLock -------------------------------

	/**
	 * Acquire a WOPI lock on the file.
	 *
	 * @param int $fileId
	 *
	 * @return DataResponse
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	#[PublicPage]
	public function lockFile(int $fileId): DataResponse {
		$token = $_GET['access_token'] ?? '';
		[$payload, $error] = $this->validateToken($token, $fileId, 'edit');
		if ($error !== null) {
			$response = new DataResponse(['error' => $error], 401);
			$this->addWopiHeaders($response);
			return $response;
		}

		$lockToken = $this->request->getHeader('X-WOPI-Lock');
		if ($lockToken === '') {
			// Generate a token if the client did not send one
			$lockToken = (string)$fileId . '_' . time();
		}

		$currentLock = self::$locks[$fileId] ?? null;

		if ($currentLock !== null && $lockToken !== $currentLock) {
			// Lock conflict — report the current lock holder
			$response = new DataResponse(['error' => 'File is locked by another session'], 409);
			$response->addHeader('X-WOPI-Lock', $currentLock);
			$this->addWopiHeaders($response);
			return $response;
		}

		self::$locks[$fileId] = $lockToken;

		$response = new DataResponse(null, Http::STATUS_OK);
		$response->addHeader('X-WOPI-Lock', $lockToken);
		$this->addWopiHeaders($response);
		return $response;
	}

	/**
	 * Release a WOPI lock.
	 *
	 * @param int $fileId
	 *
	 * @return DataResponse
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	#[PublicPage]
	public function unlockFile(int $fileId): DataResponse {
		$token = $_GET['access_token'] ?? '';
		[$payload, $error] = $this->validateToken($token, $fileId, 'edit');
		if ($error !== null) {
			$response = new DataResponse(['error' => $error], 401);
			$this->addWopiHeaders($response);
			return $response;
		}

		$lockToken = $this->request->getHeader('X-WOPI-Lock');
		$currentLock = self::$locks[$fileId] ?? null;

		if ($currentLock !== null && $lockToken !== $currentLock) {
			$response = new DataResponse(['error' => 'Lock mismatch'], 409);
			$response->addHeader('X-WOPI-Lock', $currentLock ?? '');
			$this->addWopiHeaders($response);
			return $response;
		}

		unset(self::$locks[$fileId]);

		$response = new DataResponse(null, Http::STATUS_OK);
		$response->addHeader('X-WOPI-Lock', $lockToken);
		$this->addWopiHeaders($response);
		return $response;
	}

	/**
	 * Refresh an existing WOPI lock.
	 *
	 * @param int $fileId
	 *
	 * @return DataResponse
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	#[PublicPage]
	public function refreshLock(int $fileId): DataResponse {
		$token = $_GET['access_token'] ?? '';
		[$payload, $error] = $this->validateToken($token, $fileId, 'edit');
		if ($error !== null) {
			$response = new DataResponse(['error' => $error], 401);
			$this->addWopiHeaders($response);
			return $response;
		}

		$lockToken = $this->request->getHeader('X-WOPI-Lock');
		$currentLock = self::$locks[$fileId] ?? null;

		if ($currentLock !== null && $lockToken !== $currentLock) {
			$response = new DataResponse(['error' => 'Lock mismatch'], 409);
			$response->addHeader('X-WOPI-Lock', $currentLock ?? '');
			$this->addWopiHeaders($response);
			return $response;
		}

		// Re-store the token (refreshes the "lease" for the lock holder)
		self::$locks[$fileId] = $lockToken;

		$response = new DataResponse(null, Http::STATUS_OK);
		$response->addHeader('X-WOPI-Lock', $lockToken);
		$this->addWopiHeaders($response);
		return $response;
	}
}
