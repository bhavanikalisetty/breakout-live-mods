# Breakout Live Mods

A live hackathon demo built on the LittleJS Breakout example. The original art, SFX, controls, and brick collisions are kept. Muse Ember, through the OpenRouter endpoint, turns a plain English request into one allowlisted gameplay rule or one original 8x8 ball sprite. No arbitrary JavaScript is ever run.

## Run

```sh
# Terminal 1: server (the game works without a key; modding returns a clear error)
PORT=8787 node examples/breakout/server.mjs

# With a key: export it in the server terminal's environment first (never commit it,
# and never paste it inline on the server command line), then start the server.
# The server reads it from the exported environment as OPENROUTER_API_KEY.
export OPENROUTER_API_KEY='paste-key-here'
PORT=8787 node examples/breakout/server.mjs

# Open http://127.0.0.1:8787/
```

To check the shared rules module without a key:

```sh
node --test examples/breakout/rules.test.mjs
```

## Supported rules

One rule is active at a time. A valid new rule replaces the old one immediately. An invalid or unsupported request keeps the previous rule and look.

- Triggers: `purple_brick`, `any_brick`, `every_n_bricks` with `n` from 2 to 20.
- Effects: `split_ball`, `widen_paddle`, `slow_ball`.
- At most 6 balls. Paddle width is bounded. Balls never collide with each other.
- Purple bricks use a fixed deterministic pattern. Press R to reset the board, paddle, and balls. The reset message says whether a rule is still active. Clear / Undo removes the rule and restores the original ball look.
- Ball sprites: exactly eight strings of eight characters from `.PWGROB`, plus a short label. The sidebar preview and the ball use the same grid. Drawing is visual only and does not change ball size.

Try: "When I break a purple brick, split the ball in two." Then: "Widen my paddle every five bricks." Then: "Draw a purple and green joker face on the ball."

## Credits

Game engine and original Breakout example: LittleJS by Frank Force, MIT licensed. Live mod model: Muse Ember via OpenRouter (`meta/muse-ember`). This demo uses no external dependencies and no build step.
