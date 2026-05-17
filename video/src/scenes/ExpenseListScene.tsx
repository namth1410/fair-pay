import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import { COLOR, FONT, GROUP_NAME, MEMBERS } from "../theme";
import { bounceSpring, sceneOpacity, fadeIn } from "../utils";

type Item = {
  id: string;
  title: string;
  amount: string;
  payer: (typeof MEMBERS)[number]["id"];
};

type Day = {
  id: string;
  label: string;
  dotColor: string;
  items: Item[];
  dayTotal: string;
};

const DAYS: Day[] = [
  {
    id: "t6",
    label: "T6 · Thứ 6 — Đồng Văn",
    dotColor: COLOR.mintDeep,
    items: [
      { id: "homestay", title: "Homestay Serenity VIP 4", amount: "1.600.000đ", payer: "tam" },
      { id: "xemay", title: "Thuê xe máy + xăng", amount: "400.000đ", payer: "nam" },
    ],
    dayTotal: "2.000.000đ",
  },
  {
    id: "t7",
    label: "T7 · Thứ 7 — Lô Lô Chải",
    dotColor: COLOR.danger,
    items: [
      { id: "antrua", title: "Ăn trưa Lô Lô Chải", amount: "80.000đ", payer: "thu" },
      { id: "laugada", title: "Lẩu gà đen Đồng Văn", amount: "600.000đ", payer: "quyet" },
    ],
    dayTotal: "680.000đ",
  },
  {
    id: "t8",
    label: "T8 · CN — Mã Pí Lèng",
    dotColor: COLOR.lavenderDeep,
    items: [
      { id: "coffee", title: "Coffee đèo Mã Pí Lèng", amount: "240.000đ", payer: "quyet" },
      { id: "thuyen", title: "Thuyền sông Nho Quế", amount: "280.000đ", payer: "nam" },
    ],
    dayTotal: "520.000đ",
  },
];

const SECTION_HEADER_HEIGHT = 80;
const ITEM_HEIGHT = 150;
const ITEM_GAP = 14;
const SECTION_GAP = 28;

const memberById = (id: string) => MEMBERS.find((m) => m.id === id);

const ItemCard: React.FC<{ item: Item; opacity: number; lift: number }> = ({
  item,
  opacity,
  lift,
}) => {
  const m = memberById(item.payer);
  if (!m) return null;
  return (
    <div
      style={{
        height: ITEM_HEIGHT,
        background: COLOR.white,
        borderRadius: 22,
        border: `1.5px solid ${COLOR.border}`,
        boxShadow: "0 4px 16px rgba(11,11,15,0.05)",
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "0 28px",
        opacity,
        transform: `translateY(${lift}px)`,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: m.bg,
          color: m.fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT,
          fontSize: 30,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {m.initial}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 32,
            fontWeight: 600,
            color: COLOR.primary,
            letterSpacing: -0.3,
          }}
        >
          {item.title}
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 24,
            fontWeight: 500,
            color: COLOR.secondary,
          }}
        >
          {m.label} đã trả
        </div>
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 36,
          fontWeight: 700,
          color: COLOR.primary,
          whiteSpace: "nowrap",
        }}
      >
        {item.amount}
      </div>
    </div>
  );
};

export const ExpenseListScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = sceneOpacity(frame, duration, 14, 18);

  // Header entrance
  const headerSpr = bounceSpring({ frame, fps, delay: 0, damping: 13, mass: 0.7 });
  const headerLift = interpolate(headerSpr, [0, 1], [40, 0]);
  const totalOp = fadeIn(frame - 8, 14);
  const subOp = fadeIn(frame - 18, 14);

  // Smooth scroll — start at frame 80, settle at frame 116
  const scrollDistance = SECTION_HEADER_HEIGHT + ITEM_HEIGHT * 2 + ITEM_GAP + SECTION_GAP; // ~362
  const scrollY = interpolate(frame, [80, 116], [0, -scrollDistance], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });

  // Compute Y offset for the timeline connector — needs to span from first
  // dot center to last dot center
  const sectionHeight =
    SECTION_HEADER_HEIGHT + ITEM_HEIGHT * 2 + ITEM_GAP + SECTION_GAP;

  return (
    <AbsoluteFill style={{ background: COLOR.bg, opacity }}>
      {/* Sticky header */}
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 60,
          top: 100,
          opacity: headerSpr,
          transform: `translateY(${headerLift}px)`,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 16px",
            background: COLOR.successBg,
            borderRadius: 9999,
            fontFamily: FONT,
            fontSize: 22,
            fontWeight: 600,
            color: COLOR.success,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: COLOR.success }} />
          CHUYẾN HÀ GIANG · {GROUP_NAME}
        </div>
        <div
          style={{
            marginTop: 18,
            fontFamily: FONT,
            fontSize: 26,
            fontWeight: 500,
            color: COLOR.muted,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Tổng chi 3 ngày · 6 khoản
        </div>
        <div
          style={{
            marginTop: 6,
            display: "flex",
            alignItems: "baseline",
            gap: 18,
            opacity: totalOp,
          }}
        >
          <div
            style={{
              fontFamily: FONT,
              fontSize: 110,
              fontWeight: 800,
              color: COLOR.primary,
              letterSpacing: -4,
              lineHeight: 1,
            }}
          >
            3.200.000đ
          </div>
        </div>
        <div
          style={{
            marginTop: 10,
            fontFamily: FONT,
            fontSize: 30,
            fontWeight: 500,
            color: COLOR.secondary,
            opacity: subOp,
          }}
        >
          Trung bình <strong style={{ color: COLOR.primary, fontWeight: 700 }}>800.000đ</strong> / 4 người
        </div>
      </div>

      {/* Scrollable list container — sized to show exactly T6 + T7 (4 items) initially */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 580,
          height: 870,
          overflow: "hidden",
          maskImage:
            "linear-gradient(180deg, transparent 0, #000 24px, #000 calc(100% - 56px), transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(180deg, transparent 0, #000 24px, #000 calc(100% - 56px), transparent 100%)",
        }}
      >
        <div
          style={{
            position: "relative",
            paddingLeft: 60,
            paddingRight: 60,
            transform: `translateY(${scrollY}px)`,
          }}
        >
          {/* Timeline connector line — runs through dot centers */}
          <div
            style={{
              position: "absolute",
              left: 60 + 11, // matches dot left (60 padding + 11 center)
              top: SECTION_HEADER_HEIGHT / 2,
              width: 2,
              height: sectionHeight * 2,
              background: COLOR.border,
            }}
          />

          {DAYS.map((day, dayIdx) => {
            // Combined index across all items for stagger
            const itemStartIdx = dayIdx * 2;
            return (
              <div
                key={day.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginBottom: dayIdx < DAYS.length - 1 ? SECTION_GAP : 0,
                }}
              >
                {/* Section header */}
                <div
                  style={{
                    height: SECTION_HEADER_HEIGHT,
                    display: "flex",
                    alignItems: "center",
                    gap: 20,
                    paddingLeft: 0,
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: day.dotColor,
                      boxShadow: `0 0 0 6px ${day.dotColor}22`,
                      flexShrink: 0,
                      position: "relative",
                      zIndex: 2,
                    }}
                  />
                  <div
                    style={{
                      fontFamily: FONT,
                      fontSize: 30,
                      fontWeight: 700,
                      color: COLOR.primary,
                      letterSpacing: -0.3,
                      flex: 1,
                    }}
                  >
                    {day.label}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT,
                      fontSize: 24,
                      fontWeight: 600,
                      color: COLOR.muted,
                    }}
                  >
                    {day.dayTotal}
                  </div>
                </div>

                {/* Items */}
                <div style={{ display: "flex", flexDirection: "column", gap: ITEM_GAP, paddingLeft: 42 }}>
                  {day.items.map((item, j) => {
                    const idx = itemStartIdx + j;
                    const reveal = fadeIn(frame - (16 + idx * 8), 14);
                    const lift = interpolate(reveal, [0, 1], [24, 0]);
                    return (
                      <ItemCard key={item.id} item={item} opacity={reveal} lift={lift} />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
