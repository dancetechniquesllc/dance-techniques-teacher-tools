import { assertEquals } from "jsr:@std/assert@1";
import { parsePaymentDetails, shouldReplacePaymentStatus } from "./payment.ts";

Deno.test("recognizes the legacy transaction summary", () => {
  assertEquals(parsePaymentDetails("Total: $35.00 Transaction ID: ch_123"), {
    status: "paid", amount: "35.00", transactionId: "ch_123"
  });
});

Deno.test("recognizes Jotform structured successful payment fields", () => {
  assertEquals(parsePaymentDetails("Enrollment Fee", {
    q39_myProducts: { answer: { paymentStatus: "SUCCESSFUL", total: "35.00", transactionId: "txn_456" } }
  }), { status: "paid", amount: "35.00", transactionId: "txn_456" });
});

Deno.test("does not mark incomplete payments as paid", () => {
  assertEquals(parsePaymentDetails("Enrollment Fee", { paymentStatus: "INCOMPLETE", total: "35.00" }).status, "unpaid");
});

Deno.test("allows a later successful Square webhook to repair an unpaid status", () => {
  assertEquals(shouldReplacePaymentStatus("unpaid", "paid"), true);
  assertEquals(shouldReplacePaymentStatus("paid", "unpaid"), false);
});
