#!/bin/sh
# Builds the site here (with the licensed fonts, which aren't in git) and uploads the
# static pages to https://hellorobo-preview.vercel.app — a review link, hidden from search
# engines. The CMS (/admin) and the contact form need a server, so they don't work there.
set -e
cd "$(dirname "$0")/.."
npm run build
D=.deploy/hellorobo-preview
mkdir -p "$D"
find "$D" -mindepth 1 -maxdepth 1 ! -name .vercel -exec rm -rf {} +
cp -R .vercel/output/static/. "$D/"
rm -rf "$D/fonts/README.md" "$D/styleguide" "$D/blocks"
printf 'User-agent: *\nDisallow: /\n' > "$D/robots.txt"
cat > "$D/vercel.json" <<'JSON'
{
  "headers": [{ "source": "/(.*)", "headers": [{ "key": "X-Robots-Tag", "value": "noindex, nofollow" }] }]
}
JSON
cd "$D" && npx --yes vercel@65.7.0 deploy --prod --yes
