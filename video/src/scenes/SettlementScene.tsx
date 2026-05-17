import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { COLOR, FONT, MEMBERS } from "../theme";
import { bounceSpring, sceneOpacity, fadeIn } from "../utils";
import { Avatar } from "../components/Avatar";

const POSITIONS: Record<string, { x: number; y: number }> = {
  nam: { x: 200, y: 880 },
  thu: { x: 740, y: 880 },
  quyet: { x: 200, y: 1380 },
  tam: { x: 740, y: 1380 },
};

const AVATAR_SIZE = 140;

// Settlement for 6-expense Hà Giang trip (total 3.200.000đ, 800k/người):
// - Nam đã trả 680k → còn nợ 120k
// - Thu đã trả 80k → còn nợ 720k
// - Quyết đã trả 840k → được nhận 40k
// - Tâm đã trả 1.600.000đ → được nhận 800k
// Greedy minimum: 3 transfers
const FINAL_ARROWS = [
  { from: "thu", to: "tam", amount: "720.000đ" },
  { from: "nam", to: "tam", amount: "80.000đ" },
  { from: "nam", to: "quyet", amount: "40.000đ" },
];

// Before state: all-to-all messy lines (n*(n-1)/2 = 6 connections)
const ALL_PAIRS = [
  ["nam", "thu"],
  ["nam", "quyet"],
  ["nam", "tam"],
  ["thu", "quyet"],
  ["thu", "tam"],
  ["quyet", "tam"],
];

const avatarCenter = (id: string) => ({
  x: POSITIONS[id].x + AVATAR_SIZE / 2,
  y: POSITIONS[id].y + AVATAR_SIZE / 2,
});

const Arrow: React.FC<{
  from: string;
  to: string;
  color: string;
  thickness?: number;
  progress: number;
}> = ({ from, to, color, thickness = 8, progress }) => {
  const a = avatarCenter(from);
  const b = avatarCenter(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const visible = len * progress;
  const startGap = 70;
  const endGap = 80;
  const trim = startGap + endGap;
  if (visible <= startGap) return null;
  const shaftWidth = Math.max(0, visible - trim);
  return (
    <div
      style={{
        position: "absolute",
        left: a.x,
        top: a.y - thickness / 2,
        width: visible - startGap,
        height: thickness,
        transformOrigin: "left center",
        transform: `rotate(${angle}deg) translateX(${startGap}px)`,
      }}
    >
      <div style={{ width: shaftWidth, height: thickness, background: color, borderRadius: thickness / 2 }} />
      {progress > 0.9 && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: -thickness * 2,
            width: 0,
            height: 0,
            borderTop: `${thickness * 2.5}px solid transparent`,
            borderBottom: `${thickness * 2.5}px solid transparent`,
            borderLeft: `${thickness * 3.2}px solid ${color}`,
          }}
        />
      )}
    </div>
  );
};

export const SettlementScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = sceneOpacity(frame, duration, 14, 18);

  // ----- PHASE 1 (frame 0-64): Chaos "Khỏi cần." with 6 messy red arrows -----
  const chaosIn = fadeIn(frame - 4, 14);
  const chaosOut = interpolate(frame, [50, 68], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const chaosOpacity = chaosIn * chaosOut;

  const shake = interpolate(frame, [10, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const titleChaosOp = interpolate(frame, [4, 24, 50, 68], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleChaosY = interpolate(frame, [4, 24], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ----- PHASE 2 (frame 64+): Clean reveal "App tự tính." -----
  const titleCleanOp = fadeIn(frame - 64, 14);
  const titleCleanY = interpolate(frame, [64, 82], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 3 clean arrows draw one after another (slower, easier to follow)
  const cleanArrowProgress = [0, 1, 2].map((i) =>
    interpolate(frame, [78 + i * 10, 102 + i * 10], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  const cleanOpacity = fadeIn(frame - 64, 14);

  const avatarOrder = ["nam", "thu", "quyet", "tam"];

  return (
    <AbsoluteFill style={{ background: COLOR.bg, opacity }}>
      {/* PHASE 1 title — "Mở Sheet ra tính tay? Khỏi cần." */}
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 200,
          width: 900,
          opacity: titleChaosOp,
          transform: `translateY(${titleChaosY}px)`,
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: 46,
            fontWeight: 500,
            color: COLOR.danger,
            textDecoration: "line-through",
          }}
        >
          Mở Sheet ra tính tay?
        </div>
        <div
          style={{
            marginTop: 16,
            fontFamily: FONT,
            fontSize: 140,
            fontWeight: 800,
            color: COLOR.primary,
            letterSpacing: -6,
            lineHeight: 1,
          }}
        >
          Khỏi cần.
        </div>
      </div>

      {/* PHASE 2 title — "App tự tính." */}
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 200,
          width: 900,
          opacity: titleCleanOp,
          transform: `translateY(${titleCleanY}px)`,
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: 140,
            fontWeight: 800,
            color: COLOR.primary,
            letterSpacing: -6,
            lineHeight: 1,
          }}
        >
          App tự tính.
        </div>
        <div
          style={{
            marginTop: 22,
            fontFamily: FONT,
            fontSize: 38,
            fontWeight: 500,
            color: COLOR.secondary,
            lineHeight: 1.3,
          }}
        >
          Gợi ý ai trả ai — ít chuyển khoản nhất.
        </div>
      </div>

      {/* Avatars */}
      {MEMBERS.map((m) => {
        const spr = bounceSpring({
          frame,
          fps,
          delay: 8 + avatarOrder.indexOf(m.id) * 4,
          damping: 12,
          mass: 0.55,
        });
        const pos = POSITIONS[m.id];
        const isHub = m.id === "quyet" || m.id === "tam";
        const hubBoost = isHub
          ? 1 +
            0.06 *
              Math.sin(
                interpolate(frame, [82, duration], [0, Math.PI * 4], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              )
          : 1;
        return (
          <div
            key={m.id}
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              width: AVATAR_SIZE,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              transform: `scale(${spr * hubBoost})`,
              opacity: spr,
            }}
          >
            <div style={{ position: "relative" }}>
              {isHub && (
                <div
                  style={{
                    position: "absolute",
                    inset: -16,
                    borderRadius: "50%",
                    background: COLOR.successBg,
                    opacity: cleanOpacity * 0.8,
                  }}
                />
              )}
              <div style={{ position: "relative" }}>
                <Avatar initial={m.initial} size={AVATAR_SIZE} bg={m.bg} fg={m.fg} />
              </div>
            </div>
            <div
              style={{
                fontFamily: FONT,
                fontSize: 30,
                fontWeight: 700,
                color: COLOR.primary,
              }}
            >
              {m.label}
            </div>
            {isHub && (
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: 22,
                  fontWeight: 600,
                  color: COLOR.success,
                  opacity: cleanOpacity,
                }}
              >
                nhận
              </div>
            )}
          </div>
        );
      })}

      {/* PHASE 1 chaos arrows */}
      <div style={{ position: "absolute", inset: 0, opacity: chaosOpacity }}>
        {ALL_PAIRS.map(([from, to], i) => {
          const shakeX = Math.sin(frame * 0.6 + i) * 6 * shake;
          const shakeY = Math.cos(frame * 0.7 + i) * 6 * shake;
          return (
            <div
              key={`${from}-${to}`}
              style={{
                position: "absolute",
                transform: `translate(${shakeX}px, ${shakeY}px)`,
              }}
            >
              <Arrow from={from} to={to} color={COLOR.danger} thickness={5} progress={1} />
            </div>
          );
        })}
      </div>

      {/* PHASE 2 clean arrows */}
      {FINAL_ARROWS.map((a, i) => (
        <Arrow
          key={`${a.from}-${a.to}`}
          from={a.from}
          to={a.to}
          color={COLOR.primary}
          thickness={10}
          progress={cleanArrowProgress[i]}
        />
      ))}

      {/* Amount pills */}
      {FINAL_ARROWS.map((a, i) => {
        const op = fadeIn(frame - (102 + i * 10), 14);
        const from = avatarCenter(a.from);
        const to = avatarCenter(a.to);
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        return (
          <div
            key={`pill-${a.from}-${a.to}`}
            style={{
              position: "absolute",
              left: midX - 100,
              top: midY - 32,
              width: 200,
              height: 64,
              borderRadius: 9999,
              background: COLOR.white,
              border: `2px solid ${COLOR.primary}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: FONT,
              fontSize: 32,
              fontWeight: 700,
              color: COLOR.primary,
              opacity: op,
              boxShadow: "0 4px 12px rgba(11,11,15,0.08)",
            }}
          >
            {a.amount}
          </div>
        );
      })}

      {/* Bottom caption */}
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 60,
          bottom: 130,
          padding: "24px 32px",
          background: COLOR.white,
          borderRadius: 24,
          border: `1.5px solid ${COLOR.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: FONT,
          opacity: fadeIn(frame - 138, 14),
        }}
      >
        <div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 500,
              color: COLOR.muted,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Tổng chuyến
          </div>
          <div style={{ fontSize: 38, fontWeight: 700, color: COLOR.primary, marginTop: 4 }}>
            3 lần chuyển — gọn nhất
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            background: COLOR.successBg,
            borderRadius: 9999,
            color: COLOR.success,
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          Tự động
        </div>
      </div>
    </AbsoluteFill>
  );
};
