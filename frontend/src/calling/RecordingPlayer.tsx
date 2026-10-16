import { useRef, useState, type ChangeEvent } from 'react'
import { getRecordingDownloadUrl } from './api'
import { API_URL, ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import type { Recording } from './types'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Play/pause/seek for a recording's signed playUrl. Download (a separate,
 * role-gated signed link — see RecordingsController) is offered only when
 * the caller says the current user is allowed to download. */
export function RecordingPlayer({
  recording,
  canDownload,
}: {
  recording: Recording
  canDownload: boolean
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(recording.duration ?? 0)
  const [downloading, setDownloading] = useState(false)

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      void audio.play()
    } else {
      audio.pause()
    }
  }

  function handleSeek(e: ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current
    const value = Number(e.target.value)
    setCurrentTime(value)
    if (audio) audio.currentTime = value
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      const { url } = await getRecordingDownloadUrl(recording.id)
      window.open(`${API_URL}${url}`, '_blank', 'noopener')
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to get download link'
      toast.error(message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border p-3.5">
      <audio
        ref={audioRef}
        src={`${API_URL}${recording.playUrl}`}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) =>
          setDuration(e.currentTarget.duration || recording.duration || 0)
        }
        className="hidden"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-secondary shrink-0"
          onClick={togglePlay}
          aria-label={playing ? 'Pause recording' : 'Play recording'}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          className="w-full"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={handleSeek}
          aria-label="Seek recording"
        />
        <span className="w-24 shrink-0 text-right text-xs text-muted">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      {canDownload && (
        <button
          type="button"
          className="btn-secondary self-start"
          disabled={downloading}
          onClick={() => void handleDownload()}
        >
          {downloading ? 'Preparing…' : 'Download'}
        </button>
      )}
    </div>
  )
}
