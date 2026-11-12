import { webhookListener } from "./webhook-listener";

webhookListener("http://127.0.0.1:3000", (status) => {
  console.log({ webhookHttpStatus: status, at: new Date().toISOString() });
}).listen(3200, "127.0.0.1", () => {
  console.log(
    "Webhook-only listener: http://127.0.0.1:3200/api/paypal/webhook -> local app port 3000",
  );
});
