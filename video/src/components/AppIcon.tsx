import React from "react";
import { Img, staticFile } from "remotion";
import { COLOR } from "../theme";

type Props = {
  size?: number;
  radius?: number;
  showShadow?: boolean;
  style?: React.CSSProperties;
};

export const AppIcon: React.FC<Props> = ({
  size = 320,
  radius = 72,
  showShadow = true,
  style,
}) => {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(135deg, ${COLOR.mintMid} 0%, ${COLOR.mintDeep} 100%)`,
        boxShadow: showShadow
          ? `0 ${size * 0.075}px ${size * 0.15}px ${COLOR.success}55`
          : undefined,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      <Img
        src={staticFile("logo.png")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </div>
  );
};
