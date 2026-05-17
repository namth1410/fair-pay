import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { COLOR, FONT } from "../theme";
import { bounceSpring, sceneOpacity, fadeIn } from "../utils";

// SQUARE photo anchor so coffee.jpg keeps its 1:1 aspect ratio. Composition
// interpolates from this anchor to the form's smaller square anchor.
export const CAMERA_PHOTO_ANCHOR = {
  centerX: 540,
  centerY: 920,
  width: 760,
  height: 760,
  borderRadius: 36,
};

export const CameraCaptureScene: React.FC<{
  duration: number;
  showOwnPhoto?: boolean;
}> = ({ duration, showOwnPhoto = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = sceneOpacity(frame, duration, 10, 18);

  const hintOp = fadeIn(frame - 4, 14);

  const vfSpr = bounceSpring({ frame, fps, delay: 4, damping: 14, mass: 0.7 });
  const vfScale = interpolate(vfSpr, [0, 1], [0.94, 1]);

  // Shutter ring pulse during the steady period
  const shutterPulse =
    1 +
    0.05 *
      Math.sin(
        interpolate(frame, [10, duration - 30], [0, Math.PI * 6], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      );

  // Capture flash near the end of the scene (more dramatic since duration extended)
  const flashStart = duration - 30;
  const flashPeak = duration - 24;
  const flashFade = duration - 6;
  const flash = interpolate(
    frame,
    [flashStart, flashPeak, flashFade],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const capOp = fadeIn(frame - 18, 14);

  return (
    <AbsoluteFill style={{ background: COLOR.primary, opacity }}>
      {/* Top status hint */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 110,
          textAlign: "center",
          fontFamily: FONT,
          fontSize: 32,
          fontWeight: 500,
          color: COLOR.white,
          opacity: hintOp,
          letterSpacing: 2,
        }}
      >
        <span style={{ opacity: 0.7 }}>● </span>CHỤP KHOẢNH KHẮC
      </div>

      {/* Square viewfinder photo (matches coffee.jpg 1:1) */}
      {showOwnPhoto && (
        <div
          style={{
            position: "absolute",
            left: CAMERA_PHOTO_ANCHOR.centerX - CAMERA_PHOTO_ANCHOR.width / 2,
            top: CAMERA_PHOTO_ANCHOR.centerY - CAMERA_PHOTO_ANCHOR.height / 2,
            width: CAMERA_PHOTO_ANCHOR.width,
            height: CAMERA_PHOTO_ANCHOR.height,
            borderRadius: CAMERA_PHOTO_ANCHOR.borderRadius,
            overflow: "hidden",
            transform: `scale(${vfScale})`,
            opacity: vfSpr,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          }}
        >
          <Img
            src={staticFile("coffee.jpg")}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      )}

      {/* Corner brackets — separate from the photo so they stay anchored
          even when Composition draws the shared photo on top of them */}
      {[
        { top: CAMERA_PHOTO_ANCHOR.centerY - CAMERA_PHOTO_ANCHOR.height / 2 - 14, left: CAMERA_PHOTO_ANCHOR.centerX - CAMERA_PHOTO_ANCHOR.width / 2 - 14, rotate: 0 },
        { top: CAMERA_PHOTO_ANCHOR.centerY - CAMERA_PHOTO_ANCHOR.height / 2 - 14, left: CAMERA_PHOTO_ANCHOR.centerX + CAMERA_PHOTO_ANCHOR.width / 2 - 60, rotate: 90 },
        { top: CAMERA_PHOTO_ANCHOR.centerY + CAMERA_PHOTO_ANCHOR.height / 2 - 60, left: CAMERA_PHOTO_ANCHOR.centerX - CAMERA_PHOTO_ANCHOR.width / 2 - 14, rotate: -90 },
        { top: CAMERA_PHOTO_ANCHOR.centerY + CAMERA_PHOTO_ANCHOR.height / 2 - 60, left: CAMERA_PHOTO_ANCHOR.centerX + CAMERA_PHOTO_ANCHOR.width / 2 - 60, rotate: 180 },
      ].map((c, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: c.top,
            left: c.left,
            width: 74,
            height: 74,
            borderTop: `6px solid ${COLOR.white}`,
            borderLeft: `6px solid ${COLOR.white}`,
            transform: `rotate(${c.rotate}deg)`,
            opacity: vfSpr,
          }}
        />
      ))}

      {/* Caption — placed clearly between photo and shutter */}
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 90,
          top: 1430,
          textAlign: "center",
          fontFamily: FONT,
          fontSize: 38,
          fontWeight: 500,
          color: COLOR.white,
          opacity: capOp,
        }}
      >
        Chi gì — chụp ngay.
      </div>

      {/* Shutter button at bottom, well below the photo */}
      <div
        style={{
          position: "absolute",
          left: 540 - 80,
          bottom: 130,
          width: 160,
          height: 160,
          borderRadius: "50%",
          background: COLOR.white,
          opacity: vfSpr,
          transform: `scale(${shutterPulse})`,
          boxShadow: `0 0 0 8px ${COLOR.primary}, 0 0 0 14px rgba(255,255,255,0.5)`,
        }}
      />

      {/* Flash overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: COLOR.white,
          opacity: flash,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
