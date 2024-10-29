import { Module } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { GateioService } from './gateio.service';

@Module({
  imports: [
    EventEmitterModule.forRoot()
  ],
  providers: [
    {
      provide: GateioService,
      useFactory: (eventEmitter: EventEmitter2) => {
        return new GateioService(eventEmitter, { emitter: true });
      },
      inject: [EventEmitter2],
    },
  ],
  exports: [GateioService],
})
export class GateioModule {}