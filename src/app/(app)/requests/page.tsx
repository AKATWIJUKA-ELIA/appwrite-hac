import type { Metadata } from "next";
import { RequestForm } from "@/components/requests/request-form";

export const metadata: Metadata = { title: "New request · Quotebook" };

export default function NewRequestPage() {
  return <RequestForm />;
}
