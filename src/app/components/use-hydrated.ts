"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const client = () => true;
const server = () => false;

/** Forms with client submit handlers must not submit natively before hydration. */
export function useHydrated() { return useSyncExternalStore(subscribe, client, server); }
