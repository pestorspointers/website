import React from "react";
import {
  FormControl,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Typography,
  Paper,
} from "@mui/material";

export default function Question({
  data,
  selected,
  onChange,
  disabledOptions,
}) {
  const handleChange = (option) => {
    if (selected.includes(option)) {
      onChange(selected.filter((item) => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        {data.prompt}
      </Typography>
      <FormControl component="fieldset" variant="standard">
        <FormGroup>
          {data.options.map((option) => (
            <FormControlLabel
              key={option}
              control={
                <Checkbox
                  checked={selected.includes(option)}
                  onChange={() => handleChange(option)}
                  disabled={disabledOptions.includes(option)}
                />
              }
              label={option}
            />
          ))}
        </FormGroup>
      </FormControl>
    </Paper>
  );
}
