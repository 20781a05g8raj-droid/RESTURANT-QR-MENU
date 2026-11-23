import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Send, X } from 'lucide-react';
import type { MenuItem, Restaurant } from '../types/domain';
import { formatCurrency } from '../utils/restaurantLogic';

interface LiveVoiceOrderDrawerProps {
  open: boolean;
  onClose: () => void;
  restaurant: Restaurant;
  tableNumber: number;
  menuItems: MenuItem[];
  onAddCartItem: (menuItemId: string, quantity: number) => void;
  onRemoveCartItem: (menuItemId: string) => void;
  onConfirmVoiceOrder: (notes: string) => void;
}

interface TranscriptMessage {
  id: string;
  role: 'guest' | 'steward';
  text: string;
}

function float32ToBase64Pcm16(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 32768;
  }
  return samples;
}

export function LiveVoiceOrderDrawer({
  open,
  onClose,
  restaurant,
  tableNumber,
  menuItems,
  onAddCartItem,
  onRemoveCartItem,
  onConfirmVoiceOrder,
}: LiveVoiceOrderDrawerProps) {
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'listening' | 'error'>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([
    {
      id: 'welcome',
      role: 'steward',
      text: `Namaste! Tap the mic and speak naturally in Hindi, Hinglish, or English — for example: "Do Butter Chicken aur teen Garlic Naan table ${tableNumber} par laga do."`,
    },
  ]);
  const [quickCommand, setQuickCommand] = useState('');
  const [parsingText, setParsingText] = useState(false);

  // Refs for clean AudioContext / WebSocket teardown without stale closures
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  const callbacksRef = useRef({ onAddCartItem, onRemoveCartItem, onConfirmVoiceOrder });
  callbacksRef.current = { onAddCartItem, onRemoveCartItem, onConfirmVoiceOrder };

  const stopLiveSession = useCallback(() => {
    try {
      processorRef.current?.disconnect();
      processorRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      inputCtxRef.current?.close();
      inputCtxRef.current = null;
      outputCtxRef.current?.close();
      outputCtxRef.current = null;
      wsRef.current?.close();
      wsRef.current = null;
      nextStartTimeRef.current = 0;
    } catch {
      // ignore teardown errors
    }
    setLiveStatus('idle');
  }, []);

  useEffect(() => {
    if (!open) {
      stopLiveSession();
    }
    return () => stopLiveSession();
  }, [open, stopLiveSession]);

  const schedulePcmPlayback = useCallback((base64Audio: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    const floatData = base64Pcm16ToFloat32(base64Audio);
    const audioBuffer = ctx.createBuffer(1, floatData.length, 24000);
    audioBuffer.getChannelData(0).set(floatData);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + audioBuffer.duration;
  }, []);

  const startLiveVoiceSession = async () => {
    setErrorText(null);
    setLiveStatus('connecting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/live-order`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'init',
            restaurantName: restaurant.name,
            tableNumber,
            menuItems: menuItems.map((m) => ({
              id: m.id,
              name: m.name,
              price: m.price,
              available: m.available,
              veg: m.veg,
              category: m.category,
            })),
          })
        );
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as {
          type?: string;
          audio?: string;
          text?: string;
          name?: string;
          args?: Record<string, unknown>;
          message?: string;
        };

        if (msg.type === 'ready') {
          setLiveStatus('listening');
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;
          source.connect(processor);
          processor.connect(inputCtx.destination);

          processor.onaudioprocess = (audioEvent) => {
            if (ws.readyState === WebSocket.OPEN) {
              const pcmBase64 = float32ToBase64Pcm16(
                audioEvent.inputBuffer.getChannelData(0)
              );
              ws.send(JSON.stringify({ audio: pcmBase64 }));
            }
          };
        } else if (msg.type === 'audio' && msg.audio) {
          schedulePcmPlayback(msg.audio);
        } else if (msg.type === 'interrupted') {
          nextStartTimeRef.current = outputCtxRef.current?.currentTime ?? 0;
        } else if (msg.type === 'inputTranscript' && msg.text) {
          setMessages((prev) => [
            ...prev,
            { id: `g-${Date.now()}-${Math.random()}`, role: 'guest', text: msg.text! },
          ]);
        } else if (msg.type === 'outputTranscript' && msg.text) {
          setMessages((prev) => [
            ...prev,
            { id: `s-${Date.now()}-${Math.random()}`, role: 'steward', text: msg.text! },
          ]);
        } else if (msg.type === 'toolCall') {
          if (msg.name === 'add_to_cart' && msg.args?.menuItemId) {
            const qty = Math.max(1, Number(msg.args.quantity) || 1);
            callbacksRef.current.onAddCartItem(String(msg.args.menuItemId), qty);
          } else if (msg.name === 'remove_from_cart' && msg.args?.menuItemId) {
            callbacksRef.current.onRemoveCartItem(String(msg.args.menuItemId));
          } else if (msg.name === 'place_order') {
            callbacksRef.current.onConfirmVoiceOrder(String(msg.args?.notes ?? ''));
          }
        } else if (msg.type === 'error') {
          setErrorText(msg.message || 'Voice connection error.');
          setLiveStatus('error');
        }
      };

      ws.onerror = () => {
        setErrorText('Could not connect to Live Voice server. Try the quick Hinglish command bar below.');
        setLiveStatus('error');
      };

      ws.onclose = () => {
        setLiveStatus('idle');
      };
    } catch (err) {
      stopLiveSession();
      setErrorText(
        err instanceof Error
          ? `Microphone access unavailable (${err.message}). You can still type your Hinglish/English order below.`
          : 'Microphone unavailable. Type your order below.'
      );
      setLiveStatus('error');
    }
  };

  const handleQuickTextOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const utterance = quickCommand.trim();
    if (!utterance || parsingText) return;

    setMessages((prev) => [
      ...prev,
      { id: `g-${Date.now()}`, role: 'guest', text: utterance },
    ]);
    setQuickCommand('');
    setParsingText(true);
    setErrorText(null);

    try {
      const res = await fetch('/api/voice-text-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          utterance,
          menuItems: menuItems.map((m) => ({
            id: m.id,
            name: m.name,
            price: m.price,
            available: m.available,
          })),
        }),
      });
      const data = (await res.json()) as {
        items?: Array<{ menuItemId: string; quantity: number }>;
        notes?: string;
        reply?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Could not understand order.');

      if (Array.isArray(data.items) && data.items.length > 0) {
        for (const entry of data.items) {
          onAddCartItem(entry.menuItemId, Math.max(1, entry.quantity || 1));
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `s-${Date.now()}`,
          role: 'steward',
          text:
            data.reply ||
            (data.items?.length
              ? 'Added those dishes to your table cart!'
              : 'Sorry, I could not match an available dish. Try naming items from the menu.'),
        },
      ]);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Order assistant unavailable.');
    } finally {
      setParsingText(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-drawer-title"
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4"
    >
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-slate-200 flex flex-col max-h-[88vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 id="voice-drawer-title" className="text-base font-bold text-slate-900">
              Live Voice Ordering — Table {tableNumber}
            </h3>
            <p className="text-xs text-slate-500">
              Speak in Hindi, Hinglish, or English · Dishes add to cart live
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close voice ordering"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live mic control hero */}
        <div className="px-5 py-5 bg-slate-50 border-b border-slate-200 flex flex-col items-center text-center space-y-3">
          <button
            type="button"
            onClick={liveStatus === 'listening' ? stopLiveSession : startLiveVoiceSession}
            disabled={liveStatus === 'connecting'}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors shadow-sm ${
              liveStatus === 'listening'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
            aria-label={
              liveStatus === 'listening' ? 'Stop voice conversation' : 'Start live voice ordering'
            }
          >
            {liveStatus === 'connecting' ? (
              <Loader2 className="w-7 h-7 animate-spin" />
            ) : liveStatus === 'listening' ? (
              <MicOff className="w-7 h-7" />
            ) : (
              <Mic className="w-7 h-7" />
            )}
          </button>

          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-slate-900">
              {liveStatus === 'connecting'
                ? 'Connecting live voice steward...'
                : liveStatus === 'listening'
                  ? 'Listening live — speak your order now'
                  : 'Tap microphone to speak your order'}
            </p>
            <p className="text-xs text-slate-500">
              Live menu prices synced ({menuItems.filter((m) => m.available).length} dishes available)
            </p>
          </div>

          {errorText && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 w-full">
              {errorText}
            </p>
          )}
        </div>

        {/* Conversation transcript */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[160px]">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'guest' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === 'guest'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-800'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        {/* Quick Hinglish / English order input bar */}
        <form
          onSubmit={handleQuickTextOrder}
          className="px-4 py-3 border-t border-slate-200 bg-white flex items-center gap-2"
        >
          <label htmlFor="quick-voice-command" className="sr-only">
            Type or dictate an order in English or Hinglish
          </label>
          <input
            id="quick-voice-command"
            type="text"
            value={quickCommand}
            onChange={(e) => setQuickCommand(e.target.value)}
            placeholder='Or type: "2 Butter Chicken and 3 Garlic Naan"'
            className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
          <button
            type="submit"
            disabled={parsingText || !quickCommand.trim()}
            aria-label="Send order command"
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shrink-0"
          >
            {parsingText ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>

        {/* Quick menu hints */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center gap-2 overflow-x-auto text-xs text-slate-600">
          <span className="shrink-0 font-medium text-slate-400">Available now:</span>
          {menuItems
            .filter((m) => m.available)
            .slice(0, 4)
            .map((m) => (
              <span key={m.id} className="whitespace-nowrap shrink-0">
                {m.name} ({formatCurrency(m.price, restaurant.currency)})
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}
