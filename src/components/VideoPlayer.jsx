import React, { useEffect, useRef } from "react";
import playerjs from "player.js";
import { Box } from "@mui/material";

export default function VideoPlayer({ src, selectedVideo }) {
  const videoUrl = src || selectedVideo;
  const iframeRef = useRef(null);

  useEffect(() => {
    if (iframeRef.current) {
      const player = new playerjs.Player(iframeRef.current);

      player.on("ready", () => {
        player.play();
      });

      player.on("ended", () => {
        window.location.href = "https://www.pestorspointers.com";
      });
    }
  }, [videoUrl]);

  if (!videoUrl) return null;

  return (
    <Box sx={{ width: "100%", aspectRatio: "16/9", mt: 2 }}>
      <iframe
        ref={iframeRef}
        src={videoUrl}
        style={{ width: "100%", height: "100%", border: "none" }}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
        allowFullScreen
        title="Video Player"
      ></iframe>
    </Box>
  );
}
