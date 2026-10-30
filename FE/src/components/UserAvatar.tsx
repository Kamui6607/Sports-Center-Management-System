import { useState } from "react";
import { resolveAssetUrl } from "../shared/resolveAssetUrl";

export interface UserAvatarProps {
  name: string;
  url?: string | null;
  size?: number;
  className?: string;
}

export function UserAvatar({
  name,
  url,
  size = 36,
  className = "",
}: UserAvatarProps) {
  const [broken, setBroken] = useState(false);
  const resolved = resolveAssetUrl(url);

  const initial = (name || "?").trim().slice(0, 1).toUpperCase();

  if (!resolved || broken) {
    return (
      <span
        className={`user-avatar-fallback ${className}`}
        style={{
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          borderRadius: "50%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#203d31",
          color: "#b0f2b6",
          fontWeight: 700,
          fontSize: Math.max(12, Math.round(size * 0.4)),
          userSelect: "none",
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={resolved}
      alt={name || "Avatar"}
      className={`user-avatar-img ${className}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: "50%",
        objectFit: "cover",
        display: "inline-block",
        flexShrink: 0,
      }}
      onError={() => setBroken(true)}
    />
  );
}
