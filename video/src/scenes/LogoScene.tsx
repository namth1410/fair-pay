import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { COLOR, FONT } from "../theme";
import { bounceSpring, fadeIn, sceneOpacity } from "../utils";
import { AppIcon } from "../components/AppIcon";

const TITLE = "Fair Pay";
const TAGLINE = "Chia tiền nhóm — nhanh, gọn, công bằng.";

export const LogoScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = sceneOpacity(frame, duration, 10, 14);

  const iconScale = bounceSpring({ frame, fps, delay: 0, damping: 9, mass: 0.55 });
  const iconLift = interpolate(frame, [0, duration], [0, -12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const titleCharsToShow = Math.floor(
    interpolate(frame, [10, 40], [0, TITLE.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const visibleTitle = TITLE.slice(0, titleCharsToShow);

  const taglineOpacity = fadeIn(frame - 30, 18);
  const taglineLift = interpolate(frame - 30, [0, 24], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: COLOR.white,
        opacity,
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 72 }}>
        <div style={{ transform: `scale(${iconScale}) translateY(${iconLift}px)` }}>
          <AppIcon size={340} radius={76} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 200,
              fontWeight: 800,
              color: COLOR.primary,
              letterSpacing: -6,
              lineHeight: 1,
              minHeight: 200,
            }}
          >
            {visibleTitle}
            <span
              style={{
                opacity: titleCharsToShow < TITLE.length ? (Math.floor(frame / 4) % 2 === 0 ? 1 : 0) : 0,
                color: COLOR.mintDeep,
              }}
            >
              |
            </span>
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 42,
              fontWeight: 400,
              color: COLOR.secondary,
              textAlign: "center",
              opacity: taglineOpacity,
              transform: `translateY(${taglineLift}px)`,
            }}
          >
            {TAGLINE}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
