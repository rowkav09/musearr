import { z } from 'zod'

/**
 * MusicBrainz + ListenBrainz is the deterministic similar-track source for
 * playlist generation. It is off by default; when enabled, the seed artist and
 * title are sent to MetaBrainz (or a configured mirror) to find neighbours.
 */
export const MusicBrainzStatusSchema = z.object({
  enabled: z.boolean(),
  contactConfigured: z.boolean(),
  musicBrainzBaseUrl: z.string().nullable(),
  listenBrainzBaseUrl: z.string().nullable(),
})

export type MusicBrainzStatus = z.infer<typeof MusicBrainzStatusSchema>
