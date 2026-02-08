// src/components/Result.jsx
import VideoPlayer from "./VideoPlayer";
import { Typography, Paper, List, ListItem, Box } from "@mui/material";
import quizData from "../data/quizData";
import videoData from "../data/videoData";

export default function Result({ answers = {}, userValue }) {
  if (userValue >= 1 && userValue <= 6) {
    const video = videoData.find((v) => v.id === userValue);
    return (
      <Box sx={{ mt: 5 }}>
        <VideoPlayer src={video?.url} />
      </Box>
    );
  }

  const entries = Object.entries(answers);

  return (
    <Paper sx={{ p: 3, mt: 5 }}>
      <Typography variant="h5" gutterBottom>
        Your Answers
      </Typography>
      {entries.map(([index, selected]) => (
        <div key={index}>
          <Typography variant="subtitle1" fontWeight="bold">
            {quizData[index].prompt}
          </Typography>
          <List dense>
            {selected.map((ans) => (
              <ListItem key={ans}>• {ans}</ListItem>
            ))}
          </List>
        </div>
      ))}
    </Paper>
  );
}
