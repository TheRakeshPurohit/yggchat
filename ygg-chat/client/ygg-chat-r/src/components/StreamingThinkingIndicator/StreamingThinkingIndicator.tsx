import React, { useEffect, useState } from 'react'

const STREAMING_THINKING_WORDS = [
  'Thinking',
  'Reading',
  'Tracing',
  'Checking',
  'Reviewing',
  'Inspecting',
  'Planning',
  'Composing',
  'Working',
]

const STREAMING_THINKING_WORD_INTERVAL_MS = 3200

type StreamingThinkingIndicatorVariant = 'inline' | 'tab'

type StreamingThinkingIndicatorProps = {
  variant?: StreamingThinkingIndicatorVariant
  className?: string
  style?: React.CSSProperties
}

export const StreamingThinkingIndicator = React.memo(function StreamingThinkingIndicator({
  variant = 'inline',
  className = '',
  style,
}: StreamingThinkingIndicatorProps) {
  const [wordIndex, setWordIndex] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined' || STREAMING_THINKING_WORDS.length <= 1) return

    const intervalId = window.setInterval(() => {
      setWordIndex(prev => (prev + 1) % STREAMING_THINKING_WORDS.length)
    }, STREAMING_THINKING_WORD_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  const variantClassName =
    variant === 'tab'
      ? 'rounded-t-xl border border-b-0 border-neutral-300/60 bg-neutral-100/90 px-3 py-1.5 shadow-[0_-8px_24px_-18px_rgba(0,0,0,0.55)] backdrop-blur-xl dark:border-neutral-700/70 dark:bg-neutral-900/90'
      : 'rounded-md px-1 py-0.5'

  return (
    <div
      className={`inline-flex items-center gap-2 text-[0.75em] leading-none text-neutral-500 dark:text-neutral-400 ${variantClassName} ${className}`.trim()}
      style={style}
      aria-live='polite'
      aria-label='Assistant is working'
    >
      <span className='tool-name-shimmer min-w-[5.75rem] font-medium leading-none'>
        {STREAMING_THINKING_WORDS[wordIndex]}
      </span>
    </div>
  )
})
