import { Injectable } from '@nestjs/common';

export type TransportQuote = {
  price: number;
  formatted: string;
  isMinimumApplied: boolean;
};

type BuildTransportQuoteParams = {
  distanceKm: number | null;
  pricePerKm: number;
  minimumPrice: number;
  currency?: 'BRL';
};

@Injectable()
export class TransportService {
  buildQuote(params: BuildTransportQuoteParams): TransportQuote | null {
    if (params.distanceKm == null) {
      return null;
    }

    const distanceBased = this.roundToTwoDecimals(params.distanceKm * params.pricePerKm);
    const minimum = this.roundToTwoDecimals(params.minimumPrice);
    const price = this.roundToTwoDecimals(Math.max(distanceBased, minimum));
    const currency = params.currency ?? 'BRL';

    return {
      price,
      formatted: this.formatCurrency(price, currency),
      isMinimumApplied: price === minimum,
    };
  }

  roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private formatCurrency(value: number, currency: 'BRL'): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
}
