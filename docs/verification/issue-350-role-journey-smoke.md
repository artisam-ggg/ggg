# Issue #350 — Role-journey smoke coverage

## Purpose and boundary

This record validates the public UX and onboarding surfaces added in the
post-Instawards release. It is intentionally local and deterministic: wallet
extension, authentication provider, network, npm, and GitBook interactions are
mocked or asserted as links. It neither sends nor requires a funded Testnet
transaction, and it does not replace the existing Testnet evidence.

## Automated coverage

| Persona | Entry point | Automated proof |
| --- | --- | --- |
| Developer | `homepage/index.html` | The hero **Get SDK** CTA has a descriptive accessible name and points to the canonical `@goodgameguild/escrow-sdk` npm URL. |
| Organizer | Create Tournament | Required labels, local-time/on-chain-UTC deadline help, wallet and disabled deploy boundary remain available; the organizer modal links to the organizer guide. |
| Player | Public Join Card | The player modal explains public review then Freighter authorization, links to the player guide, and renders before any app login or wallet action. |
| Referee | Public Referee Panel | The referee modal links to the referee guide; settlement remains unavailable until the configured wallet is verified, without an app-login control. |
| Keyboard user | Shared Guidelines | Triggers have contextual accessible names; the labelled dialog receives focus, traps Tab, closes with Escape or Close, and restores trigger focus. |

## Manual QA matrix

Perform this matrix against the reviewed web build before release reporting.
Use a desktop viewport of **1440 × 900** and a mobile viewport of **375 × 812**.

| Persona | Entry point | Verify at both widths |
| --- | --- | --- |
| Developer | Homepage | The SDK CTA is visible beside the app CTA, readable, keyboard reachable, and opens the canonical npm package in a new tab. |
| Organizer | Create Tournament | Compact copy leaves labels and deadline help clear; Guidelines opens without clipping; its full guide link works; no form validation is hidden. |
| Player | Public tournament | No GGG login is requested to view guidance; it distinguishes reviewing the tournament from authorizing a Freighter join. |
| Referee | Public tournament | Guidance is visible before verification; only the configured Freighter wallet reveals Settlement Console. |
| Keyboard user | Any Guidelines trigger | Tab reaches the trigger, modal focus starts on Close, Tab/Shift+Tab remain in the modal, Escape and Close dismiss it, and focus returns to the trigger. |
| Mobile user | Homepage and all modal entry points | CTA, trigger, dialog, Close control, and full-guide link remain visible without horizontal scrolling or clipped controls. |

## Expected result

All checks pass without a wallet signature, an application session, an external
HTTP request, a Testnet transaction, or a Railway change. Record any manual QA
failure with viewport, route, browser, and screenshot before release approval.
