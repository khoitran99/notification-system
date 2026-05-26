# RabbitMQ as the message queue

RabbitMQ is used as the message queue backbone between `notification-server` and the four worker services.

The retry requirement maps directly onto RabbitMQ's native dead-letter exchange (DLX) pattern: a failed message is routed to a dead-letter queue, requeued after a delay, and retried up to N times before triggering an alert. This is built-in AMQP behaviour rather than custom worker code. Four independent queues (one per channel) are modelled as separate exchanges and bindings, enforcing channel isolation at the broker level. The Node.js `amqplib` library provides a mature client.

## Considered Options

- **Kafka** — more durable and replayable, but operationally heavier; retry/DLQ requires more custom code. The event-replay capability is unused in this design.
- **AWS SQS** — zero ops, but introduces AWS lock-in; the delay-queue retry pattern is clumsier than RabbitMQ's DLX.
- **Redis Streams** — Redis is already the cache layer; doubling it as the queue couples two critical responsibilities on one instance.
