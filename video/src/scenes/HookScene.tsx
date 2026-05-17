import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { COLOR, FONT } from "../theme";
import { bounceSpring, sceneOpacity } from "../utils";

type Bubble = {
  text: string;
  x: number;
  y: number;
  rot: number;
  delay: number;
  scale: number;
  bg: string;
  fg: string;
};

const BUBBLES: Bubble[] = [
  { text: "Tiền lẩu gà đen ai trả?", x: 70, y: 320, rot: -6, delay: 4, scale: 1, bg: COLOR.white, fg: COLOR.primary },
  { text: "Tiền coffee đèo là bao nhiêu?", x: 110, y: 760, rot: 4, delay: 14, scale: 1.05, bg: COLOR.dangerBg, fg: COLOR.danger },
  { text: "Ôi quên mất rồi 😭", x: 460, y: 1180, rot: -8, delay: 24, scale: 1.1, bg: COLOR.cardLavender, fg: COLOR.primary },
  { text: "Link Google Sheet đâu?", x: 120, y: 1560, rot: 5, delay: 34, scale: 1, bg: COLOR.cardPeach, fg: COLOR.primary },
];

export const HookScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = sceneOpacity(frame, duration, 8, 18);

  const shake = interpolate(frame, [55, 85], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: COLOR.primary, opacity }}>
      {BUBBLES.map((b, i) => {
        const spr = bounceSpring({ frame, fps, delay: b.delay, damping: 10, mass: 0.45 });
        const shakeX = Math.sin(frame * 0.8 + i) * 4 * shake;
        const shakeY = Math.cos(frame * 0.7 + i * 1.4) * 3 * shake;
        const exitOut = interpolate(frame, [duration - 30, duration - 5], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const dy = exitOut * 80;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: b.x + shakeX,
              top: b.y + shakeY + dy,
              transform: `rotate(${b.rot}deg) scale(${spr * b.scale})`,
              transformOrigin: "center",
              padding: "30px 44px",
              borderRadius: 40,
              background: b.bg,
              color: b.fg,
              fontFamily: FONT,
              fontSize: 56,
              fontWeight: 600,
              letterSpacing: -0.5,
              boxShadow: "0 14px 36px rgba(0,0,0,0.22)",
              maxWidth: 820,
              opacity: 1 - exitOut * 0.9,
            }}
          >
            {b.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
