'use client';

import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-css/video-js.css';

interface VideoPlayerProps {
  /** The signed CloudFront URL (HLS .m3u8 manifest) */
  src: string;
  poster?: string;
}

export default function VideoPlayer({ src, poster }: VideoPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ReturnType<typeof videojs> | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    // Create a <video> element inside the container div
    const videoEl = document.createElement('video-js');
    videoEl.classList.add('vjs-big-play-centered');
    videoRef.current.appendChild(videoEl);

    const player = videojs(videoEl, {
      autoplay: false,
      controls: true,
      responsive: true,
      fluid: true,
      poster,
      sources: [{ src, type: 'application/x-mpegURL' }],
    });

    playerRef.current = player;

    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [src, poster]);

  return (
    <div
      ref={videoRef}
      className="w-full aspect-video bg-black rounded-lg overflow-hidden"
      data-vjs-player
    />
  );
}
