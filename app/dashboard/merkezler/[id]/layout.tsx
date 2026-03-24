import type { ReactNode } from "react";
import { STATIC_CENTER_SHELL_ID } from "@/lib/dashboard-routes";

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: STATIC_CENTER_SHELL_ID }];
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

