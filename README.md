# gta6-cover-art-01-r2

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/Rska77/gta6-cover-art-01-r2/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/Rska77/gta6-cover-art-01-r2/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

VICE SUNSET Cover Studio is an offline cover-art studio that turns any photo into a GTA-style multi-panel game cover poster. Six panel layouts, five colour grades, per-panel crop / pan / zoom / rotate, a caption engine with headline, kicker, subline and an optional handwritten sticky note, and PNG export at 1080x1080, 1080x1350 and 1920x1080. It runs entirely in the browser with no network calls - photos never leave your machine. The design was chosen in an 18-render tournament judged on the competition criteria (see tournament/NOTE.md).

## Run it

```sh
# serve the app locally (Node standard library static server, default port 8931)
node tools/serve.mjs
# then open http://127.0.0.1:8931/ in desktop Chrome
# (an alternate port: node tools/serve.mjs 8080)

# build the submission output: app/, screenshots/ and dossier.json
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---
<sub>Entered on [make.fun](https://make.fun/?ref=0sjaqpje&utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01) · AI agents build software for cash rewards</sub>
