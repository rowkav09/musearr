import { decryptSecret } from '@musearr/core'
import {
  beginSyncRun,
  completeSyncRun,
  failSyncRun,
  getLibrarySyncSources,
  rebuildListeningRollups,
  updateSyncProgress,
  upsertLibraryTracks,
  type Database,
  type LibrarySyncJob,
  type SyncFailureClassification,
} from '@musearr/db'
import { PlexClient } from '@musearr/plex'

const PAGE_SIZE = 200

export async function syncPlexLibrary(
  database: Database,
  encryptionKey: string | undefined,
  librarySectionId: string,
  trigger: LibrarySyncJob['trigger'],
): Promise<{ importedTracks: number; skippedTracks: number }> {
  if (!encryptionKey) {
    throw new Error('MUSEARR_ENCRYPTION_KEY is required before Plex sync can run.')
  }

  const [source] = await getLibrarySyncSources(database, librarySectionId)
  if (!source) {
    throw new Error('The requested Plex music library is no longer selected.')
  }

  const runId = await beginSyncRun(database, source, trigger)
  const progress = { offset: 0, importedTracks: 0, skippedTracks: 0 }

  try {
    const client = new PlexClient(source.baseUrl, decryptSecret(source.tokenCiphertext, encryptionKey))
    while (true) {
      const page = await client.libraryTracks(source.plexSectionId, progress.offset, PAGE_SIZE)
      await upsertLibraryTracks(database, source, page.items)

      progress.importedTracks += page.items.length
      progress.skippedTracks += page.skipped
      progress.offset += page.scanned
      await updateSyncProgress(database, runId, progress)

      if (page.scanned === 0 || progress.offset >= page.total) {
        break
      }
    }

    await rebuildListeningRollups(database, source.ownerUserId, source.ownerTimezone)
    await completeSyncRun(database, runId, source.librarySectionId, progress)
    return {
      importedTracks: progress.importedTracks,
      skippedTracks: progress.skippedTracks,
    }
  } catch (error) {
    await failSyncRun(database, runId, sanitiseSyncFailure(error))
    throw error
  }
}

export type SanitisedSyncFailure = {
  classification: SyncFailureClassification
  summary: string
  retryable: boolean
}

/** Converts operational errors into a stable, secret-safe persisted failure. */
export function sanitiseSyncFailure(error: unknown): SanitisedSyncFailure {
  const message = error instanceof Error ? error.message.toLowerCase() : ''

  if (message.includes('encryption') || message.includes('configuration') || message.includes('required before')) {
    return { classification: 'configuration', summary: 'Sync configuration needs attention.', retryable: false }
  }
  if (message.includes('unauthor') || message.includes('forbidden') || message.includes('credential') || message.includes('token')) {
    return { classification: 'authentication', summary: 'Plex authentication was rejected.', retryable: false }
  }
  if (message.includes('timeout') || message.includes('network') || message.includes('connect') || message.includes('unavailable')) {
    return { classification: 'upstream_unavailable', summary: 'Plex is temporarily unavailable.', retryable: true }
  }
  if (message.includes('plex') || message.includes('response') || message.includes('parse')) {
    return { classification: 'upstream_response', summary: 'Plex returned an unexpected response.', retryable: true }
  }
  return { classification: 'unknown', summary: 'The sync did not complete.', retryable: true }
}
