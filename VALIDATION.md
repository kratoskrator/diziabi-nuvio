# Validation — 26 October 2026

## Version 1.0.1

83 automated tests pass. Three current live lookups succeeded in Nuvio's public TV JavaScript sandbox and unmodified native HTTP service. The existing website search, detail, episode and public player formats remain supported.

| Selected title | Exact requested content | Result | External subtitle links | Measured lookup and manifest check |
| --- | --- | --- | --- | --- |
| Shazam! (2019), TMDB 287947 | Movie | 720p HLS, H.264 + AAC | 2 | 1.88 seconds |
| Game of Thrones (2011), TMDB 1399 | S1E1 | 720p HLS, H.264 + AAC | 3 | 2.05 seconds |
| The Mentalist (2008), TMDB 5920 | S2E2 | 720p HLS, H.264 + AAC | 1 | 1.91 seconds |

These timings describe this test network, not a promised TV loading time. The unmodified 1.0.0 bundle also resolved the same current samples in approximately two seconds. The update fixes a demonstrated delay when an independent extra player stalls.

The test fixtures supplied only title/year metadata in place of the TMDB call. Website search, detail pages, season/episode pages, player configuration and HLS manifests used ordinary live HTTPS requests through the TV's native network service. No private TMDB credential was used. Master and complete VOD child playlists returned HTTP 200. Turkish/English audio groups and external subtitle links remain present; physical audio/subtitle selection was not tested.

The tested assets' names included 1080p, but their master playlists declared only 1280×720 video. The provider therefore reports 720p. This sample does not establish the maximum resolution of every title on the website.

## Delay fix and runtime checks

Independent player alternatives previously used `Promise.all`, requiring every player to finish before returning any usable source. Version 1.0.1 returns the first fully verified player and aborts unused alternatives. It still validates every advertised video variant of that selected master, checks complete VOD duration, preserves master audio groups and validates the exact requested episode.

A captured real response chain was supplemented with a synthetic second player that never responded. The original published 1.0.0 bundle exceeded the four-second test deadline despite resolving a valid player. Version 1.0.1 returned the validated 720p source in 400 milliseconds and emitted exactly one native cancellation. The cancellation check also passed at the current 64 MiB/default-stack policy. This isolates the delay regression from changing network conditions.

The official [NuvioTVSmart](https://github.com/NuvioMedia/NuvioTVSmart) worker, runtime, policy and native HTTP sources were fetched on 26 October 2026. All three live checks and full-chain replays passed with a deliberately stricter 32 MiB memory limit and 512 KiB stack. Twelve additional sandbox checks covered missing keys, invalid input, access restrictions, browser verification, the 1 MiB response limit, malformed data, one transient retry, wrong episodes, incomplete playlists and an unrelated movie-watch redirect. Including both cancellation policy checks, the final bundle passed 20 runtime checks.

The final runtime bundle is 44,109 bytes, SHA-256:

```
e7fc750da2e0e60cacc21a9720f90e8038034a662ed526267ec260ec3d649280
```

Only player configuration and manifests were read for current live verification. No video segments, complete videos or encryption keys were downloaded. Expiring stream tokens and raw live response captures are excluded from this repository and source archive.

## Limits

This verifies source resolution and manifest access in Nuvio's TV runtime. It does not verify physical Samsung decoding, the user's network, every title, every alternative video host or future website availability. Current supported public players use the Pilavyer configuration format. Other or protected players are skipped. Matching relies on exact titles and release years because the examined pages did not publish shared TMDB/IMDb identifiers. The provider does not solve browser challenges, bypass access restrictions or require a PC relay.
