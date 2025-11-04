import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConsumerService } from 'src/kafka/consumer/consumer.service';
import { EachBatchPayload } from 'kafkajs';
import { TelemetryService } from './telemetry.service';
import { plainToInstance } from 'class-transformer';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import { validate } from 'class-validator';
import { ProducerService } from 'src/kafka/producer/producer.service';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { RetryTelemetryDto } from './dto/retry-telemetry.dto';

@Injectable()
export class CreateTelemetryConsumer implements OnModuleInit {
  private readonly dlqTopic: string;
  private readonly retryTopic: string;
  private readonly mainTopic: string;
  private readonly consumerGroupId: string;

  constructor(
    private readonly consumerService: ConsumerService,
    private readonly telemetryService: TelemetryService,
    private readonly configService: ConfigService,
    private readonly producerService: ProducerService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CreateTelemetryConsumer.name);
    this.dlqTopic =
      this.configService.get<string>('KAFKA_DLQ_TOPIC') || 'telemetry-dlq';
    this.retryTopic =
      this.configService.get<string>('KAFKA_RETRY_TOPIC') || 'telemetry-retry';
    this.mainTopic =
      this.configService.get<string>('KAFKA_INGRESS_TOPIC') ||
      'telemetry-ingress';
    this.consumerGroupId =
      this.configService.get<string>('KAFKA_CONSUMER_GROUP_ID') ||
      'telemetry-ingester-group';
  }

  async onModuleInit() {
    await this.consumerService.consume(
      this.consumerGroupId,
      { topics: [this.mainTopic], fromBeginning: false },
      {
        eachBatchAutoResolve: false,
        eachBatch: async (payload: EachBatchPayload) => {
          // eslint-disable-next-line @typescript-eslint/unbound-method
          const { batch, resolveOffset, heartbeat, isRunning, isStale } =
            payload;

          const validDtos: CreateTelemetryDto[] = [];

          for (const message of batch.messages) {
            if (!isRunning() || isStale()) break;

            try {
              if (!message.value) {
                this.logger.warn(
                  {
                    partition: batch.partition,
                    offset: message.offset,
                  },
                  'Received message with empty value',
                );
                resolveOffset(message.offset);
                await heartbeat();
                continue;
              }

              // Parse telemetry data
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              const telemetryArray = JSON.parse(message.value.toString());

              // Validate each telemetry DTO
              for (const item of telemetryArray) {
                const dto = plainToInstance(CreateTelemetryDto, item);
                const errors = await validate(dto);

                if (errors.length > 0) {
                  this.logger.warn(
                    {
                      errors: errors.map((e) => e.toString()).join(', '),
                      offset: message.offset,
                      partition: batch.partition,
                    },
                    'Invalid telemetry DTO received',
                  );

                  await this.sendToDLQ(item, 'Validation failed');
                  resolveOffset(message.offset);
                  await heartbeat();
                  continue;
                }

                validDtos.push(dto);
              }

              resolveOffset(message.offset);
              await heartbeat();
            } catch (error: unknown) {
              const errMsg =
                error instanceof Error
                  ? error.message
                  : typeof error === 'string'
                    ? error
                    : JSON.stringify(error);

              this.logger.error(
                {
                  error: errMsg,
                  offset: message.offset,
                  partition: batch.partition,
                },
                'Failed to parse or validate Kafka message',
              );

              await this.sendToDLQ(message.toString(), errMsg);
              resolveOffset(message.offset);
              await heartbeat();
            }
          }

          // ✅ Process all valid telemetry data in bulk
          if (validDtos.length > 0) {
            try {
              await this.telemetryService.create(validDtos);
              this.logger.info(
                {
                  count: validDtos.length,
                  topic: this.mainTopic,
                  partition: batch.partition,
                },
                'Successfully processed telemetry batch',
              );
            } catch (serviceError: unknown) {
              const serviceErrMsg =
                serviceError instanceof Error
                  ? serviceError.message
                  : typeof serviceError === 'string'
                    ? serviceError
                    : JSON.stringify(serviceError);
              this.logger.error(
                {
                  error: serviceErrMsg,
                  count: validDtos.length,
                  topic: this.retryTopic,
                },
                'Service failed to process telemetry batch, moving to retry',
              );

              await this.sendToRetry(validDtos, serviceError);
            }
          }
        },
      },
    );

    this.logger.info(
      {
        topic: this.mainTopic,
        groupId: 'telemetry-ingester-group',
      },
      'Telemetry consumer successfully initialized',
    );
  }

  private async sendToRetry(
    dtos: CreateTelemetryDto[],
    error: any,
  ): Promise<void> {
    const retryPayloads: RetryTelemetryDto[] = dtos.map((dto) => ({
      ...dto,
      retryAttempt: (dto as RetryTelemetryDto).retryAttempt
        ? (dto as RetryTelemetryDto).retryAttempt + 1
        : 1,
      errorMessage: error instanceof Error ? error.message : String(error),
    }));

    await this.producerService.produce({
      topic: this.retryTopic,
      messages: retryPayloads.map((p) => ({ value: JSON.stringify(p) })),
    });

    this.logger.warn(
      {
        count: retryPayloads.length,
        topic: this.retryTopic,
      },
      'Messages moved to retry topic',
    );
  }

  private async sendToDLQ(
    message: string | Record<string, unknown>,
    reason: string,
  ): Promise<void> {
    await this.producerService.produce({
      topic: this.dlqTopic,
      messages: [
        {
          value: JSON.stringify({
            failedMessage: message,
            reason,
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    });

    this.logger.error(
      {
        topic: this.dlqTopic,
        reason,
      },
      'Message sent to DLQ',
    );
  }
}
