import { useCallback, useEffect, useRef } from "react";

interface OscilloscopeProps {
  data: Float32Array | number[];
  color?: string;
  width?: number;
  height?: number;
}

export function Oscilloscope({
  data,
  color = "#ff3333",
  width = 300,
  height = 100,
}: OscilloscopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !data.length) return;

    const sliceWidth = width / data.length;
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);

    let x = 0;
    for (const val of data) {
      ctx.lineTo(x, height / 2 + val * height);
      x += sliceWidth;
    }

    ctx.lineTo(x, height / 2);
    ctx.stroke();
  }, [data, color, width, height]);

  useEffect(() => {
    if (data.length > 0) draw();
  }, [data, draw]);

  return <canvas width={width} height={height} ref={canvasRef} />;
}
