import { Easing, interpolate, spring } from "remotion";

export const SOFT_EASE = Easing.bezier(0.16, 1, 0.3, 1);

export const fadeIn = (frame: number, durationInFrames: number) =>
  interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: SOFT_EASE,
  });

export const fadeOut = (
  frame: number,
  sceneDuration: number,
  fadeFrames: number,
) =>
  interpolate(
    frame,
    [sceneDuration - fadeFrames, sceneDuration],
    [1, 0],
    {
      extrapolateRight: "clamp",
      extrapolateLeft: "clamp",
      easing: SOFT_EASE,
    },
  );

export const sceneOpacity = (
  frame: number,
  sceneDuration: number,
  inFrames = 12,
  outFrames = 12,
) => Math.min(fadeIn(frame, inFrames), fadeOut(frame, sceneDuration, outFrames));

export const bounceSpring = ({
  frame,
  fps,
  delay = 0,
  damping = 12,
  mass = 0.5,
}: {
  frame: number;
  fps: number;
  delay?: number;
  damping?: number;
  mass?: number;
}) =>
  spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping, mass, stiffness: 140 },
  });

export const formatVND = (n: number) =>
  new Intl.NumberFormat("vi-VN").format(n) + "đ";
