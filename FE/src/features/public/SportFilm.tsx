import { useEffect, useRef, useState } from "react";
import { Dumbbell, HeartPulse, Pause, Play } from "lucide-react";

// Source pages and licenses are recorded in docs/PUBLIC_MEDIA.md.
const films = [
  {
    name: "Tập tạ",
    subtitle: "Mạnh hơn qua từng chuyển động",
    icon: Dumbbell,
    src: "https://assets.mixkit.co/videos/44414/44414-720.mp4",
    poster:
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=2000&q=85",
  },
  {
    name: "Yoga",
    subtitle: "Tìm lại cân bằng từ bên trong",
    icon: HeartPulse,
    src: "https://assets.mixkit.co/videos/1053/1053-720.mp4",
    poster:
      "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=2000&q=85",
  },
];

export function SportFilm() {
  const [active, setActive] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [requested, setRequested] = useState(false);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const film = films[active];

  useEffect(() => {
    if (enabled) setRequested(true);
  }, [enabled]);

  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    const update = () => setEnabled(!motion.matches && !connection?.saveData);
    update();
    motion.addEventListener("change", update);
    return () => motion.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    observer.observe(element);
    const syncVisibility = () => {
      if (document.hidden) element.pause();
      else if (enabled && visible)
        void element.play().catch(() => setPlaying(false));
    };
    document.addEventListener("visibilitychange", syncVisibility);
    if (enabled && visible && !document.hidden)
      void element.play().catch(() => setPlaying(false));
    else element.pause();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, [enabled, visible, active, requested]);

  return (
    <>
      <img
        className="p-hero-image"
        src={film.poster}
        alt="Không gian vận động và tập luyện"
        fetchPriority="high"
      />
      <video
        ref={video}
        className={`p-hero-video${failed ? " p-video-failed" : ""}`}
        src={requested ? film.src : undefined}
        poster={film.poster}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          setFailed(true);
          setPlaying(false);
        }}
      />
      <div className="p-film-controls">
        <div className="p-film-caption">
          <span className="p-live-dot" /> NHỊP CHUYỂN ĐỘNG{" "}
          <span> / 0{active + 1}</span>
        </div>
        <div
          className="p-film-options"
          role="group"
          aria-label="Chọn video thể thao"
        >
          {films.map(({ name, icon: Icon }, i) => (
            <button
              key={name}
              type="button"
              aria-pressed={active === i}
              onClick={() => {
                setActive(i);
                setFailed(false);
              }}
            >
              <Icon size={17} />
              {name}
            </button>
          ))}
          <button
            type="button"
            aria-label={playing ? "Tạm dừng video" : "Phát video"}
            disabled={failed}
            onClick={() => {
              if (playing) {
                setEnabled(false);
              } else {
                setEnabled(true);
                void video.current?.play().catch(() => setPlaying(false));
              }
            }}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
        </div>
        <p role="status">
          {failed
            ? "Video tạm thời chưa khả dụng. Hãy khám phá bộ môn khác."
            : film.subtitle}
        </p>
      </div>
    </>
  );
}
