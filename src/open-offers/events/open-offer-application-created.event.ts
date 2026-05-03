export const OPEN_OFFER_APPLICATION_CREATED_EVENT = 'open-offer.application.created';

export type OpenOfferApplicationCreatedEvent = {
  openOfferId: string;
  applicationId: string;
  companyUserId: string;
  creatorId: string;
  creatorName: string;
  offerTitle: string;
  occurredAt: Date;
};
