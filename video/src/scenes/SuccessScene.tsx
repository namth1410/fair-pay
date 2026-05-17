import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { COLOR, FONT, GROUP_NAME } from "../theme";
import { bounceSpring, sceneOpacity, fadeIn } from "../utils";
import { CheckIcon } from "../components/Icon";
import { Sparkle } from "../components/Sparkle";
import { Avatar } from "../components/Avatar";

export const SuccessScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = sceneOpacity(frame, duration, 10, 14);

  const checkSpr = bounceSpring({ frame, fps, delay: 0, damping: 8, mass: 0.5 });
  const ringScale = interpolate(frame, [4, duration], [0.6, 1.05], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ringOpacity = fadeIn(frame - 2, 16);

  const titleOp = fadeIn(frame - 6, 14);
  const titleY = interpolate(frame, [6, 24], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const receiptSpr = bounceSpring({ frame, fps, delay: 18, damping: 13, mass: 0.7 });
  const receiptY = interpolate(receiptSpr, [0, 1], [200, 0]);

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
            fontSize: 220,
            fontWeight: 800,
            color: COLOR.primary,
            letterSpacing: -10,
            lineHeight: 1,
          }}
        >
          Xong.
        </div>
        <div
          style={{
            marginTop: 38,
            fontFamily: FONT,
            fontSize: 42,
            fontWeight: 500,
            color: COLOR.secondary,
          }}
        >
          Đã thêm khoản chi.
        </div>
      </div>

      {/* Outer rings */}
      {[420, 320].map((s, i) => (
        <div
          key={s}
          style={{
            position: "absolute",
            left: 540 - s / 2,
            top: 940 - s / 2,
            width: s,
            height: s,
            borderRadius: "50%",
            border: `${6 - i}px solid ${COLOR.success}`,
            opacity: ringOpacity * (0.32 - i * 0.12) * 1.6,
            transform: `scale(${ringScale})`,
          }}
        />
      ))}

      {/* Check circle */}
      <div
        style={{
          position: "absolute",
          left: 540 - 110,
          top: 940 - 110,
          width: 220,
          height: 220,
          borderRadius: "50%",
          background: COLOR.success,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 24px 48px ${COLOR.success}55`,
          transform: `scale(${checkSpr})`,
        }}
      >
        <CheckIcon size={130} color={COLOR.white} strokeWidth={3.5} />
      </div>

      {/* Sparkles */}
      <div style={{ position: "absolute", left: 300, top: 870, opacity: ringOpacity * 0.7 }}>
        <Sparkle size={54} color={COLOR.success} />
      </div>
      <div style={{ position: "absolute", left: 760, top: 920, opacity: ringOpacity * 0.65 }}>
        <Sparkle size={72} color={COLOR.success} />
      </div>
      <div style={{ position: "absolute", left: 530, top: 800, opacity: ringOpacity * 0.7 }}>
        <Sparkle size={46} color={COLOR.mintMid} />
      </div>

      {/* Receipt card */}
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 1240,
          width: 920,
          borderRadius: 32,
          background: COLOR.white,
          border: `1.5px solid ${COLOR.border}`,
          boxShadow: "0 8px 32px rgba(11,11,15,0.07)",
          padding: 44,
          display: "flex",
          flexDirection: "column",
          gap: 24,
          transform: `translateY(${receiptY}px)`,
          opacity: receiptSpr,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18 }}>
          <div style={{ fontFamily: FONT, fontSize: 48, fontWeight: 700, color: COLOR.primary, flex: 1 }}>
            Coffee đèo Mã Pí Lèng
          </div>
          <div style={{ fontFamily: FONT, fontSize: 54, fontWeight: 800, color: COLOR.primary, whiteSpace: "nowrap" }}>
            240.000đ
          </div>
        </div>
        <div style={{ height: 1.5, background: COLOR.border }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Avatar initial="Q" size={64} bg={COLOR.cardLavender} fg={COLOR.primary} />
          <div style={{ fontFamily: FONT, fontSize: 30, fontWeight: 500, color: COLOR.secondary }}>
            <strong style={{ color: COLOR.primary, fontWeight: 700 }}>Quyết</strong> đã trả · Chia đều 4 người
          </div>
        </div>
        <div style={{ height: 1.5, background: COLOR.border }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <CheckIcon size={32} color={COLOR.success} />
          <div style={{ fontFamily: FONT, fontSize: 28, fontWeight: 500, color: COLOR.success }}>
            Lưu vào nhóm {GROUP_NAME} · vừa xong
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
