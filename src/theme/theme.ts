export type ThemeAccent = "red" | "white" | "blue";
export type ThemeMode = "dark" | "light";

export type ThemeSelection = {
  accent: ThemeAccent;
  mode: ThemeMode;
};

export const defaultTheme: ThemeSelection = {
  accent: "red",
  mode: "dark"
};

export const themeAccents: Array<{ id: ThemeAccent; label: string }> = [
  { id: "red", label: "Black and red" },
  { id: "white", label: "Black and white" },
  { id: "blue", label: "Black and blue" }
];

