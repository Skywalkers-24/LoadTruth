/**
 * Client-side video inspection, validation, and compression utilities.
 * Configured via environment variables:
 * - NEXT_PUBLIC_MAX_UPLOAD_SECONDS (default: 30)
 * - NEXT_PUBLIC_MAX_UPLOAD_MB (default: 10)
 * - NEXT_PUBLIC_MAX_COMPRESSED_MB (default: 5)
 * - NEXT_PUBLIC_ENABLE_CLIENT_COMPRESSION (default: true)
 */

export interface VideoLimits {
  maxDurationSeconds: number;
  maxSizeBytes: number;
  compressThresholdBytes: number;
  targetCompressedBytes: number;
  enableCompression: boolean;
}

export function getUploadLimits(): VideoLimits {
  const maxDurationSeconds = process.env.NEXT_PUBLIC_MAX_UPLOAD_SECONDS
    ? Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_SECONDS)
    : 30;
  const maxMB = process.env.NEXT_PUBLIC_MAX_UPLOAD_MB
    ? Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB)
    : 50;
  const compressAboveMB = process.env.NEXT_PUBLIC_COMPRESS_ABOVE_MB
    ? Number(process.env.NEXT_PUBLIC_COMPRESS_ABOVE_MB)
    : 10;
  const compressedMB = process.env.NEXT_PUBLIC_MAX_COMPRESSED_MB
    ? Number(process.env.NEXT_PUBLIC_MAX_COMPRESSED_MB)
    : 5;
  const enableCompression = process.env.NEXT_PUBLIC_ENABLE_CLIENT_COMPRESSION !== "false";

  return {
    maxDurationSeconds,
    maxSizeBytes: maxMB * 1024 * 1024,
    compressThresholdBytes: compressAboveMB * 1024 * 1024,
    targetCompressedBytes: compressedMB * 1024 * 1024,
    enableCompression,
  };
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

/**
 * Inspect a video file's duration and resolution in the browser.
 */
export async function inspectVideo(file: File): Promise<VideoMetadata> {
  if (
    typeof window === "undefined" ||
    !file.type.startsWith("video/") ||
    typeof URL.createObjectURL !== "function"
  ) {
    return { duration: 0, width: 0, height: 0 };
  }

  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const url = URL.createObjectURL(file);
    let resolved = false;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => {
      if (resolved) return;
      resolved = true;
      const duration = video.duration || 0;
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      cleanup();
      resolve({ duration, width, height });
    };

    video.onerror = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve({ duration: 0, width: 0, height: 0 });
    };

    // Timeout fallback if metadata event does not fire
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({ duration: 0, width: 0, height: 0 });
      }
    }, 4000);

    video.src = url;
  });
}

/**
 * Validate a file against configured duration and size limits.
 */
export async function validateUploadFile(
  file: File,
  limits: VideoLimits = getUploadLimits(),
): Promise<{ ok: boolean; error?: string; metadata?: VideoMetadata }> {
  // Check file size limit (e.g. 10MB)
  if (file.size > limits.maxSizeBytes) {
    const limitMB = Math.round(limits.maxSizeBytes / (1024 * 1024));
    const currentMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: `File size (${currentMB}MB) exceeds the maximum limit of ${limitMB}MB. Please choose a smaller file.`,
    };
  }

  if (file.type.startsWith("video/")) {
    const meta = await inspectVideo(file);
    if (meta.duration > limits.maxDurationSeconds) {
      return {
        ok: false,
        error: `Video duration is ${Math.round(meta.duration)}s, which exceeds the ${limits.maxDurationSeconds}s limit. Please trim your video.`,
        metadata: meta,
      };
    }
    return { ok: true, metadata: meta };
  }

  return { ok: true };
}

/**
 * Compress a video file client-side to be under targetMaxMB (default 5MB)
 * using HTML5 Canvas and MediaRecorder.
 */
export async function compressVideoClient(
  file: File,
  metadata?: VideoMetadata,
  targetBytes: number = 5 * 1024 * 1024,
  onProgress?: (progress: number) => void,
): Promise<File> {
  // If already under target size, or not in browser, or not a video, return as-is
  if (
    file.size <= targetBytes ||
    typeof window === "undefined" ||
    !file.type.startsWith("video/") ||
    !("MediaRecorder" in window) ||
    !HTMLCanvasElement.prototype.captureStream
  ) {
    return file;
  }

  const meta = metadata && metadata.duration > 0 ? metadata : await inspectVideo(file);
  const duration = meta.duration || 10;

  // Select supported recording MIME type
  const mimeType = [
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ].find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  });

  if (!mimeType) {
    return file;
  }

  return new Promise<File>((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    // Downscale target resolution if needed: max 960x540
    let targetWidth = meta.width || 960;
    let targetHeight = meta.height || 540;
    const maxDimension = 960;

    if (targetWidth > maxDimension || targetHeight > maxDimension) {
      if (targetWidth >= targetHeight) {
        targetHeight = Math.round((targetHeight * maxDimension) / targetWidth);
        targetWidth = maxDimension;
      } else {
        targetWidth = Math.round((targetWidth * maxDimension) / targetHeight);
        targetHeight = maxDimension;
      }
    }
    // Ensure even dimensions for H.264 / VP8 / VP9
    targetWidth = Math.max(16, targetWidth - (targetWidth % 2));
    targetHeight = Math.max(16, targetHeight - (targetHeight % 2));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      URL.revokeObjectURL(url);
      return resolve(file);
    }

    // Target bitrate: aim for 85% of target size to stay safely under 5MB
    const targetBits = targetBytes * 0.85 * 8;
    const targetBps = Math.max(
      400_000,
      Math.min(2_000_000, Math.floor(targetBits / Math.max(1, duration))),
    );

    let recorder: MediaRecorder;
    try {
      const stream = canvas.captureStream(24);
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: targetBps,
      });
    } catch {
      URL.revokeObjectURL(url);
      return resolve(file);
    }

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      URL.revokeObjectURL(url);
      const outputType = mimeType.split(";")[0] || "video/mp4";
      const blob = new Blob(chunks, { type: outputType });

      if (blob.size > 0 && blob.size < file.size) {
        const ext = outputType.includes("mp4") ? ".mp4" : ".webm";
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        const compressedFile = new File([blob], `${baseName}_compressed${ext}`, {
          type: outputType,
          lastModified: Date.now(),
        });
        resolve(compressedFile);
      } else {
        resolve(file);
      }
    };

    let animationFrameId: number;
    const drawFrame = () => {
      if (video.paused || video.ended) return;
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      if (onProgress && duration > 0) {
        onProgress(Math.min(99, Math.round((video.currentTime / duration) * 100)));
      }
      animationFrameId = requestAnimationFrame(drawFrame);
    };

    video.oncanplay = () => {
      try {
        recorder.start(100);
        video.playbackRate = 2.0; // 2x playback speed for faster client compression
        video
          .play()
          .then(() => {
            drawFrame();
          })
          .catch(() => {
            recorder.stop();
          });
      } catch {
        URL.revokeObjectURL(url);
        resolve(file);
      }
    };

    video.onended = () => {
      cancelAnimationFrame(animationFrameId);
      if (recorder.state === "recording") {
        recorder.stop();
      }
    };

    video.onerror = () => {
      cancelAnimationFrame(animationFrameId);
      if (recorder.state === "recording") {
        recorder.stop();
      } else {
        URL.revokeObjectURL(url);
        resolve(file);
      }
    };

    // Safety timeout: 2x duration + 3s
    setTimeout(
      () => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      },
      Math.max(10_000, duration * 1000 + 3000),
    );
  });
}
