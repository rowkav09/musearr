# Playlist generation from a seed track

This is an early foundation. It generates an ordered playlist from one seed
track, can optionally acquire tracks that are not in the library through Lidarr,
and can optionally publish the finished playlist back to Plex.

## Pipeline

```text
POST /api/v1/playlists/generate
  → playlist_generations row (status: generating)
  → playlist.generate job
      • load the seed + the library mirror
      • (optional) ask a similar-track provider for suggestions
      • deterministic planner → ordered items
          - tracks already in the library  → state in_library (publishable now)
          - suggestions not in the library → state pending  (gap items)
  → if gaps and acquireMissing:  status awaiting_acquisition → playlist.acquire job
  → else if publishToPlex:       status ready               → playlist.publish job
  → else:                        status ready
```

### Acquisition state machine (gap items)

```text
pending → requested → downloading → imported → matched → (publishable)
                                              unavailable (skipped; generation stays open)
```

`playlist.acquire` asks Lidarr to add/monitor the artist and album and triggers a
search. The scheduled `playlist.generate.reconcile` job (every 10 minutes) then
advances items as Lidarr reports track files, and calls
`matchGenerationItemsInLibrary` to attach a Plex rating key once a normal
`library.sync` has mirrored the imported track. There is no single job that spans
"download → appears in Plex"; reconciliation repairs the gap, exactly like the
existing Plex sync model.

### Publish

`playlist.publish` writes a **Musearr-managed** playlist (`playlists.kind =
'musearr'`, `managed_by_musearr = true`). It is additive: only items that carry a
Plex rating key and have not been published yet are sent, so a retry after a
partial failure resumes without re-adding tracks. A playlist the owner created is
never modified.

Known gaps in this foundation:

- If the process dies between Plex accepting `createAudioPlaylist` and Musearr
  recording the link, a retry re-discovers the playlist by title and re-adds the
  same rating keys; Plex allows duplicate playlist entries. Acceptable for now
  because the window is small and the effect is cosmetic.
- If some items end `unavailable`, the generation is marked
  `partially_published`. There is not yet a route to re-run the publish for those
  items once they are acquired later; that needs a follow-up.

## Lidarr connection

Musearr never bundles Lidarr. Point it at an instance you already run:

```text
POST /api/v1/settings/lidarr/test   { baseUrl, apiKey }         # owner only, does not save
POST /api/v1/settings/lidarr        { baseUrl, apiKey, ... }     # owner only, tests then saves
GET  /api/v1/settings/lidarr                                     # status, no secret
```

The API key is encrypted at rest with `MUSEARR_ENCRYPTION_KEY`, the same key used
for the Plex token. Root folder and quality/metadata profiles are taken from the
request, or the first values Lidarr reports if omitted.

## Determinism

The planner (`packages/intelligence/src/playlist.ts`) is pure and free of
randomness: the same seed, library snapshot, and options always produce the same
plan. Gap suggestions only enter the plan when `acquireMissing` is set and a
similar-track provider returns candidates; otherwise the plan is library-only.

The only similar-track provider shipped today is `LocalAiSimilarTrackProvider`
(`docs/LOCAL_AI.md`), which is off by default. So with a stock configuration the
acquisition path is inert even with `acquireMissing: true` and Lidarr connected:
the plan is library-only and there are no gaps to acquire. A deterministic,
non-AI suggestion source (e.g. a ListenBrainz/MusicBrainz adapter) feeding
`externalSuggestions` is the natural follow-up.
