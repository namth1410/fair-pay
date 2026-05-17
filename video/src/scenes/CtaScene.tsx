import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { COLOR, FONT } from "../theme";
import { bounceSpring, sceneOpacity, fadeIn } from "../utils";
import { AppIcon } from "../components/AppIcon";
import { GiftIcon, ShieldIcon, GlobeIcon, PlayIcon } from "../components/Icon";

const BADGES: { icon: React.ComponentType<{ size?: number; color?: string }>; text: string; color: string }[] = [
  { icon: GiftIcon, text: "Miễn phí", color: COLOR.success },
  { icon: ShieldIcon, text: "Không quảng cáo", color: COLOR.primary },
  { icon: GlobeIcon, text: "Tiếng Việt", color: COLOR.danger },
];

export const CtaScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = sceneOpacity(frame, duration, 16, 22);

  const titleSpr = bounceSpring({ frame, fps, delay: 0, damping: 12, mass: 0.65 });
  const titleY = interpolate(titleSpr, [0, 1], [50, 0]);

  const subOp = fadeIn(frame - 14, 16);

  const iconSpr = bounceSpring({ frame, fps, delay: 42, damping: 10, mass: 0.6 });
  const iconLift = interpolate(frame, [44, duration], [0, -8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const callOp = fadeIn(frame - 80, 16);
  const callY = interpolate(frame, [80, 100], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const playSpr = bounceSpring({ frame, fps, delay: 102, damping: 13, mass: 0.7 });
  const playY = interpolate(playSpr, [0, 1], [30, 0]);

  const footOp = fadeIn(frame - 124, 16);

  // Continuous pulse on Play badge to draw attention during the long hold
  const pulse =
    1 +
    0.04 *
      Math.sin(
        interpolate(frame, [108, duration], [0, Math.PI * 6], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      );

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${COLOR.mintLight} 0%, ${COLOR.white} 55%, ${COLOR.white} 100%)`,
        opacity,
      }}
    >
      {/* Title */}
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 160,
          width: 900,
          textAlign: "center",
          fontFamily: FONT,
          fontSize: 200,
          fontWeight: 800,
          color: COLOR.primary,
          letterSpacing: -8,
          lineHeight: 1,
          transform: `translateY(${titleY}px)`,
          opacity: titleSpr,
        }}
      >
        Fair Pay
      </div>
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 400,
          width: 900,
          textAlign: "center",
          fontFamily: FONT,
          fontSize: 36,
          fontWeight: 400,
          color: COLOR.secondary,
          opacity: subOp,
        }}
      >
        Chia tiền nhóm — nhanh, gọn, công bằng.
      </div>

      {/* Badges */}
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 520,
          width: 960,
          display: "flex",
          justifyContent: "center",
          gap: 16,
        }}
      >
        {BADGES.map((b, i) => {
          const spr = bounceSpring({ frame, fps, delay: 22 + i * 8, damping: 12, mass: 0.5 });
          return (
            <div
              key={b.text}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 20px",
                borderRadius: 9999,
                background: COLOR.white,
                border: `1.5px solid ${COLOR.border}`,
                transform: `scale(${spr})`,
                opacity: spr,
              }}
            >
              <b.icon size={28} color={b.color} />
              <span style={{ fontFamily: FONT, fontSize: 28, fontWeight: 600, color: COLOR.primary }}>
                {b.text}
              </span>
            </div>
          );
        })}
      </div>

      {/* App icon */}
      <div
        style={{
          position: "absolute",
          left: 540 - 160,
          top: 740,
          transform: `scale(${iconSpr}) translateY(${iconLift}px)`,
        }}
      >
        <AppIcon size={320} radius={72} />
      </div>

      {/* CTA call */}
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 1140,
          width: 900,
          textAlign: "center",
          fontFamily: FONT,
          fontSize: 72,
          fontWeight: 700,
          color: COLOR.primary,
          opacity: callOp,
          transform: `translateY(${callY}px)`,
        }}
      >
        Tải về ngay
      </div>

      {/* Play Store badge */}
      <div
        style={{
          position: "absolute",
          left: 200,
          top: 1290,
          width: 680,
          height: 140,
          borderRadius: 28,
          background: COLOR.primary,
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "20px 32px",
          boxShadow: "0 12px 32px rgba(11,11,15,0.33)",
          transform: `translateY(${playY}px) scale(${pulse})`,
          opacity: playSpr,
        }}
      >
        <PlayIcon size={70} color={COLOR.white} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 22,
              fontWeight: 500,
              color: COLOR.white,
              letterSpacing: 2,
            }}
          >
            TẢI XUỐNG TRÊN
          </div>
          <div style={{ fontFamily: FONT, fontSize: 50, fontWeight: 700, color: COLOR.white }}>
            Google Play
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 1500,
          width: 900,
          textAlign: "center",
          fontFamily: FONT,
          fontSize: 22,
          fontWeight: 400,
          color: COLOR.muted,
          opacity: footOp,
        }}
      >
        play.google.com/store/apps/details?id=com.cyclone.fairpay
      </div>
    </AbsoluteFill>
  );
};
