import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Kafka, Producer, ProducerRecord } from 'kafkajs';

@Injectable()
export class ProducerService implements OnModuleInit, OnApplicationShutdown {
  async onModuleInit() {
    console.log('ProducerService.onModuleInit');
    await this.producer.connect();
  }
  async onApplicationShutdown() {
    await this.producer.disconnect();
  }
  private readonly kafka = new Kafka({
    brokers: ['localhost:29092', 'localhost:39092', 'localhost:49092'],
  });

  private readonly producer: Producer = this.kafka.producer({
    idempotent: true,
  });

  async produce(record: ProducerRecord) {
    await this.producer.send(record);
  }
}
