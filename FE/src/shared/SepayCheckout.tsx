import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "./toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, LoaderCircle, RotateCcw } from "lucide-react";
import { sepayApi } from "../api/sepay.api";
import { AlertBanner, Modal } from "../components/common";
import type { MembershipPlan, SepayCheckout } from "../types/member";

const clientEnv = (
  import.meta as unknown as {
    env: Record<string, string | boolean | undefined>;
  }
).env;
const mockModeEnabled = clientEnv.VITE_SEPAY_MOCK_MODE === "true";

function useCountdown(expiresAt: string) {
  const expiry = useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, expiry - Date.now()),
  );

  useEffect(() => {
    const update = () => setRemaining(Math.max(0, expiry - Date.now()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [expiry]);

  const totalSeconds = Math.ceil(remaining / 1000);
  return {
    expired: remaining <= 0,
    label: `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(
      totalSeconds % 60,
    ).padStart(2, "0")}`,
  };
}

export function SepayCheckoutModal({
  checkout,
  selectedPlan,
  onClose,
  onCreateNew,
  open = true,
  onConfirmed,
}: {
  checkout: SepayCheckout | null;
  selectedPlan: MembershipPlan | null;
  onClose: () => void;
  onCreateNew: () => void;
  open?: boolean;
  onConfirmed?: () => void;
}) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const countdown = useCountdown(
    checkout?.expiresAt ?? new Date().toISOString(),
  );
  const statusQuery = useQuery({
    queryKey: ["sepay-checkout", checkout?.paymentId],
    queryFn: () => sepayApi.getCheckout(checkout!.paymentId),
    enabled: Boolean(checkout?.paymentId),
    initialData: checkout ?? undefined,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchIntervalInBackground: true,
    refetchInterval: (query) =>
      query.state.data?.status === "PENDING" ? 4000 : false,
  });
  const current = checkout ? { ...checkout, ...statusQuery.data } : null;
  const announced = useRef("");
  useEffect(() => {
    if (!current) return;
    const state = `${current.paymentId}:${current.status}`;
    if (state === announced.current || current.status === "PENDING") return;
    announced.current = state;
    toast(
      current.status === "SUCCESS" ? "success" : "error",
      current.status === "SUCCESS"
        ? "Thanh toán thành công. Gói hội viên đã được kích hoạt."
        : "Thanh toán thất bại. Vui lòng tạo đơn mới.",
      state,
    );
  }, [current?.paymentId, current?.status]);
  const mockConfirm = useMutation({
    mutationFn: () => sepayApi.mockConfirm(checkout!.paymentId),
    onSuccess: () => statusQuery.refetch(),
  });

  useEffect(() => {
    if (current?.status !== "SUCCESS") return;
    onConfirmed?.();
    queryClient.invalidateQueries({ queryKey: ["current-membership"] });
    queryClient.invalidateQueries({ queryKey: ["member-invoices"] });
    queryClient.invalidateQueries({ queryKey: ["membership-plans"] });
  }, [current?.status, current?.paymentId, queryClient]);

  const copyTransferContent = async () => {
    if (!current?.transferContent) return;
    try {
      await navigator.clipboard.writeText(current.transferContent);
      setCopied(true);
      toast("success", "Đã sao chép nội dung chuyển khoản.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast(
        "error",
        "Không thể sao chép. Vui lòng chọn và chép nội dung chuyển khoản thủ công.",
      );
    }
  };

  if (!checkout || !current) return null;

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Chuyển khoản VietQR qua SePay"
      maxWidth={560}
      dismissible={!mockConfirm.isPending}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {current.status === "SUCCESS" ? (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ 
              width: 72, height: 72, background: "#10b981", borderRadius: "50%", 
              display: "flex", alignItems: "center", justifyContent: "center", 
              margin: "0 auto 20px", color: "white", boxShadow: "0 4px 10px rgba(16, 185, 129, 0.3)"
            }}>
              <Check size={40} strokeWidth={3} />
            </div>
            <h3 style={{ color: "#065f46", margin: "0 0 8px 0", fontSize: 22 }}>Thanh toán thành công!</h3>
            <div style={{ color: "#475467", fontSize: 14, marginBottom: 24 }}>
              Giao dịch đã hoàn tất. Gói hội viên của bạn đã được kích hoạt.
            </div>
            <div style={{ 
              background: "#f9fafb", borderRadius: 12, padding: 16, 
              textAlign: "left", fontSize: 14, color: "#374151",
              border: "1px solid #e5e7eb"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ color: "#6b7280" }}>Mã đơn hàng:</span>
                <strong>{current.orderCode}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ color: "#6b7280" }}>Số tiền:</span>
                <strong style={{ color: "#10b981" }}>+{current.amount.toLocaleString("vi-VN")} VND</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#6b7280" }}>Gói đăng ký:</span>
                <strong>{current.plan?.name ?? selectedPlan?.name}</strong>
              </div>
            </div>
            <button type="button" className="button primary" onClick={onClose} style={{ marginTop: 24, width: "100%", padding: 12 }}>
              Đóng và bắt đầu tập luyện
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                padding: 16,
                borderRadius: 12,
                background: "#fff5fb",
                border: "1px solid #f6c8e3",
              }}
            >
              <div>
                <strong style={{ color: "#203d31" }}>
                  {current.plan?.name ?? selectedPlan?.name ?? "Gói hội viên"}
                </strong>
                {(current.plan?.durationDays ?? selectedPlan?.durationDays) && (
                  <div style={{ color: "#667085", fontSize: 12, marginTop: 4 }}>
                    Thời hạn{" "}
                    {current.plan?.durationDays ?? selectedPlan?.durationDays} ngày
                  </div>
                )}
              </div>
              <strong style={{ color: "#a50064", whiteSpace: "nowrap" }}>
                {Number(current.amount).toLocaleString("vi-VN")} VND
              </strong>
            </div>

            {current.status === "PENDING" && !countdown.expired && (
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    display: "inline-flex",
                    padding: 12,
                    background: "#fff",
                    border: "1px solid #e7ece9",
                    borderRadius: 14,
                  }}
                >
                  <img
                    src={current.qrUrl}
                    width={300}
                    height={300}
                    alt="Mã VietQR thanh toán gói hội viên"
                    style={{ maxWidth: "100%", height: "auto" }}
                  />
                </div>
                <div style={{ marginTop: 8, color: "#667085", fontSize: 13 }}>
                  Mã hết hạn sau <strong>{countdown.label}</strong>
                </div>
              </div>
            )}

            <div style={{ color: "#475467", fontSize: 13, lineHeight: 1.8 }}>
              {current.bank && (
                <>
                  <div>
                    Ngân hàng: <strong>{current.bank.id}</strong>
                  </div>
                  <div>
                    Số tài khoản: <strong>{current.bank.accountNumber}</strong>
                  </div>
                  <div>
                    Chủ tài khoản: <strong>{current.bank.accountHolder}</strong>
                  </div>
                </>
              )}
              <div>
                Số tiền:{" "}
                <strong>{current.amount.toLocaleString("vi-VN")} VND</strong>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span>
                  Nội dung: <strong>{current.transferContent}</strong>
                </span>
                <button
                  type="button"
                  className="button small"
                  onClick={copyTransferContent}
                  aria-label="Sao chép nội dung chuyển khoản"
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? "Đã chép" : "Copy"}
                </button>
              </div>
            </div>

            {current.status === "PENDING" && !countdown.expired && (
              <AlertBanner
                type="info"
                title="Đang chờ ngân hàng xác nhận"
                message="Hệ thống đang chờ xác nhận từ ngân hàng. Nếu đã chuyển tiền, không chuyển lại. Vui lòng giữ biên lai và mã đơn để trung tâm đối soát nếu trạng thái chưa cập nhật."
              />
            )}
            {current.status === "PENDING" && countdown.expired && (
              <AlertBanner
                type="warning"
                title="Đơn thanh toán đã hết thời gian"
                message="Bạn có thể tạo đơn mới để nhận mã VietQR còn hiệu lực."
              />
            )}
            {current.status === "FAILED" && (
              <AlertBanner
                type="error"
                title="Thanh toán thất bại"
                message="Giao dịch không thành công. Vui lòng tạo đơn thanh toán mới."
              />
            )}
            {statusQuery.isError && current.status === "PENDING" && (
              <AlertBanner
                type="warning"
                title="Chưa kiểm tra được trạng thái"
                message="Kết nối tạm thời gián đoạn. Bạn có thể kiểm tra lại thủ công."
              />
            )}
            {mockConfirm.isError && (
              <AlertBanner
                type="error"
                title="Không thể giả lập thanh toán"
                message={
                  mockConfirm.error instanceof Error
                    ? mockConfirm.error.message
                    : "Vui lòng kiểm tra SEPAY_MOCK_MODE ở backend."
                }
              />
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {current.status === "PENDING" && (
                <button
                  type="button"
                  className="button"
                  disabled={statusQuery.isFetching}
                  onClick={async () => {
                    const result = await statusQuery.refetch();
                    if (result.data?.status === "PENDING")
                      toast(
                        "info",
                        `Đơn ${checkout.orderCode} vẫn đang chờ BE xác nhận. Nếu đã chuyển tiền, vui lòng liên hệ trung tâm để đối soát.`,
                      );
                  }}
                >
                  <RotateCcw size={16} />
                  {statusQuery.isFetching ? "Đang kiểm tra..." : "Kiểm tra lại"}
                </button>
              )}
              {(current.status === "FAILED" ||
                (current.status === "PENDING" && countdown.expired)) && (
                <button
                  type="button"
                  className="button primary"
                  onClick={onCreateNew}
                >
                  Tạo đơn mới
                </button>
              )}
            </div>

            {mockModeEnabled &&
              current.status === "PENDING" &&
              !countdown.expired && (
                <button
                  type="button"
                  className="button"
                  disabled={mockConfirm.isPending}
                  onClick={() => mockConfirm.mutate()}
                  style={{ borderStyle: "dashed" }}
                >
                  {mockConfirm.isPending && (
                    <LoaderCircle className="spin" size={16} />
                  )}
                  DEV: giả lập SePay đã thu tiền
                </button>
              )}
          </>
        )}
      </div>
    </Modal>
  );
}
