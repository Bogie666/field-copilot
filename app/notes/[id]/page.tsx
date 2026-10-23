import type { Metadata } from "next";
import Notepad from "../../components/Notepad";
export const metadata: Metadata = { title: "Personal note" };
export default function NotePage() { return <Notepad />; }
