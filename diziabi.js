/* DiziAbi TV for Nuvio v1.0.1
MIT License

Copyright (c) 2026 Russian Cinema Nuvio provider contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.




*/
(function () {
var modules = {
"utils": function(module, exports, require) {
'use strict';

function entities(value) {
  return String(value || '').replace(/&#(x[\da-f]+|\d+);|&(amp|quot|apos|lt|gt|nbsp);/gi, function (all, number, named) {
    if (number) return String.fromCharCode(number.charAt(0).toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : parseInt(number, 10));
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[named.toLowerCase()];
  });
}

function text(value) {
  return entities(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function attr(tag, name) {
  var re = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^\"]*)"|\x27([^\x27]*)\x27|([^\\s>]+))', 'i');
  var match = re.exec(tag || '');
  return match ? entities(match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[3]) : '';
}

function origin(url) {
  var match = /^(https?:\/\/[^/?#]+)/i.exec(url || '');
  return match ? match[1] : '';
}

function absolute(value, base) {
  value = entities(value).trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/\//.test(value)) return (String(base).split(':')[0] || 'https') + ':' + value;
  if (!value || /^[\w+.-]+:/.test(value)) return '';
  var root = origin(base);
  if (!root) return '';
  var path = String(base).slice(root.length).split(/[?#]/)[0] || '/';
  if (value.charAt(0) === '?') return root + path + value;
  if (value.charAt(0) === '#') return '';
  path = value.charAt(0) === '/' ? value : path.slice(0, path.lastIndexOf('/') + 1) + value;
  var suffix = /[?#].*$/.exec(path);
  var parts = path.split(/[?#]/)[0].split('/');
  var clean = [];
  parts.forEach(function (part) {
    if (part === '..') clean.pop();
    else if (part && part !== '.') clean.push(part);
  });
  return root + '/' + clean.join('/') + (clean.length && /\/$/.test(path.split(/[?#]/)[0]) ? '/' : '') + (suffix ? suffix[0] : '');
}

function siteUrl(value) {
  return /^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(String(value || '')) ? String(value).replace(/\/+$/, '') : '';
}

function sameSite(url, base) {
  return origin(url).toLowerCase() === origin(base).toLowerCase();
}

function normalize(value) {
  return text(value).toLowerCase().replace(/ё/g, 'е').replace(/[^a-z0-9а-я]+/g, ' ').trim();
}

function form(values) {
  return Object.keys(values).map(function (name) { return encodeURIComponent(name) + '=' + encodeURIComponent(String(values[name])); }).join('&');
}

function classText(html, className) {
  var re = /<([a-z][\w:-]*)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  var match;
  // Search only opening tags carrying this class, so outer containers do not swallow descendants.
  var opening = new RegExp('<([a-z][\\w:-]*)\\b([^>]*\\bclass\\s*=\\s*(?:"[^"]*\\b' + className + '\\b[^"]*"|\x27[^\x27]*\\b' + className + '\\b[^\x27]*\x27)[^>]*)>', 'gi');
  match = opening.exec(html);
  if (!match) return '';
  re = new RegExp('^([\\s\\S]*?)<\\/' + match[1] + '\\s*>', 'i');
  var body = re.exec(html.slice(opening.lastIndex));
  return body ? text(body[1]) : '';
}

module.exports = { entities: entities, text: text, attr: attr, origin: origin, absolute: absolute, siteUrl: siteUrl, sameSite: sameSite, normalize: normalize, classText: classText, form: form };

},
"http": function(module, exports, require) {
'use strict';
var u = require("utils");
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
var MAX_BYTES = 1024 * 1024;

function safeError(message, blocked, transient, cancelled) {
  var error = new Error(message);
  error.providerSafe = true;
  error.siteBlocked = !!blocked;
  error.transient = !!transient;
  error.cancelled = !!cancelled;
  return error;
}

// Only request state is retained. Native TV redirects do not safely scope a
// manually supplied Cookie header, so this provider never copies site cookies.
function session(deadline) { return { deadline: deadline || Date.now() + 50000, blocked: {}, pending: [], cancelled: false }; }

// Abort unused alternatives, including in the TV guest where timers are absent.
// State belongs to one lookup, so another title lookup remains independent.
function cancel(state) {
  if (!state || state.cancelled) return;
  state.cancelled = true;
  var pending = (state.pending || []).slice();
  state.pending = [];
  pending.forEach(function (abort) { abort(); });
}

// The TV bridge preserves raw bytes but only decodes UTF-8/Latin-1 itself.
var CP1251 = 'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—\u0098™љ›њќћџ\u00a0ЎўЈ¤Ґ¦§Ё©Є«¬\u00ad®Ї°±Ііґµ¶·ё№є»јЅѕї';
function decode1251(buffer) {
  var bytes = new Uint8Array(buffer);
  if (bytes.length >= MAX_BYTES) throw safeError('Response reaches TV size limit');
  var chunks = [], current = '';
  for (var i = 0; i < bytes.length; i++) {
    var code = bytes[i];
    current += code < 128 ? String.fromCharCode(code) : code < 192 ? CP1251.charAt(code - 128) : String.fromCharCode(1040 + code - 192);
    if (current.length >= 4096) { chunks.push(current); current = ''; }
  }
  chunks.push(current);
  return chunks.join('');
}

function readBody(response, options) {
  var contentType = response.headers && typeof response.headers.get === 'function' ? response.headers.get('content-type') || '' : '';
  if (options.binary) {
    if (typeof response.arrayBuffer !== 'function' || typeof Uint8Array === 'undefined') return Promise.reject(safeError('Runtime binary responses unavailable'));
    return response.arrayBuffer().then(function (buffer) {
      if (buffer.byteLength > 4096) throw safeError('Media verification response exceeds size limit');
      var bytes = new Uint8Array(buffer), data = [];
      for (var i = 0; i < bytes.length; i++) data.push(bytes[i]);
      return { body: '', bytes: bytes.length, data: data };
    });
  }
  if (/windows-1251|cp1251/i.test(options.encoding || contentType) && typeof response.arrayBuffer === 'function' && typeof Uint8Array !== 'undefined') {
    return response.arrayBuffer().then(function (buffer) { return { body: decode1251(buffer), bytes: buffer.byteLength }; });
  }
  return response.text().then(function (body) {
    if (/windows-1251|cp1251/i.test(options.encoding || contentType) && /\ufffd/.test(body)) throw safeError('This runtime cannot decode the website charset');
    return { body: body, bytes: byteLength(body) };
  });
}

function byteLength(value) {
  var bytes = 0;
  for (var i = 0; i < value.length && bytes <= MAX_BYTES; i++) {
    var ch = value.charCodeAt(i);
    if (ch < 128) bytes++;
    else if (ch < 2048) bytes += 2;
    else if (ch >= 55296 && ch <= 56319 && i + 1 < value.length && value.charCodeAt(i + 1) >= 56320 && value.charCodeAt(i + 1) <= 57343) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

function request(url, options) {
  options = options || {};
  if (!/^https?:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/i.test(url)) return Promise.reject(safeError('Unsupported request URL'));
  var site = u.origin(url);
  var state = options.session || session();
  var method = String(options.method || (options.body !== undefined ? 'POST' : 'GET')).toUpperCase();
  var timeout = Math.min(Math.max(Number(options.timeout) || 12000, 1), 12000);
  var headers = {
    'User-Agent': USER_AGENT,
    Accept: options.json ? 'application/json, text/javascript, */*; q=0.01' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
  };
  if (options.referer) headers.Referer = options.referer;
  if (options.origin) headers.Origin = options.origin;
  if (options.search) headers['X-Requested-With'] = 'fetch';
  if (options.bearer) headers.Authorization = 'Bearer ' + options.bearer;
  if (options.body !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
  Object.keys(options.headers || {}).forEach(function (name) {
    if (/^(?:cookie|host|content-length|connection|proxy-authorization)$/i.test(name)) return;
    headers[name] = String(options.headers[name]);
  });

  function blocked(message) {
    state.blocked[site] = message;
    return safeError(message, true);
  }

  function attempt(number) {
    if (state.cancelled) return Promise.reject(safeError('Lookup cancelled: ' + site, false, false, true));
    if (state.blocked[site]) return Promise.reject(safeError(state.blocked[site], true));
    var remaining = state.deadline - Date.now();
    if (remaining <= 0) return Promise.reject(safeError('Lookup time budget exhausted: ' + site));
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    var finished = false;
    return new Promise(function (resolve, reject) {
      function cancelPending() {
        finish(safeError('Lookup cancelled: ' + site, false, false, true));
        if (controller) controller.abort();
      }
      function finish(error, value) {
        if (finished) return;
        finished = true;
        if (timer !== null && typeof clearTimeout === 'function') clearTimeout(timer);
        var index = state.pending.indexOf(cancelPending);
        if (index !== -1) state.pending.splice(index, 1);
        if (error) reject(error); else resolve(value);
      }
      if (!state.pending) state.pending = [];
      state.pending.push(cancelPending);
      if (typeof setTimeout === 'function') {
        timer = setTimeout(function () {
          finish(safeError('Request timed out: ' + site, false, true));
          if (controller) controller.abort();
        }, Math.min(timeout, remaining));
      }
      var init = { method: method, headers: headers, credentials: 'same-origin' };
      if (options.body !== undefined) init.body = options.body;
      if (controller) init.signal = controller.signal;
      Promise.resolve().then(function () { return finished ? null : fetch(url, init); }).then(function (response) {
        if (finished) return;
        var mitigation = response.headers && typeof response.headers.get === 'function' ? response.headers.get('cf-mitigated') : '';
        if (response.status === 403 || response.status === 429 || response.status === 451) throw blocked('Site access blocked (HTTP ' + response.status + '): ' + site);
        if (mitigation === 'challenge') throw blocked('Cloudflare challenge: ' + site);
        if (!response.status) throw safeError('Network request failed: ' + site, false, true);
        return readBody(response, options).then(function (result) {
          if (finished) return;
          var body = result.body;
          if (result.bytes >= MAX_BYTES) throw safeError('Response reaches TV size limit: ' + site);
          if (/<title[^>]*>\s*(?:Just a moment|Attention Required|Проверяем, что вы не бот)/i.test(body) || /cf-browser-verification|class=["']cf-turnstile|id=["']anubis_challenge/i.test(body)) throw blocked('Website verification required: ' + site);
          if (!response.ok) throw safeError('HTTP ' + response.status + ': ' + site, false, [502, 503, 504].indexOf(response.status) !== -1);
          var value = body;
          if (options.json) {
            try { value = JSON.parse(body); } catch (ignored) { throw safeError('Invalid JSON response: ' + site); }
          }
          if (options.responseInfo) value = {
            body: value, status: response.status, finalUrl: response.url || url,
            contentType: response.headers && typeof response.headers.get === 'function' ? response.headers.get('content-type') || '' : '',
            contentLength: response.headers && typeof response.headers.get === 'function' ? Number(response.headers.get('content-length')) || 0 : 0,
            contentRange: response.headers && typeof response.headers.get === 'function' ? response.headers.get('content-range') || '' : '',
            receivedBytes: result.bytes, data: result.data || []
          };
          finish(null, value);
        });
      }).catch(function (error) {
        finish(error && error.providerSafe ? error : safeError('Network request failed: ' + site, false, true));
      });
    }).catch(function (error) {
      // One GET retry for a transport failure or a temporary upstream outage.
      // Never retry access restrictions, verification pages, or malformed data.
      if (!state.cancelled && method === 'GET' && number === 0 && error.transient && state.deadline - Date.now() >= timeout) return attempt(1);
      throw error;
    });
  }
  return attempt(0);
}

module.exports = { request: request, USER_AGENT: USER_AGENT, session: session, cancel: cancel };

},
"media": function(module, exports, require) {
'use strict';
var u = require("utils");

function codecName(value) {
  if (/^avc[13]/i.test(value)) return 'H.264';
  if (/^(?:hvc1|hev1|hevc)/i.test(value)) return 'HEVC';
  if (/^(?:vp09|vp9)/i.test(value)) return 'VP9';
  if (/^av01/i.test(value)) return 'AV1';
  if (/^mp4a/i.test(value)) return 'AAC';
  if (/^opus/i.test(value)) return 'Opus';
  if (/^ac-3/i.test(value)) return 'AC-3';
  if (/^ec-3/i.test(value)) return 'E-AC-3';
  if (/^flac/i.test(value)) return 'FLAC';
  return '';
}
function codecs(values) {
  var found = [];
  values.forEach(function (value) {
    String(value || '').split(',').forEach(function (item) {
      var name = codecName(item.trim());
      if (name && found.indexOf(name) < 0) found.push(name);
    });
  });
  return found.join(' + ');
}
function dash(body) {
  if (typeof body !== 'string' || body.length > 1024 * 1024 || !/<(?:[\w.-]+:)?MPD\b/i.test(body)) return null;
  body = body.replace(/<!--[\s\S]*?-->/g, '');
  if (!/<(?:[\w.-]+:)?Period\b/i.test(body) || !/<\/(?:[\w.-]+:)?MPD\s*>\s*$/i.test(body)) return null;
  // This provider only exposes ordinary clear streams, not protected manifests.
  if (/<(?:[\w.-]+:)?ContentProtection\b|default_KID|<(?:[\w.-]+:)?pssh\b/i.test(body)) return null;
  var tags = /<(\/?)(?:[\w.-]+:)?(Representation|AdaptationSet)\b([^>]*)>/gi, match;
  var height = 0, width = 0, values = [], representations = 0, parent = {};
  while ((match = tags.exec(body))) {
    var adaptation = match[2].toLowerCase() === 'adaptationset';
    if (match[1]) { if (adaptation) parent = {}; continue; }
    var h = Number(u.attr(match[3], 'height')) || Number(u.attr(match[3], 'maxHeight')) || 0;
    var w = Number(u.attr(match[3], 'width')) || Number(u.attr(match[3], 'maxWidth')) || 0;
    var codec = u.attr(match[3], 'codecs');
    if (adaptation) { parent = { height: h, width: w, codec: codec }; continue; }
    representations++;
    h = h || parent.height || 0; w = w || parent.width || 0;
    if (h > height) { height = h; width = w; }
    values.push(codec || parent.codec);
  }
  if (!representations || !height || height > 8640 || width > 15360) return null;
  return { quality: height + 'p', codecSummary: codecs(values), height: height, width: width };
}
function hls(body) {
  if (typeof body !== 'string' || body.length > 1024 * 1024 || !/^\s*#EXTM3U/.test(body)) return null;
  // AES-128 HLS can be played by the native player. DRM key formats cannot.
  var keys = /#EXT-X-(?:SESSION-)?KEY:([^\r\n]*)/gi, key;
  while ((key = keys.exec(body))) {
    if (/\bMETHOD=SAMPLE-AES(?:-CTR)?\b/i.test(key[1])) return null;
    var format = /\bKEYFORMAT=(?:"([^"]+)"|'([^']+)'|([^,\s]+))/i.exec(key[1]);
    if (format && String(format[1] || format[2] || format[3]).toLowerCase() !== 'identity') return null;
  }
  var lines = body.split(/\r?\n/), playable = false;
  for (var i = 0; i < lines.length; i++) {
    if (!/^\s*#EXT(?:INF:|-X-STREAM-INF:)/i.test(lines[i])) continue;
    var next = i + 1;
    while (next < lines.length && (!lines[next].trim() || /^\s*#/.test(lines[next]))) next++;
    if (next < lines.length && /^[^#<>\s]+$/.test(lines[next].trim())) { playable = true; break; }
  }
  if (!playable) return null;
  var heights = /\bRESOLUTION=(\d+)x(\d+)/gi, match, height = 0, width = 0, values = [];
  while ((match = heights.exec(body))) if (Number(match[2]) > height) { height = Number(match[2]); width = Number(match[1]); }
  var codec = /\bCODECS="([^"]+)"/gi;
  while ((match = codec.exec(body))) values.push(match[1]);
  return { quality: height ? height + 'p' : '', codecSummary: codecs(values), height: height, width: width };
}
module.exports = { dash: dash, hls: hls };

},
"catalog": function(module, exports, require) {
'use strict';
var u = require("utils");

var MAX_HTML = 1024 * 1024;

function normalize(value) {
  var replacements = { 'İ': 'I', 'ı': 'i', 'Ş': 'S', 'ş': 's', 'Ç': 'C', 'ç': 'c', 'Ğ': 'G', 'ğ': 'g', 'Ö': 'O', 'ö': 'o', 'Ü': 'U', 'ü': 'u', 'Â': 'A', 'â': 'a', 'Î': 'I', 'î': 'i', 'Û': 'U', 'û': 'u', 'É': 'E', 'é': 'e' };
  return u.text(value).replace(/[İıŞşÇçĞğÖöÜüÂâÎîÛûÉé]/g, function (letter) { return replacements[letter]; })
    .toLowerCase().replace(/[̀-ͯ‎‏]/g, '').replace(/[‘’']/g, '').replace(/ё/g, 'е')
    .replace(/[^a-z0-9à-ɏЀ-ӿ぀-ヿ㐀-鿿]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function kindValue(kind) {
  return kind === 'movie' ? 'movie' : /^(?:tv|series|show)$/.test(String(kind)) ? 'tv' : '';
}

function integer(value, minimum) {
  return value != null && /^\d{1,5}$/.test(String(value)) && Number(value) >= minimum ? Number(value) : null;
}

function yearValue(value) {
  var match = /(?:^|\D)((?:18|19|20)\d{2})(?:\D|$)/.exec(String(value == null ? '' : value));
  return match && Number(match[1]) >= 1870 ? Number(match[1]) : 0;
}

function titleList(meta) {
  meta = meta || {};
  var values = [meta.title, meta.originalTitle, meta.turkishTitle, meta.name, meta.original_title, meta.original_name];
  if (Array.isArray(meta.titles)) values = values.concat(meta.titles.slice(0, 16));
  var found = [];
  values.forEach(function (value) {
    if (typeof value !== 'string') return;
    var title = normalize(value);
    if (title && found.indexOf(title) === -1) found.push(title);
  });
  return found;
}

function htmlValue(html) {
  return typeof html === 'string' && html.length <= MAX_HTML ? html.replace(/<!--[\s\S]*?-->/g, '') : '';
}

function localUrl(value, base, keepQuery) {
  value = u.entities(typeof value === 'string' ? value : '');
  if (!value || /[\\\x00-\x20\x7f]/.test(value) || /(?:^|\/)\.{1,2}(?:\/|[?#]|$)/.test(value)) return '';
  var root = u.siteUrl(u.origin(base));
  if (!root) return '';
  var url = u.absolute(value, base);
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?\//i.test(url) || !u.sameSite(url, root) || /%(?:00|0[ad]|2f|5c)/i.test(url)) return '';
  url = url.split('#')[0];
  return keepQuery ? url : url.split('?')[0];
}

function route(value, kind, base) {
  var url = localUrl(value, base || value, false);
  if (!url) return null;
  var path = url.slice(u.origin(url).length);
  var match = kind === 'tv' ? /^\/dizi\/([a-z0-9][a-z0-9_-]*)\/?$/i.exec(path) : /^\/([a-z0-9][a-z0-9_-]*)\/?$/i.exec(path);
  if (!match || /^(?:ara|login|register|filmler|diziler|animeler|kesfet|takvim|forum|premium)$/i.test(match[1])) return null;
  return { url: u.origin(url) + (kind === 'tv' ? '/dizi/' : '/') + match[1] + '/', slug: match[1] };
}

function samePage(first, second) {
  return String(first || '').replace(/\/+$/, '').toLowerCase() === String(second || '').replace(/\/+$/, '').toLowerCase();
}

function parseSuggestions(data, base, kind, meta) {
  kind = kindValue(kind);
  if (!kind || !u.siteUrl(u.origin(base))) return [];
  if (typeof data === 'string') {
    if (data.length > MAX_HTML) return [];
    try { data = JSON.parse(data); } catch (ignore) { return []; }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  var records = data[kind === 'movie' ? 'movies' : 'series'];
  if (!Array.isArray(records)) return [];
  var titles = titleList(meta);
  var wantedYear = yearValue(meta && meta.year);
  var seen = {};
  return records.slice(0, 64).map(function (item, index) {
    if (!item || typeof item !== 'object' || kindValue(item.type) !== kind || typeof item.title !== 'string') return null;
    var target = route(item.url, kind, base);
    var year = yearValue(item.meta);
    var title = u.text(item.title);
    if (!target || !title || title.length > 300 || !year || (wantedYear && year !== wantedYear) || seen[target.url]) return null;
    seen[target.url] = true;
    var exact = titles.indexOf(normalize(title)) !== -1;
    var result = { url: target.url, title: title, type: kind, year: year, exactTitle: exact };
    if (integer(item.id, 1) !== null) result.id = Number(item.id);
    return { item: result, index: index, score: exact ? 1 : 0 };
  }).filter(Boolean).sort(function (a, b) { return b.score - a.score || a.index - b.index; }).slice(0, 12).map(function (entry) { return entry.item; });
}

function nodes(html) {
  var results = [];
  var scripts = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  var match;
  var count = 0;
  var visited = 0;
  html = htmlValue(html);
  function walk(value, depth) {
    if (!value || typeof value !== 'object' || depth > 6 || visited >= 128) return;
    visited++;
    if (Array.isArray(value)) {
      value.slice(0, 128).forEach(function (entry) { walk(entry, depth + 1); });
      return;
    }
    if (typeof value['@type'] === 'string' || Array.isArray(value['@type'])) results.push(value);
    if (value['@graph']) walk(value['@graph'], depth + 1);
  }
  while ((match = scripts.exec(html)) !== null && count < 12 && visited < 128) {
    if (u.attr(match[1], 'type').toLowerCase() !== 'application/ld+json') continue;
    count++;
    if (match[2].length > 256 * 1024) continue;
    try { walk(JSON.parse(match[2]), 0); } catch (ignore) { /* Invalid data is not executable code. */ }
  }
  return results;
}

function hasType(node, expected) {
  var types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  return types.indexOf(expected) !== -1;
}

function watchTarget(node, pageUrl) {
  var actions = Array.isArray(node.potentialAction) ? node.potentialAction : [node.potentialAction];
  var target = '';
  actions.slice(0, 8).forEach(function (action) {
    if (!action || !hasType(action, 'WatchAction') || typeof action.target !== 'string') return;
    var url = localUrl(action.target, pageUrl, true);
    if (url && !/[?#]/.test(url) && samePage(url, pageUrl + 'izle/')) target = url.replace(/\/?$/, '/');
  });
  return target;
}

function detail(html, url, kind, meta) {
  kind = kindValue(kind);
  var expected = route(url, kind, url);
  var titles = titleList(meta);
  var wantedYear = yearValue(meta && meta.year);
  if (!kind || !expected || !titles.length || !wantedYear) return null;
  var found = [];
  nodes(html).forEach(function (node) {
    if (!hasType(node, kind === 'movie' ? 'Movie' : 'TVSeries')) return;
    var canonical = route(node.url, kind, expected.url);
    var year = yearValue(kind === 'movie' ? node.datePublished : node.startDate);
    var name = typeof node.name === 'string' ? u.text(node.name) : '';
    var alternate = typeof node.alternateName === 'string' ? u.text(node.alternateName) : '';
    if (!canonical || !samePage(canonical.url, expected.url) || year !== wantedYear || !name || (titles.indexOf(normalize(name)) === -1 && titles.indexOf(normalize(alternate)) === -1)) return;
    found.push({ url: canonical.url, type: kind, title: name, alternateTitle: alternate, year: year, slug: canonical.slug, watchUrl: kind === 'movie' ? watchTarget(node, canonical.url) : '' });
  });
  // More than one identity is ambiguous, even if a later node looks plausible.
  return found.length === 1 ? found[0] : null;
}

function movieWatchUrl(item, base) {
  if (!item || item.type !== 'movie') return '';
  var page = route(item.url, 'movie', base || item.url);
  var url = page && localUrl(item.watchUrl, page.url, true);
  return url && !/[?#]/.test(url) && samePage(url, page.url + 'izle/') ? url.replace(/\/?$/, '/') : '';
}

function anchorUrls(html, base) {
  html = htmlValue(html).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  var anchors = /<a\b([^>]*)>/gi;
  var match;
  var urls = [];
  while ((match = anchors.exec(html)) !== null && urls.length < 2048) {
    var url = localUrl(u.attr(match[1], 'href'), base, true);
    if (url) urls.push(url);
  }
  return urls;
}

function seasonUrl(html, seriesUrl, season) {
  var series = route(seriesUrl, 'tv', seriesUrl);
  var number = integer(season, 0);
  if (!series || number === null) return '';
  var found = '';
  anchorUrls(html, series.url).some(function (url) {
    var parts = url.split('?');
    var query = /^sezon=(\d{1,5})$/.exec(parts[1] || '');
    if (parts.length === 2 && samePage(parts[0], series.url) && query && Number(query[1]) === number) { found = url; return true; }
    return false;
  });
  // The base detail page can itself be the published first-season listing.
  if (!found && number === 1 && episodeUrl(html, series.url, 1, 1)) return series.url;
  return found;
}

function episodeUrl(html, seriesUrl, season, episode) {
  var series = route(seriesUrl, 'tv', seriesUrl);
  var wantedSeason = integer(season, 0);
  var wantedEpisode = integer(episode, 1);
  if (!series || wantedSeason === null || wantedEpisode === null) return '';
  var found = '';
  anchorUrls(html, series.url).some(function (url) {
    if (/[?#]/.test(url)) return false;
    var match = /^\/bolum\/([a-z0-9][a-z0-9_-]*)-(\d{1,5})-sezon-(\d{1,5})-bolum\/?$/i.exec(url.slice(u.origin(url).length));
    if (match && match[1].toLowerCase() === series.slug.toLowerCase() && Number(match[2]) === wantedSeason && Number(match[3]) === wantedEpisode) { found = url.replace(/\/?$/, '/'); return true; }
    return false;
  });
  return found;
}

function validateEpisode(html, url, series, season, episode) {
  var seriesUrl = typeof series === 'string' ? series : series && series.url;
  var parent = route(seriesUrl, 'tv', seriesUrl);
  var target = parent && localUrl(url, parent.url, true);
  var wantedSeason = integer(season, 0);
  var wantedEpisode = integer(episode, 1);
  if (!parent || !target || /[?#]/.test(target) || wantedSeason === null || wantedEpisode === null) return false;
  var expected = episodeUrl('<a href="' + target + '">episode</a>', parent.url, wantedSeason, wantedEpisode);
  if (!expected) return false;
  var titles = typeof series === 'object' ? titleList({ title: series.title, originalTitle: series.alternateTitle }) : [];
  var matching = nodes(html).filter(function (node) {
    if (!hasType(node, 'TVEpisode') || !node.partOfSeason || !node.partOfSeries) return false;
    var canonical = localUrl(node.url, target, true);
    var actualParent = route(node.partOfSeries.url, 'tv', parent.url);
    return canonical && !/[?#]/.test(canonical) && samePage(canonical, target) && actualParent && samePage(actualParent.url, parent.url) &&
      integer(node.episodeNumber, 1) === wantedEpisode && integer(node.partOfSeason.seasonNumber, 0) === wantedSeason &&
      (!titles.length || titles.indexOf(normalize(node.partOfSeries.name)) !== -1);
  });
  return matching.length === 1;
}

module.exports = { normalize: normalize, parseSuggestions: parseSuggestions, detail: detail, movieWatchUrl: movieWatchUrl, seasonUrl: seasonUrl, episodeUrl: episodeUrl, validateEpisode: validateEpisode };

},
"player": function(module, exports, require) {
'use strict';
var u = require("utils");
var http = require("http");
var media = require("media");
var MAX_FRAMES = 4;
var MAX_VARIANTS = 4;

function playerOrigin(url) {
  var root = u.origin(url);
  return /^https:\/\/(?:[a-z0-9-]+\.)*pilavyerplay\.top$/i.test(root) ? root : '';
}
function safeURL(url) {
  return /^https:\/\/[a-z0-9.-]+(?:\/[\x21-\x7e]*)?$/i.test(String(url || '')) && !/[<>"\\]/.test(url);
}
function samePlayerURL(value, base, kind) {
  var url = u.absolute(value, base), root = playerOrigin(base);
  if (!root || !safeURL(url) || !u.sameSite(url, root)) return '';
  var path = url.slice(root.length).split(/[?#]/)[0];
  if (kind === 'stream' && path !== '/api/stream.php') return '';
  if (kind === 'subtitle' && path !== '/api/sub.php' && !/\.(?:vtt|srt)$/i.test(path)) return '';
  return url;
}
function frames(html, pageURL) {
  html = String(html || '').replace(/<!--[\s\S]*?-->/g, '');
  var bases = [], slugs = [], found = [], match;
  var scripts = /<script\b[^>]*>/gi;
  while ((match = scripts.exec(html))) {
    var src = u.absolute(u.attr(match[0], 'src'), pageURL);
    if (!/\/(?:assets\/js\/core|e\/c)\.js(?:[?#]|$)/i.test(src)) continue;
    var base = playerOrigin(src);
    if (base && bases.indexOf(base) < 0) bases.push(base);
  }
  var containers = /<div\b[^>]*>/gi;
  while ((match = containers.exec(html)) && slugs.length < MAX_FRAMES) {
    var slug = u.attr(match[0], 'data-pv');
    if (/^[A-Za-z0-9_-]{8,128}$/.test(slug) && slugs.indexOf(slug) < 0) slugs.push(slug);
  }
  // The public loader constructs this exact iframe URL from data-pv. Its code
  // is never downloaded or executed during a provider lookup.
  bases.slice(0, 1).forEach(function (base) {
    slugs.forEach(function (slug) { found.push(base + '/assets/js/s.php?s=' + encodeURIComponent(slug)); });
  });
  var iframes = /<iframe\b[^>]*>/gi;
  while ((match = iframes.exec(html)) && found.length < MAX_FRAMES) {
    var frame = u.absolute(u.attr(match[0], 'src'), pageURL);
    if (playerOrigin(frame) && safeURL(frame) && /\/assets\/js\/s\.php\?s=[A-Za-z0-9_-]{8,128}(?:&|$)/.test(frame) && found.indexOf(frame) < 0) found.push(frame);
  }
  return found.slice(0, MAX_FRAMES);
}
function configuration(html) {
  html = String(html || '');
  if (html.length > 1024 * 1024) return null;
  var scripts = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, match;
  while ((match = scripts.exec(html))) {
    if (u.attr(match[1], 'src')) continue;
    var assignment = /^\s*window\.__PLAYER__\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(match[2]);
    if (!assignment || assignment[1].length > 256 * 1024) continue;
    try {
      var value = JSON.parse(assignment[1]);
      if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.stream === 'string') return value;
    } catch (ignored) {}
  }
  return null;
}
function variants(body, base) {
  var lines = String(body || '').split(/\r?\n/), found = [];
  for (var i = 0; i < lines.length; i++) {
    if (!/^\s*#EXT-X-STREAM-INF:/i.test(lines[i])) continue;
    var resolution = /\bRESOLUTION=(\d+)x(\d+)/i.exec(lines[i]);
    var next = i + 1;
    while (next < lines.length && (!lines[next].trim() || /^\s*#/.test(lines[next]))) next++;
    if (next === lines.length) return [];
    var url = samePlayerURL(lines[next].trim(), base, 'stream');
    if (!url) return [];
    found.push({ url: url, height: resolution ? Number(resolution[2]) : 0 });
    if (found.length > MAX_VARIANTS) return [];
  }
  return found;
}
function duration(body) {
  if (!/#EXT-X-ENDLIST(?:\s|$)/i.test(body)) return 0;
  var re = /#EXTINF:([\d.]+)/gi, match, total = 0;
  while ((match = re.exec(body))) total += Number(match[1]) || 0;
  return total;
}
function compatibleEpisode(config, meta) {
  if (!meta || !/^(?:tv|series|show)$/i.test(meta.kind || '')) return true;
  var episode = /(?:^|[.\s_-])S(\d{1,3})E(\d{1,4})(?=[.\s_-]|$)/i.exec(config.title || '');
  return !episode || Number(episode[1]) === Number(meta.season) && Number(episode[2]) === Number(meta.episode);
}
function playbackHeaders(frame) {
  var root = playerOrigin(frame);
  return { Referer: root + '/', Origin: root, 'User-Agent': http.USER_AGENT, 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8' };
}
function subtitles(config, frame, headers) {
  var found = [], seen = {};
  (Array.isArray(config.subs) ? config.subs : []).slice(0, 12).forEach(function (sub) {
    if (!sub || typeof sub !== 'object') return;
    var url = samePlayerURL(sub.src, frame, 'subtitle');
    if (!url || seen[url]) return;
    seen[url] = true;
    var language = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(String(sub.lang || '')) ? String(sub.lang) : 'und';
    found.push({ id: 'diziabi-' + found.length, url: url, language: language, name: u.text(sub.label || language).slice(0, 100), headers: headers });
  });
  return found;
}
function audioLabel(config) {
  var labels = [];
  (Array.isArray(config.audios) ? config.audios : []).slice(0, 8).forEach(function (audio) {
    var label = u.text(audio && (audio.label || audio.lang) || '').slice(0, 80);
    if (label && labels.indexOf(label) < 0) labels.push(label);
  });
  return labels.join(' / ');
}
function verifyPlaylist(body, expectedDuration) {
  if (!media.hls(body)) return false;
  var seconds = duration(body);
  if (!seconds || seconds < 10) return false;
  // The page supplies the full asset's duration. Reject obvious previews even
  // when their playlist header looks valid; never use its filename for quality.
  return !expectedDuration || seconds >= expectedDuration * 0.8;
}
function resolveFrame(frame, page, cfg, meta) {
  return http.request(frame, { session: cfg.session, referer: u.origin(page.url) + '/', responseInfo: true }).then(function (response) {
    if (!playerOrigin(response.finalUrl) || !u.sameSite(response.finalUrl, frame)) return [];
    var config = configuration(response.body);
    if (!config || !compatibleEpisode(config, meta)) return [];
    var stream = samePlayerURL(config.stream, frame, 'stream');
    if (!stream) return [];
    var headers = playbackHeaders(frame);
    return http.request(stream, { session: cfg.session, headers: headers, responseInfo: true }).then(function (master) {
      if (!u.sameSite(master.finalUrl, frame)) return [];
      var info = media.hls(master.body);
      if (!info) return [];
      var children = variants(master.body, stream);
      var hasVariants = /#EXT-X-STREAM-INF:/i.test(master.body);
      if (hasVariants && !children.length) return [];
      var expected = Number(config.dur);
      if (!(expected >= 10 && expected <= 86400)) expected = 0;
      var validation = children.length ? Promise.all(children.map(function (child) {
        return http.request(child.url, { session: cfg.session, headers: headers, responseInfo: true }).then(function (response) {
          return u.sameSite(response.finalUrl, frame) && verifyPlaylist(response.body, expected);
        });
      })).then(function (results) { return results.every(function (valid) { return valid; }); }) : Promise.resolve(verifyPlaylist(master.body, expected));
      return validation.then(function (valid) {
        if (!valid) return [];
        var title = (meta && meta.title || 'DiziAbi') + (meta && /^(?:tv|series|show)$/i.test(meta.kind || '') ? ' S' + meta.season + 'E' + meta.episode : '');
        var audio = audioLabel(config);
        return [{ name: 'DiziAbi', provider: 'DiziAbi', title: title + ' | Pilavyer' + (audio ? ' | ' + audio : '') + (info.codecSummary ? ' | ' + info.codecSummary : ''), url: stream, type: 'hls', quality: info.quality || 'Auto', headers: headers, subtitles: subtitles(config, frame, headers) }];
      });
    });
  });
}
function resolve(page, cfg, meta) {
  cfg = cfg || {};
  if (!cfg.session) cfg.session = http.session();
  if (!page || typeof page.html !== 'string' || !/^https:\/\//i.test(page.url || '')) return Promise.resolve([]);
  var choices = frames(page.html, page.url);
  if (!choices.length) return Promise.resolve([]);
  // Independent players need not all respond before a confirmed source can be
  // played. Keep full manifest validation inside each player before selecting it.
  return new Promise(function (resolve) {
    var remaining = choices.length, finished = false;
    function complete(streams) {
      if (finished) return;
      remaining--;
      if (streams.length) {
        finished = true;
        http.cancel(cfg.session);
        resolve(streams);
      } else if (!remaining) {
        finished = true;
        resolve([]);
      }
    }
    choices.forEach(function (frame) {
      resolveFrame(frame, page, cfg, meta).then(complete, function () { complete([]); });
    });
  });
}
module.exports = { resolve: resolve, frames: frames, configuration: configuration, variants: variants, duration: duration };

},
"index": function(module, exports, require) {
'use strict';
var u = require("utils");
var http = require("http");
var catalog = require("catalog");
var player = require("player");
var DEFAULT_SITE = 'https://www.diziabi.net';

function settings() {
  var root = typeof globalThis !== 'undefined' ? globalThis : {};
  var saved = root.SCRAPER_SETTINGS || {};
  return {
    site: u.siteUrl(saved.siteUrl || DEFAULT_SITE) || DEFAULT_SITE,
    key: String(saved.tmdbApiKey || root.TMDB_API_KEY || '').trim(),
    session: http.session()
  };
}

function metadata(id, kind, cfg) {
  if (!cfg.key) return Promise.reject(new Error('TMDB key unavailable. Enter your own key in DiziAbi TV settings.'));
  var token = cfg.key.length > 40;
  var url = 'https://api.themoviedb.org/3/' + kind + '/' + encodeURIComponent(id) + '?language=tr-TR';
  if (!token) url += '&api_key=' + encodeURIComponent(cfg.key);
  return http.request(url, { json: true, bearer: token ? cfg.key : '', session: cfg.session }).then(function (data) {
    var title = String(kind === 'movie' ? data.title || '' : data.name || '');
    var original = String(kind === 'movie' ? data.original_title || '' : data.original_name || '');
    var year = Number(String(kind === 'movie' ? data.release_date || '' : data.first_air_date || '').slice(0, 4));
    if ((!title && !original) || !year || (data.id && String(data.id) !== String(id))) throw new Error('Title metadata is incomplete.');
    return { title: title || original, originalTitle: original, year: year, kind: kind };
  });
}

function warn(error) {
  console.warn('[DiziAbi TV] ' + (error && error.providerSafe ? error.message : 'Source unavailable or title could not be confirmed.'));
}

function findTitle(meta, cfg) {
  var queries = [meta.title, meta.originalTitle].filter(function (value, index, all) { return value && all.indexOf(value) === index; }).slice(0, 2);
  return Promise.all(queries.map(function (query) {
    return http.request(cfg.site + '/ara/oneri?q=' + encodeURIComponent(query), { json: true, referer: cfg.site + '/', session: cfg.session }).then(function (data) {
      return catalog.parseSuggestions(data, cfg.site, meta.kind, meta);
    }).catch(function (error) { warn(error); return []; });
  })).then(function (groups) {
    var candidates = [], seen = {};
    groups.forEach(function (group) { group.forEach(function (candidate) {
      if (!seen[candidate.url]) { seen[candidate.url] = true; candidates.push(candidate); }
    }); });
    candidates.sort(function (a, b) { return Number(b.exactTitle) - Number(a.exactTitle); });
    return Promise.all(candidates.slice(0, 4).map(function (candidate) {
      return http.request(candidate.url, { referer: cfg.site + '/', session: cfg.session }).then(function (html) {
        var identity = catalog.detail(html, candidate.url, meta.kind, meta);
        return identity ? { identity: identity, html: html } : null;
      }).catch(function (error) { warn(error); return null; });
    }));
  }).then(function (results) {
    var confirmed = results.filter(function (result) { return !!result; });
    // A title/year collision is ambiguous without a shared external identifier.
    return confirmed.length === 1 ? confirmed[0] : null;
  });
}

function watchPage(found, meta, cfg, season, episode) {
  var identity = found.identity;
  if (meta.kind === 'movie') {
    var watch = catalog.movieWatchUrl(identity, cfg.site);
    if (!watch) return Promise.resolve(null);
    return http.request(watch, { referer: identity.url, session: cfg.session, responseInfo: true }).then(function (response) {
      // Watch pages have no title metadata, so do not follow a redirect into
      // another title or a generic landing page containing an unrelated player.
      if (String(response.finalUrl || '').split(/[?#]/)[0].replace(/\/+$/, '') !== watch.replace(/\/+$/, '')) return null;
      return { html: response.body, url: watch };
    });
  }
  var seasonPage = catalog.seasonUrl(found.html, identity.url, season);
  if (!seasonPage) return Promise.resolve(null);
  var body = seasonPage === identity.url ? Promise.resolve(found.html) : http.request(seasonPage, { referer: identity.url, session: cfg.session });
  return body.then(function (html) {
    // Season pages must still describe the same confirmed series.
    var confirmed = catalog.detail(html, identity.url, 'tv', meta);
    if (!confirmed || confirmed.url !== identity.url) return null;
    var target = catalog.episodeUrl(html, identity.url, season, episode);
    if (!target) return null;
    return http.request(target, { referer: seasonPage, session: cfg.session }).then(function (episodeHtml) {
      return catalog.validateEpisode(episodeHtml, target, identity, season, episode) ? { html: episodeHtml, url: target } : null;
    });
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var kind = mediaType === 'movie' ? 'movie' : /^(?:tv|series|show)$/.test(String(mediaType)) ? 'tv' : '';
  if (!kind || !/^[1-9]\d*$/.test(String(tmdbId))) return Promise.resolve([]);
  if (kind === 'tv' && (!/^\d+$/.test(String(season)) || !/^[1-9]\d*$/.test(String(episode)))) return Promise.resolve([]);
  var cfg = settings();
  if (!cfg.key) {
    console.warn('[DiziAbi TV] TMDB key unavailable. Enter your own key in plugin settings.');
    return Promise.resolve([]);
  }
  return metadata(tmdbId, kind, cfg).then(function (meta) {
    meta.season = Number(season); meta.episode = Number(episode);
    return findTitle(meta, cfg).then(function (found) {
      if (!found) return [];
      return watchPage(found, meta, cfg, season, episode).then(function (page) {
        return page ? player.resolve(page, cfg, meta) : [];
      });
    });
  }).catch(function (error) { warn(error); return []; }).then(function (streams) {
    http.cancel(cfg.session);
    return streams;
  });
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'DiziAbi TV' },
    { type: 'text', key: 'siteUrl', label: 'Website address', defaultValue: DEFAULT_SITE, description: 'The HTTPS website address. Change this only if DiziAbi moves.' },
    { type: 'text', key: 'tmdbApiKey', label: 'TMDB API key (optional)', isPassword: true, defaultValue: '', description: 'Uses Nuvio\'s key when available. Otherwise enter your own TMDB v3 key or API Read Access Token.' }
  ]);
}

module.exports = { getStreams: getStreams, onSettings: onSettings };

}
};
var cache = {};
function load(id) {
 if (cache[id]) return cache[id].exports;
 if (!modules[id]) throw new Error("Unknown module: " + id);
 var local = { exports: {} }; cache[id] = local;
 modules[id](local, local.exports, load);
 return local.exports;
}
module.exports = load("index");
}());
