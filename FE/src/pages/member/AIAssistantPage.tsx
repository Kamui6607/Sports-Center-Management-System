import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Bot, Send, RefreshCw } from "lucide-react";

interface Message {
  sender: "ai" | "user";
  text: string;
  time: string;
}

export function AIAssistantPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "ai",
      text: `Xin chào ${user?.fullName || "bạn"}! Tôi là Pulse AI Assistant. Tôi có thể hỗ trợ bạn tìm kiếm lớp học phù hợp, giải đáp thắc mắc về lịch tập, dinh dưỡng và chế độ rèn luyện thể chất. Bạn muốn hỏi điều gì hôm nay?`,
      time: "Vừa xong",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const quickPrompts = [
    "Tôi muốn đăng ký lớp học thì làm thế nào?",
    "Thời hạn gói hội viên của tôi còn bao lâu?",
    "Mới bắt đầu nên tập Yoga hay Gym?",
    "Lịch tập tuần này của tôi ở đâu?",
  ];

  const handleSend = (textToSend?: string) => {
    const text = textToSend || input.trim();
    if (!text) return;

    const userMsg: Message = {
      sender: "user",
      text,
      time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setLoading(true);

    setTimeout(() => {
      let reply = "Cảm ơn câu hỏi của bạn! Đội ngũ huấn luyện viên và trợ lý AI của Pulse Sports luôn sẵn sàng đồng hành cùng bạn.";

      const lower = text.toLowerCase();
      if (lower.includes("đăng ký") || lower.includes("đặt")) {
        reply = "Để đăng ký ca học, bạn hãy vào mục 'Tìm kiếm lớp học' trên menu bên trái, chọn lớp học yêu thích rồi nhấn 'Đặt ca học' cho khung giờ phù hợp nhé!";
      } else if (lower.includes("gói") || lower.includes("hội viên") || lower.includes("hạn")) {
        reply = "Bạn có thể kiểm tra chi tiết trạng thái gói tập và số ngày còn lại tại mục 'Gói hội viên'. Để gia hạn, vui lòng liên hệ quầy Lễ tân hoặc hotline trung tâm.";
      } else if (lower.includes("yoga") || lower.includes("gym") || lower.includes("mới bắt đầu")) {
        reply = "Với người mới bắt đầu, bạn nên kết hợp 2 buổi Yoga (tăng độ dẻo dai và hít thở đúng) cùng 2 buổi Gym nhẹ nhàng cùng HLV để làm quen với các động tác nền tảng.";
      } else if (lower.includes("lịch tập") || lower.includes("tuần này")) {
        reply = "Bạn có thể xem lịch tập tổng thể tại mục 'Lịch tập tuần' hoặc xem chi tiết các buổi đã đặt ở mục 'Lớp của tôi'.";
      }

      const aiMsg: Message = {
        sender: "ai",
        text: reply,
        time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, aiMsg]);
      setLoading(false);
    }, 800);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", gap: 16, maxWidth: 900, margin: "0 auto", width: "100%" }}>
      {/* HEADER */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: 16,
          padding: "16px 24px",
          border: "1px solid #e7ece9",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: "#203d31",
              color: "#d3f879",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Bot size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#203d31", margin: 0 }}>
              Pulse AI Assistant
            </h2>
            <span style={{ fontSize: 12, color: "#267346", display: "inline-flex", alignItems: "center", gap: 4 }}>
              ● Trực tuyến
            </span>
          </div>
        </div>

        <button
          onClick={() =>
            setMessages([
              {
                sender: "ai",
                text: "Cuộc trò chuyện đã được làm mới. Tôi có thể hỗ trợ gì thêm cho bạn?",
                time: "Vừa xong",
              },
            ])
          }
          style={{
            background: "none",
            border: "1px solid #e7ece9",
            padding: "6px 12px",
            borderRadius: 8,
            color: "#54655d",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <RefreshCw size={13} /> Làm mới
        </button>
      </div>

      {/* CHAT CONTAINER */}
      <div
        style={{
          flex: 1,
          backgroundColor: "#ffffff",
          borderRadius: 18,
          border: "1px solid #e7ece9",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          overflowY: "auto",
        }}
      >
        {messages.map((m, idx) => {
          const isAi = m.sender === "ai";
          return (
            <div
              key={idx}
              style={{
                display: "flex",
                gap: 12,
                alignSelf: isAi ? "flex-start" : "flex-end",
                maxWidth: "80%",
              }}
            >
              {isAi && (
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    backgroundColor: "#203d31",
                    color: "#d3f879",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Bot size={18} />
                </div>
              )}

              <div>
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 14,
                    backgroundColor: isAi ? "#f4f7f5" : "#203d31",
                    color: isAi ? "#203d31" : "#ffffff",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  {m.text}
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: "#58695f",
                    marginTop: 4,
                    display: "block",
                    textAlign: isAi ? "left" : "right",
                  }}
                >
                  {m.time}
                </span>
              </div>
            </div>
          );
        })}

        {loading && (
          <div style={{ display: "flex", gap: 12, alignSelf: "flex-start" }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                backgroundColor: "#203d31",
                color: "#d3f879",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bot size={18} />
            </div>
            <div
              style={{
                padding: "10px 16px",
                borderRadius: 14,
                backgroundColor: "#f4f7f5",
                color: "#58695f",
                fontSize: 13,
                fontStyle: "italic",
              }}
            >
              Pulse AI đang suy nghĩ...
            </div>
          </div>
        )}
      </div>

      {/* QUICK PROMPTS */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {quickPrompts.map((q, i) => (
          <button
            key={i}
            onClick={() => handleSend(q)}
            style={{
              padding: "6px 12px",
              backgroundColor: "#ffffff",
              border: "1px solid #d4ebbf",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              color: "#376228",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* INPUT BAR */}
      <div
        style={{
          display: "flex",
          gap: 10,
          backgroundColor: "#ffffff",
          padding: 8,
          borderRadius: 14,
          border: "1px solid #e7ece9",
        }}
      >
        <input
          type="text"
          placeholder="Nhập câu hỏi cho trợ lý AI..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          style={{ border: "none", outline: "none", boxShadow: "none", fontSize: 13 }}
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || loading}
          style={{
            padding: "10px 18px",
            backgroundColor: "#203d31",
            color: "#ffffff",
            border: "none",
            borderRadius: 10,
            fontWeight: 700,
            cursor: !input.trim() || loading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Send size={15} /> Gửi
        </button>
      </div>
    </div>
  );
}
