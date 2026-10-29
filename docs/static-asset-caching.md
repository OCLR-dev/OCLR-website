# Static asset caching (#433)

Production builds enumerate actual image/font files in `public` and install exact
path header rules. New files are discovered on the next build. Symlinks, documents,
JSON and application routes are excluded. Do not put private uploads in `public`.

| Resource                                                      | Browser policy                         | Update mechanism                                                                                    |
| ------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/_next/static/` hashed CSS/JS/media                          | Next.js: one year, immutable           | Build creates new content URLs                                                                      |
| Public brand, season, archive, mascot, theme images and fonts | `public, max-age=300, must-revalidate` | Same URL revalidates after at most five minutes; rename and update references for immediate rollout |
| HTML, OAuth, API, private media/downloads                     | Existing application policy            | No new public cache rules                                                                           |
| `a.ppy.sh`, `assets.ppy.sh`                                   | Third-party response policy            | Outside this application's control                                                                  |

Five minutes bounds stale original-path assets while avoiding transfers and
validation round trips during normal navigation/revisits within that window.
After expiry Next.js's static server supplies ETag/Last-Modified and can respond
304 without retransmitting the file. This is intentionally not an immutable
policy. A version query works only if every reference changes with the bytes;
a new filename is preferable for an immediate update. Do not replace a file and
expect an already fresh URL to update instantly. Development does not install
these cache rules; remote mode retains its existing no-store behavior.

The previous public default was `public, max-age=0`: it allowed storage and 304
validation but no freshness window. That can cause repeated validation, not
necessarily repeated full downloads. Framework hashed files were already cached.
This diagnosis concerns local production builds; it is not a measurement of the
live site's current configuration.

## Existing separate Nginx host

Use [the complete conf.d example](examples/oclr-nginx.conf) inside the existing
`http {}` block. It is a site include, not a replacement of the host-wide
`nginx.conf`. Replace the example canonical hostname, app private address and
certificate paths. Keep the existing separate proxy/database topology.

`proxy_cache off` disables shared proxy caching; browsers still obey upstream
Cache-Control. `expires off` prevents inherited expires rules from replacing
that policy. Preserve Cache-Control, ETag, Last-Modified, Vary, CSP and Set-Cookie;
remove conflicting inherited `add_header Cache-Control`, `proxy_hide_header`,
`proxy_ignore_headers` and extension-based cache locations from the effective
vhost configuration. Do not enable a generic image/font/JS extension rule: private
API/download URLs can also end in those extensions. See the official
[Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

On the Nginx host, an authorized operator must inspect `nginx -T` privately,
validate `sudo nginx -t`, and reload only after approval. Do not publish the
complete host configuration or logs, which may include secrets or OAuth queries.
This change does not operate production services.

## Verification and release checklist

Compare upstream and public HTTPS GET responses (HEAD alone does not establish
transfer savings). Representative paths: `/branding/oclr-mark.svg`,
`/oclr-s11-key-visual.webp`, `/archive/s7/key-visual.jpg`,
`/themes/prism-overture/prism-field-light.svg`,
`/fonts/quicksand-latin-variable.woff2`, and real hashed CSS/JS URLs from HTML.
Check Cache-Control, ETag, Last-Modified, Vary and security headers; repeat with
If-None-Match and If-Modified-Since and expect an unchanged file to return 304.

In desktop and mobile browsers, leave Disable cache **unchecked**, start a fresh
context, visit normally, navigate away and revisit in the same context. Record
request counts and encoded transfer bytes, distinguishing memory/disk cache (zero
transfer), 304 and full 200. Normal reload may deliberately revalidate; hard reload
and Disable cache are separate diagnostics. Include both appearances and locales;
verify private/no-store output and real multi-account login separately on staging.

Replace a mutable asset in an isolated copy: unchanged validator should yield 304;
after replacement the old validator must yield 200/new bytes. Check natural expiry
or use an explicitly revalidating request; for an immediate publication use a new
filename and verify new HTML/CSS references it. Never run this against live assets.

During deployment retain old hashed chunks for active tabs through the supported
release overlap window (on the app/asset host), and test an old open tab navigating
after switching releases plus new visitors loading the new build. The current
update script switches whole release directories; keeping the old directory alone
does not serve its old URLs from the new process. Browser freshness cannot fix a
missing uncached old chunk. This existing release-overlap limitation requires
staging evidence/asset retention before accepting the rollout criterion; this
patch does not claim seamless rolling deployment.

See [local evidence](verification/issue-433/README.md) for performed checks and gaps.
