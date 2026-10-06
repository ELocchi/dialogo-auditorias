"use client";
import { createContext, useContext } from "react";
export const AgendaWindow = createContext<{ month: string; setMonth: (month: string) => void; loading: boolean; blocked: boolean; error: string; retry: () => void } | null>(null);
export const useAgendaWindow = () => useContext(AgendaWindow);
