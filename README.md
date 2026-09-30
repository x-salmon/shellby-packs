# 🦀 Shellby Wardrobe: community packs

Hats, effects and colors for [Shellby](https://github.com/x-salmon/shellby), the pixel hermit crab that runs Claude Code on your Windows desktop.

**Browse:** https://x-salmon.github.io/shellby-packs/
**Make one:** [Pack Studio](https://x-salmon.github.io/shellby-packs/studio/) · [Guide](https://x-salmon.github.io/shellby-packs/create/)

## How it works

- Every pack is one JSON file in `packs/<pack-id>/pack.json`, with an optional `README.md` beside it.
- Pull requests are checked automatically with **Shellby's own validator** (vendored in `lib/shellby.js`), plus a few gallery rules. Maintainers review the art and merge.
- Merging rebuilds the gallery on GitHub Pages and publishes `index.json`, the registry Shellby reads. Each pack in it has a SHA-256 checksum.
- **Add to Shellby** buttons open `shellby://install?pack=<id>`. Shellby (0.4+) looks that id up in the registry, downloads it only from this site, checks the checksum, validates the pack, and shows a native "Install pack?" preview before anything is installed. Packs are pixel art and settings only: they can't run code.

## Submitting a pack

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version: design it in Pack Studio, add `packs/<id>/pack.json` in a fork, and open a PR.

## Developing the gallery

```bash
node scripts/validate.mjs          # check every pack (same rules as the PR check)
node scripts/build.mjs             # build the static site into dist/
node scripts/sync-shellby.mjs ../shellby   # re-vendor the validator/renderer after a Shellby release
```

The site is plain HTML, CSS and JavaScript with no framework and no dependencies. Interactive previews use Shellby's own sprite and effects engines (`lib/sprite.js`, `lib/effects.js`), so what you see here is exactly what Shellby draws.

## License

Gallery code: MIT. Packs: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), credited to their authors. Fonts: SIL OFL 1.1.

Shellby is an independent open-source project, not affiliated with or endorsed by Anthropic.
