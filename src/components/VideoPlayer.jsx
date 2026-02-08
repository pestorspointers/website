import ReactPlayer from "react-player";
import { Box } from "@mui/material";

export default function VideoPlayer({ src, selectedVideo }) {
  const videoUrl = src || selectedVideo;

  if (!videoUrl) return null;

  const isMux = videoUrl.includes("player.mux.com");

  return (
    <Box sx={{ width: "100%", aspectRatio: "16/9", mt: 2 }}>
      {isMux ? (
        <iframe
          src={videoUrl}
          style={{ width: "100%", height: "100%", border: "none" }}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
          allowFullScreen
        ></iframe>
      ) : (
        <ReactPlayer url={videoUrl} width="100%" height="100%" controls />
      )}
    </Box>
  );
}
