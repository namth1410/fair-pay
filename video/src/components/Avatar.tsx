import React from "react";
import { COLOR, FONT } from "../theme";

type Props = {
  initial: string;
  size?: number;
  bg?: string;
  fg?: string;
};

export const Avatar: React.FC<Props> = ({
  initial,
  size = 160,
  bg = COLOR.primary,
  fg = COLOR.white,
}) => {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: size * 0.45,
        color: fg,
        letterSpacing: -1,
      }}
    >
      {initial}
    </div>
  );
};
