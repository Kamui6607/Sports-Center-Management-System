import { Activity } from "lucide-react";
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Activity size={25} strokeWidth={2.7} />
      </span>
      <span>
        pulse<span className="brand-dot">.</span>
        <small>SPORTS CENTER</small>
      </span>
    </span>
  );
}
