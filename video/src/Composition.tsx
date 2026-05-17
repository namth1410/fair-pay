import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  interpolate,
  Img,
  staticFile,
  spring,
  useVideoConfig,
  Easing,
} from "remotion";
import { COLOR, SCENE, TOTAL_DURATION } from "./theme";
import { HookScene } from "./scenes/HookScene";
import { ExcelPainpointScene } from "./scenes/ExcelPainpointScene";
import { CameraCaptureScene, CAMERA_PHOTO_ANCHOR } from "./scenes/CameraCaptureScene";
import { AddExpenseFormScene, FORM_PHOTO_ANCHOR } from "./scenes/AddExpenseFormScene";
import { SuccessScene } from "./scenes/SuccessScene";
import { ExpenseListScene } from "./scenes/ExpenseListScene";
import { SettlementScene } from "./scenes/SettlementScene";
import { CtaScene } from "./scenes/CtaScene";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const FLOATING_DOTS = [
  { x: 160, y: 300, size: 20, color: COLOR.cardPeach, speed: 0.6, phase: 0 },
  { x: 880, y: 380, size: 14, color: COLOR.cardLavender, speed: 0.8, phase: 1.2 },
  { x: 130, y: 1500, size: 24, color: COLOR.cardMint, speed: 0.5, phase: 2.1 },
  { x: 920, y: 1620, size: 18, color: COLOR.dangerBg, speed: 0.7, phase: 3.4 },
  { x: 500, y: 240, size: 10, color: COLOR.muted, speed: 0.9, phase: 4.5 },
  { x: 760, y: 1180, size: 14, color: COLOR.mintMid, speed: 0.55, phase: 5.2 },
  { x: 240, y: 1280, size: 12, color: COLOR.cardLavender, speed: 0.65, phase: 6.0 },
];

const FloatingDots: React.FC = () => {
  const frame = useCurrentFrame();
  // Hidden during dark scenes (Hook 0-90 & Camera 210-330), visible during light scenes.
  const dotOpacity = interpolate(
    frame,
    [0, 90, 105, 210, 220, 330, 345, TOTAL_DURATION - 22, TOTAL_DURATION],
    [0, 0, 0.7, 0.7, 0, 0, 0.55, 0.55, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {FLOATING_DOTS.map((d, i) => {
        const drift = Math.sin(frame * 0.012 * d.speed + d.phase) * 24;
        const driftY = Math.cos(frame * 0.01 * d.speed + d.phase) * 18;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: d.x + drift,
              top: d.y + driftY,
              width: d.size,
              height: d.size,
              borderRadius: "50%",
              background: d.color,
              opacity: dotOpacity,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// Shared coffee photo that travels from CameraScene viewfinder to FormScene receipt slot
const CoffeePhotoFlow: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cameraStart = SCENE.camera.start;
  const cameraEnd = cameraStart + SCENE.camera.duration;
  const formStart = SCENE.form.start;
  const formEnd = formStart + SCENE.form.duration;

  if (frame < cameraStart - 2 || frame > formEnd + 2) return null;

  // Entry spring when first appearing in camera viewfinder
  const enterSpr = spring({
    frame: frame - (cameraStart + 4),
    fps,
    config: { damping: 14, mass: 0.7, stiffness: 140 },
  });

  // Transition from camera anchor to form anchor — happens around camera tail / form head
  // Camera shutter flash starts at cameraEnd-28, peaks at cameraEnd-22. Photo starts moving slightly after.
  const tStart = cameraEnd - 18;
  const tEnd = formStart + 28;
  const t = interpolate(frame, [tStart, tEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });

  const cx = lerp(CAMERA_PHOTO_ANCHOR.centerX, FORM_PHOTO_ANCHOR.centerX, t);
  const cy = lerp(CAMERA_PHOTO_ANCHOR.centerY, FORM_PHOTO_ANCHOR.centerY, t);
  const w = lerp(CAMERA_PHOTO_ANCHOR.width, FORM_PHOTO_ANCHOR.width, t);
  const h = lerp(CAMERA_PHOTO_ANCHOR.height, FORM_PHOTO_ANCHOR.height, t);
  const radius = lerp(CAMERA_PHOTO_ANCHOR.borderRadius, FORM_PHOTO_ANCHOR.borderRadius, t);

  // Exit fade near the end of Form scene
  const exitFade = interpolate(frame, [formEnd - 18, formEnd], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtle "snapshot" snap during shutter flash
  const snapScale = interpolate(
    frame,
    [cameraEnd - 22, cameraEnd - 16, cameraEnd - 10],
    [1, 0.92, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        left: cx - w / 2,
        top: cy - h / 2,
        width: w,
        height: h,
        borderRadius: radius,
        overflow: "hidden",
        boxShadow:
          t < 0.5
            ? "0 24px 64px rgba(0,0,0,0.5)"
            : "0 12px 32px rgba(11,11,15,0.18)",
        opacity: enterSpr * exitFade,
        transform: `scale(${snapScale})`,
      }}
    >
      <Img
        src={staticFile("coffee.jpg")}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </div>
  );
};

export const FairPayIntro: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: COLOR.bg }}>
      <Sequence from={SCENE.hook.start} durationInFrames={SCENE.hook.duration} layout="none">
        <HookScene duration={SCENE.hook.duration} />
      </Sequence>

      <Sequence from={SCENE.excel.start} durationInFrames={SCENE.excel.duration} layout="none">
        <ExcelPainpointScene duration={SCENE.excel.duration} />
      </Sequence>

      <Sequence from={SCENE.camera.start} durationInFrames={SCENE.camera.duration} layout="none">
        <CameraCaptureScene duration={SCENE.camera.duration} showOwnPhoto={false} />
      </Sequence>

      <Sequence from={SCENE.form.start} durationInFrames={SCENE.form.duration} layout="none">
        <AddExpenseFormScene duration={SCENE.form.duration} showOwnPhoto={false} />
      </Sequence>

      <Sequence from={SCENE.success.start} durationInFrames={SCENE.success.duration} layout="none">
        <SuccessScene duration={SCENE.success.duration} />
      </Sequence>

      <Sequence
        from={SCENE.expenseList.start}
        durationInFrames={SCENE.expenseList.duration}
        layout="none"
      >
        <ExpenseListScene duration={SCENE.expenseList.duration} />
      </Sequence>

      <Sequence
        from={SCENE.settlement.start}
        durationInFrames={SCENE.settlement.duration}
        layout="none"
      >
        <SettlementScene duration={SCENE.settlement.duration} />
      </Sequence>

      <Sequence from={SCENE.cta.start} durationInFrames={SCENE.cta.duration} layout="none">
        <CtaScene duration={SCENE.cta.duration} />
      </Sequence>

      {/* Shared coffee photo persists across Camera and Form scenes */}
      <CoffeePhotoFlow />

      <FloatingDots />
    </AbsoluteFill>
  );
};
