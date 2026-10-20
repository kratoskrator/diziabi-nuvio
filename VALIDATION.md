# Validation — 20 October 2026

## Result

78 automated tests pass. Live extraction succeeded for a movie, a first-season episode and a later-season episode through Nuvio's public TV JavaScript sandbox and native HTTP service. No PC relay is part of the provider.

| Selected title | Exact requested content | Result | External subtitles |
| --- | --- | --- | --- |
| Shazam! (2019), TMDB 287947 | Movie | 720p HLS, H.264 + AAC, Turkish/English audio | 2 |
| Game of Thrones (2011), TMDB 1399 | S1E1 | 720p HLS, H.264 + AAC, Turkish/English audio | 3 |
| The Mentalist (2008), TMDB 5920 | S2E2 | 720p HLS, H.264 + AAC, Turkish/English audio | 1 |

The test fixtures supplied only title/year metadata in place of the TMDB call; website search, detail pages, season/episode pages, player configuration and HLS manifests used ordinary live HTTPS requests through the TV's native network service. No private TMDB credential was used. Master and complete VOD child playlists returned HTTP 200. The public player configuration and manifests exposed Turkish/English audio groups; physical TV audio selection was not tested. A separate Turkish subtitle check returned valid WEBVTT.

The tested assets' names included 1080p, but their master playlists declared only 1280×720 video. The provider therefore reports 720p. This sample does not establish the maximum resolution of every title on the website.

## Runtime checks

The official [NuvioTVSmart](https://github.com/NuvioMedia/NuvioTVSmart) worker, runtime, policy and native HTTP sources were fetched on 20 October 2026. The worker/runtime/policy matched the previously checked 17 October versions. The HTTP service added an unrelated poster configuration route; its fetch behavior was unchanged.

All three live cases passed in QuickJS with a deliberately stricter 32 MiB memory limit and 512 KiB stack. The final bundle passed all three captured full-chain replays at those limits, plus one replay at the current 64 MiB/default-stack configuration. Twelve additional sandbox checks covered missing keys, invalid input, access restrictions, browser verification, the 1 MiB response limit, malformed data, one transient retry, wrong episodes, incomplete playlists and an unrelated movie-watch redirect. These total 19 runtime checks, including the live checks and replays.

The final runtime bundle is 42,697 bytes, SHA-256:

```
d2c3ef3f3ec58131f19f15ac812ce62ba93a042c0e418eae579f746565b8a3d9
```

Only player configuration, manifests and one subtitle text file were read for research. No video segments, complete videos or encryption keys were downloaded. Expiring stream tokens and raw live response captures are excluded from this repository and source archive.

## Limits

This verifies source resolution and manifest access in Nuvio's TV runtime. It does not verify physical Samsung decoding, the user's network, every title, every alternative video host or future website availability. Current supported public players use the Pilavyer configuration format. Other or protected players are skipped. Matching relies on exact titles and release years because the examined pages did not publish shared TMDB/IMDb identifiers.
