import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  BarChart2, 
  Settings, 
  Send, 
  StopCircle, 
  Play, 
  RefreshCw, 
  Activity, 
  Zap, 
  ShieldAlert, 
  Clock, 
  CheckCircle,
  Database,
  Search,
  Check,
  AlertTriangle
} from 'lucide-react';

const API_BASE = "http://localhost:8000";

// Custom high-fidelity lightweight Markdown Renderer
function MarkdownRenderer({ content }) {
  if (!content) return null;

  // Split content into blocks of code and normal text
  const parts = content.split(/(```[a-z]*\n[\s\S]*?\n```)/g);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', lineHeight: '1.6' }}>
      {parts.map((part, index) => {
        if (part.startsWith('```')) {
          const lines = part.split('\n');
          const firstLine = lines[0];
          const lang = firstLine.replace('```', '').trim() || 'code';
          const code = lines.slice(1, lines.length - 1).join('\n');

          return (
            <div key={index} style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              overflow: 'hidden',
              margin: '8px 0',
              fontFamily: 'Consolas, Monaco, Courier New, monospace'
            }}>
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                padding: '6px 12px',
                fontSize: '11px',
                color: '#9ca3af',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                userSelect: 'none'
              }}>
                <span style={{ fontWeight: 600 }}>{lang.toUpperCase()}</span>
                <button 
                  onClick={(e) => {
                    navigator.clipboard.writeText(code);
                    const btn = e.target;
                    btn.innerText = "COPIED!";
                    setTimeout(() => btn.innerText = "COPY", 2000);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#3b82f6',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 600,
                    outline: 'none',
                    padding: 0
                  }}
                >
                  COPY
                </button>
              </div>
              <pre style={{
                margin: 0,
                padding: '12px',
                overflowX: 'auto',
                fontSize: '13px',
                color: '#34d399',
                whiteSpace: 'pre-wrap'
              }}><code>{code}</code></pre>
            </div>
          );
        } else {
          return (
            <div key={index} style={{ whiteSpace: 'pre-wrap' }}>
              {renderTextWithInlineStyles(part)}
            </div>
          );
        }
      })}
    </div>
  );
}

function renderTextWithInlineStyles(text) {
  if (!text) return "";
  
  // Split on bold markdown markers: **text**
  const boldParts = text.split(/(\*\*.*?\*\*)/g);
  
  return boldParts.map((bPart, bIdx) => {
    if (bPart.startsWith('**') && bPart.endsWith('**')) {
      const boldText = bPart.slice(2, -2);
      return <strong key={bIdx} style={{ color: '#0f172a', fontWeight: 700 }}>{boldText}</strong>;
    }
    
    // Split on inline code backticks: `code`
    const codeParts = bPart.split(/(`.*?`)/g);
    return codeParts.map((cPart, cIdx) => {
      if (cPart.startsWith('`') && cPart.endsWith('`')) {
        const codeText = cPart.slice(1, -1);
        return (
          <code key={cIdx} style={{
            backgroundColor: 'rgba(225, 29, 72, 0.06)',
            border: '1px solid rgba(225, 29, 72, 0.15)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontFamily: 'monospace',
            color: '#be123c',
            fontSize: '13px',
            fontWeight: 600
          }}>
            {codeText}
          </code>
        );
      }
      return cPart;
    });
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState('chat'); // chat | conversations | metrics
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeLogs, setActiveLogs] = useState([]);
  
  // Telemetry Filtering States
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [logStatusFilter, setLogStatusFilter] = useState("all");
  const [logMinLatency, setLogMinLatency] = useState(0);
  
  // Model Settings
  const [provider, setProvider] = useState("mock");
  const [model, setModel] = useState("interactive-sim");

  // Metrics Dashboard State
  const [globalMetrics, setGlobalMetrics] = useState({
    total_requests: 0,
    error_rate_percent: 0,
    latency_p50_ms: 0,
    latency_p95_ms: 0,
    latency_p99_ms: 0,
    total_tokens_consumed: 0
  });
  const [timeseries, setTimeseries] = useState([]);

  // Auto scroll ref
  const chatBottomRef = useRef(null);

  useEffect(() => {
    fetchConversations();
    fetchMetrics();
    const interval = setInterval(() => {
      fetchMetrics();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const parseRedactedText = (text) => {
    if (!text) return "";
    const parts = text.split(/(\[REDACTED_[A-Z_]+\])/g);
    return parts.map((part, idx) => {
      if (part.startsWith('[REDACTED_') && part.endsWith(']')) {
        const type = part.slice(10, -1);
        let description = "Sensitive information masked for database logging.";
        let rule = "PII Shield Module";
        if (type === 'EMAIL') {
          rule = "Rule: EMAIL_REGEX ([a-zA-Z0-9_.+-]+@[a-zA-Z...])";
          description = "Automatically intercepts and scrubs active email addresses to guarantee database privacy.";
        } else if (type === 'PHONE') {
          rule = "Rule: PHONE_REGEX (10-digit formats & local 7-digit numbers)";
          description = "Flags and removes telephone, mobile, and local 7-digit patterns before writing to inference logs.";
        }
        return (
          <span 
            key={idx} 
            className="redacted-tag-interactive"
            data-tooltip={`${type} SCAN FILTERED\n${rule}\n\n${description}`}
            style={{
              backgroundColor: 'rgba(225, 29, 72, 0.08)',
              border: '1px solid rgba(225, 29, 72, 0.25)',
              color: '#be123c',
              padding: '2px 5px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'monospace',
              display: 'inline-block',
              margin: '0 2px'
            }}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const exportLogsToJson = () => {
    if (!activeLogs || activeLogs.length === 0) return;
    const jsonStr = JSON.stringify(activeLogs, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `telemetry_logs_session_${activeConvId.slice(0, 8)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/conversations`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (e) {
      console.error("Error loading conversations", e);
    }
  };

  const fetchMetrics = async () => {
    try {
      const resMetrics = await fetch(`${API_BASE}/ingest/metrics`);
      const resTs = await fetch(`${API_BASE}/ingest/metrics/timeseries`);
      if (resMetrics.ok && resTs.ok) {
        setGlobalMetrics(await resMetrics.json());
        setTimeseries(await resTs.json());
      }
    } catch (e) {
      console.error("Error loading metrics", e);
    }
  };

  const startNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setActiveLogs([]);
    setInputText("");
    setIsStreaming(false);
    setActiveTab('chat');
  };

  const selectConversation = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setActiveConvId(data.conversation.id);
        setMessages(data.messages);
        setActiveLogs(data.inference_logs || []);
        setProvider(data.conversation.provider);
        setModel(data.conversation.model);
        setActiveTab('chat');
      }
    } catch (e) {
      console.error("Failed to load conversation details", e);
    }
  };

  const selectConversationForTelemetry = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setActiveConvId(data.conversation.id);
        setActiveLogs(data.inference_logs || []);
      }
    } catch (e) {
      console.error("Failed to load conversation telemetry logs", e);
    }
  };

  const cancelActiveStream = async () => {
    if (!activeConvId) return;
    try {
      await fetch(`${API_BASE}/api/chat/cancel/${activeConvId}`, { method: 'POST' });
      setIsStreaming(false);
      // Refresh messages
      selectConversation(activeConvId);
    } catch (e) {
      console.error("Failed to cancel chat", e);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || isStreaming) return;

    let currentConvId = activeConvId;
    const userMessageText = inputText;
    setInputText("");

    // optimistic UI add user message
    const tempUserMsg = {
      id: Math.random().toString(),
      role: "user",
      content: userMessageText,
      created_at: new Date().toISOString()
    };
    
    // optimistic UI add assistant placeholder
    const tempAssistantMsg = {
      id: Math.random().toString(),
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
      loading: true
    };

    setMessages(prev => [...prev, tempUserMsg, tempAssistantMsg]);
    setIsStreaming(true);

    try {
      const response = await fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessageText,
          provider: provider,
          model: model,
          conversation_id: activeConvId
        })
      });

      if (!response.ok) {
        throw new Error("API Connection failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunkStr = decoder.decode(value);
        const lines = chunkStr.split("\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            if (dataStr === "[CANCELLED]") {
              setIsStreaming(false);
              break;
            }
            try {
              const data = JSON.parse(dataStr);
              if (data.conversation_id) {
                currentConvId = data.conversation_id;
                if (!activeConvId) {
                  setActiveConvId(data.conversation_id);
                  fetchConversations();
                }
              }
              if (data.chunk) {
                assistantText += data.chunk;
                setMessages(prev => {
                  const copy = [...prev];
                  const lastIdx = copy.length - 1;
                  if (copy[lastIdx] && copy[lastIdx].role === "assistant") {
                    copy[lastIdx] = {
                      ...copy[lastIdx],
                      content: assistantText,
                      loading: false
                    };
                  }
                  return copy;
                });
              }
            } catch (err) {
              // Not JSON, handle edge cases
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => {
        const copy = [...prev];
        const lastIdx = copy.length - 1;
        if (copy[lastIdx]) {
          copy[lastIdx] = {
            ...copy[lastIdx],
            content: `Failed to connect to backend model. Ensure Server is running! [Error: ${err.message}]`,
            loading: false,
            error: true
          };
        }
        return copy;
      });
    } finally {
      setIsStreaming(false);
      fetchConversations();
      fetchMetrics();
      
      const convIdToFetch = currentConvId || activeConvId;
      if (convIdToFetch) {
        setTimeout(() => {
          fetch(`${API_BASE}/api/conversations/${convIdToFetch}`)
            .then(res => res.json())
            .then(data => setActiveLogs(data.inference_logs || []))
            .catch(err => console.error("Failed to refresh logs", err));
        }, 300);
      }
    }
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {/* Sidebar navigation */}
      <div className="glass-panel" style={{
        width: '260px',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px',
        margin: '12px',
        marginRight: '6px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          <span style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '0.5px' }}>Inference Logs</span>
        </div>

        <button 
          onClick={startNewChat}
          style={{
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            border: 'none',
            color: '#fff',
            padding: '10px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '20px'
          }}
        >
          <MessageSquare size={16} /> New Conversation
        </button>

        {/* Tab buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          <button 
            onClick={() => setActiveTab('chat')}
            style={{
              background: activeTab === 'chat' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              color: activeTab === 'chat' ? '#fff' : '#9ca3af',
              padding: '10px 12px',
              borderRadius: '6px',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '14px'
            }}
          >
            <MessageSquare size={16} /> Chat Playground
          </button>

          <button 
            onClick={() => { setActiveTab('telemetry'); fetchConversations(); }}
            style={{
              background: activeTab === 'telemetry' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              color: activeTab === 'telemetry' ? '#fff' : '#9ca3af',
              padding: '10px 12px',
              borderRadius: '6px',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '14px'
            }}
          >
            <Activity size={16} /> Database Telemetry Logs
          </button>

          <button 
            onClick={() => { setActiveTab('conversations'); fetchConversations(); }}
            style={{
              background: activeTab === 'conversations' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              color: activeTab === 'conversations' ? '#fff' : '#9ca3af',
              padding: '10px 12px',
              borderRadius: '6px',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '14px'
            }}
          >
            <Database size={16} /> Conversations History
          </button>

          <button 
            onClick={() => { setActiveTab('metrics'); fetchMetrics(); }}
            style={{
              background: activeTab === 'metrics' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              color: activeTab === 'metrics' ? '#fff' : '#9ca3af',
              padding: '10px 12px',
              borderRadius: '6px',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '14px'
            }}
          >
            <BarChart2 size={16} /> Observability Metrics
          </button>
        </div>

        {/* Small health indicators */}
        <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>
            <span>Ingestion Pipeline</span>
            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px' }}><CheckCircle size={10} /> Active</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af' }}>
            <span>Event Broker (Redis)</span>
            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px' }}><CheckCircle size={10} /> Connected</span>
          </div>
        </div>
      </div>

      {/* Main Panel (displays side-by-side telemetry panel in telemetry mode, full screen in chat/conversations/metrics mode) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
        
        {activeTab === 'chat' && (
          <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', margin: '12px' }}>
            
            {/* Header / Selector */}
            <div style={{ 
              padding: '14px 20px', 
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Chat Sandbox</h2>
                <p style={{ margin: 0, fontSize: '11px', color: '#9ca3af' }}>Select provider to check latencies, token consumption, and PII redactor live.</p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <select 
                  value={provider} 
                  onChange={(e) => {
                    setProvider(e.target.value);
                    if (e.target.value === 'gemini') setModel('gemini-1.5-flash');
                    else if (e.target.value === 'openai') setModel('gpt-4o');
                    else setModel('interactive-sim');
                  }}
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                >
                  <option value="mock">Simulated Provider (No key)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI GPT-4o</option>
                </select>

                <input 
                  type="text" 
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="model identifier"
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '13px',
                    width: '120px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Chat Messages */}
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {messages.length === 0 ? (
                <div style={{ margin: 'auto', textAlign: 'center', maxWidth: '400px' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600 }}>Start Logging Inferences</h3>
                  <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af', lineHeight: '1.6' }}>
                    Type a message below to query our unified SDK wrappers. Every inference records system telemetry, latency, token rates, and auto-filters PII like phone numbers and emails instantly.
                  </p>
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '75%',
                    backgroundColor: m.role === 'user' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                    border: m.role === 'user' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '12px 16px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px', color: '#9ca3af' }}>
                      <span style={{ fontWeight: 600, color: m.role === 'user' ? '#93c5fd' : '#cbd5e1' }}>
                        {m.role === 'user' ? 'USER' : 'ASSISTANT'}
                      </span>
                      <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                    </div>

                    <div style={{ fontSize: '14px' }}>
                      {m.loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', height: '20px' }}>
                          <span className="dot-typing"></span>
                          <span className="dot-typing"></span>
                          <span className="dot-typing"></span>
                        </div>
                      ) : (
                        <MarkdownRenderer content={m.content} />
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={sendMessage} style={{ 
              padding: '16px 20px', 
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              gap: '10px'
            }}>
              <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={isStreaming ? "Generating response..." : "Ask your model anything... (e.g. Try testing PII email@gmail.com)"}
                disabled={isStreaming}
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#fff',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />

              {isStreaming ? (
                <button 
                  type="button" 
                  onClick={cancelActiveStream}
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#ef4444',
                    padding: '0 16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 500,
                    fontSize: '14px'
                  }}
                >
                  <StopCircle size={16} /> Cancel
                </button>
              ) : (
                <button 
                  type="submit"
                  disabled={!inputText.trim()}
                  style={{
                    backgroundColor: inputText.trim() ? '#2563eb' : 'rgba(255,255,255,0.05)',
                    color: inputText.trim() ? '#fff' : '#9ca3af',
                    border: 'none',
                    padding: '0 20px',
                    borderRadius: '8px',
                    cursor: inputText.trim() ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 500,
                    fontSize: '14px'
                  }}
                >
                  <Send size={16} /> Send
                </button>
              )}
            </form>
          </div>
        )}

        {activeTab === 'telemetry' && (
          <div style={{ flex: 1, display: 'flex', gap: '12px', padding: '12px', overflow: 'hidden', height: '100%' }}>
            {/* Left Column: Conversations List */}
            <div className="glass-panel" style={{
              width: '320px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}>
              <div style={{ padding: '16px', borderBottom: '1px solid rgba(0, 0, 0, 0.05)', backgroundColor: 'rgba(255, 255, 255, 0.15)' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>Select Conversation</h3>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Choose a session to inspect database-level telemetry logs.</p>
              </div>

              <div style={{ flex: 1, padding: '12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {conversations.length === 0 ? (
                  <div style={{ margin: 'auto', textAlign: 'center', color: '#64748b', fontSize: '12px', padding: '20px' }}>
                    No sessions found. Start a conversation in the Chat Playground first!
                  </div>
                ) : (
                  conversations.map((c) => {
                    const isSelected = activeConvId === c.id;
                    return (
                      <div 
                        key={c.id}
                        onClick={() => selectConversationForTelemetry(c.id)}
                        style={{
                          backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'rgba(255, 255, 255, 0.5)',
                          border: isSelected ? '1.5px solid rgba(37, 99, 235, 0.4)' : '1px solid rgba(255, 255, 255, 0.6)',
                          borderRadius: '8px',
                          padding: '12px',
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.01)',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: '13px', color: isSelected ? '#1d4ed8' : '#0f172a', marginBottom: '4px' }}>
                          {c.title || "Untitled Session"}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b' }}>
                          <span>{c.provider} ({c.model})</span>
                          <span>{c.session_id.slice(0, 8)}...</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Database Telemetry Logs */}
            <div className="glass-panel" style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}>
              <div style={{ 
                padding: '16px', 
                borderBottom: '1px solid rgba(0, 0, 0, 0.05)', 
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>Database Telemetry Logs</h3>
                  <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Scrubbed telemetry records saved in inference_logs table</p>
                </div>
                
                {activeConvId && activeLogs.length > 0 && (
                  <button 
                    onClick={exportLogsToJson}
                    style={{
                      backgroundColor: 'rgba(37, 99, 235, 0.08)',
                      border: '1.5px solid rgba(37, 99, 235, 0.25)',
                      color: '#1d4ed8',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'rgba(37, 99, 235, 0.15)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'rgba(37, 99, 235, 0.08)'; }}
                  >
                    Export JSON Logs
                  </button>
                )}
              </div>

              {/* Telemetry Filter Toolbar */}
              {activeConvId && activeLogs.length > 0 && (
                <div style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  {/* Search Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '180px' }}>
                    <Search size={14} color="#64748b" />
                    <input 
                      type="text"
                      placeholder="Search log content..."
                      value={logSearchQuery}
                      onChange={(e) => setLogSearchQuery(e.target.value)}
                      style={{
                        padding: '5px 10px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        border: '1px solid rgba(0, 0, 0, 0.08)',
                        width: '100%'
                      }}
                    />
                  </div>

                  {/* Status Toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#475569', fontWeight: 500 }}>Status:</span>
                    <select
                      value={logStatusFilter}
                      onChange={(e) => setLogStatusFilter(e.target.value)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        border: '1px solid rgba(0, 0, 0, 0.08)'
                      }}
                    >
                      <option value="all">All</option>
                      <option value="success">Success</option>
                      <option value="error">Error</option>
                    </select>
                  </div>

                  {/* Latency Filter */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '160px' }}>
                    <span style={{ fontSize: '11px', color: '#475569', fontWeight: 500 }}>Min Latency:</span>
                    <input 
                      type="range"
                      min="0"
                      max="3000"
                      step="50"
                      value={logMinLatency}
                      onChange={(e) => setLogMinLatency(parseInt(e.target.value))}
                      style={{ flex: 1, height: '4px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#0f172a', width: '50px', textAlign: 'right' }}>
                      {logMinLatency}ms
                    </span>
                  </div>
                </div>
              )}

              <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {!activeConvId ? (
                  <div style={{ margin: 'auto', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                    Select a conversation from the left pane to inspect its telemetry database logs.
                  </div>
                ) : activeLogs.length === 0 ? (
                  <div style={{ margin: 'auto', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                    No telemetry records found for this conversation.
                  </div>
                ) : (
                  (() => {
                    const filtered = activeLogs.filter(log => {
                      const matchesSearch = logSearchQuery === "" || 
                        (log.input_preview && log.input_preview.toLowerCase().includes(logSearchQuery.toLowerCase())) ||
                        (log.output_preview && log.output_preview.toLowerCase().includes(logSearchQuery.toLowerCase()));
                      const matchesStatus = logStatusFilter === 'all' || log.status.toLowerCase() === logStatusFilter;
                      const matchesLatency = log.latency_ms >= logMinLatency;
                      return matchesSearch && matchesStatus && matchesLatency;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div style={{ margin: 'auto', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                          No logs match the current search filters. Try loosening your criteria!
                        </div>
                      );
                    }

                    return filtered.map((log, idx) => (
                      <div key={idx} style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.5)',
                        border: '1px solid rgba(255, 255, 255, 0.6)',
                        borderRadius: '10px',
                        padding: '12px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.01)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: log.status === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: log.status === 'success' ? '#10b981' : '#ef4444'
                          }}>
                            {log.status.toUpperCase()}
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', color: '#475569' }}>
                          <div>Latency: <strong style={{ color: '#0f172a' }}>{log.latency_ms.toFixed(1)} ms</strong></div>
                          <div>Tokens: <strong style={{ color: '#0f172a' }}>{log.total_tokens}</strong></div>
                          <div>Provider: <strong style={{ color: '#0f172a' }}>{log.provider}</strong></div>
                          <div>Model: <strong style={{ color: '#0f172a' }}>{log.model}</strong></div>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid rgba(0,0,0,0.04)', paddingTop: '6px' }}>
                          <div style={{ fontSize: '9px', fontWeight: 700, color: '#475569', letterSpacing: '0.5px' }}>REDACTED INPUT PREVIEW:</div>
                          <div style={{
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            backgroundColor: 'rgba(255, 255, 255, 0.6)',
                            border: '1px solid rgba(0, 0, 0, 0.05)',
                            padding: '6px',
                            borderRadius: '4px',
                            color: '#be123c',
                            wordBreak: 'break-all'
                          }}>{parseRedactedText(log.input_preview)}</div>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ fontSize: '9px', fontWeight: 700, color: '#475569', letterSpacing: '0.5px' }}>REDACTED OUTPUT PREVIEW:</div>
                          <div style={{
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            backgroundColor: 'rgba(255, 255, 255, 0.6)',
                            border: '1px solid rgba(0, 0, 0, 0.05)',
                            padding: '6px',
                            borderRadius: '4px',
                            color: '#047857',
                            maxHeight: '120px',
                            overflowY: 'auto',
                            wordBreak: 'break-all'
                          }}>{parseRedactedText(log.output_preview)}</div>
                        </div>
                      </div>
                    ));
                  })()
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'conversations' && (
          <div className="glass-panel" style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600 }}>Conversations Logs Store</h2>
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#9ca3af' }}>Select any stored multi-turn conversation below to resume full telemetry streams or cancel operations.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {conversations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                  No historical sessions found.
                </div>
              ) : (
                conversations.map((c) => (
                  <div 
                    key={c.id}
                    onClick={() => selectConversation(c.id)}
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      padding: '16px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background-color 0.2s'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                        {c.title || "Untitled Session"}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#9ca3af' }}>
                        <span>Provider: <strong style={{ color: '#fff' }}>{c.provider}</strong></span>
                        <span>Model: <strong>{c.model}</strong></span>
                        <span>Session UUID: <code>{c.session_id.slice(0, 8)}...</code></span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        backgroundColor: c.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: c.status === 'active' ? '#10b981' : '#ef4444'
                      }}>
                        {c.status.toUpperCase()}
                      </span>
                      <button style={{
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        border: 'none',
                        color: '#60a5fa',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: 500
                      }}>
                        Resume Chat
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="glass-panel" style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 600 }}>Observability Metrics Dashboard</h2>
                <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af' }}>Real-time telemetry captured by backend SDK instrumentation pipelines.</p>
              </div>
              <button 
                onClick={fetchMetrics}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px'
                }}
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            {/* Metrics cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Activity size={12} color="#3b82f6" /> Total Requests
                </span>
                <span style={{ fontSize: '24px', fontWeight: 700 }}>{globalMetrics.total_requests}</span>
              </div>

              <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldAlert size={12} color="#ef4444" /> Error Rate
                </span>
                <span style={{ fontSize: '24px', fontWeight: 700, color: globalMetrics.error_rate_percent > 10 ? '#ef4444' : '#fff' }}>
                  {globalMetrics.error_rate_percent}%
                </span>
              </div>

              <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Zap size={12} color="#eab308" /> Latency p50 (Median)
                </span>
                <span style={{ fontSize: '24px', fontWeight: 700 }}>{globalMetrics.latency_p50_ms} ms</span>
              </div>

              <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Zap size={12} color="#a855f7" /> Latency p95
                </span>
                <span style={{ fontSize: '24px', fontWeight: 700 }}>{globalMetrics.latency_p95_ms} ms</span>
              </div>

              <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Database size={12} color="#10b981" /> Total Tokens
                </span>
                <span style={{ fontSize: '24px', fontWeight: 700 }}>{globalMetrics.total_tokens_consumed}</span>
              </div>
            </div>

            {/* Timeseries details */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600 }}>Interval Requests Streams</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {timeseries.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
                    No series intervals logged yet. Send chats to start recording metrics.
                  </div>
                ) : (
                  timeseries.map((ts, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      backgroundColor: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: '6px',
                      fontSize: '13px'
                    }}>
                      <span style={{ color: '#9ca3af' }}>{ts.time}</span>
                      <div style={{ display: 'flex', gap: '20px' }}>
                        <span>Requests: <strong style={{ color: '#3b82f6' }}>{ts.requests}</strong></span>
                        <span>Avg Latency: <strong style={{ color: '#eab308' }}>{ts.avg_latency_ms} ms</strong></span>
                        <span>Errors: <strong style={{ color: '#ef4444' }}>{ts.errors}</strong></span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
