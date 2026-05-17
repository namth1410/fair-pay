import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { COLOR, FONT } from "../theme";
import { bounceSpring, sceneOpacity, fadeIn } from "../utils";

type Row = {
  date: string;
  item: string;
  amount: string;
  payer: string;
};

const ROWS: Row[] = [
  { date: "Tối T5", item: "Xe khách HN → HG", amount: "600.000", payer: "Nam" },
  { date: "T6 sáng", item: "Xe khách HG → Đồng Văn", amount: "300.000", payer: "Thu" },
  { date: "T6", item: "Homestay Serenity VIP 4", amount: "1.500.000", payer: "Quyết" },
  { date: "T6", item: "Thuê xe máy + xăng", amount: "510.000", payer: "Tâm" },
  { date: "T6 trưa", item: "Ăn ở Lô Lô Chải", amount: "80.000", payer: "?" },
  { date: "T6 tối", item: "Lẩu gà đen Đồng Văn", amount: "?", payer: "?" },
  { date: "T7 sáng", item: "Coffee đèo Mã Pí Lèng", amount: "?", payer: "?" },
];

export const ExcelPainpointScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = sceneOpacity(frame, duration, 10, 18);

  const sheetSpr = bounceSpring({ frame, fps, delay: 0, damping: 13, mass: 0.7 });
  const sheetScale = interpolate(sheetSpr, [0, 1], [0.92, 1]);

  // Shake when stressed (right before the X crosses out)
  const shake = interpolate(frame, [50, 75], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shakeX = Math.sin(frame * 1.1) * 4 * shake;
  const shakeRot = Math.sin(frame * 0.9) * 0.4 * shake;

  // After the X is drawn, settle the sheet back without shake but tilted slightly
  const settleShake = interpolate(frame, [75, 95], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Red X scribble draws across the sheet
  const xProgress = interpolate(frame, [48, 78], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "Bỏ Sheet đi." appears earlier so user has time to read
  const overlaySpr = bounceSpring({ frame, fps, delay: 70, damping: 12, mass: 0.6 });
  const overlayLift = interpolate(overlaySpr, [0, 1], [40, 0]);

  return (
    <AbsoluteFill style={{ background: COLOR.bg, opacity }}>
      {/* Sheet wrapper */}
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 180,
          width: 960,
          transform: `scale(${sheetScale}) rotate(${-1.2 + shakeRot * settleShake}deg) translateX(${shakeX * settleShake}px)`,
          transformOrigin: "center top",
          opacity: sheetSpr,
        }}
      >
        {/* Tab header — looks like Google Sheet */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 20px",
            background: COLOR.white,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            borderBottom: `1px solid ${COLOR.sheetGridLine}`,
            fontFamily: FONT,
            fontSize: 26,
            fontWeight: 600,
            color: COLOR.primary,
          }}
        >
          <span style={{ fontSize: 24 }}>📊</span>
          <span>PLAN HÀ GIANG 3N4Đ</span>
          <span style={{ marginLeft: "auto", fontSize: 22, color: COLOR.muted, fontWeight: 400 }}>
            Google Sheets
          </span>
        </div>

        {/* Column header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr 200px 140px",
            background: COLOR.sheetHeaderYellow,
            borderBottom: `1px solid ${COLOR.sheetGridLine}`,
            fontFamily: FONT,
            fontSize: 22,
            fontWeight: 700,
            color: COLOR.primary,
          }}
        >
          {["NGÀY", "LỊCH TRÌNH", "CHI PHÍ", "AI TRẢ"].map((h, i) => (
            <div
              key={h}
              style={{
                padding: "16px 18px",
                borderRight: i < 3 ? `1px solid ${COLOR.sheetGridLine}` : undefined,
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {ROWS.map((r, i) => {
          const rowReveal = fadeIn(frame - (4 + i * 3), 8);
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "180px 1fr 200px 140px",
                background: i % 2 === 0 ? COLOR.white : COLOR.sheetRowGray,
                borderBottom: `1px solid ${COLOR.sheetGridLine}`,
                fontFamily: FONT,
                fontSize: 22,
                fontWeight: 500,
                color: r.amount === "?" ? COLOR.danger : COLOR.primary,
                opacity: rowReveal,
              }}
            >
              {[r.date, r.item, r.amount === "?" ? "??? đ" : r.amount + "đ", r.payer].map(
                (c, j) => (
                  <div
                    key={j}
                    style={{
                      padding: "14px 18px",
                      borderRight: j < 3 ? `1px solid ${COLOR.sheetGridLine}` : undefined,
                      fontWeight: j === 2 || j === 3 ? 600 : 500,
                      color: j === 3 && c === "?" ? COLOR.danger : undefined,
                    }}
                  >
                    {c}
                  </div>
                ),
              )}
            </div>
          );
        })}
      </div>

      {/* Hand-drawn red X scribble overlay */}
      <svg
        viewBox="0 0 1080 1920"
        width={1080}
        height={1920}
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
      >
        <defs>
          <filter id="rough">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" />
            <feDisplacementMap in="SourceGraphic" scale="3" />
          </filter>
        </defs>
        <line
          x1={120}
          y1={280}
          x2={120 + 880 * xProgress}
          y2={280 + 1000 * xProgress}
          stroke={COLOR.danger}
          strokeWidth={20}
          strokeLinecap="round"
          opacity={0.78}
          filter="url(#rough)"
        />
        <line
          x1={1000}
          y1={280}
          x2={1000 - 880 * Math.max(0, xProgress - 0.2)}
          y2={280 + 1000 * Math.max(0, xProgress - 0.2)}
          stroke={COLOR.danger}
          strokeWidth={20}
          strokeLinecap="round"
          opacity={0.78}
          filter="url(#rough)"
        />
      </svg>

      {/* "Bỏ Sheet đi." headline + tagline (more time to read with extended duration) */}
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 1470,
          width: 900,
          opacity: fadeIn(frame - 70, 14),
          transform: `translateY(${overlayLift}px)`,
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: 180,
            fontWeight: 800,
            color: COLOR.primary,
            letterSpacing: -7,
            lineHeight: 0.95,
          }}
        >
          Bỏ Sheet đi.
        </div>
        <div
          style={{
            marginTop: 30,
            fontFamily: FONT,
            fontSize: 40,
            fontWeight: 500,
            color: COLOR.secondary,
            lineHeight: 1.3,
          }}
        >
          Hết tour, ai còn nhớ tiêu gì ở đâu?
        </div>
      </div>
    </AbsoluteFill>
  );
};
