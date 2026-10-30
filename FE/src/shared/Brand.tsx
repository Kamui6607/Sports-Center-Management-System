import { PulseMark } from "./PulseMark";
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <PulseMark size={30} boxed={false} />
      </span>
      <span>
        pulse<span className="brand-dot">.</span>
        <small>SPORTS CENTER</small>
      </span>
    </span>
  );
}
