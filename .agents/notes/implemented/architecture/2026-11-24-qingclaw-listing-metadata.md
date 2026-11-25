# Agent Note: Declare listing metadata in the package manifest

Status: implemented

English | [中文](2026-11-24-qingclaw-listing-metadata.zh.md)

## Problem

Listing a new version silently replaced the catalog entry's curated title with the package name. The website derived `title_zh` from `params[:title_zh] || manifest["display_name"] || package name`, and the media desk package declared no display name, so approving 2.7.3 overwrote 自媒体工作台 with `@qinglion/dsh-media-desk`. Its description and category were replaced the same way, and nothing told the creator what a release must declare.

## Decision

- The release manifest owns listing metadata under `qingclaw`: `name` and `description` localization tables, with Chinese `zh` required and `en` accepted, plus `workbench.icon` and at least two `workbench.previews` package-relative image paths for a workbench. Images ship inside the package tarball, so a creator needs no write access to the website; the inspector verifies each declared file exists and stays under 2 MB.
- The website validates the shape while inspecting the tarball and refuses a listing request whose release omits them, answering `listing_metadata_required` with the missing field keys. It no longer falls back to the package name or to a previous entry's text.
- Publishing checks the same fields against the packed archive, so a release that could never be listed fails at `npm pack` time with the missing keys instead of later at the listing request. The archive cap, the registry's request limit, and the website's inspection limit stay at 100 MB.
- The workbench directory publishes `iconUrl` and `previews` from the approved release and keeps `previewUrl` as the first preview for older clients. Publishing extracts the declared images from the verified archive, attaches them to the release, and stores them in the website's configured object storage (COS in production), so no website-side upload step exists and the archive is not re-read per request.
- The desktop catalog parser accepts both fields, the sidebar launcher draws the declared logo, and the detail page shows every preview.
- A release may also declare up to eight `qingclaw.links`. A link is a URL, or an object naming its own title and a packaged cover for pages that serve no crawler-readable preview, such as WeChat Channels. Publishing resolves bare links on the server, restricted to public HTTPS with bounded time and bytes, and stores the cards with the release so the catalog never fetches a third-party page per request.

## Alternatives considered

**Preserve the previous entry metadata when a release declares none.** It would hide the missing declaration and let later releases inherit stale text. Rejected: the manifest must state what the release is.

**Keep `dsh.displayName` as the title source.** It is one untranslated string with no description or images, and the fields would still be split between `dsh` and `qingclaw`. Rejected in favor of one `qingclaw` block.

## Testing

Website specs pin the normalized metadata, the refusal with its missing keys, the emitted `iconUrl`/`previews`, and the archive-derived values. Desktop specs pin catalog parsing, the detail gallery, the sidebar launcher logo, and the Creator center showing the rejection message.

## Consequences

- A package must declare the fields before its next listing; a release without them is refused with the missing keys shown in Creator center.
- Existing catalog entries keep their metadata until a release declares new values.
- Images stay platform-hosted: the manifest carries paths, not bytes.
