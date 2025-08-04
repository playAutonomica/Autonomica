# Going live — Hedge Bots (Robinhood Chain)

Everything works locally today. This is the checklist so **nothing breaks when you move it** to the internet. The arena is the piece that goes live (real wallets, real ETH on Robinhood Chain).

## The pieces — ONE host (Railway serves everything)

| Piece | What it is | Where it hosts |
|---|---|---|
| `arena/` | the arena service — **also serves the built site** (`web/dist`) | **Railway** (one process, one URL) |
| `web/` | the site, built to static files at deploy time | served by the arena service |