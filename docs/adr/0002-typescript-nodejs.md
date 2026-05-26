# TypeScript / Node.js across all services

All five services (`notification-server`, `worker-ios`, `worker-android`, `worker-sms`, `worker-email`) are written in TypeScript running on Node.js.

Workers are I/O-bound (queue consume → third-party HTTP call → DB write), which suits Node.js's async model well. More critically, the required third-party integrations — Firebase Admin SDK (FCM), `apns2` (APNs), Twilio Node SDK, Sendgrid SDK — are all first-class in the Node.js ecosystem, avoiding hand-rolled HTTP clients. A single language also allows shared TypeScript types for the notification event payload that crosses queue boundaries.

## Considered Options

- **Go** — better raw throughput and leaner containers, but the APNs/FCM/Twilio/Sendgrid SDK ecosystem is thin, requiring significantly more integration code.
