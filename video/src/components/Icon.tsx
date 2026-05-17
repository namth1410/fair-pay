import React from "react";

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
};

const wrap = (children: React.ReactNode, props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width={props.size ?? 24}
    height={props.size ?? 24}
    fill="none"
    stroke={props.color ?? "currentColor"}
    strokeWidth={props.strokeWidth ?? 2}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={props.style}
  >
    {children}
  </svg>
);

export const CheckIcon: React.FC<IconProps> = (p) =>
  wrap(<polyline points="20 6 9 17 4 12" />, p);

export const BoltIcon: React.FC<IconProps> = (p) =>
  wrap(
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill={p.color ?? "currentColor"} />,
    { ...p, strokeWidth: 0 },
  );

export const PlayIcon: React.FC<IconProps> = (p) =>
  wrap(
    <polygon points="6 3 20 12 6 21 6 3" fill={p.color ?? "currentColor"} />,
    { ...p, strokeWidth: 0 },
  );

export const GiftIcon: React.FC<IconProps> = (p) =>
  wrap(
    <>
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </>,
    p,
  );

export const ShieldIcon: React.FC<IconProps> = (p) =>
  wrap(
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </>,
    p,
  );

export const GlobeIcon: React.FC<IconProps> = (p) =>
  wrap(
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>,
    p,
  );

export const ArrowRightIcon: React.FC<IconProps> = (p) =>
  wrap(
    <>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </>,
    p,
  );

export const PinIcon: React.FC<IconProps> = (p) =>
  wrap(
    <>
      <path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </>,
    p,
  );
