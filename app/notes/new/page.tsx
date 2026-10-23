import type { Metadata } from "next";
import Notepad from "../../components/Notepad";
export const metadata: Metadata = { title: "New personal note" };
export default function NewNotePage() { return <Notepad />; }
