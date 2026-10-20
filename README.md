# DiziAbi TV for Nuvio

A Nuvio JavaScript provider for movies, series and anime listed on [DiziAbi](https://www.diziabi.net/). It resolves public HLS streams directly through Nuvio's TV network service. A running PC or relay server is not required.

## Install

Add this repository manifest in Nuvio's plugin settings:

```
https://raw.githubusercontent.com/kratoskrator/diziabi-nuvio/main/manifest.json
```

Enable **DiziAbi TV**, search for a title in Nuvio's existing catalog, and open the movie or the exact episode. This provider adds playback sources; it does not add browsing catalog rows. Anime uses Nuvio's ordinary series season/episode numbering.

The provider uses Nuvio's supplied TMDB key to translate a selected title ID into its name and year. If that key is unavailable, enter your own TMDB API key or API Read Access Token in the provider's settings. DiziAbi itself does not need an account for the public sources supported here. The optional website setting accepts an HTTPS origin if the site changes address.

## Playback

- Matches both Turkish and original titles, the content type and the release year. Conflicting exact matches return no source.
- Confirms the requested season and episode against the website's episode metadata. It never substitutes a first, latest or nearby episode.
- Reads the player's published JSON configuration, checks that the returned URL is a real clear HLS playlist, and exposes external subtitles supplied by the player.
- Keeps HLS audio groups in the master playlist so supported players can select Turkish or original audio. Audio selection depends on the Nuvio player and TV firmware.
- Reports resolution from the playlist, rather than the video's filename. A file named 1080p can expose only a 720p stream.
- Gets fresh expiring stream URLs on every lookup. Resolved links should not be bookmarked.

Access restrictions or browser verification can still make a source unavailable. The provider does not solve browser challenges or bypass DRM. Website, player and CDN changes can require an update. Network validation in the TV JavaScript runtime cannot guarantee physical Samsung playback on every TV model.

## Development

No third-party build dependencies are required. With Node.js installed:

```
npm test
npm run build
```

`src/` contains the editable source, `test/` contains synthetic fixtures and regression tests, and `diziabi.js` is the generated Nuvio bundle. The runtime uses ES5-style JavaScript and Promises, without a browser DOM, Node.js APIs or execution of downloaded website scripts. Lookup work is bounded by a 50-second budget, response size limits, a small candidate limit, and one retry for transient GET failures. Requests use ordinary HTTPS with the website/player's request context and do not copy cookies.

`diziabi-nuvio-source.zip` contains the same editable source and tests for repositories published with only the install files at the root. Captured live responses, credentials and expiring media tokens are excluded.

This independent project is not affiliated with DiziAbi, Nuvio or TMDB. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
