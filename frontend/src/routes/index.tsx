import { createFileRoute } from "@tanstack/react-router";
import { RawScreen } from "../components/RawScreen";
import html from "../screens/body_4.html?raw";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "SYNCSCRIPT | Code Together. Build Faster." },
    { name: "description", content: "A real-time collaborative code editor with live rooms, chat, code execution, and version history." },
  ] }),
  component: () => (
    <RawScreen html={html} className="bg-[#10131a] text-[#e1e2eb] overflow-x-hidden min-h-screen" />
  ),
});
