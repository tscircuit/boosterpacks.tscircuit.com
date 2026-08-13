# boosterpacks.tscircuit.com

A searchable, two-page directory of the TI BoosterPack boards in
[`tscircuit/boosters`](https://github.com/tscircuit/boosters). The index shows a
PoppyGL-rendered thumbnail for every discovered board. Board detail pages load
the generated GLB in an interactive viewer, show the PCB as a full-resolution
SVG, and provide pre-generated design downloads.

## How it works

`scripts/generate-board-assets.ts` is the source-of-truth pipeline:

1. Clone or update `tscircuit/boosters`.
2. Discover every top-level directory containing `index.circuit.tsx`.
3. Build routed Circuit JSON, GLB, PCB SVG, and schematic outputs with `tsci`.
4. Pre-generate KiCad and Altium project ZIPs plus a multi-page schematic PDF.
5. Render each GLB to a thumbnail with PoppyGL.
6. Write the public asset tree and searchable board manifest.

Each generated board directory contains the interactive GLB, thumbnail, PCB
SVG, `kicad.zip`, `altium.zip`, and `schematic.pdf`. The tscircuit project link
points directly to the corresponding source directory in `tscircuit/boosters`.

Because discovery is automatic, adding a board to `tscircuit/boosters` is
enough for it to appear on the next site build.

Generated board directories are intentionally ignored by Git. Production builds
recreate them from the pinned upstream commit captured in the generated manifest.

## Development

Install dependencies and generate the current board catalog:

```sh
bun install
bun run generate:boards
bun run dev
```

To reuse a local clone while working on the generator:

```sh
bun run scripts/generate-board-assets.ts --source-dir ../boosters
```

When the local clone already has current `dist` outputs, add `--skip-build` to
regenerate the manifest and PoppyGL thumbnails without rerouting every board.

Run the fast checks without rebuilding all circuit assets:

```sh
bun run typecheck
bun test
bun run format:check
bun run build:site
```

`bun run start` opens the React Cosmos fixtures used to develop the index and
detail page components in isolation. The full production command is
`bun run build`.

## Deployment

Production assets are built and deployed to the Vercel project
`tscircuit/boosterpacks-tscircuit-com`, which is connected to this GitHub
repository for production deployments from `main`. A small Cloudflare Worker owns
`boosterpacks.tscircuit.com` and forwards requests to the stable Vercel
production alias, so every future Vercel production deployment is immediately
available on the custom domain.

Deploy both layers with:

```sh
bun run deploy
```

Use `bun run deploy:vercel` for ordinary content releases and
`bun run deploy:edge` only when `worker/proxy.ts` or `wrangler.jsonc` changes.
