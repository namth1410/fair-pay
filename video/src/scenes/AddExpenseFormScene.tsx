import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { COLOR, FONT, GROUP_NAME, MEMBERS } from "../theme";
import { bounceSpring, sceneOpacity, fadeIn } from "../utils";
import { CheckIcon } from "../components/Icon";

// SQUARE photo anchor — receipt thumbnail keeps coffee.jpg 1:1 aspect ratio
export const FORM_PHOTO_ANCHOR = {
  centerX: 540,
  centerY: 480,
  width: 480,
  height: 480,
  borderRadius: 32,
};

const PAYER_ID = "quyet";
const AMOUNT_TEXT = "240.000";
const TITLE = "Coffee đèo Mã Pí Lèng";

export const AddExpenseFormScene: React.FC<{
  duration: number;
  showOwnPhoto?: boolean;
}> = ({ duration, showOwnPhoto = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = sceneOpacity(frame, duration, 14, 18);

  // Reveal schedule — spread earlier so the final "ready to read" state holds longer
  const headerOp = fadeIn(frame - 4, 12);
  const photoSlotOp = fadeIn(frame - 16, 14);
  const titleOp = fadeIn(frame - 30, 14);
  const amountOp = fadeIn(frame - 42, 14);
  const payerOp = fadeIn(frame - 68, 14);
  const splitOp = fadeIn(frame - 94, 14);

  const amountCharCount = Math.floor(
    interpolate(frame, [42, 58], [0, AMOUNT_TEXT.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  const memberSprDelay = 100;

  return (
    <AbsoluteFill style={{ background: COLOR.bg, opacity }}>
      {/* Header */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 100,
          padding: "0 60px",
          opacity: headerOp,
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: 30,
            fontWeight: 500,
            color: COLOR.muted,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Thêm khoản chi mới
        </div>
        <div
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontFamily: FONT,
            fontSize: 38,
            fontWeight: 700,
            color: COLOR.primary,
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: COLOR.success,
              boxShadow: `0 0 0 4px ${COLOR.successBg}`,
            }}
          />
          Nhóm <span style={{ fontWeight: 800 }}>{GROUP_NAME}</span>
        </div>
      </div>

      {/* Square receipt photo slot (Composition draws the actual photo on top) */}
      {showOwnPhoto && (
        <div
          style={{
            position: "absolute",
            left: FORM_PHOTO_ANCHOR.centerX - FORM_PHOTO_ANCHOR.width / 2,
            top: FORM_PHOTO_ANCHOR.centerY - FORM_PHOTO_ANCHOR.height / 2,
            width: FORM_PHOTO_ANCHOR.width,
            height: FORM_PHOTO_ANCHOR.height,
            borderRadius: FORM_PHOTO_ANCHOR.borderRadius,
            background: COLOR.border,
            opacity: photoSlotOp,
            boxShadow: "0 12px 32px rgba(11,11,15,0.13)",
          }}
        />
      )}

      {/* Photo attached pill */}
      <div
        style={{
          position: "absolute",
          left: FORM_PHOTO_ANCHOR.centerX - FORM_PHOTO_ANCHOR.width / 2,
          top: FORM_PHOTO_ANCHOR.centerY + FORM_PHOTO_ANCHOR.height / 2 + 20,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 18px",
          background: COLOR.successBg,
          borderRadius: 9999,
          fontFamily: FONT,
          fontSize: 26,
          fontWeight: 600,
          color: COLOR.success,
          opacity: photoSlotOp,
        }}
      >
        <CheckIcon size={22} color={COLOR.success} strokeWidth={3} />
        Ảnh hóa đơn đã đính kèm
      </div>

      {/* Form fields */}
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 60,
          top: 1080,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Title */}
        <div
          style={{
            background: COLOR.white,
            borderRadius: 20,
            border: `1.5px solid ${COLOR.border}`,
            padding: "20px 28px",
            opacity: titleOp,
          }}
        >
          <div
            style={{
              fontFamily: FONT,
              fontSize: 22,
              fontWeight: 500,
              color: COLOR.muted,
              marginBottom: 6,
            }}
          >
            Tên khoản chi
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 42,
              fontWeight: 600,
              color: COLOR.primary,
            }}
          >
            {TITLE}
          </div>
        </div>

        {/* Amount */}
        <div
          style={{
            background: COLOR.white,
            borderRadius: 20,
            border: `2.5px solid ${COLOR.primary}`,
            padding: "20px 28px",
            opacity: amountOp,
          }}
        >
          <div
            style={{
              fontFamily: FONT,
              fontSize: 22,
              fontWeight: 500,
              color: COLOR.muted,
              marginBottom: 6,
            }}
          >
            Số tiền (VND)
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 76,
              fontWeight: 800,
              color: COLOR.primary,
              letterSpacing: -2,
              minHeight: 84,
            }}
          >
            {AMOUNT_TEXT.slice(0, amountCharCount)}
            {amountCharCount < AMOUNT_TEXT.length && (
              <span style={{ color: COLOR.success, opacity: Math.floor(frame / 4) % 2 ? 1 : 0 }}>
                |
              </span>
            )}
          </div>
        </div>

        {/* Payer row */}
        <div style={{ opacity: payerOp }}>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 26,
              fontWeight: 600,
              color: COLOR.primary,
              marginBottom: 14,
            }}
          >
            Người trả
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {MEMBERS.map((m) => {
              const isPayer = m.id === PAYER_ID;
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 22px",
                    borderRadius: 9999,
                    background: isPayer ? COLOR.primary : COLOR.white,
                    border: `1.5px solid ${isPayer ? COLOR.primary : COLOR.border}`,
                    fontFamily: FONT,
                    fontSize: 28,
                    fontWeight: 600,
                    color: isPayer ? COLOR.white : COLOR.primary,
                  }}
                >
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: isPayer ? COLOR.white : m.bg,
                      color: isPayer ? COLOR.primary : m.fg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      fontWeight: 700,
                    }}
                  >
                    {m.initial}
                  </span>
                  {m.label}
                </div>
              );
            })}
          </div>
        </div>

        {/* Split row */}
        <div style={{ opacity: splitOp }}>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 26,
              fontWeight: 600,
              color: COLOR.primary,
              marginBottom: 14,
            }}
          >
            Chia đều — {MEMBERS.length} người
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {MEMBERS.map((m, i) => {
              const spr = bounceSpring({
                frame,
                fps,
                delay: memberSprDelay + i * 4,
                damping: 12,
                mass: 0.5,
              });
              return (
                <div
                  key={m.id}
                  style={{
                    flex: 1,
                    background: COLOR.white,
                    borderRadius: 20,
                    border: `1.5px solid ${COLOR.border}`,
                    padding: "20px 16px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                    transform: `scale(${spr})`,
                    opacity: spr,
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      background: m.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: FONT,
                      fontWeight: 700,
                      fontSize: 24,
                      color: m.fg,
                    }}
                  >
                    {m.initial}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT,
                      fontSize: 22,
                      fontWeight: 600,
                      color: COLOR.primary,
                    }}
                  >
                    {m.label}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT,
                      fontSize: 22,
                      fontWeight: 700,
                      color: COLOR.success,
                    }}
                  >
                    60.000đ
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
