import { useEffect, useRef } from 'react'
import type { TranscriptMessage } from './types'

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * Speaker-labeled, auto-scrolling message list — shared by the live
 * transcript panel on the Live Calls page and the historical view on the
 * Call Detail page. Purely presentational: callers own fetching/socket
 * subscription and just hand down the current message list.
 */
export function TranscriptMessages({
  messages,
  emptyText,
  autoScroll = true,
}: {
  messages: TranscriptMessage[]
  emptyText: string
  autoScroll?: boolean
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // scrollIntoView is unimplemented in jsdom (test environment) — guard
    // rather than assume every DOM implementation has it.
    if (autoScroll) bottomRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages.length, autoScroll])

  if (messages.length === 0) {
    return <p className="text-sm text-muted">{emptyText}</p>
  }

  return (
    <div className="flex max-h-96 flex-col gap-2.5 overflow-y-auto pr-1">
      {messages.map((message) => {
        const isAi = message.speaker === 'AI'
        return (
          <div key={message.id} className={`flex ${isAi ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3.5 py-2 text-sm ${
                isAi ? 'bg-surface-hover text-ink' : 'bg-brand text-brand-on'
              }`}
            >
              <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide uppercase opacity-70">
                <span>{isAi ? 'AI' : 'Customer'}</span>
                <span aria-hidden="true">·</span>
                <span>{formatTime(message.timestamp)}</span>
              </div>
              <p className="whitespace-pre-wrap">{message.text}</p>
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
