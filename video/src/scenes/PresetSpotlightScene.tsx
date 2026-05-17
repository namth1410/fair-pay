import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { COLOR, FONT } from "../theme";
import { bounceSpring, sceneOpacity, fadeIn } from "../utils";
import { BoltIcon } from "../components/Icon";

export const PresetSpotlightScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = sceneOpacity(frame, duration, 12, 14);

  const titleSpr = bounceSpring({ frame, fps, delay: 4, damping: 14, mass: 0.6 });
  const titleY = interpolate(titleSpr, [0, 1], [60, 0]);
  const titleOp = fadeIn(frame - 4, 18);

  const sheetSpr = bounceSpring({ frame, fps, delay: 0, damping: 15, mass: 0.7 });
  const sheetY = interpolate(sheetSpr, [0, 1], [1200, 0]);

  const chipReveal = fadeIn(frame - 24, 18);
  const chipPulse =
    0.96 +
    0.04 *
      Math.sin(
        interpolate(frame, [42, duration - 20], [0, Math.PI * 4], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      );

  const tapStart = duration - 50;
  const rippleProgress = interpolate(frame, [tapStart, duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: COLOR.bg, opacity }}>
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 160,
          width: 900,
          opacity: titleOp,
          transform: `translateY(${titleY}px)`,
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: 200,
            fontWeight: 800,
            color: COLOR.primary,
            letterSpacing: -8,
            lineHeight: 1,
          }}
        >
          1 chạm.
        </div>
        <div
          style={{
            marginTop: 38,
            fontFamily: FONT,
            fontSize: 38,
            fontWeight: 500,
            color: COLOR.secondary,
          }}
        >
          Khoản chi mới — đã có sẵn.
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 60,
          top: 680,
          width: 960,
          height: 1180,
          borderRadius: 48,
          background: COLOR.white,
          boxShadow: "0 -12px 60px rgba(11,11,15,0.13)",
          padding: "36px 44px",
          transform: `translateY(${sheetY}px)`,
          opacity: sheetSpr,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <div style={{ width: 96, height: 6, borderRadius: 3, background: "#D1D5DB" }} />
        </div>

        <div
          style={{
            fontFamily: FONT,
            fontSize: 54,
            fontWeight: 700,
            color: COLOR.primary,
            marginBottom: 24,
          }}
        >
          Thêm khoản chi mới
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 30,
            fontWeight: 500,
            color: COLOR.secondary,
            marginBottom: 28,
          }}
        >
          Preset
        </div>

        <div style={{ display: "flex", gap: 20, height: 260 }}>
          <div
            style={{
              flex: 1,
              borderRadius: 28,
              background: COLOR.white,
              border: `5px solid ${COLOR.primary}`,
              padding: 28,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              boxShadow: `0 0 0 12px rgba(11,11,15,0.07), 0 0 48px rgba(11,11,15,0.13)`,
              transform: `scale(${chipPulse})`,
              opacity: chipReveal,
            }}
          >
            <div style={{ fontFamily: FONT, fontSize: 54, fontWeight: 700, color: COLOR.primary }}>
              Ăn trưa
            </div>
            <div style={{ fontFamily: FONT, fontSize: 38, fontWeight: 500, color: COLOR.secondary }}>
              35.000đ
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                width: "fit-content",
                padding: "8px 16px",
                borderRadius: 9999,
                background: COLOR.primary,
              }}
            >
              <BoltIcon size={22} color={COLOR.white} />
              <span style={{ fontFamily: FONT, fontSize: 24, fontWeight: 600, color: COLOR.white }}>
                1-tap
              </span>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              borderRadius: 28,
              background: COLOR.white,
              border: `1.5px solid ${COLOR.border}`,
              padding: 28,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              opacity: chipReveal * 0.5,
            }}
          >
            <div style={{ fontFamily: FONT, fontSize: 54, fontWeight: 700, color: COLOR.primary }}>
              Aa
            </div>
            <div style={{ fontFamily: FONT, fontSize: 38, fontWeight: 500, color: COLOR.secondary }}>
              440.000đ
            </div>
          </div>
        </div>
      </div>

      {/* Tap ripples - emanate from chip center near end of scene */}
      {[0, 1, 2].map((i) => {
        const localStart = i * 8;
        const p = interpolate(frame, [tapStart + localStart, duration], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const scale = 0.3 + p * 1.4;
        const ringOpacity = (1 - p) * (rippleProgress > 0 ? 0.6 : 0);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 260,
              top: 1180,
              width: 280,
              height: 280,
              borderRadius: "50%",
              border: `6px solid ${COLOR.primary}`,
              transform: `scale(${scale})`,
              opacity: ringOpacity,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
