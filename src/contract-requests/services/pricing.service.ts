import { Injectable } from '@nestjs/common';
import { TransportService } from './transport.service';

export type TransportPricing = {
  transportFeeAmountCents: number;
  transportPricePerKmUsed: number;
  transportMinimumFeeUsed: number;
  transportIsMinimumApplied: boolean;
};

type BuildTransportParams = {
  distanceKm: number;
  transportPricePerKm: number;
  transportMinimumFee: number;
};

@Injectable()
export class PricingService {
  constructor(private readonly transportService: TransportService) {}

  buildTransport(params: BuildTransportParams): TransportPricing {
    const quote = this.transportService.buildQuote({
      distanceKm: params.distanceKm,
      pricePerKm: params.transportPricePerKm,
      minimumPrice: params.transportMinimumFee,
    });

    if (!quote) {
      throw new Error('Não foi possível calcular o transporte sem distância válida.');
    }

    return {
      transportFeeAmountCents: Math.round(quote.price * 100),
      transportPricePerKmUsed: params.transportPricePerKm,
      transportMinimumFeeUsed: params.transportMinimumFee,
      transportIsMinimumApplied: quote.isMinimumApplied,
    };
  }
}
