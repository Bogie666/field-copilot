"use client";

import { createContext } from "react";

export type VoiceField = { label: string; unit?: string; value: string; apply: (value: string) => void };
/** Number fields register here so spoken readings can be matched to them. */
export type VoiceRegistry = Map<string, VoiceField>;
export const VoiceRegistryContext = createContext<VoiceRegistry | null>(null);
