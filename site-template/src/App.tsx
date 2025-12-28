import React from "react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import DayView from "@/pages/DayView";
import Overview from "@/pages/Overview";
import Settings from "@/pages/Settings";

/**
 * ulogme - Personal Activity Tracker Dashboard
 *
 * A modern rewrite of karpathy/ulogme for macOS.
 */
export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {/* Main routes */}
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/day/:date" element={<DayView />} />
          <Route path="/settings" element={<Settings />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
