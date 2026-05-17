import "./index.css";
import { Composition } from "remotion";
import { FairPayIntro } from "./Composition";
import { TOTAL_DURATION } from "./theme";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FairPayIntro"
        component={FairPayIntro}
        durationInFrames={TOTAL_DURATION}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
