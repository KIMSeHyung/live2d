import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import * as faceapi from "face-api.js";

function lerp(start: number, end: number, amt: number) {
  return (1 - amt) * start + amt * end;
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const spriteRef = useRef<PIXI.Sprite | null>(null);
  const texturesRef = useRef<Record<string, PIXI.Texture>>({});

  const targetPos = useRef({ x: 0, y: 0 });
  const targetRot = useRef(0);
  const targetScale = useRef(1);
  const lastDetection = useRef(0);

  useEffect(() => {
    (async () => {
      // Pixi init
      const app = new PIXI.Application();
      await app.init({ resizeTo: window, backgroundAlpha: 0, antialias: true });
      stageRef.current!.appendChild(app.canvas);
      appRef.current = app;

      // Load textures
      texturesRef.current = {
        neutral: await PIXI.Assets.load("/avatar-neutral.png"),
        happy: await PIXI.Assets.load("/avatar-happy.png"),
        surprised: await PIXI.Assets.load("/avatar-surprised.png"),
      };

      // Load sprite
      const sp = new PIXI.Sprite(texturesRef.current.neutral);
      sp.anchor.set(0.5);
      sp.x = window.innerWidth / 2;
      sp.y = window.innerHeight / 2;
      targetPos.current = { x: sp.x, y: sp.y };
      spriteRef.current = sp;
      app.stage.addChild(sp);

      // Load face-api models
      await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri("/models");
      await faceapi.nets.faceExpressionNet.loadFromUri("/models");

      // Start camera
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        requestAnimationFrame(tick);
      }
    })();

    return () => {
      appRef.current?.destroy(true);
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      videoRef.current?.srcObject && (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    };
  }, []);

  const tick = async () => {
    if (videoRef.current && appRef.current && spriteRef.current) {
      const now = Date.now();
      if (now - lastDetection.current > 50) { // Run detection every 50ms
        lastDetection.current = now;
        const displaySize = { width: appRef.current.screen.width, height: appRef.current.screen.height };
        const detection = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks(true).withFaceExpressions();

        if (detection) {
          const resizedDetection = faceapi.resizeResults(detection, displaySize);
          const { detection: resized, landmarks } = resizedDetection;
          const jaw = landmarks.getJawOutline();

          // Expression
          const expressions = detection.expressions;
          const happy = expressions.happy > 0.7;
          const surprised = expressions.surprised > 0.7;

          if (happy) {
            spriteRef.current.texture = texturesRef.current.happy;
          } else if (surprised) {
            spriteRef.current.texture = texturesRef.current.surprised;
          } else {
            spriteRef.current.texture = texturesRef.current.neutral;
          }

          // Head position
          const { box } = resized;
          targetPos.current = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

          // Head rotation
          targetRot.current = Math.atan2(jaw[16].y - jaw[0].y, jaw[16].x - jaw[0].x);

          // Adjust sprite scale
          const targetFaceWidth = 600; // Adjust this value to control the character's size
          targetScale.current = resized.box.width / targetFaceWidth;
        }
      }

      // Smooth movement
      const smoothing = 0.3; // Increased for more responsiveness
      spriteRef.current.x = lerp(spriteRef.current.x, targetPos.current.x, smoothing);
      spriteRef.current.y = lerp(spriteRef.current.y, targetPos.current.y, smoothing);
      spriteRef.current.rotation = lerp(spriteRef.current.rotation, targetRot.current, smoothing);
      spriteRef.current.scale.set(lerp(spriteRef.current.scale.x, targetScale.current, smoothing));
    }
    requestAnimationFrame(tick);
  };

  return (
    <div style={{ height: "100vh", background: "#111" }}>
      <video ref={videoRef} style={{ position: "fixed", right: 16, bottom: 16, width: 200, opacity: 0.2 }} playsInline muted />
      <div ref={stageRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}