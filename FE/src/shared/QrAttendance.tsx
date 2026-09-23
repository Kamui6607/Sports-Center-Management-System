import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api, ApiError } from "./api";
import { ErrorState, Loading } from "./ui";

export function AttendanceQr({ scheduleId }: { scheduleId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [now, setNow] = useState(Date.now());
  const q = useQuery({
    queryKey: ["attendance-qr", scheduleId],
    enabled,
    queryFn: async ({ signal }) => {
      const started = Date.now();
      const result = await api<{ qrToken: string; expiresIn: number }>(
        "POST /attendance/generate-qr",
        { body: { scheduleId }, signal },
      );
      return {
        ...result.data,
        expiresAt: started + result.data.expiresIn * 1000,
      };
    },
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: enabled ? 55000 : false,
  });
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  const seconds = Math.max(
    0,
    Math.ceil(((q.data?.expiresAt || 0) - now) / 1000),
  );
  return (
    <section className="qr-panel">
      <h3>Điểm danh bằng QR</h3>
      <p>Hội viên quét mã để xác nhận có mặt. Mã tự làm mới sau 55 giây.</p>
      {!enabled ? (
        <button
          className="button primary"
          onClick={() => {
            setNow(Date.now());
            setEnabled(true);
          }}
        >
          Tạo QR điểm danh
        </button>
      ) : (
        <>
          {q.isPending ? (
            <Loading />
          ) : q.error ? (
            <ErrorState error={q.error} retry={() => q.refetch()} />
          ) : q.data && seconds > 0 ? (
            <>
              <div className="qr-code">
                <QRCodeSVG
                  role="img"
                  aria-label="Mã QR điểm danh buổi học"
                  value={q.data.qrToken}
                  size={220}
                  title="Mã QR điểm danh buổi học"
                />
              </div>
              <p>Còn {seconds} giây</p>
            </>
          ) : (
            <p role="status">Mã đã hết hạn. Vui lòng tạo mã mới.</p>
          )}
          <div className="workflow-actions">
            <button
              className="button"
              disabled={q.isFetching}
              onClick={() => void q.refetch()}
            >
              Làm mới QR
            </button>
            <button className="button" onClick={() => setEnabled(false)}>
              Ẩn mã QR
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export function ScanAttendanceQr() {
  const [token, setToken] = useState("");
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const locked = useRef(false);
  const cache = useQueryClient();
  const scan = useMutation({
    mutationFn: (qrToken: string) =>
      api("POST /attendance/scan-qr", { body: { qrToken } }),
    onSuccess: () => {
      setToken("");
      void cache.invalidateQueries({ queryKey: ["my-attendance"] });
    },
    onSettled: () => {
      locked.current = false;
    },
  });
  const submit = useRef((value: string) => {
    scan.mutate(value);
  });
  submit.current = (value) => {
    if (!locked.current) {
      locked.current = true;
      setCamera(false);
      scan.mutate(value);
    }
  };
  useEffect(() => {
    if (!camera || !video.current) return;
    let disposed = false;
    let controls: { stop(): void } | undefined;
    const element = video.current;
    import("@zxing/browser")
      .then(async ({ BrowserQRCodeReader }) => {
        if (disposed) return;
        controls = await new BrowserQRCodeReader().decodeFromConstraints(
          { video: { facingMode: "environment" }, audio: false },
          element,
          (result, _error, control) => {
            if (result && !disposed && !locked.current) {
              control.stop();
              submit.current(result.getText());
            }
          },
        );
        if (disposed) controls.stop();
      })
      .catch(() => {
        if (!disposed) {
          setCameraError(
            "Không mở được camera. Hãy cấp quyền camera, dùng HTTPS hoặc nhập mã bên dưới.",
          );
          setCamera(false);
        }
      });
    return () => {
      disposed = true;
      controls?.stop();
      const stream = element.srcObject;
      if (stream instanceof MediaStream)
        stream.getTracks().forEach((track) => track.stop());
      element.srcObject = null;
    };
  }, [camera]);
  return (
    <section className="qr-panel">
      <h2>Quét QR điểm danh</h2>
      <p>
        Mở mã trên thiết bị của huấn luyện viên. Gói tập phải còn hiệu lực tại
        thời điểm quét.
      </p>
      <button
        className="button primary"
        disabled={scan.isPending}
        onClick={() => {
          scan.reset();
          setCameraError("");
          setCamera(!camera);
        }}
      >
        {camera ? "Dừng camera" : "Mở camera quét QR"}
      </button>
      {camera && (
        <video ref={video} muted playsInline aria-label="Camera quét QR" />
      )}
      {cameraError && <p role="alert">{cameraError}</p>}
      <details>
        <summary>Nhập mã nếu không dùng được camera</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) submit.current(token.trim());
          }}
        >
          <label>
            Mã điểm danh
            <textarea
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <button className="button" disabled={scan.isPending || !token.trim()}>
            Xác nhận điểm danh
          </button>
        </form>
      </details>
      {scan.isPending && <p role="status">Đang xác nhận điểm danh…</p>}
      {scan.isSuccess && (
        <p className="success" role="status">
          Điểm danh thành công!
        </p>
      )}
      {scan.error && <ErrorState error={scan.error} />}
      {scan.error instanceof ApiError &&
        scan.error.status === 403 &&
        /gói|hết hạn/i.test(scan.error.message) && (
          <Link className="button" to="/member/membership">
            Gia hạn ngay
          </Link>
        )}
    </section>
  );
}
