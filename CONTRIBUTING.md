# Submitting a pack to the Shellby Wardrobe

Thanks for dressing up the crab! 🦀

## 1. Make it
- Open **[Pack Studio](https://getshellby.com/community/studio/)**, start from the template, and draw. Shellby wears it live, and the checker uses the same validator as the app.
- The full format reference (slots, anchors, pivots, effects, colors) is in Shellby's [creator guide](https://github.com/x-salmon/shellby/blob/main/docs/ADDONS.md).
- Test it in Shellby itself: drop the `.json` onto the Wardrobe.

## 2. Submit it
1. Fork this repo.
2. Add `packs/<your-pack-id>/pack.json`. The folder name **must** equal the pack's `"id"`.
3. Optionally add `packs/<your-pack-id>/README.md` (Markdown, up to 20 KB) describing the pack.
4. Open a pull request. The **Pack check** runs automatically and reports any problems in plain English.

## 3. Show it off

When your pack is merged, a bot comments on your PR with:

- a link to your pack's page in the gallery
- a ready-made picture of Shellby wearing your pack (it's also the preview image whenever someone shares the link)
- one-click **Post on X** and **Post on Bluesky** links with the text filled in

**Please post it!** Every post helps people find Shellby, and your pack with it. Tag it **#ShellbyPacks** and we'll repost it. Want something more personal? In Shellby, put the pack on and press **📸 Share** in the Wardrobe for a card of your own crab with your trophies.

## 4. Updating your pack
Edit it and **bump `"version"`** (e.g. `1.0.0` → `1.1.0`). The check fails if a published pack changes without a version bump.

## Rules
- **Original art only.** No copyrighted characters, logos or brand marks.
- **Friendly.** Shellby lives on people's desktops, so nothing hateful, sexual, violent or cruel.
- **One idea per pack.** A themed set is great; a grab bag of everything is harder to browse.
- **No warnings.** The app skips invalid items and still loads the rest, but the gallery requires every item to be valid.
- **Reserved ids:** `shellby`, `official`, `core`, `builtin`, `shellby-packs`.

## License
By submitting, you agree your pack is published under **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**, credited to the `author` in your pack.
