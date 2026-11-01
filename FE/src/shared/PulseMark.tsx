/**
 * "Vòng năng lượng": vòng tiến độ hở một khe có chấm, bên trong là nhịp tim — nguồn gốc ở
 * `Doc/brand/pulse-mark.svg` (đồng bộ Mobile `core/widgets/brand_logo.dart`).
 */
const RING = "M32 14A18 18 0 1 1 16.41 23";
const PULSE = "M24 32h4l2.5-5 3 10 2.5-5h4";

/**
 * Logo biểu tượng Pulse. `boxed` (mặc định) vẽ ô vuông bo góc; màu ô / hình lấy từ biến CSS
 * `--pm-bg` / `--pm-fg` để từng nơi tự đổi theo nền. `boxed={false}` chỉ vẽ hình, màu theo `currentColor`.
 */
export function PulseMark({ size = 32, boxed = true, className = "" }: { size?: number; boxed?: boolean; className?: string }) {
  const fg = boxed ? "var(--pm-fg, #fff0f5)" : "currentColor";
  return (
    <svg className={"pulse-mark " + className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {boxed && <rect width="64" height="64" rx="16" fill="var(--pm-bg, #c9356a)" />}
      <path d={RING} fill="none" stroke={fg} strokeWidth={7} strokeLinecap="round" />
      <circle cx="23" cy="16.41" r="3.6" fill={fg} />
      <path d={PULSE} fill="none" stroke={fg} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
