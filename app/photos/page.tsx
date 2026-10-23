import type { Metadata } from "next";
import PhotosIndex from "../components/PhotosIndex";
export const metadata: Metadata = { title: "Photos" };
export default function PhotosPage() { return <PhotosIndex />; }
