import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Loader2, Trash2, Maximize2, Minimize2 } from 'lucide-react';
import { ENV } from '../../config/env';
import './AIChatWidget.css';
import { useConfirm } from '@/components/common/ConfirmDialog';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
}

interface QuickQuestionGroup {
  group: string;
  questions: string[];
}

export const AIChatWidget = ({ vesselId }: { vesselId: string }) => {
  const ask = useConfirm();
  const storageKey = `ai_chat_history_${vesselId}`;
  const quickQuestionGroups: QuickQuestionGroup[] = [
    {
      group: 'Hiệu suất nhiên liệu',
      questions: [
        'Tiêu hao nhiên liệu 30 ngày có vượt định mức không?',
        'ROB hiện tại còn chạy được bao nhiêu ngày?'
      ]
    },
    {
      group: 'Hiệu suất máy và hành hải',
      questions: [
        'So sánh tốc độ và RPM trung bình 7 ngày với 30 ngày',
        'Mối liên hệ giữa tốc độ, RPM và tiêu hao nhiên liệu là gì?'
      ]
    },
    {
      group: 'Ngày bất thường',
      questions: [
        'Liệt kê các ngày có số liệu bất thường trong 30 ngày gần nhất',
        'Ngày nào có mức tiêu hao tăng đột biến và vì sao?'
      ]
    },
    {
      group: 'Rủi ro ETA và thời tiết',
      questions: [
        'ETA có nguy cơ trễ do thời tiết hoặc hiệu suất máy không?',
        'Nên điều chỉnh tốc độ thế nào để giữ ETA và giảm tiêu hao?'
      ]
    },
    {
      group: 'An toàn và tuân thủ',
      questions: [
        'Có cảnh báo an toàn nào cần xử lý ngay không?',
        'Tình hình safety incidents và drills trong kỳ báo cáo thế nào?'
      ]
    },
    {
      group: 'Bảo trì và vật tư',
      questions: [
        'Có dấu hiệu cần bảo trì sớm từ dữ liệu vận hành không?',
        'Rủi ro thiếu vật tư ảnh hưởng kế hoạch bảo trì kỳ tới ra sao?'
      ]
    }
  ];

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [sessionId] = useState(() => {
    const savedSession = localStorage.getItem(`${storageKey}_session`);
    if (savedSession) return savedSession;
    const newSession = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem(`${storageKey}_session`, newSession);
    return newSession;
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem(`${storageKey}_messages`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to parse chat history', e);
    }
    return [
      {
        id: '1',
        sender: 'ai',
        text: 'Xin chào! Tôi có thể giúp bạn phân tích chuyên sâu các số liệu và biểu đồ của tàu này.',
      },
    ];
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(`${storageKey}_messages`, JSON.stringify(messages));
  }, [messages, storageKey]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (presetText?: string) => {
    const textToSend = (presetText ?? input).trim();
    if (!textToSend || isLoading) return;

    const userText = textToSend;
    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: userText };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds (optimized data = faster response)

      const res = await fetch(`${ENV.API_BASE_URL}/reports/chat/vessels/${vesselId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, vesselId, sessionId }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        let serverMessage = '';
        let retryAfter = 0;

        try {
          const payload = await res.json();
          serverMessage = payload?.answer || payload?.message || '';
          retryAfter = Number(payload?.retryAfterSeconds || 0);
        } catch {
          // Ignore JSON parse error and use fallback message.
        }

        if (!retryAfter) {
          const retryHeader = res.headers.get('Retry-After');
          retryAfter = retryHeader ? Number(retryHeader) : 0;
        }

        if (res.status === 429) {
          const fallback = retryAfter > 0
            ? `Yêu cầu đang bị giới hạn tần suất. Vui lòng thử lại sau ${retryAfter}s.`
            : 'Yêu cầu đang bị giới hạn tần suất. Vui lòng thử lại sau.';
          throw new Error(serverMessage || fallback);
        }

        if (res.status === 503) { throw new Error(serverMessage || 'Mô hình AI tạm thời bị quá tải (API 503). Vui lòng thử lại sau.'); }
          throw new Error(serverMessage || 'API Error');
      }

      const data = await res.json();
      if (data?.success === false) {
        throw new Error(data?.answer || 'Yêu cầu AI không thành công.');
      }

      const aiMsg: Message = { 
        id: (Date.now() + 1).toString(), 
        sender: 'ai', 
        text: `${data.answer}\n\n_${data.sources}_` 
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (error: any) {
      const errorMsg = error?.name === 'AbortError' 
        ? 'Yêu cầu vượt thời gian chờ. Vui lòng thử lại với khoảng thời gian ngắn hơn.'
        : (error?.message || 'Xin lỗi, đã có lỗi kết nối tới AI.');
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), sender: 'ai', text: errorMsg },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSend();
  };

  const handleQuickQuestion = (question: string) => {
    handleSend(question);
  };

  return (
    <div className="ai-chat-widget">
      {/* Floating Action Button */}
      {!isOpen && (
        <button className="ai-chat-fab" onClick={() => setIsOpen(true)}>
          <MessageSquare size={24} color="white" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className={`ai-chat-window shadow-xl border border-gray-200 ${isExpanded ? 'expanded' : ''}`}>
          {/* Header */}
          <div className="ai-chat-header bg-primary text-white p-3 flex justify-between items-center rounded-t-lg">
            <div className="flex items-center gap-2">
              <Bot size={20} />
              <h3 className="font-semibold text-sm m-0">Trợ lý AI Phân Tích</h3>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsExpanded((prev) => !prev)}
                className="text-white hover:text-gray-200"
                title={isExpanded ? 'Thu gọn giao diện' : 'Mở rộng giao diện'}
              >
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button 
                onClick={async () => {
                  if (await ask("Bắt đầu cuộc trò chuyện mới? Nội dung hiện tại sẽ bị xóa.", { title: 'Cuộc trò chuyện mới', confirmLabel: 'Bắt đầu', variant: 'warning' })) {
                    localStorage.removeItem(`${storageKey}_messages`);
                    localStorage.removeItem(`${storageKey}_session`);
                    window.location.reload();
                  }
                }}
                className="text-white hover:text-gray-200"
                title="Làm mới hội thoại"
              >
                <Trash2 size={16} />
              </button>
              <button onClick={() => setIsOpen(false)} className="text-white hover:text-gray-200">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="ai-chat-body p-3 flex flex-col gap-3 h-80 overflow-y-auto bg-gray-50">
            <div className="ai-chat-quick-questions">
              <div className="ai-quick-question-title">Câu hỏi mẫu theo nghiệp vụ</div>
              {quickQuestionGroups.map((groupItem) => (
                <div key={groupItem.group} className="ai-quick-question-group">
                  <div className="ai-quick-question-group-label">{groupItem.group}</div>
                  <div className="ai-quick-question-group-list">
                    {groupItem.questions.map((question) => (
                      <button
                        key={`${groupItem.group}-${question}`}
                        type="button"
                        className="ai-quick-question-btn"
                        onClick={() => handleQuickQuestion(question)}
                        disabled={isLoading}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 max-w-[85%] ${
                  msg.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    msg.sender === 'user' ? 'bg-accent-soft text-accent' : 'bg-indigo-100 text-indigo-600'
                  }`}
                >
                  {msg.sender === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div
                  className={`p-2.5 rounded-lg text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-primary text-white rounded-tr-none'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none shadow-sm'
                  }`}
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2 max-w-[85%] mr-auto">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <Bot size={16} />
                </div>
                <div className="p-2 justify-center flex items-center text-gray-500">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input */}
          <div className="ai-chat-footer border-t border-gray-200 p-2 bg-white rounded-b-lg flex gap-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Hỏi về báo cáo..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-accent"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="px-3 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary-hover disabled:opacity-50 hover:disabled:bg-blue-600 transition"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIChatWidget;

