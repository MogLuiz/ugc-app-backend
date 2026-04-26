import { Injectable } from '@nestjs/common';

export type ServiceSnapshot = {
  serviceGrossAmountCents: number;
  platformFeeBpsSnapshot: number;
  platformFeeAmountCents: number;
  creatorNetServiceAmountCents: number;
};

export type ContractSnapshot = ServiceSnapshot & {
  transportFeeAmountCents: number;
  creatorPayoutAmountCents: number;
  companyTotalAmountCents: number;
};

@Injectable()
export class FinancialSnapshotService {
  buildServiceSnapshot(serviceGrossAmountCents: number, platformFeeBps: number): ServiceSnapshot {
    const platformFeeAmountCents = Math.round(serviceGrossAmountCents * platformFeeBps / 10000);
    return {
      serviceGrossAmountCents,
      platformFeeBpsSnapshot: platformFeeBps,
      platformFeeAmountCents,
      creatorNetServiceAmountCents: serviceGrossAmountCents - platformFeeAmountCents,
    };
  }

  buildContractSnapshot(
    serviceGrossAmountCents: number,
    platformFeeBps: number,
    transportFeeAmountCents: number,
  ): ContractSnapshot {
    const service = this.buildServiceSnapshot(serviceGrossAmountCents, platformFeeBps);
    return {
      ...service,
      transportFeeAmountCents,
      creatorPayoutAmountCents: service.creatorNetServiceAmountCents + transportFeeAmountCents,
      companyTotalAmountCents: serviceGrossAmountCents + transportFeeAmountCents,
    };
  }
}
