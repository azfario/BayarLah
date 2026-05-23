import { redirect } from "next/navigation";

export default function ReceiptExpenseRedirectPage() {
  redirect("/expenses?mode=receipt");
}
