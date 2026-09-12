'use client';

import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

/**
 * `type` is the source's MIME type. It defaults to HLS because that is what
 * finished, customer-facing videos are; an admin previewing an untranscoded
 * upload passes `video/mp4` instead and video.js plays it natively.
 */
export default function VideoPlayer({ src, poster, type = 'application/x-mpegURL' }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);

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
      sources: [{ src, type }],
    });

    playerRef.current = player;

    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [src, poster, type]);

  return (
    <div
      ref={videoRef}
      className="w-full aspect-video bg-black rounded-lg overflow-hidden"
      data-vjs-player
    />
  );
}
