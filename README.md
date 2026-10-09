# BSE Trades: long-running pull, live dashboard

Zero dependencies. Node 18+ only.

## Run it

```bash
npm start          # real timing: mock BSE holds each pull for 15 minutes
npm run demo       # same thing with a 20-second pull, handy for a walkthrough
```

Open http://localhost:3000. The dashboard loads instantly, even mid-pull. When the pull completes, new trades
appear on the open page with a highlight, with no refresh.

| Setting (env var)       | Default   | Meaning                                          |
|-------------------------|-----------|--------------------------------------------------|
| `BSE_DELAY_MS`          | 900000    | How long the mock holds `/getTrades` (15 min)    |
| `BSE_BASE_TRADES`       | 3000      | Trades returned by the first pull                |
| `BSE_GROWTH_PER_PULL`   | 150       | Extra trades each later pull returns             |
| `SSE_MAX_LIFETIME_MS`   | 25000     | Server closes each event stream after this long  |
| `PORT` / `MOCK_PORT`    | 3000/4001 | Ports                                            |

You can also override the delay per call: `curl "localhost:4001/getTrades?delayMs=5000"`.

## Endpoints

| Service | Endpoint          | Purpose                                                      |
|---------|-------------------|--------------------------------------------------------------|
| mock    | `GET /getTrades`  | Seeded trades, held for the configured delay                 |
| app     | `GET /api/trades` | Instant snapshot from the store (`?after=<seq>` for a delta) |
| app     | `POST /api/pull`  | Start a background pull; returns 202 immediately             |
| app     | `GET /api/events` | Server-Sent Events: `trades` and `pull` events               |

## Try the 30-second constraint yourself

```bash
npm run demo
curl -m 2 localhost:3000/api/trades                      # answers instantly while the pull runs
curl -N localhost:3000/api/events                        # stream ends itself after ~25s
curl -N -H "Last-Event-ID: 1" localhost:3000/api/events  # replays anything newer than seq 1
```

See `docs/ARCHITECTURE.md` for the design and the reasoning.
