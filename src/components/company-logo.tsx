"use client";

import { useState } from "react";

export function CompanyLogo({
  name,
  logoUrl,
  size = 40,
}: {
  name: string;
  logoUrl?: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

  if (logoUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external logos, no optimizer in static export
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setBroken(true)}
        className="rounded-lg border border-line object-contain bg-card p-0.5"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-lg bg-brand-50 font-serif text-sm font-bold text-brand-ink"
    >
      {initials || "?"}
    </div>
  );
}
