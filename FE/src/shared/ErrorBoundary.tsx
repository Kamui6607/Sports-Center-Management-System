import { Component } from "react";
import type { ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="fullscreen">
          <h1>Chưa thể hiển thị trang</h1>
          <p>
            Vui lòng tải lại để tiếp tục. Nếu bạn vừa lưu dữ liệu, hãy kiểm tra
            kết quả trước khi thực hiện lại.
          </p>
          <button
            className="button primary"
            onClick={() => window.location.reload()}
          >
            Tải lại trang
          </button>
        </main>
      );
    return this.props.children;
  }
}
