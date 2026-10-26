/** Các điểm (x, y) theo tỉ lệ 0–1: phẳng → nhịp nhỏ → nhịp lớn → phẳng (đồng bộ màn chào Mobile `welcome_screen.dart`). */
const POINTS: [number, number][] = [
  [0, 0.6],
  [0.22, 0.6],
  [0.27, 0.45],
  [0.31, 0.6],
  [0.38, 0.6],
  [0.42, 0.72],
  [0.47, 0.05],
  [0.53, 0.95],
  [0.57, 0.6],
  [0.64, 0.6],
  [0.68, 0.38],
  [0.73, 0.6],
  [1, 0.6],
];
const W = 600;
const H = 80;
const D = POINTS.map(([x, y], i) => `${i ? "L" : "M"}${(x * W).toFixed(1)} ${(y * H).toFixed(1)}`).join(" ");

/**
 * Đường nhịp tim "pulse" — hình ảnh gốc của thương hiệu. Tự vẽ dần một lần (CSS `.pulse-line`),
 * người dùng bật giảm chuyển động thì hiện ngay. Màu lấy từ `currentColor`.
 */
export function PulseLine({ className = "" }: { className?: string }) {
  return (
    <svg className={"pulse-line " + className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path className="pulse-line-base" d={`M0 ${0.6 * H} H${W}`} />
      <path className="pulse-line-trace" d={D} pathLength={1} />
    </svg>
  );
}
