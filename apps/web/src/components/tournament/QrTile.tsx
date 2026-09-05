"use client";
import { QRCodeSVG } from "qrcode.react";

interface QrTileProps {
  /** The public tournament URL to encode as a QR code. */
  value: string;
  /** Size in pixels of the QR code itself (not including white quiet-zone padding). @defaultValue 180 */
  size?: number;
}

/**
 * QrTile — renders a tournament URL as a QR code inside a white-padded tile.
 *
 * QR codes require a light "quiet zone" to be scannable on dark backgrounds.
 * The outer tile uses the brand surface; the inner white box provides the
 * mandatory quiet zone.
 */
export function QrTile({ value, size = 180 }: QrTileProps) {
  return (
    <a
      href={value}
      aria-label="Open tournament join page"
      className="violet-accent inline-block rounded-xl bg-surface-container p-4"
      data-testid="join-qr"
    >
      <div
        className="rounded-lg bg-white p-4"
        role="img"
        aria-label="Tournament join QR — scan to open GGG and join with a wallet"
      >
        <QRCodeSVG value={value} size={size} level="M" />
      </div>
    </a>
  );
}
