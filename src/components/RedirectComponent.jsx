import React, { useEffect, useState } from "react";
import { Card, CardContent, Link, Typography, Container } from "@mui/material";

function RedirectComponent() {
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (countdown === 0) {
      window.location.href = "https://www.PestorsPointers.com";
      return;
    }

    const interval = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [countdown]);

  return (
    <Container
      maxWidth="sm"
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
      }}
    >
      <Card sx={{ width: "100%" }}>
        <CardContent sx={{ textAlign: "center", py: 4 }}>
          <Typography variant="h5" gutterBottom sx={{ mb: 2 }}>
            Thank you for taking the time to fill out this survey.
          </Typography>
          <Typography variant="body1" sx={{ mb: 3 }}>
            If interested in learning more, please checkout{" "}
            <Link
              href="https://www.PestorsPointers.com"
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              sx={{ fontWeight: "bold" }}
            >
              www.PestorsPointers.com
            </Link>
          </Typography>
          <Typography variant="caption" color="textSecondary">
            Redirecting in {countdown} second{countdown !== 1 ? "s" : ""}...
          </Typography>
        </CardContent>
      </Card>
    </Container>
  );
}

export default RedirectComponent;
