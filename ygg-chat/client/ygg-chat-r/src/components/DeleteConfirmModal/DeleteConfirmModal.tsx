import React from 'react'

interface DeleteConfirmModalProps {
  isOpen: boolean
  title?: string
  description?: string
  dontAskAgain?: boolean
  showDontAskAgain?: boolean
  dontAskAgainLabel?: string
  confirmLabel?: string
  cancelLabel?: string
  overlayBackgroundColor?: string
  backgroundColor?: string
  borderColor?: string
  titleTextColor?: string
  bodyTextColor?: string
  checkboxTextColor?: string
  cancelButtonBackgroundColor?: string
  cancelButtonBorderColor?: string
  cancelButtonTextColor?: string
  confirmButtonBackgroundColor?: string
  confirmButtonBorderColor?: string
  confirmButtonTextColor?: string
  onDontAskAgainChange?: (checked: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  title = 'Delete message?',
  description = 'This action cannot be undone.',
  dontAskAgain = false,
  showDontAskAgain = true,
  dontAskAgainLabel = "Don't ask again this session",
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  overlayBackgroundColor,
  backgroundColor,
  borderColor,
  titleTextColor,
  bodyTextColor,
  checkboxTextColor,
  cancelButtonBackgroundColor,
  cancelButtonBorderColor,
  cancelButtonTextColor,
  confirmButtonBackgroundColor,
  confirmButtonBorderColor,
  confirmButtonTextColor,
  onDontAskAgainChange,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null

  return (
    <div
      className='fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm'
      onClick={onCancel}
      style={overlayBackgroundColor ? { backgroundColor: overlayBackgroundColor } : undefined}
    >
      <div
        className='w-full max-w-sm rounded-[2rem] border border-white/45 bg-white/80 p-6 backdrop-blur-2xl dark:border-white/10 dark:bg-yBlack-900/80'
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor,
          borderColor,
        }}
      >
        <h3 className='mb-2 text-[20px] font-semibold tracking-tight' style={{ color: titleTextColor ?? 'rgb(23 23 23)' }}>
          {title}
        </h3>
        <p className='mb-5 text-[14px] leading-6' style={{ color: bodyTextColor ?? 'rgb(64 64 64)' }}>
          {description}
        </p>

        {showDontAskAgain && onDontAskAgainChange && (
          <label
            className='mb-5 flex items-center gap-2 rounded-full bg-black/5 px-3 py-2 text-sm backdrop-blur-xl dark:bg-white/5'
            style={{ color: checkboxTextColor ?? bodyTextColor ?? 'rgb(64 64 64)' }}
          >
            <input
              type='checkbox'
              checked={dontAskAgain}
              onChange={e => onDontAskAgainChange(e.target.checked)}
              className='peer sr-only'
            />
            <span
              aria-hidden='true'
              className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/70 text-white transition-all duration-150 ring-1 ring-black/10 peer-checked:bg-red-600 peer-checked:ring-red-600 peer-focus-visible:ring-2 peer-focus-visible:ring-red-400/50 dark:bg-white/10 dark:ring-white/10'
            >
              <svg
                className='h-3.5 w-3.5 opacity-0 transition-opacity duration-150 peer-checked:opacity-100'
                viewBox='0 0 20 20'
                fill='none'
                stroke='currentColor'
                strokeWidth={3}
                strokeLinecap='round'
                strokeLinejoin='round'
              >
                <path d='M5 10.5 8.2 14 15 6' />
              </svg>
            </span>
            <span>{dontAskAgainLabel}</span>
          </label>
        )}

        <div className='mt-8 flex justify-end gap-2'>
          <button
            type='button'
            onClick={onCancel}
            className='rounded-full border border-transparent bg-white/60 px-4 py-2 text-sm font-medium backdrop-blur-xl transition-all duration-150 hover:-translate-y-0.5 hover:bg-white/80 active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 dark:bg-white/10 dark:hover:bg-white/15'
            style={{
              backgroundColor: cancelButtonBackgroundColor,
              borderColor: cancelButtonBorderColor,
              color: cancelButtonTextColor ?? 'rgb(64 64 64)',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type='button'
            onClick={onConfirm}
            className='rounded-full border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:-translate-y-0.5 hover:bg-red-500 active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50'
            style={{
              backgroundColor: confirmButtonBackgroundColor,
              borderColor: confirmButtonBorderColor,
              color: confirmButtonTextColor ?? '#ffffff',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
